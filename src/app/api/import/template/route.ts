import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requirePermission } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

/**
 * GET /api/import/template?entityType=asset
 *
 * Returns a styled .xlsx template file for asset import.
 * Required columns (Sr. No., Asset Type, PID (Asset ID), Condition, Location,
 * Brand, Review Date, Remark) are highlighted in blue; optional columns are
 * gray. Field hints are attached as Excel comments on the headers. No sample
 * or fake records are included.
 */
export async function GET(req: NextRequest) {
  try {
    await requirePermission("import:execute");

    const entityType = req.nextUrl.searchParams.get("entityType");
    if (entityType !== "asset") {
      return NextResponse.json(
        { error: "Template only available for asset entity." },
        { status: 400 },
      );
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = "Asset Tracker";
    wb.created = new Date();

    const ws = wb.addWorksheet("Asset Import", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    // Define headers in user-specified order (required first, then optional)
    const headerDefs = [
      { field: "srNo",          label: "Sr. No.",         width: 12, required: true },
      { field: "assetType",     label: "Asset Type",      width: 20, required: true },
      { field: "pid",           label: "PID (Asset ID)",  width: 22, required: true },
      { field: "condition",     label: "Condition",       width: 18, required: true },
      { field: "location",      label: "Location",        width: 18, required: true },
      { field: "brand",         label: "Brand",           width: 18, required: true },
      { field: "reviewDate",    label: "Review Date",     width: 16, required: true },
      { field: "notes",         label: "Remark",          width: 26, required: true },
      { field: "assetname",     label: "Asset Name",      width: 24, required: false },
      { field: "assettag",      label: "Tag",             width: 16, required: false },
      { field: "purchaseprice", label: "Purchase Price",  width: 16, required: false },
      { field: "purchasedate",  label: "Purchase Date",   width: 16, required: false },
      { field: "department",    label: "Department",      width: 18, required: false },
      { field: "mobile",        label: "Mobile",          width: 10, required: false },
      { field: "requestable",   label: "Requestable",     width: 12, required: false },
      { field: "specs",         label: "Specifications",  width: 24, required: false },
    ];

    // Hint text for each column (shown as an Excel comment on the header)
    const hints: Record<string, string> = {
      srNo:          "REQUIRED. Row number, e.g. 1, 2, 3... Just for your reference — not saved.",
      assetType:     "REQUIRED. Type name exactly as it appears in the system.",
      pid:           "REQUIRED, must be unique. Example: 1-06-LAP-IT-001",
      condition:     "REQUIRED column. Status name exactly as in the system (blank = default status).",
      location:      "REQUIRED column. Location name exactly as in the system.",
      brand:         "REQUIRED column. Manufacturer name exactly as in the system.",
      reviewDate:    "REQUIRED column. YYYY-MM-DD or M/D/YYYY.",
      notes:         "REQUIRED column. Free text — any remark for the asset.",
      assetname:     "Optional. Defaults to the PID if left blank.",
      assettag:      "Optional. Defaults to the PID if left blank.",
      purchaseprice: "Optional. Numbers only, e.g. 1234.56",
      purchasedate:  "Optional. YYYY-MM-DD or M/D/YYYY.",
      department:    "Optional. Department name exactly as in the system.",
      mobile:        "Optional. Yes / No / True / False",
      requestable:   "Optional. Yes / No / True / False",
      specs:         "Optional. Free text.",
    };

    // Header row styling
    const headerRow = ws.getRow(1);
    headerRow.height = 24;

    headerDefs.forEach((h, idx) => {
      const col = ws.getColumn(idx + 1);
      col.header = h.label;
      col.width = h.width;
      col.alignment = { vertical: "middle" };

      const cell = headerRow.getCell(idx + 1);
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: h.required ? "FF2563EB" : "FF6B7280" }, // blue for required, gray for optional
      };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
      };
      cell.note = hints[h.field] || undefined;
    });

    // Add autofilter
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: headerDefs.length },
    };

    // Set date column formats
    const dateCols = headerDefs
      .map((h, i) => (h.field === "reviewDate" || h.field === "purchasedate" ? i + 1 : -1))
      .filter((i) => i > 0);
    for (const colIdx of dateCols) {
      ws.getColumn(colIdx).numFmt = "yyyy-mm-dd";
    }

    // Write to buffer
    const buffer = await wb.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="Asset_Import_Template.xlsx"',
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    logger.error("Error generating import template", { error });
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith("Forbidden")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Failed to generate template" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";