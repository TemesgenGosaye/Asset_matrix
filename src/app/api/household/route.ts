import { type NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireNotDemoMode,
  requirePermission,
} from "@/lib/api-auth";
import {
  createHouseholdSchema,
  updateHouseholdSchema,
  uuidSchema,
  validateBody,
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
import { handleRouteError, requireOrgId } from "@/lib/api-route";
import { validateHouseNumberFormat, generateNextHID } from "@/lib/household";
import { CACHE_DOMAIN, invalidateAssistantCache } from "@/lib/ai/cache";

const HOUSEHOLD_SORT_FIELDS = [
  "srNo",
  "hid",
  "houseNumber",
  "houseType",
  "rgType",
  "status",
  "locationName",
  "createdAt",
];

// Advisory lock key used to serialize HID generation per-create, preventing
// two concurrent requests from allocating the same HID.
const HID_GENERATION_LOCK_KEY = 7282710;

const householdInclude = {
  location: {
    select: {
      locationid: true,
      locationname: true,
    },
  },
};

// GET /api/household
export async function GET(req: NextRequest) {
  try {
    await requirePermission("household:view");

    const orgId = await requireOrgId();

    const searchParams = req.nextUrl.searchParams;

    // Filters
    const where: Record<string, unknown> = { organizationId: orgId };

    const status = searchParams.get("status");
    if (status && status !== "all") {
      where.status = status;
    }

    const houseType = searchParams.get("houseType");
    if (houseType && houseType !== "all") {
      where.houseType = houseType;
    }

    const rgType = searchParams.get("rgType");
    if (rgType && rgType !== "all") {
      where.rgType = rgType;
    }

    const locationId = searchParams.get("locationId");
    if (locationId && locationId !== "all") {
      where.locationId = locationId;
    }

    // Search filter
    const query = searchParams.get("search")?.trim();
    if (query) {
      where.OR = [
        { hid: { contains: query, mode: "insensitive" } },
        { houseNumber: { contains: query, mode: "insensitive" } },
        { locationName: { contains: query, mode: "insensitive" } },
        { damageNotes: { contains: query, mode: "insensitive" } },
      ];
    }

    // If no `page` param, return all matching results
    if (!searchParams.has("page")) {
      const items = await prisma.household.findMany({
        where,
        include: householdInclude,
        orderBy: { srNo: "asc" },
      });
      return NextResponse.json(items, { status: 200 });
    }

    const params = parsePaginationParams(searchParams);
    const prismaArgs = buildPrismaArgs(params, HOUSEHOLD_SORT_FIELDS);

    const [items, total] = await Promise.all([
      prisma.household.findMany({
        where,
        include: householdInclude,
        ...prismaArgs,
      }),
      prisma.household.count({ where }),
    ]);

    return NextResponse.json(buildPaginatedResponse(items, total, params), {
      status: 200,
    });
  } catch (e) {
    return handleRouteError(e, {
      label: "GET /api/household",
      message: "Failed to fetch households",
    });
  }
}

// POST /api/household
export async function POST(req: NextRequest) {
  try {
    const demoBlock = requireNotDemoMode();
    if (demoBlock) return demoBlock;

    const user = await requirePermission("household:create");

    const body = await req.json();
    const data = validateBody(createHouseholdSchema, body);
    if (data instanceof NextResponse) return data;

    const orgId = await requireOrgId();

    // Validate house number prefix matches house type and staff category
    const prefixCheck = validateHouseNumberFormat(
      data.houseNumber,
      data.houseType,
      data.staffCategory,
    );
    if (!prefixCheck.valid) {
      return NextResponse.json(
        { error: prefixCheck.error },
        { status: 400 },
      );
    }

    // Resolve location name if locationId provided
    let locationName = data.locationName || null;
    if (data.locationId) {
      const loc = await prisma.location.findUnique({
        where: { locationid: data.locationId },
        select: { locationname: true },
      });
      if (loc?.locationname && !locationName) {
        locationName = loc.locationname;
      }
    }

    // If status is Active, ensure damage fields are cleanly reset
    const damageInfo =
      data.status === "Active"
        ? {
            damageWindow: false,
            damageDoor: false,
            damageWaterPanel: false,
            damageRoof: false,
            damageWall: false,
            damageElectricity: false,
            damageNotes: null,
          }
        : {
            damageWindow: data.damageWindow,
            damageDoor: data.damageDoor,
            damageWaterPanel: data.damageWaterPanel,
            damageRoof: data.damageRoof,
            damageWall: data.damageWall,
            damageElectricity: data.damageElectricity,
            damageNotes: data.damageNotes || null,
          };

    // Concurrency-safe creation inside transaction.
    // The HID is AUTO-GENERATED by the server (canonical 106-90-XXXX format)
    // so the registrar never has to think about identifiers.
    const created = await prisma.$transaction(async (tx) => {
      // Serialize HID generation across concurrent creates to avoid gaps/collisions.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${HID_GENERATION_LOCK_KEY})`;

      const requestedHid = await generateNextHID(orgId, tx);

      // Check duplicate house number within organization
      const existingHouseNumber = await tx.household.findFirst({
        where: {
          organizationId: orgId,
          houseNumber: { equals: data.houseNumber, mode: "insensitive" },
        },
      });
      if (existingHouseNumber) {
        throw new Error(`HOUSE_NUMBER_EXISTS:${data.houseNumber}`);
      }

      return tx.household.create({
        data: {
          organizationId: orgId,
          hid: requestedHid,
          houseType: data.houseType,
          staffCategory: data.houseType === "Staff" ? data.staffCategory : null,
          houseNumber: data.houseNumber,
          rgType: data.rgType,
          locationId: data.locationId || null,
          locationName,
          status: data.status,
          bedCount: data.bedCount ?? 0,
          chairsCount: data.chairsCount ?? 0,
          lockerCount: data.lockerCount ?? 0,
          tablesCount: data.tablesCount ?? 0,
          ...damageInfo,
          createdBy: user.id ?? null,
        },
        include: householdInclude,
      });
    });

    await createAuditLog({
      userId: user.id ?? null,
      action: AUDIT_ACTIONS.CREATE,
      entity: AUDIT_ENTITIES.HOUSEHOLD,
      entityId: created.id,
      details: {
        srNo: created.srNo,
        hid: created.hid,
        houseNumber: created.houseNumber,
        houseType: created.houseType,
        status: created.status,
      },
    });

    // A new house changes every count the assistant quotes.
    invalidateAssistantCache(orgId, [CACHE_DOMAIN.housing, CACHE_DOMAIN.queue]);

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    return handleRouteError(e, {
      label: "POST /api/household",
      message: "Failed to create household",
    });
  }
}

// PUT /api/household
export async function PUT(req: NextRequest) {
  try {
    const demoBlock = requireNotDemoMode();
    if (demoBlock) return demoBlock;

    const user = await requirePermission("household:edit");

    const body = await req.json();
    const data = validateBody(updateHouseholdSchema, body);
    if (data instanceof NextResponse) return data;

    const orgId = await requireOrgId();

    const existing = await prisma.household.findFirst({
      where: { id: data.id, organizationId: orgId },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Household not found" },
        { status: 404 },
      );
    }

    // If houseNumber or houseType changed, validate prefix format
    const effectiveHouseType = data.houseType ?? existing.houseType;
    const effectiveStaffCategory =
      effectiveHouseType === "Staff"
        ? (data.staffCategory ?? existing.staffCategory)
        : null;
    const effectiveHouseNumber = data.houseNumber ?? existing.houseNumber;

    const prefixCheck = validateHouseNumberFormat(
      effectiveHouseNumber,
      effectiveHouseType,
      effectiveStaffCategory,
    );
    if (!prefixCheck.valid) {
      return NextResponse.json(
        { error: prefixCheck.error },
        { status: 400 },
      );
    }

    // Check duplicate houseNumber if changed
    if (data.houseNumber && data.houseNumber !== existing.houseNumber) {
      const duplicate = await prisma.household.findFirst({
        where: {
          organizationId: orgId,
          houseNumber: { equals: data.houseNumber, mode: "insensitive" },
          NOT: { id: data.id },
        },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: `House number '${data.houseNumber}' is already in use.` },
          { status: 409 },
        );
      }
    }

    // Check duplicate HID if changed
    if (data.hid && data.hid !== existing.hid) {
      const duplicate = await prisma.household.findFirst({
        where: {
          organizationId: orgId,
          hid: { equals: data.hid, mode: "insensitive" },
          NOT: { id: data.id },
        },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: `House ID '${data.hid}' is already in use.` },
          { status: 409 },
        );
      }
    }

    // Location name resolution
    let locationName = data.locationName;
    if (data.locationId && !locationName) {
      const loc = await prisma.location.findUnique({
        where: { locationid: data.locationId },
        select: { locationname: true },
      });
      if (loc?.locationname) {
        locationName = loc.locationname;
      }
    }

    // Damage logic based on status
    const effectiveStatus = data.status ?? existing.status;
    let damageUpdates: Record<string, unknown> = {};
    if (effectiveStatus === "Active") {
      damageUpdates = {
        damageWindow: false,
        damageDoor: false,
        damageWaterPanel: false,
        damageRoof: false,
        damageWall: false,
        damageElectricity: false,
        damageNotes: null,
      };
    } else {
      if (data.damageWindow !== undefined) damageUpdates.damageWindow = data.damageWindow;
      if (data.damageDoor !== undefined) damageUpdates.damageDoor = data.damageDoor;
      if (data.damageWaterPanel !== undefined) damageUpdates.damageWaterPanel = data.damageWaterPanel;
      if (data.damageRoof !== undefined) damageUpdates.damageRoof = data.damageRoof;
      if (data.damageWall !== undefined) damageUpdates.damageWall = data.damageWall;
      if (data.damageElectricity !== undefined) damageUpdates.damageElectricity = data.damageElectricity;
      if (data.damageNotes !== undefined) damageUpdates.damageNotes = data.damageNotes;
    }

    const updated = await prisma.household.update({
      where: { id: data.id },
      data: {
        ...(data.hid && { hid: data.hid }),
        ...(data.houseType && { houseType: data.houseType }),
        staffCategory: effectiveStaffCategory,
        ...(data.houseNumber && { houseNumber: data.houseNumber }),
        ...(data.rgType && { rgType: data.rgType }),
        ...(data.locationId !== undefined && { locationId: data.locationId || null }),
        ...(locationName !== undefined && { locationName }),
        ...(data.status && { status: data.status }),
        ...(data.bedCount !== undefined && { bedCount: data.bedCount }),
        ...(data.chairsCount !== undefined && { chairsCount: data.chairsCount }),
        ...(data.lockerCount !== undefined && { lockerCount: data.lockerCount }),
        ...(data.tablesCount !== undefined && { tablesCount: data.tablesCount }),
        ...damageUpdates,
      },
      include: householdInclude,
    });

    await createAuditLogWithDiff({
      userId: user.id ?? null,
      action: AUDIT_ACTIONS.UPDATE,
      entity: AUDIT_ENTITIES.HOUSEHOLD,
      entityId: updated.id,
      before: existing as unknown as Record<string, unknown>,
      after: updated as unknown as Record<string, unknown>,
      details: {
        hid: updated.hid,
        houseNumber: updated.houseNumber,
      },
    });

    // Register status and occupancy status both feed the assistant's counters.
    invalidateAssistantCache(orgId, [CACHE_DOMAIN.housing, CACHE_DOMAIN.queue]);

    return NextResponse.json(updated, { status: 200 });
  } catch (e) {
    return handleRouteError(e, {
      label: "PUT /api/household",
      message: "Failed to update household",
    });
  }
}

