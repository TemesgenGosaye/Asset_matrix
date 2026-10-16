/**
 * GET /api/rent/summary - aggregate cards for the page header.
 *
 * Every number is a database aggregate (see `getRentSummary`), computed from the
 * live ledger, so an empty state means the database genuinely has no rent
 * records - there is no placeholder data anywhere in this module.
 */

import { type NextRequest, NextResponse } from "next/server";
import { mapRentError, withRentContext } from "@/lib/rent/api";
import { getRentSummary } from "@/lib/rent/queries";

export async function GET(req: NextRequest) {
  const { response, context } = await withRentContext(
    "rent:view",
    "GET /api/rent/summary",
  );
  if (response) return response;
  const { organizationId } = context!;

  try {
    const summary = await getRentSummary(organizationId);
    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    return mapRentError(error, "GET /api/rent/summary error");
  }
}

export const dynamic = "force-dynamic";
