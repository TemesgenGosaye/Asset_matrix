import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { handleRouteError, requireOrgId } from "@/lib/api-route";
import { validateBody } from "@/lib/validation";
import { houseRequestCandidatesQuerySchema } from "@/lib/house-requests/schemas";
import { searchHouseRequestCandidates } from "@/lib/house-requests/service";

export const dynamic = "force-dynamic";

/**
 * GET /api/house-requests/candidates?q=ast&limit=8
 *
 * The people search behind the House Request page's one input.
 *
 * WHY THIS EXISTS
 * Until now that input accepted an exact Employee ID and nothing else, which
 * quietly assumed the officer at the counter had been handed a code. They
 * usually know a name. Making them leave for the Employee register, find a
 * number, and come back to type it is two page loads for one decision.
 *
 * PERMISSION — `house_request:create`, the same gate as the lookup and the
 * submit this page exists to perform. It is deliberately NOT `employee:view`:
 * that permission is not implied by filing a request, and coupling this route to
 * it would mean the field silently stops working for the housing officers it is
 * most useful to.
 *
 * DISCLOSURE — every field returned here is a subset of what
 * `GET /api/house-requests/lookup` already returns in full, to the same
 * permission, for the same organization. This route arranges those fields; it
 * does not reveal a new one. No National ID, no phone, no date of birth.
 *
 * AUTHORITY — nothing from this response is ever written. Choosing a suggestion
 * only pre-fills the field; the authoritative lookup still runs, still throws
 * its own rejection for archived / inactive / ineligible records, and the
 * submit path re-checks every gate inside its own transaction.
 */
export async function GET(req: NextRequest) {
  try {
    await requirePermission("house_request:create");
    const orgId = await requireOrgId();

    const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
    const parsed = validateBody(houseRequestCandidatesQuerySchema, raw);
    if (parsed instanceof NextResponse) return parsed;

    const result = await searchHouseRequestCandidates({
      organizationId: orgId,
      query: parsed.q,
      limit: parsed.limit,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    return handleRouteError(e, {
      label: "GET /api/house-requests/candidates",
      message: "Failed to search the employee register",
    });
  }
}
