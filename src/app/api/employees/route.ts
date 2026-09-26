import { type NextRequest, NextResponse } from "next/server";
import prisma from "../../../lib/prisma";
import { Prisma } from "@prisma/client";
import {
  requireApiAuth,
  requireNotDemoMode,
  requirePermission,
} from "@/lib/api-auth";
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  uuidSchema,
} from "@/lib/validation";
import {
  createAuditLog,
  createAuditLogWithDiff,
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
} from "@/lib/audit-log";
import {
  parsePaginationParams,
  buildPrismaArgs,
  buildPaginatedResponse,
} from "@/lib/pagination";
import { logger } from "@/lib/logger";
import { invalidateCacheByPrefix } from "@/lib/cache";
import { getOrganizationContext } from "@/lib/organization-context";

const EMPLOYEE_SORT_FIELDS = [
  "employeeNumber",
  "firstname",
  "lastname",
  "jobTitle",
  "jobGrade",
  "employmentStatus",
];

const employeeInclude = {
  manager: { select: { id: true, firstname: true, lastname: true } },
  department: { select: { id: true, name: true } },
};

// GET /api/employees
export async function GET(req: NextRequest) {
  try {
    await requirePermission("employee:view");

    const orgCtx = await getOrganizationContext();
    const orgId = orgCtx?.organization?.id;
    if (!orgId) {
      return NextResponse.json(
        { error: "Organization context required" },
        { status: 400 },
      );
    }

    const searchParams = req.nextUrl.searchParams;

    // If no `page` param, return all results for backward compatibility
    if (!searchParams.has("page")) {
      const items = await prisma.employee.findMany({
        where: { organizationId: orgId },
        include: employeeInclude,
        orderBy: [{ lastname: "asc" }, { firstname: "asc" }],
      });
      return NextResponse.json(items, { status: 200 });
    }

    const params = parsePaginationParams(searchParams);
    const prismaArgs = buildPrismaArgs(params, EMPLOYEE_SORT_FIELDS);

    const where: Record<string, unknown> = { organizationId: orgId };

    // Search filter
    if (params.search) {
      const search = params.search;
      where.OR = [
        { firstname: { contains: search, mode: "insensitive" } },
        { lastname: { contains: search, mode: "insensitive" } },
        { employeeNumber: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { jobTitle: { contains: search, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        include: employeeInclude,
        ...prismaArgs,
      }),
      prisma.employee.count({ where }),
    ]);

    return NextResponse.json(buildPaginatedResponse(items, total, params), {
      status: 200,
    });
  } catch (e) {
    logger.error("GET /api/employees error", { error: e });

    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (e instanceof Error && e.message.startsWith("Forbidden")) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }

    return NextResponse.json(
      { error: "Failed to fetch employees" },
      { status: 500 },
    );
  }
}

// POST /api/employees
export async function POST(req: NextRequest) {
  try {
    const demoBlock = requireNotDemoMode();
    if (demoBlock) return demoBlock;

    const user = await requirePermission("employee:create");

    const body = await req.json();

    const validationResult = createEmployeeSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: validationResult.error.issues,
        },
        { status: 400 },
      );
    }

    const data = validationResult.data;

    const orgCtx = await getOrganizationContext();
    const orgId = orgCtx?.organization?.id;
    if (!orgId) {
      return NextResponse.json(
        { error: "Organization context required" },
        { status: 400 },
      );
    }

    // Validate that a linked user belongs to the same org
    if (data.userid) {
      const linkedUser = await prisma.user.findFirst({
        where: { userid: data.userid, organizationId: orgId },
      });
      if (!linkedUser) {
        return NextResponse.json(
          { error: "Linked user not found in this organization" },
          { status: 400 },
        );
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      return tx.employee.create({
        data: {
          organizationId: orgId,
          employeeNumber: data.employeeNumber,
          firstname: data.firstname,
          lastname: data.lastname,
          email: data.email,
          phone: data.phone,
          dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
          gender: data.gender,
          address: data.address,
          city: data.city,
          state: data.state,
          country: data.country,
          postalCode: data.postalCode,
          jobTitle: data.jobTitle,
          employmentType: data.employmentType,
          employmentStatus: data.employmentStatus,
          jobGrade: data.jobGrade,
          maritalStatus: data.maritalStatus,
          familySize: data.familySize,
          disabilityStatus: data.disabilityStatus ?? false,
          hireDate: data.hireDate ? new Date(data.hireDate) : null,
          terminationDate: data.terminationDate
            ? new Date(data.terminationDate)
            : null,
          departmentId: data.departmentId,
          managerId: data.managerId,
          userid: data.userid,
          notes: data.notes,
        },
      });
    });

    await createAuditLog({
      userId: user.id ?? null,
      action: AUDIT_ACTIONS.CREATE,
      entity: AUDIT_ENTITIES.EMPLOYEE,
      entityId: created.id,
      details: {
        employeeNumber: created.employeeNumber,
        firstname: created.firstname,
        lastname: created.lastname,
        email: created.email,
      },
    });

    invalidateCacheByPrefix("employees").catch(() => {});
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    logger.error("POST /api/employees error", { error: e });

    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (e instanceof Error && e.message.startsWith("Forbidden")) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "An employee with that number or email already exists" },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: "Failed to create employee" },
      { status: 500 },
    );
  }
}

