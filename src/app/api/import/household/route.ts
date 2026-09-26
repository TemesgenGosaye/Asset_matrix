import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission, requireNotDemoMode } from "@/lib/api-auth";
import { handleRouteError, requireOrgId } from "@/lib/api-route";
import { createAuditLog, AUDIT_ACTIONS, AUDIT_ENTITIES } from "@/lib/audit-log";
import { triggerWebhook } from "@/lib/webhooks";
import { notifyIntegrations } from "@/lib/integrations/slack-teams";
import { logger, logCatchError } from "@/lib/logger";
import {
  analyzeHouseholdWorkbook,
  fetchHouseholdImportContext,
  parseHouseholdImportMode,
  persistHouseholdImport,
  type HouseholdImportAnalysis,
} from "@/lib/household-import";
import { MAX_IMPORT_FILE_SIZE, MAX_REPORTED_ERRORS } from "@/lib/excel-import";

/**
 * POST /api/import/household
 *
 * Transaction-safe House Register import confirm. Parses + validates the file
 * exactly as the preview endpoint, then persists every actionable row inside a
 * single Serializable transaction:
 *   - New houses: server-generated HIDs (106-90-NNN), never a user-supplied srNo.
 *   - Existing houses: re-checked allocation/inspection guards in-transaction.
 *   - Any unexpected DB failure rolls the whole import back (all-or-nothing).
 *
 * Request (FormData):
 *   file       - required .xlsx/.xls/.csv
 *   mode       - "add" | "update" | "add_update"
 *   sheetName  - optional; auto-detected when omitted
 *
 * Permissions: household:create (all modes) + household:edit (update modes).
 */
