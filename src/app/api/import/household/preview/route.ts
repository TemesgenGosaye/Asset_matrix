import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { handleRouteError, requireOrgId } from "@/lib/api-route";
import {
  analyzeHouseholdWorkbook,
  fetchHouseholdImportContext,
  parseHouseholdImportMode,
  HOUSEHOLD_IMPORT_FIELDS,
  type HouseholdImportAnalysis,
} from "@/lib/household-import";
import { MAX_IMPORT_FILE_SIZE } from "@/lib/excel-import";

/**
 * POST /api/import/household/preview
 *
 * Parses, validates and classifies a House Register Excel file against the
 * live register (states owned by House Queue: allocation/inspection included).
 * No rows are written — this endpoint only returns the plan.
 *
 * Request (FormData):
 *   file       - required .xlsx/.xls/.csv
 *   mode       - "add" | "update" | "add_update"
 *   sheetName  - optional; auto-detected when omitted
 */
export async function POST(req: NextRequest) {
  try {
    await requirePermission("household:create");

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

    const orgId = await requireOrgId();
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
      const labels = analysis.missingRequiredColumns.map((id) => {
        const field = HOUSEHOLD_IMPORT_FIELDS.find((f) => f.id === id);
        return field ? field.label : id;
      });
      return NextResponse.json(
        {
          error: `The file is missing required column(s): ${labels.join(", ")}. Download the House Register template for the exact column names.`,
          missingRequiredColumns: labels,
        },
        { status: 400 },
      );
    }

    const { pendingRows, ...response } = analysis;
    void pendingRows;
    return NextResponse.json(response, { status: 200 });
  } catch (e) {
    return handleRouteError(e, {
      label: "POST /api/import/household/preview",
      message: "Failed to preview House Register import",
    });
  }
}

export const dynamic = "force-dynamic";