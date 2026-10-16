import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { handleRouteError, requireOrgId } from "@/lib/api-route";
import { validateBody } from "@/lib/validation";
import { employeeIdLookupSchema } from "@/lib/house-requests/schemas";
import {
  HouseRequestRejectedError,
  lookupEmployeeForHouseRequest,
} from "@/lib/house-requests/service";
import { canViewSensitiveEmployeeData } from "@/lib/employees/access";

export const dynamic = "force-dynamic";

/**
 * GET /api/house-requests/lookup?employeeNumber=EMP-001
 *
 * Verifies an Employee ID against the Employee table — the single source of
 * truth — and returns the read-only record for the verification form.
 *
 * Rejections (not found / archived / inactive / not eligible) come back as 400
 * with a stable `code` so the page can explain the problem and keep the search
 * field editable. An existing request or a live allocation is NOT an error here:
 * the page still needs the employee details to render alongside the notice, so
 * both are reported as data (`existingRequest`, `hasAllocatedHouse`).
 */
export async function GET(req: NextRequest) {
  try {
    const authUser = await requirePermission("house_request:create");
    const orgId = await requireOrgId();

    const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
    const parsed = validateBody(employeeIdLookupSchema, raw);
    if (parsed instanceof NextResponse) return parsed;

    const result = await lookupEmployeeForHouseRequest({
      organizationId: orgId,
      employeeNumber: parsed.employeeNumber,
      canViewSensitive: await canViewSensitiveEmployeeData(authUser),
      throwOnBlocked: false,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    if (e instanceof HouseRequestRejectedError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: e.status },
      );
    }
    return handleRouteError(e, {
      label: "GET /api/house-requests/lookup",
      message: "Failed to look up the employee",
    });
  }
}
