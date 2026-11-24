import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission, requireNotDemoMode } from "@/lib/api-auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getOrganizationContext } from "@/lib/organization-context";
import {
  MAX_FIXED_ASSET_IMPORT_BYTES,
  commitFixedAssetImport,
  normalizeDuplicatePolicy,
  normalizeErrorHandling,
  parseFixedAssetWorkbook,
} from "@/lib/fixed-asset-import";
import { createAuditLog } from "@/lib/audit-log";
import { invalidateCacheByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isFeatureEnabled("fixedAssetRegister")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const demoBlock = requireNotDemoMode();
  if (demoBlock) return demoBlock;
  try {
    const user = await requirePermission("import:execute");
    const ctx = await getOrganizationContext();
    const organizationId = user.organizationId ?? ctx?.organization?.id;
    if (!organizationId || !user.id) {
      return NextResponse.json(
        { error: "Organization context required" },
        { status: 403 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (file.size > MAX_FIXED_ASSET_IMPORT_BYTES) {
      return NextResponse.json(
        { error: "File too large (20MB max)" },
        { status: 413 },
      );
    }
    const sheetName =
      typeof formData.get("sheetName") === "string"
        ? (formData.get("sheetName") as string)
        : undefined;
    const headerRow = Number(formData.get("headerRow") ?? "1") || 1;
    const modeRaw = String(formData.get("mode") ?? "commit").toLowerCase();
    const mode = modeRaw === "dry-run" ? "dry-run" : "commit";

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = createHash("sha256").update(buffer).digest("hex");
    const workbook = await parseFixedAssetWorkbook(
      buffer,
      sheetName,
      headerRow,
    );

    if (mode === "dry-run") {
      return NextResponse.json({
        mode,
        ...workbook.summary,
        rows: workbook.rows.slice(0, 500).map((row) => ({
          rowNumber: row.rowNumber,
          status: row.parsed.errors.length ? "error" : "ready",
          warnings: row.parsed.warnings,
          errors: row.parsed.errors,
        })),
      });
    }

    const result = await commitFixedAssetImport(workbook, {
      organizationId,
      userId: user.id,
      fileName: file.name,
      fileSize: file.size,
      sheetName: workbook.sheetName,
      headerRow,
      mode,
      errorHandling: normalizeErrorHandling(formData.get("errorHandling")),
      duplicatePolicy: normalizeDuplicatePolicy(
        formData.get("duplicatePolicy"),
      ),
      fileHash,
    });
    await createAuditLog({
      userId: user.id,
      action: "asset.register.import",
      entity: "import_job",
      entityId: result.batchId,
      details: {
        fileName: file.name,
        sheetName: workbook.sheetName,
        totalRows: result.totalRows,
        createdCount: result.createdCount,
        updatedCount: result.updatedCount,
        flaggedCount: result.flaggedCount,
        skippedCount: result.skippedCount,
        failedCount: result.failedCount,
      },
    });
    invalidateCacheByPrefix("assets_");
    invalidateCacheByPrefix("asset_count");
    return NextResponse.json(result);
  } catch (error) {
    logger.error("Failed to commit fixed asset import", { error });
    const message = error instanceof Error ? error.message : "Unknown error";
    const status =
      message === "Unauthorized"
        ? 401
        : message.startsWith("Forbidden")
          ? 403
          : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
