import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission, requireNotDemoMode } from "@/lib/api-auth";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit-log";
import { triggerWebhook } from "@/lib/webhooks";
import { notifyIntegrations } from "@/lib/integrations/slack-teams";
import { logger, logCatchError } from "@/lib/logger";
import { invalidateCacheByPrefix } from "@/lib/cache";
import { z } from "zod";
import {
  parseWorkbook,
  processAssetImportRows,
  buildAssetLookups,
  cleanColumnMapping,
  MAX_IMPORT_FILE_SIZE,
  MAX_REPORTED_ERRORS,
  type ReferenceRecord,
} from "@/lib/excel-import";

/**
 * POST /api/import/asset
 *
 * Transaction-safe Excel/CSV asset import with:
 * - Reference resolution (names → IDs)
 * - Duplicate detection (in-file + DB)
 * - Validation & error reporting
 * - Transaction-safe inserts
 * - ImportJob record + audit log + webhooks + cache invalidation
 *
 * Request (FormData):
 *   file            - required (.xlsx/.xls/.csv)
 *   sheetName       - required (string)
 *   headerRow       - optional int (default 1)
 *   columnMapping   - required JSON string { fieldId: colIndex }
 */
export async function POST(req: NextRequest) {
  try {
    const demoBlock = requireNotDemoMode();
    if (demoBlock) return demoBlock;

    const authUser = await requirePermission("import:execute");

    // Get user's organization
    const importUser = await prisma.user.findUnique({
      where: { userid: authUser.id! },
      select: { organizationId: true },
    });
    const orgId = importUser?.organizationId ?? null;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const sheetNameRaw = formData.get("sheetName") as string | null;
    const headerRowRaw = formData.get("headerRow") as string | null;
    const mappingRaw = formData.get("columnMapping") as string | null;

    if (!file || !sheetNameRaw || !mappingRaw) {
      return NextResponse.json(
        { error: "file, sheetName, and columnMapping are required" },
        { status: 400 },
      );
    }

    // Validate file size
    if (file.size > MAX_IMPORT_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${Math.round(MAX_IMPORT_FILE_SIZE / (1024 * 1024))}MB.` },
        { status: 413 },
      );
    }

    // Validate file extension
    const fileName = file.name;
    if (!/\.(xlsx|xls|csv)$/i.test(fileName)) {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload .xlsx, .xls, or .csv files." },
        { status: 400 },
      );
    }

    // Parse column mapping
    let rawMapping: Record<string, number>;
    try {
      rawMapping = JSON.parse(mappingRaw);
    } catch {
      return NextResponse.json(
        { error: "Invalid columnMapping JSON" },
        { status: 400 },
      );
    }

    // Validate mapping: pid and assetType must be mapped
    const pidCol = rawMapping.pid;
    const assetTypeCol = rawMapping.assetType;
    if (pidCol === undefined || pidCol < 0) {
      return NextResponse.json(
        { error: "PID (Asset ID) must be mapped to a column." },
        { status: 400 },
      );
    }
    if (assetTypeCol === undefined || assetTypeCol < 0) {
      return NextResponse.json(
        { error: "Asset Type must be mapped to a column." },
        { status: 400 },
      );
    }

    // Parse workbook
    const buffer = Buffer.from(await file.arrayBuffer());
    let sheets;
    try {
      sheets = await parseWorkbook(buffer, fileName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: `Failed to parse file: ${msg}` },
        { status: 400 },
      );
    }

    // Find target sheet
    const targetSheet = sheets.find(
      (s) => s.name.toLowerCase() === sheetNameRaw.toLowerCase(),
    );
    if (!targetSheet) {
      return NextResponse.json(
        {
          error: `Sheet "${sheetNameRaw}" not found.`,
          availableSheets: sheets.map((s) => s.name),
        },
        { status: 400 },
      );
    }

    // Parse headerRow
    const headerRow = Math.max(
      1,
      Math.min(50, parseInt(headerRowRaw ?? "1", 10) || 1),
    );

    // Clean mapping
    const mapping = cleanColumnMapping(rawMapping, targetSheet.headers.length);

    // Ensure critical mappings survived cleaning
    if (mapping.pid === undefined) {
      return NextResponse.json(
        { error: "PID column index is out of bounds for this sheet." },
        { status: 400 },
      );
    }
    if (mapping.assetType === undefined) {
      return NextResponse.json(
        { error: "Asset Type column index is out of bounds for this sheet." },
        { status: 400 },
      );
    }

    // Load reference data (org-scoped, including global/null org records for categories)
    const orgWhere = { organizationId: orgId };

    const [categories, statuses, locations, manufacturers, departments, existingAssets] =
      await Promise.all([
        prisma.assetCategoryType.findMany({
          where: orgId
            ? { OR: [{ organizationId: orgId }, { organizationId: null }] }
            : { organizationId: null },
          select: {
            assetcategorytypeid: true,
            assetcategorytypename: true,
            assetTypeCode: true,
          },
        }),
        prisma.statusType.findMany({
          where: orgId
            ? { OR: [{ organizationId: orgId }, { organizationId: null }] }
            : { organizationId: null },
          select: {
            statustypeid: true,
            statustypename: true,
            isDefault: true,
          },
        }),
        prisma.location.findMany({
          where: orgId
            ? { OR: [{ organizationId: orgId }, { organizationId: null }] }
            : { organizationId: null },
          select: { locationid: true, locationname: true },
        }),
        prisma.manufacturer.findMany({
          where: orgId
            ? { OR: [{ organizationId: orgId }, { organizationId: null }] }
            : { organizationId: null },
          select: { manufacturerid: true, manufacturername: true },
        }),
        prisma.department.findMany({
          where: orgWhere,
          select: { id: true, name: true, code: true },
        }),
        prisma.asset.findMany({
          select: { serialnumber: true, assettag: true },
        }),
      ]);

    // Build lookups
    const refCategories: ReferenceRecord[] = categories.map((c) => ({
      id: c.assetcategorytypeid,
      name: c.assetcategorytypename,
      code: c.assetTypeCode,
    }));
    const refStatuses: ReferenceRecord[] = statuses.map((s) => ({
      id: s.statustypeid,
      name: s.statustypename,
      isDefault: s.isDefault,
    }));
    const refLocations: ReferenceRecord[] = locations.map((l) => ({
      id: l.locationid,
      name: l.locationname ?? "",
    }));
    const refManufacturers: ReferenceRecord[] = manufacturers.map((m) => ({
      id: m.manufacturerid,
      name: m.manufacturername,
    }));
    const refDepartments: ReferenceRecord[] = departments.map((d) => ({
      id: d.id,
      name: d.name,
      code: d.code,
    }));

    const lookups = buildAssetLookups(
      refCategories,
      refStatuses,
      refLocations,
      refManufacturers,
      refDepartments,
    );

    // Build existing uniques sets (for DB duplicate detection)
    // A value may appear as either a serialnumber or assettag in the system.
    const combinedExisting = new Set<string>();
    for (const a of existingAssets) {
      if (a.serialnumber) combinedExisting.add(a.serialnumber);
      if (a.assettag) combinedExisting.add(a.assettag);
    }

    // Validate and resolve all rows
    const processResult = processAssetImportRows(
      targetSheet.rows,
      headerRow,
      mapping,
      lookups,
    );

    // Check for DB duplicates in valid rows (add errors, remove from valid)
    const dbErrors: { row: number; error: string }[] = [];
    const finalValidRows = processResult.validRows.filter((r) => {
      if (combinedExisting.has(r.pid)) {
        dbErrors.push({
          row: r.rowNumber,
          error: `Row ${r.rowNumber}: PID "${r.pid}" already exists in the system.`,
        });
        return false;
      }
      if (combinedExisting.has(r.assettag) && r.assettag !== r.pid) {
        dbErrors.push({
          row: r.rowNumber,
          error: `Row ${r.rowNumber}: Tag "${r.assettag}" already exists in the system.`,
        });
        return false;
      }
      return true;
    });

    const allErrors = [...processResult.errors, ...dbErrors];
    const dataRowCount = Math.max(0, targetSheet.rows.length - headerRow);
    const totalRows = finalValidRows.length + allErrors.length;

    // Create ImportJob record
    const job = await prisma.importJob.create({
      data: {
        userId: authUser.id!,
        entityType: "asset",
        fileName,
        fileSize: file.size,
        totalRows: totalRows || dataRowCount,
        status: "processing",
        startedAt: new Date(),
      },
    });

    // If no valid rows, mark as failed and return
    if (finalValidRows.length === 0) {
      const failedJob = await prisma.importJob.update({
        where: { id: job.id },
        data: {
          processedRows: 0,
          successCount: 0,
          errorCount: allErrors.length,
          status: "failed",
          errors: allErrors.length > 0 ? allErrors.slice(0, MAX_REPORTED_ERRORS) : null,
          completedAt: new Date(),
        },
      });

      await createAuditLog({
        userId: authUser.id!,
        action: AUDIT_ACTIONS.CREATE,
        entity: "ImportJob",
        entityId: job.id,
        details: {
          entityType: "asset",
          fileName,
          totalRows,
          successCount: 0,
          errorCount: allErrors.length,
          status: "failed",
        },
      });

      return NextResponse.json(failedJob, { status: 201 });
    }

    // Build create payload
    const now = new Date();
    const createManyData = finalValidRows.map((r) => ({
      assetname: r.assetname,
      assettag: r.assettag,
      serialnumber: r.pid,
      assetcategorytypeid: r.assetcategorytypeid,
      statustypeid: r.statustypeid,
      locationid: r.locationid ?? null,
      manufacturerid: r.manufacturerid ?? null,
      departmentId: r.departmentId ?? null,
      departmentCode: r.departmentCode ?? null,
      reviewsDate: r.reviewsDate ?? null,
      purchasedate: r.purchasedate ?? null,
      purchaseprice: r.purchaseprice ?? null,
      mobile: r.mobile ?? null,
      requestable: r.requestable ?? null,
      specs: r.specs ?? null,
      notes: r.notes ?? null,
      creation_date: now,
      organizationId: orgId,
    }));

    // Transaction-safe insert: all valid rows apply atomically.
    // All expected failures (unknown references, in-file duplicates, DB
    // duplicates) are caught during pre-validation above, so the transaction
    // should only fail on unexpected errors — in which case NOTHING is
    // inserted (full rollback).
    let successCount = 0;
    try {
      const result = await prisma.$transaction(
        (tx) =>
          tx.asset.createMany({
            data: createManyData,
          }),
        { timeout: 120_000 },
      );
      successCount = result.count;
    } catch (txErr) {
      logger.error("Transaction failed during asset import", {
        error: txErr,
        jobId: job.id,
      });
      // All-or-nothing: transaction rolled back, mark job as failed
      const failedJob = await prisma.importJob.update({
        where: { id: job.id },
        data: {
          processedRows: totalRows,
          successCount: 0,
          errorCount: totalRows,
          status: "failed",
          errors: [
            { row: 0, error: `Transaction failed (no rows imported): ${txErr instanceof Error ? txErr.message : String(txErr)}` },
            ...allErrors,
          ].slice(0, MAX_REPORTED_ERRORS),
          completedAt: new Date(),
        },
      });
      return NextResponse.json(failedJob, { status: 409 });
    }

    const finalErrorCount = allErrors.length;
    const finalStatus = successCount === 0 ? "failed" : "completed";

    // Finalize job
    const completedJob = await prisma.importJob.update({
      where: { id: job.id },
      data: {
        processedRows: totalRows,
        successCount,
        errorCount: finalErrorCount,
        status: finalStatus,
        errors: finalErrorCount > 0 ? allErrors.slice(0, MAX_REPORTED_ERRORS) : null,
        completedAt: new Date(),
      },
    });

    // Audit log
    await createAuditLog({
      userId: authUser.id!,
      action: AUDIT_ACTIONS.CREATE,
      entity: "ImportJob",
      entityId: job.id,
      details: {
        entityType: "asset",
        fileName,
        sheetName: sheetNameRaw,
        totalRows,
        successCount,
        errorCount: finalErrorCount,
        status: finalStatus,
      },
    });

    // Webhooks
    const webhookEvent = successCount === 0 ? "import.failed" : "import.completed";
    await triggerWebhook(webhookEvent, {
      jobId: job.id,
      entityType: "asset",
      totalRows,
      successCount,
      errorCount: finalErrorCount,
    });
    notifyIntegrations(webhookEvent, {
      entityType: "asset",
      successCount,
      errorCount: finalErrorCount,
      totalRows,
    }).catch(logCatchError("Integration notification failed"));

    // Invalidate asset caches
    await Promise.all([
      invalidateCacheByPrefix("assets_all"),
      invalidateCacheByPrefix("combined_assets"),
      invalidateCacheByPrefix("asset_summary"),
    ]);

    return NextResponse.json(completedJob, { status: 201 });
  } catch (error) {
    logger.error("Error in asset import endpoint", { error });
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith("Forbidden")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to process asset import" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
