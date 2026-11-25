import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getOrganizationContext } from "@/lib/organization-context";
import { requirePermission } from "@/lib/api-auth";
import { createAuditLog } from "@/lib/audit-log";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// POST /api/master-data/merge
// Body: { type: "location" | "category" | "department", sourceIds: string[], targetId: string }
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("asset:edit");
    const orgCtx = await getOrganizationContext();
    const orgId = orgCtx?.organization?.id;
    if (!orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { type = "location", sourceIds, targetId } = body;

    if (!Array.isArray(sourceIds) || !sourceIds.length || !targetId) {
      return NextResponse.json(
        { error: "sourceIds (array) and targetId (string) are required" },
        { status: 400 }
      );
    }

    // Filter out targetId from sourceIds
    const sourcesToMerge = sourceIds.filter((id) => id !== targetId);
    if (!sourcesToMerge.length) {
      return NextResponse.json({ error: "No distinct source IDs to merge" }, { status: 400 });
    }

    if (type === "location") {
      // Verify target exists
      const targetLoc = await prisma.location.findFirst({
        where: { locationid: targetId, organizationId: orgId },
      });
      if (!targetLoc) {
        return NextResponse.json({ error: "Target location not found" }, { status: 404 });
      }

      // Perform merge inside transaction
      const result = await prisma.$transaction(async (tx) => {
        // Re-point Location 1st
        const updateLoc1 = await tx.asset.updateMany({
          where: { organizationId: orgId, location1Id: { in: sourcesToMerge } },
          data: { location1Id: targetId, location1: targetLoc.locationname },
        });

        // Re-point Location 2nd
        const updateLoc2 = await tx.asset.updateMany({
          where: { organizationId: orgId, locationid: { in: sourcesToMerge } },
          data: { locationid: targetId, location2Raw: targetLoc.locationname },
        });

        // Soft-deactivate source locations (never hard delete)
        await tx.location.updateMany({
          where: { locationid: { in: sourcesToMerge }, organizationId: orgId },
          data: { isActive: false, change_date: new Date() },
        });

        // Recalculate target location usageCount
        const loc1Cnt = await tx.asset.count({ where: { organizationId: orgId, location1Id: targetId } });
        const loc2Cnt = await tx.asset.count({ where: { organizationId: orgId, locationid: targetId } });
        const totalUsage = loc1Cnt + loc2Cnt;

        const updatedTarget = await tx.location.update({
          where: { locationid: targetId },
          data: { usageCount: totalUsage, change_date: new Date() },
        });

        return {
          repointedLocation1: updateLoc1.count,
          repointedLocation2: updateLoc2.count,
          targetLocation: updatedTarget,
          mergedCount: sourcesToMerge.length,
        };
      });

      // Audit log the merge
      await createAuditLog({
        userId: user.id ?? null,
        action: "location.merge",
        entity: "location",
        entityId: targetId,
        details: {
          targetName: targetLoc.locationname,
          sourceIds: sourcesToMerge,
          repointedCount: result.repointedLocation1 + result.repointedLocation2,
        },
      });

      return NextResponse.json({
        success: true,
        message: `Merged ${sourcesToMerge.length} locations into "${targetLoc.locationname}". Repointed ${result.repointedLocation1 + result.repointedLocation2} asset references.`,
        details: result,
      });
    }

    return NextResponse.json({ error: "Unsupported merge type" }, { status: 400 });
  } catch (error) {
    logger.error("Failed to merge master data", { error });
    return NextResponse.json(
      { error: "Merge operation failed", details: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    );
  }
}
