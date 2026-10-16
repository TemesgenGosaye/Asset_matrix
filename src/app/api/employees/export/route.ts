import { NextRequest, NextResponse } from "next/server";
import { buildExportResponse, type ExportFormat } from "@/lib/export";
import { canViewSensitiveEmployeeData } from "@/lib/employees/access";
import {
  mapErrorToResponse,
  parseQuery,
  withEmployeeContext,
} from "@/lib/employees/api";
import { getEmployeesForExport } from "@/lib/employees/queries";
import { EMPLOYEE_EXPORT_COLUMNS, toExportRow } from "@/lib/employees/export";
import { employeeListQuerySchema } from "@/lib/employees/schemas";

/**
 * GET /api/employees/export
 *
 * Streams the employee register as CSV or XLSX. Honours the same filters as the
 * list endpoint so "Export" always matches what the user is looking at, and
 * masks National IDs for callers without the sensitive-data permission.
 */
export async function GET(req: NextRequest) {
  try {
    const { response, context } = await withEmployeeContext("employee:export");
    if (response) return response;
    const { user, organizationId } = context!;

    const url = new URL(req.url);
    const query = parseQuery(url, employeeListQuerySchema);

    const formatParam = url.searchParams.get("format");
    const format: ExportFormat = formatParam === "xlsx" ? "xlsx" : "csv";

    const canSeeSensitive = await canViewSensitiveEmployeeData(user);
    const { rows, truncated } = await getEmployeesForExport({
      organizationId,
      query,
      canSeeSensitive,
    });

    const payload = rows.map(toExportRow);
    const stamp = new Date().toISOString().slice(0, 10);

    const exportResponse = await buildExportResponse(
      payload,
      [...EMPLOYEE_EXPORT_COLUMNS],
      format,
      `employees-${stamp}`,
      "Employees",
    );

    // Tell the caller (and the UI) that the file was capped, so a truncated
    // export can never be mistaken for the complete register.
    exportResponse.headers.set("X-Export-Row-Count", String(rows.length));
    if (truncated) {
      exportResponse.headers.set("X-Export-Truncated", "true");
    }
    exportResponse.headers.set(
      "X-Export-National-Id-Masked",
      String(!canSeeSensitive),
    );

    return exportResponse;
  } catch (error) {
    return mapErrorToResponse(error, "GET /api/employees/export error");
  }
}

export const dynamic = "force-dynamic";
