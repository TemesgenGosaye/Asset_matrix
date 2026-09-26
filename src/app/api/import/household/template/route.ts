import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requirePermission } from "@/lib/api-auth";
import { handleRouteError } from "@/lib/api-route";

const REQUIRED_ARG = "FF2563EB"; // blue — must include + populate
const OPTIONAL_ARG = "FF6B7280"; // gray — may include, may leave blank
const CONDITIONAL_ARG = "FFB45309"; // amber — only needed in a specific case

interface HeaderDef {
  field: string;
  label: string;
  width: number;
  tone: "required" | "optional" | "conditional";
  hint: string;
}

const HEADER_DEFS: readonly HeaderDef[] = [
  { field: "srNo", label: "Sr. No.", width: 10, tone: "required", hint: "REQUIRED column. Row number, e.g. 1, 2, 3... Just for your reference — not saved (the system assigns SR numbers automatically)." },
  { field: "houseNumber", label: "House Number", width: 16, tone: "required", hint: "REQUIRED. Must use a valid family: Staff SA1-SE999 or categories A1-E999 (e.g. SA1, SB2, A1, E5). Case-insensitive; stored in capitals." },
  { field: "houseType", label: "House Type", width: 12, tone: "required", hint: "REQUIRED. One of: Staff, A, B, C, D, E." },
  { field: "rgType", label: "R/G Type", width: 12, tone: "required", hint: "REQUIRED. One of: Regular, Guest (Guest House and Guest are both accepted)." },
  { field: "staffCategory", label: "Staff Category", width: 16, tone: "conditional", hint: "Required ONLY when House Type is Staff. One of: A, B, C, D, E (e.g. Staff + A → SA1). Leave blank for category houses A-E." },
  { field: "hid", label: "House ID (HID)", width: 14, tone: "optional", hint: "Optional. Canonical format 106-90-001. Leave blank to let the system generate the next HID automatically." },
  { field: "locationName", label: "Location Name", width: 18, tone: "optional", hint: "Optional. Free-text location, e.g. Main Campus Block B." },
  { field: "status", label: "Status", width: 12, tone: "optional", hint: "Optional. Active (ready for occupancy) or Inactive (under maintenance). Defaults to Active." },
  { field: "bedCount", label: "Bed Count", width: 12, tone: "optional", hint: "Optional. Whole number, e.g. 2. Defaults to 0." },
  { field: "chairsCount", label: "Chairs Count", width: 13, tone: "optional", hint: "Optional. Whole number, e.g. 4. Defaults to 0." },
  { field: "lockerCount", label: "Locker Count", width: 13, tone: "optional", hint: "Optional. Whole number, e.g. 2. Defaults to 0." },
  { field: "tablesCount", label: "Tables Count", width: 13, tone: "optional", hint: "Optional. Whole number, e.g. 1. Defaults to 0." },
  { field: "damageWindow", label: "Damage — Window", width: 16, tone: "optional", hint: "Optional. Yes / No. Required to tick at least one damage item when Status is Inactive." },
  { field: "damageDoor", label: "Damage — Door", width: 16, tone: "optional", hint: "Optional. Yes / No." },
  { field: "damageWaterPanel", label: "Damage — Water Panel", width: 20, tone: "optional", hint: "Optional. Yes / No." },
  { field: "damageRoof", label: "Damage — Roof", width: 16, tone: "optional", hint: "Optional. Yes / No." },
  { field: "damageWall", label: "Damage — Wall", width: 16, tone: "optional", hint: "Optional. Yes / No." },
  { field: "damageElectricity", label: "Damage — Electricity", width: 20, tone: "optional", hint: "Optional. Yes / No." },
  { field: "damageNotes", label: "Damage Notes", width: 24, tone: "optional", hint: "Optional. Free text, max 1000 characters." },
];

/**
 * GET /api/import/household/template
 *
 * Styled .xlsx template for the House Register import. Required columns are
 * blue, optional gray, conditionally-required amber. Each header carries its
 * rule as an Excel comment. No sample or fake records are included.
 */
export async function GET(_req: NextRequest) {
  try {
    await requirePermission("household:create");

    const wb = new ExcelJS.Workbook();
    wb.creator = "Asset Tracker";
    wb.created = new Date();

    const ws = wb.addWorksheet("House Register Import", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    const headerRow = ws.getRow(1);
    headerRow.height = 24;

    HEADER_DEFS.forEach((h, idx) => {
      const col = ws.getColumn(idx + 1);
      col.header = h.label;
      col.width = h.width;
      col.alignment = { vertical: "middle" };

      const cell = headerRow.getCell(idx + 1);
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: {
          argb:
            h.tone === "required"
              ? REQUIRED_ARG
              : h.tone === "conditional"
                ? CONDITIONAL_ARG
                : OPTIONAL_ARG,
        },
      };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
      };
      cell.note = h.hint;
    });

    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: HEADER_DEFS.length },
    };

    const buffer = await wb.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="House_Register_Import_Template.xlsx"',
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (e) {
    return handleRouteError(e, {
      label: "GET /api/import/household/template",
      message: "Failed to generate House Register template",
    });
  }
}

export const dynamic = "force-dynamic";