import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { handleRouteError, requireOrgId } from "@/lib/api-route";
import { getOrganizationContext, scopeToOrganization } from "@/lib/organization-context";
import prisma from "@/lib/prisma";

// GET /api/house-queue/inspectors
// Facility inspectors for the handback-inspection scheduler (Step 3 of the
// Release Workflow). Returns org-scoped users as { userid, firstname, lastname }.
export async function GET() {
  try {
    await requirePermission("house_queue:view");

    const orgContext = await getOrganizationContext();
    const orgId = orgContext?.organization?.id ?? null;
    const orgIdOrThrow = await requireOrgId();

    const users = await prisma.user.findMany({
      where: scopeToOrganization({}, orgId),
      orderBy: [{ firstname: "asc" }, { lastname: "asc" }],
      select: { userid: true, firstname: true, lastname: true },
    });

    return NextResponse.json(
      { organizationId: orgIdOrThrow, inspectors: users },
      { status: 200 },
    );
  } catch (e) {
    return handleRouteError(e, {
      label: "GET /api/house-queue/inspectors",
      message: "Failed to fetch inspectors",
    });
  }
}

export const dynamic = "force-dynamic";