import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission, requireNotDemoMode } from "@/lib/api-auth";
import { departmentSchema } from "@/lib/validation-organization";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit-log";
import {
  getOrganizationContext,
  scopeToOrganization,
} from "@/lib/organization-context";
import { z } from "zod";
import {
  parsePaginationParams,
  buildPrismaArgs,
  buildPaginatedResponse,
} from "@/lib/pagination";
import { logger } from "@/lib/logger";

const DEPARTMENT_SORT_FIELDS = ["name", "createdAt"];

export async function GET(req: NextRequest) {
  try {
    await requirePermission("dept:view");

    const orgContext = await getOrganizationContext();
    const orgId = orgContext?.organization?.id;

    const searchParams = req.nextUrl.searchParams;
    const organizationId = searchParams.get("organizationId");
    const isActive = searchParams.get("isActive");
    const search = searchParams.get("search");

    // Use the query param if provided, otherwise scope to user's org
    const where: Record<string, unknown> = scopeToOrganization(
      organizationId ? { organizationId } : {},
      orgId,
    );

    // Filter by active status
    if (isActive !== null && isActive !== undefined && isActive !== "all") {
      where.isActive = isActive === "true";
    }

    // Search filter
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
      ];
    }

    const include = {
      organization: {
        select: { id: true, name: true, slug: true },
      },
      parent: {
        select: { id: true, name: true, code: true },
      },
      _count: {
        select: { children: true, users: true, employees: true },
      },
    };

    // If no `page` param, return all results for backward compatibility
    if (!searchParams.has("page")) {
      const departments = await prisma.department.findMany({
        where,
        include,
        orderBy: [
          { sortOrder: "asc" },
          { code: "asc" },
          { name: "asc" },
        ],
      });
      return NextResponse.json(departments);
    }

    // Paginated path
    const params = parsePaginationParams(searchParams);
    const prismaArgs = buildPrismaArgs(params, DEPARTMENT_SORT_FIELDS);

    const [departments, total] = await Promise.all([
      prisma.department.findMany({ where, include, ...prismaArgs }),
      prisma.department.count({ where }),
    ]);

    return NextResponse.json(
      buildPaginatedResponse(departments, total, params),
      { status: 200 },
    );
  } catch (error) {
    logger.error("Error fetching departments", { error });
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith("Forbidden")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Failed to fetch departments" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const demoBlock = requireNotDemoMode();
    if (demoBlock) return demoBlock;

    const authUser = await requirePermission("dept:manage");

    const orgContext = await getOrganizationContext();
    const orgId = orgContext?.organization?.id;

    const body = await req.json();
    const validated = departmentSchema.parse(body);

    // If user has an org, ensure they can only create departments in their own org
    if (orgId && validated.organizationId !== orgId) {
      return NextResponse.json(
        { error: "Cannot create department in another organization" },
        { status: 403 },
      );
    }

    // Verify organization exists
    const organization = await prisma.organization.findUnique({
      where: { id: validated.organizationId },
    });

    if (!organization) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    // If parent is specified, verify it exists and belongs to same organization
    if (validated.parentId) {
      const parent = await prisma.department.findFirst({
        where: {
          id: validated.parentId,
          organizationId: validated.organizationId,
        },
      });

      if (!parent) {
        return NextResponse.json(
          { error: "Parent department not found in this organization" },
          { status: 404 },
        );
      }
    }

    const department = await prisma.department.create({
      data: {
        name: validated.name,
        code: validated.code || null,
        description: validated.description,
        isActive: validated.isActive !== undefined ? validated.isActive : true,
        organizationId: validated.organizationId,
        parentId: validated.parentId || null,
      },
      include: {
        organization: {
          select: { id: true, name: true },
        },
      },
    });

    await createAuditLog({
      userId: authUser.id!,
      action: AUDIT_ACTIONS.CREATE,
      entity: "Department",
      entityId: department.id,
      details: {
        name: department.name,
        organizationId: department.organizationId,
      },
    });

    return NextResponse.json(department, { status: 201 });
  } catch (error) {
    logger.error("Error creating department", { error });
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith("Forbidden")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to create department" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
