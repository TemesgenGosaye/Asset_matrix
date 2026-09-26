import { type NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  requireNotDemoMode,
  requirePermission,
} from "@/lib/api-auth";
import {
  createGeneralAssetSchema,
  updateGeneralAssetSchema,
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
import { getOrganizationContext } from "@/lib/organization-context";
import { generateNextPID } from "@/lib/general-asset";

const GENERAL_ASSET_SORT_FIELDS = [
  "srNo",
  "pid",
  "itemType",
  "category",
  "locationName",
  "condition",
  "brand",
  "reviewsDate",
  "createdAt",
];

const generalAssetInclude = {
  location: {
    select: {
      locationid: true,
      locationname: true,
    },
  },
};

async function resolveLocationName(
  locationId: string | null | undefined,
): Promise<string | null> {
  if (!locationId) return null;
  const loc = await prisma.location.findUnique({
    where: { locationid: locationId },
    select: { locationname: true },
  });
  return loc?.locationname ?? null;
}

// GET /api/general-asset
export async function GET(req: NextRequest) {
  try {
    await requirePermission("general_asset:view");

    const orgCtx = await getOrganizationContext();
    const orgId = orgCtx?.organization?.id;
    if (!orgId) {
      return NextResponse.json(
        { error: "Organization context required" },
        { status: 400 },
      );
    }

    const searchParams = req.nextUrl.searchParams;

    // Filters
    const where: Record<string, unknown> = { organizationId: orgId };

    const itemType = searchParams.get("itemType");
    if (itemType && itemType !== "all") {
      where.itemType = itemType;
    }

    const category = searchParams.get("category");
    if (category && category !== "all") {
      where.category = category;
    }

    const condition = searchParams.get("condition");
    if (condition && condition !== "all") {
      where.condition = condition;
    }

    const locationId = searchParams.get("locationId");
    if (locationId && locationId !== "all") {
      where.locationId = locationId;
    }

    // Search filter
    const query = searchParams.get("search")?.trim();
    if (query) {
      where.OR = [
        { pid: { contains: query, mode: "insensitive" } },
        { itemType: { contains: query, mode: "insensitive" } },
        { category: { contains: query, mode: "insensitive" } },
        { locationName: { contains: query, mode: "insensitive" } },
        { condition: { contains: query, mode: "insensitive" } },
        { brand: { contains: query, mode: "insensitive" } },
        { remark: { contains: query, mode: "insensitive" } },
      ];
    }

    // If no `page` param, return all matching results
    if (!searchParams.has("page")) {
      const items = await prisma.generalAsset.findMany({
        where,
        include: generalAssetInclude,
        orderBy: { srNo: "asc" },
      });
      return NextResponse.json(items, { status: 200 });
    }

    const params = parsePaginationParams(searchParams);
    const prismaArgs = buildPrismaArgs(params, GENERAL_ASSET_SORT_FIELDS);

    const [items, total] = await Promise.all([
      prisma.generalAsset.findMany({
        where,
        include: generalAssetInclude,
        ...prismaArgs,
      }),
      prisma.generalAsset.count({ where }),
    ]);

    return NextResponse.json(buildPaginatedResponse(items, total, params), {
      status: 200,
    });
  } catch (e) {
    logger.error("GET /api/general-asset error", { error: e });

    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (e instanceof Error && e.message.startsWith("Forbidden")) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }

    return NextResponse.json(
      { error: "Failed to fetch general assets" },
      { status: 500 },
    );
  }
}

// POST /api/general-asset
export async function POST(req: NextRequest) {
  try {
    const demoBlock = requireNotDemoMode();
    if (demoBlock) return demoBlock;

    const user = await requirePermission("general_asset:create");

    const body = await req.json();

    const validationResult = createGeneralAssetSchema.safeParse(body);
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

    const locationName = await resolveLocationName(data.locationId);

    // Concurrency-safe creation inside transaction with per-org advisory lock
    const created = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        `general_asset_reg_${orgId}`,
      );

      // Duplicate PID check within organization
      const existingPid = await tx.generalAsset.findFirst({
        where: {
          organizationId: orgId,
          pid: { equals: data.pid, mode: "insensitive" },
        },
      });
      if (existingPid) {
        throw new Error(`PID_EXISTS:${data.pid}`);
      }

      return tx.generalAsset.create({
        data: {
          organizationId: orgId,
          itemType: data.itemType,
          pid: data.pid,
          category: data.category,
          locationId: data.locationId || null,
          locationName,
          condition: data.condition,
          brand: data.brand || null,
          reviewsDate: data.reviewsDate ? new Date(data.reviewsDate) : null,
          remark: data.remark || null,
          createdBy: user.id ?? null,
        },
        include: generalAssetInclude,
      });
    });

    await createAuditLog({
      userId: user.id ?? null,
      action: AUDIT_ACTIONS.CREATE,
      entity: AUDIT_ENTITIES.GENERAL_ASSET,
      entityId: created.id,
      details: {
        srNo: created.srNo,
        pid: created.pid,
        itemType: created.itemType,
        category: created.category,
        condition: created.condition,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    logger.error("POST /api/general-asset error", { error: e });

    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (e instanceof Error && e.message.startsWith("Forbidden")) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    if (e instanceof Error && e.message.startsWith("PID_EXISTS:")) {
      const pid = e.message.replace("PID_EXISTS:", "");
      return NextResponse.json(
        { error: `PID '${pid}' is already registered in this organization.` },
        { status: 409 },
      );
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "A general asset with that PID already exists." },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: "Failed to create general asset" },
      { status: 500 },
    );
  }
}

