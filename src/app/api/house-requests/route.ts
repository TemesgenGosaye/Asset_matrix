import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { handleRouteError, requireOrgId } from "@/lib/api-route";
import { validateBody } from "@/lib/validation";
import { createHouseRequestSchema } from "@/lib/house-requests/schemas";
import {
  HouseRequestRejectedError,
  submitHouseRequest,
} from "@/lib/house-requests/service";
import { canViewSensitiveEmployeeData } from "@/lib/employees/access";
import { invalidateAssistantCache, CACHE_DOMAIN } from "@/lib/ai/cache";

export const dynamic = "force-dynamic";

/**
 * POST /api/house-requests
 *
 * Files a house request for the employee identified by `employeeNumber`.
 *
 * The body carries ONLY the Employee ID and the remarks — no name, no grade, no
 * department. The service re-reads the employee from the database, re-checks
 * liveness and eligibility against the ACTIVE engine config, re-checks for a
 * duplicate request and a live allocation, and writes the request + audit row in
 * one transaction. Nothing the browser asserts is trusted.
 */
export async function POST(req: NextRequest) {
  try {
    const authUser = await requirePermission("house_request:create");
    const orgId = await requireOrgId();

    const body = await req.json().catch(() => null);
    const data = validateBody(createHouseRequestSchema, body);
    if (data instanceof NextResponse) return data;

    const result = await submitHouseRequest({
      organizationId: orgId,
      employeeNumber: data.employeeNumber,
      remarks: data.remarks,
      submittedBy: authUser.id!,
      canViewSensitive: await canViewSensitiveEmployeeData(authUser),
    });

    // The queue ranking just gained a participant, so anything the assistant
    // cached about the queue is now stale.
    invalidateAssistantCache(orgId, [CACHE_DOMAIN.queue]);

    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    // Policy rejections carry a stable machine code the form branches on, so it
    // can keep the typed remarks on screen instead of clearing the form.
    if (e instanceof HouseRequestRejectedError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: e.status },
      );
    }
    return handleRouteError(e, {
      label: "POST /api/house-requests",
      message: "Failed to submit the house request",
    });
  }
}
