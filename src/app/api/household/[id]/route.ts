import { type NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireNotDemoMode,
  requirePermission,
} from "@/lib/api-auth";
import {
  toggleHouseholdStatusSchema,
  uuidSchema,
  validateBody,
} from "@/lib/validation";
import {
  createAuditLogWithDiff,
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
} from "@/lib/audit-log";
import { ConflictError, handleRouteError, requireOrgId } from "@/lib/api-route";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/household/[id]
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    await requirePermission("household:view");

    const { id } = await context.params;
    const idValidation = validateBody(uuidSchema, id);
    if (idValidation instanceof NextResponse) return idValidation;

    const orgId = await requireOrgId();

    const item = await prisma.household.findFirst({
      where: { id, organizationId: orgId },
      include: {
        location: {
          select: {
            locationid: true,
            locationname: true,
          },
        },
      },
    });

    if (!item) {
      return NextResponse.json(
        { error: "Household not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(item, { status: 200 });
  } catch (e) {
    return handleRouteError(e, {
      label: "GET /api/household/[id]",
      message: "Failed to fetch household",
    });
  }
}

// PATCH /api/household/[id] - Toggle/update status with damage checklist validation
export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const demoBlock = requireNotDemoMode();
    if (demoBlock) return demoBlock;

    const user = await requirePermission("household:edit");

    const { id } = await context.params;
    const body = await req.json();

    const data = validateBody(toggleHouseholdStatusSchema, {
      ...body,
      id,
    });
    if (data instanceof NextResponse) return data;

    const orgId = await requireOrgId();

    const existing = await prisma.household.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Household not found" },
        { status: 404 },
      );
    }

    const isActivating = data.status === "Active";

    // The House Queue is the single authority over allocation state: a house
    // with a live allocation (decision ledger status "allocated") can only be
    // taken out of service by releasing that allocation through the queue, and
    // a house awaiting its handback inspection cannot be force-activated while
    // that inspection is open.
    if (isActivating) {
      const pendingInspection = await prisma.houseInspection.count({
        where: { organizationId: orgId, householdId: id, resolvedTo: null },
      });
      if (pendingInspection > 0) {
        throw new ConflictError(
          "This house is pending its handback inspection. Complete the inspection before activating the house.",
        );
      }
    }
    if (!isActivating) {
      const live = await prisma.houseAllocation.count({
        where: { householdId: id, status: "allocated" },
      });
      if (live > 0) {
        throw new ConflictError(
          "This house has a live allocation. Release it through the House Queue before deactivating the house.",
        );
      }
    }

    const updateData = {
      ...(isActivating
        ? {
            status: "Active",
            damageWindow: false,
            damageDoor: false,
            damageWaterPanel: false,
            damageRoof: false,
            damageWall: false,
            damageElectricity: false,
            damageNotes: null,
          }
        : {
            status: "Inactive",
            damageWindow: data.damageWindow,
            damageDoor: data.damageDoor,
            damageWaterPanel: data.damageWaterPanel,
            damageRoof: data.damageRoof,
            damageWall: data.damageWall,
            damageElectricity: data.damageElectricity,
            damageNotes: data.damageNotes || null,
          }),
      // Occupancy is owned here for register activate/deactivate only.
      occupancyStatus: isActivating
        ? ("Vacant" as const)
        : ("Maintenance" as const),
    };

    const updated = await prisma.household.update({
      where: { id },
      data: updateData,
      include: {
        location: {
          select: {
            locationid: true,
            locationname: true,
          },
        },
      },
    });

    await createAuditLogWithDiff({
      userId: user.id ?? null,
      action: AUDIT_ACTIONS.UPDATE,
      entity: AUDIT_ENTITIES.HOUSEHOLD,
      entityId: updated.id,
      before: existing as unknown as Record<string, unknown>,
      after: updated as unknown as Record<string, unknown>,
      details: {
        action: isActivating ? "ACTIVATE_HOUSE" : "DEACTIVATE_HOUSE",
        status: updated.status,
      },
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (e) {
    return handleRouteError(e, {
      label: "PATCH /api/household/[id]",
      message: "Failed to update household status",
    });
  }
}

export const dynamic = "force-dynamic";