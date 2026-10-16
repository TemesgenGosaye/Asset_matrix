import { NextRequest, NextResponse } from "next/server";
import { canViewSensitiveEmployeeData } from "@/lib/employees/access";
import {
  mapErrorToResponse,
  parseJsonBody,
  parseQuery,
  withEmployeeContext,
  withEmployeeMutationContext,
} from "@/lib/employees/api";
import { listEmployees } from "@/lib/employees/queries";
import {
  createEmployee,
  invalidateEmployeeCache,
} from "@/lib/employees/service";
import {
  createEmployeeSchema,
  employeeListQuerySchema,
} from "@/lib/employees/schemas";

/**
 * GET /api/employees
 *
 * Always paginated. Filtering, sorting and search are executed by PostgreSQL;
 * National IDs are masked unless the caller holds a sensitive-data permission.
 */
export async function GET(req: NextRequest) {
  try {
    const { response, context } = await withEmployeeContext("employee:view");
    if (response) return response;
    const { user, organizationId } = context!;

    const query = parseQuery(new URL(req.url), employeeListQuerySchema);

    const canSeeSensitive = await canViewSensitiveEmployeeData(user);
    const result = await listEmployees({
      organizationId,
      query,
      canSeeSensitive,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return mapErrorToResponse(error, "GET /api/employees error");
  }
}

/** POST /api/employees — create a single employee. */
export async function POST(req: NextRequest) {
  try {
    const { response, context } =
      await withEmployeeMutationContext("employee:create");
    if (response) return response;
    const { user, organizationId } = context!;

    const { data, response: parseError } = await parseJsonBody(
      req,
      createEmployeeSchema,
    );
    if (parseError) return parseError;

    const canSeeSensitive = await canViewSensitiveEmployeeData(user);
    const { employee } = await createEmployee({
      organizationId,
      actorId: user.id ?? null,
      input: data,
    });

    invalidateEmployeeCache();

    return NextResponse.json({ employee }, { status: 201 });
  } catch (error) {
    return mapErrorToResponse(error, "POST /api/employees error");
  }
}

export const dynamic = "force-dynamic";