// PUT /api/general-asset
export async function PUT(req: NextRequest) {
  try {
    const demoBlock = requireNotDemoMode();
    if (demoBlock) return demoBlock;

    const user = await requirePermission("general_asset:edit");

    const body = await req.json();

    const idValidation = uuidSchema.safeParse(body.id);
    if (!idValidation.success) {
      return NextResponse.json(
        { error: "Invalid general asset ID" },
        { status: 400 },
      );
    }

    const dataValidation = updateGeneralAssetSchema.safeParse(body);
    if (!dataValidation.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: dataValidation.error.issues,
        },
        { status: 400 },
      );
    }

    const data = dataValidation.data;

    const orgCtx = await getOrganizationContext();
    const orgId = orgCtx?.organization?.id;
    if (!orgId) {
      return NextResponse.json(
        { error: "Organization context required" },
        { status: 400 },
      );
    }

    const existing = await prisma.generalAsset.findFirst({
      where: { id: data.id, organizationId: orgId },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "General asset not found" },
        { status: 404 },
      );
    }

    // Duplicate PID check if changed
    if (data.pid && data.pid.toLowerCase() !== existing.pid.toLowerCase()) {
      const duplicate = await prisma.generalAsset.findFirst({
        where: {
          organizationId: orgId,
          pid: { equals: data.pid, mode: "insensitive" },
          NOT: { id: data.id },
        },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: `PID '${data.pid}' is already in use.` },
          { status: 409 },
        );
      }
    }

    // Resolve location name when location changed or provided
    const effectiveLocationId =
      data.locationId !== undefined ? data.locationId : existing.locationId;
    let locationName = data.locationName;
    if (data.locationId !== undefined && data.locationId !== null) {
      const resolved = await resolveLocationName(data.locationId);
      locationName = resolved ?? locationName;
    } else if (data.locationId === null) {
      locationName = null;
    } else if (!locationName) {
      locationName = existing.locationName;
    }

    const updated = await prisma.generalAsset.update({
      where: { id: data.id },
      data: {
        ...(data.itemType && { itemType: data.itemType }),
        ...(data.pid && { pid: data.pid }),
        ...(data.category && { category: data.category }),
        ...(data.locationId !== undefined && {
          locationId: data.locationId || null,
        }),
        ...(locationName !== undefined && { locationName }),
        ...(data.condition && { condition: data.condition }),
        ...(data.brand !== undefined && { brand: data.brand || null }),
        ...(data.reviewsDate !== undefined && {
          reviewsDate: data.reviewsDate ? new Date(data.reviewsDate) : null,
        }),
        ...(data.remark !== undefined && { remark: data.remark || null }),
      },
      include: generalAssetInclude,
    });

    await createAuditLogWithDiff({
      userId: user.id ?? null,
      action: AUDIT_ACTIONS.UPDATE,
      entity: AUDIT_ENTITIES.GENERAL_ASSET,
      entityId: updated.id,
      before: existing as unknown as Record<string, unknown>,
      after: updated as unknown as Record<string, unknown>,
      details: {
        srNo: updated.srNo,
        pid: updated.pid,
      },
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (e) {
    logger.error("PUT /api/general-asset error", { error: e });

    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (e instanceof Error && e.message.startsWith("Forbidden")) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "A general asset with that PID already exists." },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: "Failed to update general asset" },
      { status: 500 },
    );
  }
}

// DELETE /api/general-asset
export async function DELETE(req: NextRequest) {
  try {
    const demoBlock = requireNotDemoMode();
    if (demoBlock) return demoBlock;

    const user = await requirePermission("general_asset:delete");

    const body = await req.json();
    const { id } = body;

    const idValidation = uuidSchema.safeParse(id);
    if (!idValidation.success) {
      return NextResponse.json(
        { error: "Invalid general asset ID" },
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

    const item = await prisma.generalAsset.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!item) {
      return NextResponse.json(
        { error: "General asset not found" },
        { status: 404 },
      );
    }

    await prisma.generalAsset.delete({ where: { id } });

    await createAuditLog({
      userId: user.id ?? null,
      action: AUDIT_ACTIONS.DELETE,
      entity: AUDIT_ENTITIES.GENERAL_ASSET,
      entityId: id,
      details: {
        srNo: item.srNo,
        pid: item.pid,
        itemType: item.itemType,
      },
    });

    return NextResponse.json(
      { message: "General asset deleted successfully" },
      { status: 200 },
    );
  } catch (e) {
    logger.error("DELETE /api/general-asset error", { error: e });

    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (e instanceof Error && e.message.startsWith("Forbidden")) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }

    return NextResponse.json(
      { error: "Failed to delete general asset" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";