// PUT /api/employees
export async function PUT(req: NextRequest) {
  try {
    const demoBlock = requireNotDemoMode();
    if (demoBlock) return demoBlock;

    const user = await requirePermission("employee:edit");

    const body = await req.json();

    const idValidation = uuidSchema.safeParse(body.id);
    if (!idValidation.success) {
      return NextResponse.json(
        { error: "Invalid employee ID" },
        { status: 400 },
      );
    }

    const dataValidation = updateEmployeeSchema.safeParse(body);
    if (!dataValidation.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: dataValidation.error.issues,
        },
        { status: 400 },
      );
    }

    const { id, ...data } = body;

    const orgCtx = await getOrganizationContext();
    const orgId = orgCtx?.organization?.id;
    if (!orgId) {
      return NextResponse.json(
        { error: "Organization context required" },
        { status: 400 },
      );
    }

    const existing = await prisma.employee.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 },
      );
    }

    // Validate that a linked user belongs to the same org
    if (data.userid) {
      const linkedUser = await prisma.user.findFirst({
        where: { userid: data.userid, organizationId: orgId },
      });
      if (!linkedUser) {
        return NextResponse.json(
          { error: "Linked user not found in this organization" },
          { status: 400 },
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    for (const key of Object.keys(data)) {
      const value = data[key];
      if (value === undefined) continue;
      if (["dateOfBirth", "hireDate", "terminationDate"].includes(key)) {
        updateData[key] = value ? new Date(value) : null;
      } else {
        updateData[key] = value;
      }
    }

    const updated = await prisma.employee.update({
      where: { id },
      data: updateData,
    });

    await createAuditLogWithDiff({
      userId: user.id ?? null,
      action: AUDIT_ACTIONS.UPDATE,
      entity: AUDIT_ENTITIES.EMPLOYEE,
      entityId: id,
      before: existing as unknown as Record<string, unknown>,
      after: updated as unknown as Record<string, unknown>,
    });

    invalidateCacheByPrefix("employees").catch(() => {});
    return NextResponse.json(updated, { status: 200 });
  } catch (e) {
    logger.error("PUT /api/employees error", { error: e });

    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (e instanceof Error && e.message.startsWith("Forbidden")) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 },
      );
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "An employee with that number or email already exists" },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: "Failed to update employee" },
      { status: 500 },
    );
  }
}

// DELETE /api/employees
export async function DELETE(req: NextRequest) {
  try {
    const demoBlock = requireNotDemoMode();
    if (demoBlock) return demoBlock;

    const user = await requirePermission("employee:delete");

    const body = await req.json();
    const { id } = body;

    const idValidation = uuidSchema.safeParse(id);
    if (!idValidation.success) {
      return NextResponse.json(
        { error: "Invalid employee ID" },
        { status: 400 },
      );
    }

    const orgCtx = await getOrganizationContext();
    const orgId = orgCtx?.organization?.id;
    if (!orgId) {
      return NextResponse.json(
        { error: "Organization context required" },
        { status: 400 },
      );
    }

    const employee = await prisma.employee.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    // Block deletion if this employee is a reporting manager for others
    const hasReports = await prisma.employee.count({
      where: { managerId: id },
    });
    if (hasReports > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete: this employee is the manager of ${hasReports} other employee(s). Reassign or remove their direct reports first.`,
        },
        { status: 409 },
      );
    }

    await prisma.employee.delete({ where: { id } });

    await createAuditLog({
      userId: user.id ?? null,
      action: AUDIT_ACTIONS.DELETE,
      entity: AUDIT_ENTITIES.EMPLOYEE,
      entityId: id,
      details: {
        employeeNumber: employee.employeeNumber,
        firstname: employee.firstname,
        lastname: employee.lastname,
        email: employee.email,
      },
    });

    invalidateCacheByPrefix("employees").catch(() => {});
    return NextResponse.json(
      { message: "Employee deleted successfully" },
      { status: 200 },
    );
  } catch (e) {
    logger.error("DELETE /api/employees error", { error: e });

    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (e instanceof Error && e.message.startsWith("Forbidden")) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Failed to delete employee" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";