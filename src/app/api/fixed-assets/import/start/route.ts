import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission, requireNotDemoMode } from "@/lib/api-auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getOrganizationContext } from "@/lib/organization-context";
import {
  MAX_FIXED_ASSET_IMPORT_BYTES,
  createFixedAssetImportJob,
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
    const context = await getOrganizationContext();
    const organizationId = user.organizationId ?? context?.organization?.id;
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
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = createHash("sha256").update(buffer).digest("hex");
    const workbook = await parseFixedAssetWorkbook(
      buffer,
      sheetName,
      headerRow,
    );
    const started = await createFixedAssetImportJob(workbook, {
      organizationId,
      userId: user.id,
      fileName: file.name,
      fileSize: file.size,
      sheetName: workbook.sheetName,
      headerRow,
      mode: "commit",
      errorHandling: normalizeErrorHandling(formData.get("errorHandling")),
      duplicatePolicy: normalizeDuplicatePolicy(
        formData.get("duplicatePolicy"),
      ),
      fileHash,
    });
    if (!started.reused) {
      await createAuditLog({
        userId: user.id,
        action: "asset.register.import.started",
        entity: "import_job",
        entityId: started.batchId,
        details: {
          fileName: file.name,
          sheetName: workbook.sheetName,
          totalRows: workbook.rows.length,
          plan: started.plan,
        },
      });
      invalidateCacheByPrefix("assets_");
      invalidateCacheByPrefix("asset_count");
    }
    return NextResponse.json(started);
  } catch (error) {
    logger.error("Failed to start fixed asset import", { error });
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
