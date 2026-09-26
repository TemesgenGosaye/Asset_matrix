import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { z } from "zod";
import {
  parseWorkbook,
  previewRequestSchema,
  autoMapAssetColumns,
  cleanColumnMapping,
  ASSET_IMPORT_FIELDS,
  MAX_IMPORT_FILE_SIZE,
  PREVIEW_ROW_LIMIT,
  SAMPLE_VALIDATION_ROWS,
  type SheetData,
  type AssetImportFieldId,
} from "@/lib/excel-import";

/**
 * POST /api/import/preview
 *
 * Accepts a file (xlsx/xls/csv) and returns sheet metadata, headers,
 * and preview rows. Optionally validates the first N rows when a
 * columnMapping is provided.
 *
 * Request (FormData):
 *   file            - required
 *   headerRow       - optional int (default 1)
 *   columnMapping   - optional JSON string { fieldId: colIndex }
 *   sheetName       - optional (if omitted, returns all sheets)
 */
export async function POST(req: NextRequest) {
  try {
    await requirePermission("import:execute");

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    // Validate file size
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

    // Validate file extension
    const fileName = file.name;
    if (!/\.(xlsx|xls|csv)$/i.test(fileName)) {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload .xlsx, .xls, or .csv files." },
        { status: 400 },
      );
    }

    // Parse form fields
    const headerRowRaw = formData.get("headerRow") as string | null;
    const mappingRaw = formData.get("columnMapping") as string | null;
    const sheetNameRaw = formData.get("sheetName") as string | null;

    let parsed: z.infer<typeof previewRequestSchema>;
    try {
      parsed = previewRequestSchema.parse({
        headerRow: headerRowRaw ?? 1,
        columnMapping: mappingRaw ? JSON.parse(mappingRaw) : {},
        sheetName: sheetNameRaw ?? undefined,
      });
    } catch (e) {
      if (e instanceof z.ZodError) {
        return NextResponse.json(
          { error: "Invalid parameters", details: e.issues },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: "Invalid columnMapping JSON" },
        { status: 400 },
      );
    }

    // Parse the workbook
    const buffer = Buffer.from(await file.arrayBuffer());
    let sheets: SheetData[];
    try {
      sheets = await parseWorkbook(buffer, fileName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Failed to parse workbook", { error: err, fileName });
      return NextResponse.json(
        { error: `Failed to parse file: ${msg}` },
        { status: 400 },
      );
    }

    if (sheets.length === 0) {
      return NextResponse.json(
        { error: "File contains no readable sheets." },
        { status: 400 },
      );
    }

    // Build response for each sheet (or the requested one)
    const targetSheets = parsed.sheetName
      ? sheets.filter(
          (s) => s.name.toLowerCase() === parsed.sheetName!.toLowerCase(),
        )
      : sheets;

    if (parsed.sheetName && targetSheets.length === 0) {
      return NextResponse.json(
        {
          error: `Sheet "${parsed.sheetName}" not found.`,
          availableSheets: sheets.map((s) => s.name),
        },
        { status: 400 },
      );
    }

    const sheetSummaries = targetSheets.map((sheet) => {
      // Extract preview rows
      const headerIdx = Math.min(parsed.headerRow - 1, sheet.rows.length - 1);
      const headers = headerIdx >= 0 ? sheet.rows[headerIdx] : sheet.headers;

      const dataStartIdx = parsed.headerRow; // 0-based index after header
      const dataRows = sheet.rows.slice(dataStartIdx);

      // Build auto-mapping from headers
      const autoMapping = autoMapAssetColumns(headers);

      // Merge with user-provided mapping (user overrides)
      const mergedMapping = cleanColumnMapping(
        { ...autoMapping, ...parsed.columnMapping } as Record<string, number>,
        headers.length,
      );

      // Preview rows (up to PREVIEW_ROW_LIMIT)
      const previewRows = dataRows
        .slice(0, PREVIEW_ROW_LIMIT)
        .map((row, i) => ({
          rowNumber: dataStartIdx + i + 1,
          values: headers.map((_, colIdx) => row[colIdx] ?? ""),
        }));

      return {
        name: sheet.name,
        rowCount: sheet.rowCount,
        dataRowCount: dataRows.length,
        headers,
        previewRows,
        autoMapping,
        mergedMapping,
      };
    });

    return NextResponse.json({
      fileName,
      fileSize: file.size,
      sheets: sheetSummaries,
      fieldDefs: ASSET_IMPORT_FIELDS.map((f) => ({
        id: f.id,
        label: f.label,
        required: f.required,
        kind: f.kind,
      })),
    });
  } catch (error) {
    logger.error("Error in preview endpoint", { error });
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith("Forbidden")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Failed to generate preview" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
