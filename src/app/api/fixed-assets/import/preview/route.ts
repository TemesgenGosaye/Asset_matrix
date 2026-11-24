import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import {
  MAX_FIXED_ASSET_IMPORT_BYTES,
  parseFixedAssetWorkbook,
  suggestFixedAssetMappings,
} from "@/lib/fixed-asset-import";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isFeatureEnabled("fixedAssetRegister")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    await requirePermission("import:execute");
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
    const workbook = await parseFixedAssetWorkbook(
      Buffer.from(await file.arrayBuffer()),
      sheetName,
      headerRow,
    );
    return NextResponse.json({
      sheets: workbook.sheets,
      sheetName: workbook.sheetName,
      headers: workbook.headers,
      mappings: suggestFixedAssetMappings(workbook.headers),
      summary: workbook.summary,
      preview: workbook.preview.map((row) => ({
        rowNumber: row.rowNumber,
        parsed: row.parsed,
        raw: row.raw,
      })),
    });
  } catch (error) {
    logger.error("Failed to preview fixed asset import", { error });
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
