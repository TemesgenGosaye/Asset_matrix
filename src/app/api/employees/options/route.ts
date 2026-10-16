import { NextRequest, NextResponse } from "next/server";
import { canViewSensitiveEmployeeData } from "@/lib/employees/access";
import {
  mapErrorToResponse,
  parseQuery,
  withEmployeeContext,
} from "@/lib/employees/api";
import { getEmployeeOptions } from "@/lib/employees/queries";

/**
 * GET /api/employees/options
 *
 * Reference data for the create/edit form and filter controls: departments,
 * reporting managers and linkable system users, all scoped to the caller's
 * organization. The table does not call this — it receives the list inline.
 */
export async function GET(_req: NextRequest) {
  try {
    const { response, context } = await withEmployeeContext("employee:view");
    if (response) return response;
    const { organizationId } = context!;

    const options = await getEmployeeOptions(organizationId);
    return NextResponse.json(options, { status: 200 });
  } catch (error) {
    return mapErrorToResponse(error, "GET /api/employees/options error");
  }
}

export const dynamic = "force-dynamic";