// DELETE /api/household
export async function DELETE(req: NextRequest) {
  try {
    const demoBlock = requireNotDemoMode();
    if (demoBlock) return demoBlock;

    const user = await requirePermission("household:delete");

    const body = await req.json();
    const id = validateBody(uuidSchema, body?.id);
    if (id instanceof NextResponse) return id;

    const orgId = await requireOrgId();

    const household = await prisma.household.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!household) {
      return NextResponse.json(
        { error: "Household not found" },
        { status: 404 },
      );
    }

    await prisma.household.delete({ where: { id } });

    await createAuditLog({
      userId: user.id ?? null,
      action: AUDIT_ACTIONS.DELETE,
      entity: AUDIT_ENTITIES.HOUSEHOLD,
      entityId: id,
      details: {
        srNo: household.srNo,
        hid: household.hid,
        houseNumber: household.houseNumber,
      },
    });

    invalidateAssistantCache(orgId, [CACHE_DOMAIN.housing, CACHE_DOMAIN.queue]);

    return NextResponse.json(
      { message: "Household deleted successfully" },
      { status: 200 },
    );
  } catch (e) {
    return handleRouteError(e, {
      label: "DELETE /api/household",
      message: "Failed to delete household",
    });
  }
}

export const dynamic = "force-dynamic";