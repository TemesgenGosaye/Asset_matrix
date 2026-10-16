/**
 * GET /api/rent/export - download the rent register as CSV or Excel.
 *
 * Honours the exact same filters as `GET /api/rent`, so what is downloaded always
 * matches what is on screen. National ID is exported masked unless the caller
 * carries `rent:sensitive_view`, and `X-Export-National-Id-Masked` tells the
 * client which happened.
 */

import { type NextRequest } from "next/server";
import { buildExportResponse } from "@/lib/export";
import { canViewSensitiveRentData } from "@/lib/rent/access";
import { mapRentError, parseRentQuery, withRentContext } from "@/lib/rent/api";
import { rentExportQuerySchema } from "@/lib/rent/schemas";
import { getRentersForExport } from "@/lib/rent/queries";
import {
  RENT_EXPORT_COLUMNS,
  rentFileStem,
  toRentExportRow,
} from "@/lib/rent/export";

export async function GET(req: NextRequest) {
  const { response, context } = await withRentContext(
    "rent:export",
    "GET /api/rent/export",
  );
  if (response) return response;
  const { user, organizationId } = context!;

  try {
    const { format, ...query } = parseRentQuery(
      new URL(req.url),
      rentExportQuerySchema,
    );

    const canSeeSensitive = await canViewSensitiveRentData(user);
    const { rows, truncated } = await getRentersForExport({
      organizationId,
      query,
      canSeeSensitive,
    });

    const payload = rows.map(toRentExportRow);
    const exportResponse = await buildExportResponse(
      payload,
      RENT_EXPORT_COLUMNS,
      format,
      rentFileStem(),
      "Rent Register",
    );

    exportResponse.headers.set("X-Export-Row-Count", String(rows.length));
    if (truncated) exportResponse.headers.set("X-Export-Truncated", "true");
    exportResponse.headers.set(
      "X-Export-National-Id-Masked",
      String(!canSeeSensitive),
    );
    return exportResponse;
  } catch (error) {
    return mapRentError(error, "GET /api/rent/export error");
  }
}

export const dynamic = "force-dynamic";
