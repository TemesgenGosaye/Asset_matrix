import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { handleRouteError, requireOrgId } from "@/lib/api-route";
import { listEligibleTransferHouses } from "@/lib/house-queue/service";

// GET /api/house-queue/transfer/candidates?employeeId=<id>
//
// The eligibility-filtered house list for the TRANSFER step.
//
// Note the parameter is an *employee*, not a house type: the qualifying
// category is derived from the employee's grade in the database, so the client
// cannot ask for a category the employee does not qualify for. This is the same
// function the transfer confirmation runs, so the offered list and the accepted
// house can never disagree.
export async function GET(req: NextRequest) {
  try {
    await requirePermission(
      "house_queue:view",
      "house_queue:allocate",
      "house_queue:manage",
    );

    const orgId = await requireOrgId();
    const employeeId = req.nextUrl.searchParams.get("employeeId");

    if (!employeeId) {
      return NextResponse.json(
        { error: "employeeId is required" },
        { status: 400 },
      );
    }

    const result = await listEligibleTransferHouses(orgId, employeeId);

    return NextResponse.json(
      {
        jobGrade: result.jobGrade,
        eligibleCategory: result.eligibleCategory,
        houses: result.candidates,
      },
      { status: 200 },
    );
  } catch (e) {
    return handleRouteError(e, {
      label: "GET /api/house-queue/transfer/candidates",
      message: "Failed to load eligible transfer houses",
    });
  }
}
