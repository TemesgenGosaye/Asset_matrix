import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { getOrganizationContext } from "@/lib/organization-context";
import { seedOfficialDepartments } from "@/lib/department-seed";
import { OFFICIAL_DEPARTMENTS } from "@/lib/department-master";
import { logger } from "@/lib/logger";
import { invalidateCache } from "@/lib/cache";

export const dynamic = "force-dynamic";

/**
 * POST /api/departments/seed
 * Controlled initialization of the official MSF department hierarchy for the
 * caller's organization. Idempotent — safe to run repeatedly.
 */
export async function POST(req: NextRequest) {
  try {
    await requirePermission("dept:manage");
    const orgCtx = await getOrganizationContext();
    const orgId = orgCtx?.organization?.id;

    if (!orgId) {
      return NextResponse.json(
        { error: "Organization context required" },
        { status: 400 },
      );
    }

    const result = await seedOfficialDepartments(orgId);
    invalidateCache(`departments_org:${JSON.stringify({ organizationId: orgId })}`).catch(
      () => {},
    );

    return NextResponse.json(
      { success: true, seeded: result },
      { status: 200 },
    );
  } catch (error) {
    logger.error("POST /api/departments/seed error", { error });
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith("Forbidden")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Failed to seed departments" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/departments/seed
 * Returns how many official departments are loaded for the current org compared
 * to the official master list (used to surface seed status in the UI).
 */
export async function GET(req: NextRequest) {
  try {
    await requirePermission("dept:view");
    const orgCtx = await getOrganizationContext();
    const orgId = orgCtx?.organization?.id;

    if (!orgId) {
      return NextResponse.json(
        { error: "Organization context required" },
        { status: 400 },
      );
    }

    const [loaded, seeded] = await Promise.all([
      prisma.department.count({ where: { organizationId: orgId } }),
      Promise.resolve(OFFICIAL_DEPARTMENTS.length),
    ]);

    return NextResponse.json({
      loaded,
      expected: seeded,
      complete: loaded >= seeded,
    });
  } catch (error) {
    logger.error("GET /api/departments/seed error", { error });
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith("Forbidden")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Failed to read department seed status" },
      { status: 500 },
    );
  }
}