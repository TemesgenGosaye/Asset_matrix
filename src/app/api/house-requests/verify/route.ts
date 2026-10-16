import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { handleRouteError, requireOrgId } from "@/lib/api-route";
import { verifyEmpIdQuerySchema } from "@/lib/house-requests/schemas";
import {
  HouseRequestRejectedError,
  verifyEmployeeForHouseRequest,
} from "@/lib/house-requests/service";
import { canViewSensitiveEmployeeData } from "@/lib/employees/access";

export const dynamic = "force-dynamic";

/**
 * GET /api/house-requests/verify?empId=EMP-0042
 *
 * Verify an Employee ID against the Employee table — the single source of truth —
 * and return the employee record, the eligibility verdict from the central
 * job-grade rule, and the two conditions that would block a request.
 *
 * WHAT MAKES THIS DIFFERENT FROM `POST /api/house-requests`
 * Verification never decides; it reports. It succeeds for an employee who is on
 * leave, who has no job grade, who already holds a house, or who already has an
 * open request — because the page's next move is different in every one of those
 * cases, and a 404 cannot carry that. The blocking verdict lives in the body
 * (`isEligible`, `alreadyHasActiveAllocation`, `hasOpenRequest`), and the submit
 * endpoint is what actually refuses.
 *
 * THE 404 CONTRACT
 * Only two conditions produce a 404, and both carry the same `error` string:
 *
 *   - no employee carries this Employee ID in the caller's organization;
 *   - the employee row exists but has been archived (soft-deleted).
 *
 * They share the message because the caller cannot act differently on them —
 * both mean "there is nothing here to file for", and naming which one it was
 * would leak whether a deleted person's Employee ID is still valid. A distinct
 * `code` is returned alongside, so a client that wants to say "this record has
 * been archived" without leaking it to an unauthorized caller can.
 *
 * INACTIVE IS NOT A 404
 * An employee on leave is a real person with a real record. Returning 404 would
 * tell the officer the ID is wrong, which is a statement about the register
 * rather than about this request, and would send them to the Employee module to
 * re-check something the register already answered.
 *
 * GATED on `house_request:create` — the same permission the submit action needs,
 * so the page can never verify a row the caller could not act on.
 */
export async function GET(req: NextRequest) {
  try {
    const authUser = await requirePermission("house_request:create");
    const orgId = await requireOrgId();

    const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
    const parsed = verifyEmpIdQuerySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Employee ID not found",
          code: "EMPLOYEE_NOT_FOUND",
          details: parsed.error.issues.map((issue) => ({
            field: issue.path.join(".") || "_root",
            message: issue.message,
          })),
        },
        { status: 404 },
      );
    }

    const result = await verifyEmployeeForHouseRequest({
      organizationId: orgId,
      empId: parsed.data.empId,
      canViewSensitive: await canViewSensitiveEmployeeData(authUser),
    });

    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    // Both policy rejections above already carry the 404 contract; anything the
    // service raises for a reason the client cannot act on repeats it rather
    // than inventing a second vocabulary.
    if (e instanceof HouseRequestRejectedError) {
      const status =
        e.code === "EMPLOYEE_NOT_FOUND" || e.code === "EMPLOYEE_ARCHIVED"
          ? 404
          : e.status;
      return NextResponse.json(
        { error: "Employee ID not found", code: e.code },
        { status },
      );
    }
    return handleRouteError(e, {
      label: "GET /api/house-requests/verify",
      message: "Failed to verify the employee ID",
    });
  }
}
