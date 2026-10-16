import { NextRequest, NextResponse } from "next/server";
import { canViewSensitiveEmployeeData } from "@/lib/employees/access";
import {
  mapErrorToResponse,
  parseJsonBody,
  withEmployeeContext,
  withEmployeeMutationContext,
} from "@/lib/employees/api";
import { getEmployee } from "@/lib/employees/queries";
import {
  archiveEmployee,
  restoreEmployee,
  updateEmployee,
  invalidateEmployeeCache,
} from "@/lib/employees/service";
import { updateEmployeeSchema } from "@/lib/employees/schemas";
import { uuidSchema } from "@/lib/validation";

/** GET /api/employees/:id — fetch a single employee. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { response, context } = await withEmployeeContext("employee:view");
    if (response) return response;
    const { user, organizationId } = context!;

    const { id } = await params;
    const idValidation = uuidSchema.safeParse(id);
    if (!idValidation.success) {
      return NextResponse.json(
        { error: "Invalid employee ID." },
        { status: 400 },
      );
    }

    const canSeeSensitive = await canViewSensitiveEmployeeData(user);
    const employee = await getEmployee({
      organizationId,
      id,
      canSeeSensitive,
    });

    if (!employee) {
      return NextResponse.json(
        { error: "Employee not found." },
        { status: 404 },
      );
    }

    return NextResponse.json(employee, { status: 200 });
  } catch (error) {
    return mapErrorToResponse(error, "GET /api/employees/[id] error");
  }
}

/** PUT /api/employees/:id — update an employee. */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { response, context } =
      await withEmployeeMutationContext("employee:edit");
    if (response) return response;
    const { user, organizationId } = context!;

    const { id } = await params;
    const idValidation = uuidSchema.safeParse(id);
    if (!idValidation.success) {
      return NextResponse.json(
        { error: "Invalid employee ID." },
        { status: 400 },
      );
    }

    const { data, response: parseError } = await parseJsonBody(
      req,
      updateEmployeeSchema,
    );
    if (parseError) return parseError;

    const employee = await updateEmployee({
      organizationId,
      actorId: user.id ?? null,
      id,
      input: data,
    });

    invalidateEmployeeCache();

    return NextResponse.json(employee, { status: 200 });
  } catch (error) {
    return mapErrorToResponse(error, "PUT /api/employees/[id] error");
  }
}

/** DELETE /api/employees/:id — soft-delete (archive) the employee. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { response, context } =
      await withEmployeeMutationContext("employee:delete");
    if (response) return response;
    const { user, organizationId } = context!;

    const { id } = await params;
    const idValidation = uuidSchema.safeParse(id);
    if (!idValidation.success) {
      return NextResponse.json(
        { error: "Invalid employee ID." },
        { status: 400 },
      );
    }

    const { employee } = await archiveEmployee({
      organizationId,
      actorId: user.id ?? null,
      id,
    });

    invalidateEmployeeCache();

    return NextResponse.json(
      {
        message: "Employee archived successfully.",
        employee: {
          id: employee.id,
          employeeNumber: employee.employeeNumber,
          firstname: employee.firstname,
          lastname: employee.lastname,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    return mapErrorToResponse(error, "DELETE /api/employees/[id] error");
  }
}

/** PATCH /api/employees/:id/restore — restore a soft-deleted employee. */
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { response, context } =
      await withEmployeeMutationContext("employee:restore");
    if (response) return response;
    const { user, organizationId } = context!;

    const { id } = await params;
    const idValidation = uuidSchema.safeParse(id);
    if (!idValidation.success) {
      return NextResponse.json(
        { error: "Invalid employee ID." },
        { status: 400 },
      );
    }

    const employee = await restoreEmployee({
      organizationId,
      actorId: user.id ?? null,
      id,
    });

    invalidateEmployeeCache();

    return NextResponse.json(
      { message: "Employee restored successfully.", employee },
      { status: 200 },
    );
  } catch (error) {
    return mapErrorToResponse(error, "PATCH /api/employees/[id]/restore error");
  }
}

export const dynamic = "force-dynamic";
