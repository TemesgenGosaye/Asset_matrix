import { type NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { handleRouteError, requireOrgId } from "@/lib/api-route";
import { compareHouses } from "@/lib/house-queue/recommendation";
import { getActiveConfig } from "@/lib/house-queue/config/service";
import { HOUSE_TYPES } from "@/lib/household-constants";

// GET /api/house-queue/available-houses?houseType=A
// Decision-support list used by the Reassign dialog and the Release Workflow's
// TRANSFER panel: active, unallocated houses of one category, ordered by the
// deterministic Engine B ranking. Read-only — any queue capability may use it.
export async function GET(req: NextRequest) {
  try {
    await requirePermission("house_queue:view", "house_queue:allocate", "house_queue:manage");

    const orgId = await requireOrgId();
    const houseType = req.nextUrl.searchParams.get("houseType");

    if (!houseType || !(HOUSE_TYPES as readonly string[]).includes(houseType)) {
      return NextResponse.json(
        { error: `houseType must be one of: ${HOUSE_TYPES.join(", ")}` },
        { status: 400 },
      );
    }

    const [houses, allocs] = await Promise.all([
      prisma.household.findMany({
        where: { organizationId: orgId, houseType, status: "Active" },
        select: {
          id: true,
          houseNumber: true,
          hid: true,
          houseType: true,
          rgType: true,
          locationName: true,
          status: true,
        },
        orderBy: { houseNumber: "asc" },
      }),
      prisma.houseAllocation.findMany({
        where: { organizationId: orgId, status: "allocated" },
        select: { householdId: true },
      }),
    ]);

    const allocatedHouseIds = new Set(
      allocs
        .map((a) => a.householdId)
        .filter((id): id is string => Boolean(id)),
    );

    const available = houses.filter((h) => !allocatedHouseIds.has(h.id));
    const rules = (await getActiveConfig(orgId)).payload.recommendation;
    const sorted = [...available].sort((a, b) => compareHouses(a, b, rules));

    return NextResponse.json({ houses: sorted }, { status: 200 });
  } catch (e) {
    return handleRouteError(e, {
      label: "GET /api/house-queue/available-houses",
      message: "Failed to load available houses",
    });
  }
}