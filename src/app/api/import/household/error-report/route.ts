import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requirePermission } from "@/lib/api-auth";
import { handleRouteError } from "@/lib/api-route";

interface ErrorReportRow {
  excelRow: number | string;
  houseNumber: string;
  hid?: string | null;
  message: string;
}

/**
 * POST /api/import/household/error-report
 *
 * Accepts the error rows produced by the household import (excelRow,
 * houseNumber, message) and returns a downloadable .xlsx so the registrar can
 * correct the file offline.
 *
 * Request (JSON): { rows: [{ excelRow, houseNumber, message }] }
 */
export async function POST(req: NextRequest) {
  try {
    await requirePermission("household:create");

    let rows: ErrorReportRow[];
    try {
      const body = await req.json();
      rows = Array.isArray(body?.rows) ? body.rows : [];
    } catch {
      return NextResponse.json(
        { error: "Expected { rows: [...] } JSON body." },
        { status: 400 },
      );
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: "No error rows provided. Expected { rows: [...] }." },
        { status: 400 },
      );
    }

    if (rows.length > 20_000) {
      return NextResponse.json(
        { error: "Too many error rows. Maximum is 20,000." },
        { status: 400 },
      );
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = "Asset Tracker";
    wb.created = new Date();

    const ws = wb.addWorksheet("Import Errors", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    const headers = [
      "Excel Row",
      "House Number",
      "House ID",
      "Issue",
    ] as const;

    const headerRow = ws.getRow(1);
    headerRow.height = 22;
    headers.forEach((label, idx) => {
      const col = ws.getColumn(idx + 1);
      col.width = label === "Issue" ? 90 : 16;
      const cell = headerRow.getCell(idx + 1);
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFB91C1C" },
      };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    });

    rows.forEach((r, i) => {
      const row = ws.getRow(i + 2);
      row.getCell(1).value = r.excelRow;
      row.getCell(2).value = r.houseNumber;
      row.getCell(3).value = r.hid ?? "";
      row.getCell(4).value = r.message;
      row.getCell(1).alignment = { vertical: "top" };
      row.getCell(2).alignment = { vertical: "top" };
      row.getCell(3).alignment = { vertical: "top" };
      row.getCell(4).alignment = { vertical: "top", wrapText: true };
    });

    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: headers.length },
    };

    const buffer = await wb.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="House_Import_Errors.xlsx"',
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (e) {
    return handleRouteError(e, {
      label: "POST /api/import/household/error-report",
      message: "Failed to generate error report",
    });
  }
}

export const dynamic = "force-dynamic";