export async function POST(req: NextRequest) {
  try {
    const demoBlock = requireNotDemoMode();
    if (demoBlock) return demoBlock;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const modeRaw = (formData.get("mode") as string | null) ?? "add";
    const sheetNameRaw = (formData.get("sheetName") as string | null) ?? undefined;

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    if (file.size > MAX_IMPORT_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `File too large. Maximum size is ${Math.round(MAX_IMPORT_FILE_SIZE / (1024 * 1024))}MB.`,
          size: file.size,
          maxSize: MAX_IMPORT_FILE_SIZE,
        },
        { status: 413 },
      );
    }

    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload .xlsx, .xls, or .csv files." },
        { status: 400 },
      );
    }

    const mode = parseHouseholdImportMode(modeRaw);
    if (!mode) {
      return NextResponse.json(
        { error: "Invalid import mode. Expected one of: add, update, add_update." },
        { status: 400 },
      );
    }

    const user = await requirePermission("household:create");
    if (mode !== "add") {
      await requirePermission("household:edit");
    }

    const orgId = await requireOrgId();

    // Parse + validate + classify exactly like the preview endpoint, against a
    // fresh snapshot so nothing can drift between preview and confirm.
    const { lookups } = await fetchHouseholdImportContext(orgId);
    const buffer = Buffer.from(await file.arrayBuffer());

    let analysis: HouseholdImportAnalysis;
    try {
      analysis = await analyzeHouseholdWorkbook(
        buffer,
        file.name,
        sheetNameRaw,
        mode,
        lookups,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    if (analysis.missingRequiredColumns.length > 0) {
      return NextResponse.json(
        { error: "The file is missing required columns. Download the House Register template first." },
        { status: 400 },
      );
    }

    const createRows = analysis.pendingRows.filter((p) => p.action === "create").map((p) => p.row);
    const updateRows = analysis.pendingRows.filter((p) => p.action === "update").map((p) => p.row);
    const unchangedSkipped = analysis.rows.filter(
      (r) => r.classification === "update" && r.hasChanges === false,
    ).length;
    const totalRows = analysis.summary.totalRows;

    // Create the import job up-front so failures are recorded against it.
    const job = await prisma.importJob.create({
      data: {
        userId: user.id!,
        entityType: "household",
        fileName: file.name,
        fileSize: file.size,
        totalRows: totalRows || 0,
        status: "processing",
        startedAt: new Date(),
      },
    });

    // Nothing actionable → record the job and show the user a "nothing to
    // import" result instead of a failed transaction.
    if (createRows.length + updateRows.length === 0) {
      const errorCount = analysis.errors.length;
      const completedJob = await prisma.importJob.update({
        where: { id: job.id },
        data: {
          processedRows: totalRows,
          successCount: 0,
          errorCount,
          status: "completed",
          errors: errorCount > 0 ? analysis.errors.slice(0, MAX_REPORTED_ERRORS) : null,
          completedAt: new Date(),
        },
      });

      await createAuditLog({
        userId: user.id ?? null,
        action: AUDIT_ACTIONS.IMPORT,
        entity: AUDIT_ENTITIES.HOUSEHOLD,
        entityId: job.id,
        details: {
          entityType: "household",
          fileName: file.name,
          sheetName: analysis.sheetName,
          mode,
          totalRows,
          created: 0,
          updated: 0,
          errorCount,
          status: "completed",
        },
      });

      const webhookEvent = errorCount === 0 ? "import.completed" : "import.failed";
      await triggerWebhook(webhookEvent, {
        jobId: job.id,
        entityType: "household",
        totalRows,
        successCount: 0,
        errorCount,
      });
      notifyIntegrations(webhookEvent, {
        entityType: "household",
        successCount: 0,
        errorCount,
        totalRows,
      }).catch(logCatchError("Integration notification failed"));

      return NextResponse.json(
        {
          jobId: job.id,
          mode,
          sheetName: analysis.sheetName,
          fileName: file.name,
          totalRows,
          created: 0,
          updated: 0,
          unchangedSkipped,
          failedCount: 0,
          errors: analysis.errors.slice(0, MAX_REPORTED_ERRORS),
          status: "completed",
        },
        { status: 200 },
      );
    }

    // Persist everything inside one transaction. Expected failures (e.g. a
    // house that became allocated between preview and confirm) are reported
    // per-row; ANY unexpected DB error rolls the whole import back.
    try {
      const outcome = await prisma.$transaction(
        (tx) =>
          persistHouseholdImport(tx, orgId, createRows, updateRows, user.id ?? null),
        { timeout: 120_000 },
      );

      const failedItems = [...analysis.errors, ...outcome.failed];
      const errorCount = failedItems.length;
      const successCount = outcome.created + outcome.updated;
      const finalStatus = successCount === 0 ? "failed" : "completed";

      const completedJob = await prisma.importJob.update({
        where: { id: job.id },
        data: {
          processedRows: totalRows,
          successCount,
          errorCount,
          status: finalStatus,
          errors: errorCount > 0 ? failedItems.slice(0, MAX_REPORTED_ERRORS) : null,
          completedAt: new Date(),
        },
      });

      await createAuditLog({
        userId: user.id ?? null,
        action: AUDIT_ACTIONS.IMPORT,
        entity: AUDIT_ENTITIES.HOUSEHOLD,
        entityId: job.id,
        details: {
          entityType: "household",
          fileName: file.name,
          sheetName: analysis.sheetName,
          mode,
          totalRows,
          created: outcome.created,
          updated: outcome.updated,
          unchangedSkipped,
          failed: outcome.failed.length,
          errorCount,
          status: finalStatus,
        },
      });

      const webhookEvent = successCount === 0 ? "import.failed" : "import.completed";
      await triggerWebhook(webhookEvent, {
        jobId: job.id,
        entityType: "household",
        totalRows,
        successCount,
        errorCount,
      });
      notifyIntegrations(webhookEvent, {
        entityType: "household",
        successCount,
        errorCount,
        totalRows,
      }).catch(logCatchError("Integration notification failed"));

      return NextResponse.json(
        {
          jobId: job.id,
          mode,
          sheetName: analysis.sheetName,
          fileName: file.name,
          totalRows,
          created: outcome.created,
          updated: outcome.updated,
          unchangedSkipped,
          failedCount: outcome.failed.length,
          errors: failedItems.slice(0, MAX_REPORTED_ERRORS),
          status: finalStatus,
        },
        { status: 201 },
      );
    } catch (txErr) {
      logger.error("Transaction failed during household import", {
        error: txErr,
        jobId: job.id,
      });

      const failedItems = [
        {
          excelRow: 0,
          houseNumber: "-",
          message: `Import failed (no rows imported): ${txErr instanceof Error ? txErr.message : String(txErr)}`,
        },
        ...analysis.errors,
      ];

      const failedJob = await prisma.importJob.update({
        where: { id: job.id },
        data: {
          processedRows: totalRows,
          successCount: 0,
          errorCount: failedItems.length,
          status: "failed",
          errors: failedItems.slice(0, MAX_REPORTED_ERRORS),
          completedAt: new Date(),
        },
      });
      void failedJob;

      await createAuditLog({
        userId: user.id ?? null,
        action: AUDIT_ACTIONS.IMPORT,
        entity: AUDIT_ENTITIES.HOUSEHOLD,
        entityId: job.id,
        details: {
          entityType: "household",
          fileName: file.name,
          sheetName: analysis.sheetName,
          mode,
          totalRows,
          created: 0,
          updated: 0,
          errorCount: failedItems.length,
          status: "failed",
          rolledBack: true,
        },
      });

      return NextResponse.json(
        {
          jobId: job.id,
          mode,
          fileName: file.name,
          totalRows,
          created: 0,
          updated: 0,
          failedCount: totalRows,
          errors: failedItems.slice(0, MAX_REPORTED_ERRORS),
          status: "failed",
          rolledBack: true,
        },
        { status: 409 },
      );
    }
  } catch (e) {
    return handleRouteError(e, {
      label: "POST /api/import/household",
      message: "Failed to import House Register",
    });
  }
}

export const dynamic = "force-dynamic";