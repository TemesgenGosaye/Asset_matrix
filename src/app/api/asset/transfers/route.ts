import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireApiAdmin, requireNotDemoMode } from "@/lib/api-auth";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, createAuditLog } from "@/lib/audit-log";
import { logger } from "@/lib/logger";

// GET /api/asset/transfers
// Optional query: ?assetId=<uuid> to filter by asset
export async function GET(req: Request) {
  try {
    const user = await requireApiAdmin();

    const url = new URL(req.url);
    const assetId = url.searchParams.get("assetId");

    const where = assetId ? { assetId } : {};

    const transfers = await prisma.assetTransfer.findMany({
      where,
      orderBy: { transferredAt: "desc" },
    });

    return NextResponse.json(transfers, { status: 200 });
  } catch (error) {
    logger.error("GET /api/asset/transfers error", { error });
    if (error instanceof Error) {
      if (error.message === "Unauthorized") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (error.message.includes("Forbidden")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    return NextResponse.json(
      { error: "Failed to fetch transfers" },
      { status: 500 },
    );
  }
}

// POST /api/asset/transfers
// Body: { assetId, transferType, toUserId?, toLocationId?, toOrgId?, reason? }
export async function POST(req: Request) {
  try {
    const demoBlock = requireNotDemoMode();
    if (demoBlock) return demoBlock;
    const user = await requireApiAdmin();

    const transferredBy = user.id!;
    const body = await req.json();
    const { assetId, transferType, toUserId, toLocationId, toOrgId, reason } =
      body || {};

    if (!assetId || !transferType) {
      return NextResponse.json(
        { error: "assetId and transferType are required" },
        { status: 400 },
      );
    }

    if (!["user", "location", "organization"].includes(transferType)) {
      return NextResponse.json(
        { error: "transferType must be 'user', 'location', or 'organization'" },
        { status: 400 },
      );
    }

    // Validate that the target field is provided for the given type
    if (transferType === "user" && !toUserId) {
      return NextResponse.json(
        { error: "toUserId is required for user transfers" },
        { status: 400 },
      );
    }
    if (transferType === "location" && !toLocationId) {
      return NextResponse.json(
        { error: "toLocationId is required for location transfers" },
        { status: 400 },
      );
    }
    if (transferType === "organization" && !toOrgId) {
      return NextResponse.json(
        { error: "toOrgId is required for organization transfers" },
        { status: 400 },
      );
    }

    // Fetch the current asset
    const asset = await prisma.asset.findUnique({
      where: { assetid: assetId },
    });

    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    if (user.organizationId && asset.organizationId) {
      if (asset.organizationId !== user.organizationId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    if (transferType === "user") {
      const targetUser = await prisma.user.findUnique({
        where: { userid: toUserId },
        select: { userid: true, organizationId: true, isActive: true },
      });
      if (!targetUser) {
        return NextResponse.json(
          { error: "Employee user not found" },
          { status: 404 },
        );
      }
      if (user.organizationId && targetUser.organizationId) {
        if (targetUser.organizationId !== user.organizationId) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }
      if (!targetUser.isActive) {
        return NextResponse.json(
          { error: "The selected employee is inactive" },
          { status: 400 },
        );
      }
    } else if (transferType === "location") {
      const targetLocation = await prisma.location.findUnique({
        where: { locationid: toLocationId },
        select: { locationid: true, organizationId: true },
      });
      if (!targetLocation) {
        return NextResponse.json(
          { error: "Location not found" },
          { status: 404 },
        );
      }
      if (user.organizationId && targetLocation.organizationId) {
        if (targetLocation.organizationId !== user.organizationId) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }
    } else {
      const targetOrg = await prisma.organization.findUnique({
        where: { id: toOrgId },
        select: { id: true },
      });
      if (!targetOrg) {
        return NextResponse.json(
          { error: "Organization not found" },
          { status: 404 },
        );
      }
    }

    let transfer;

    if (transferType === "user") {
      // Find the current userAssets entry for this asset
      const currentAssignment = await prisma.userAssets.findFirst({
        where: { assetid: assetId },
      });

      const fromUserId = currentAssignment?.userid ?? null;

      transfer = await prisma.$transaction(async (tx) => {
        // Delete old assignment if it exists
        if (currentAssignment) {
          await tx.userAssets.delete({
            where: { userassetsid: currentAssignment.userassetsid },
          });
        }

        // Create new assignment
        await tx.userAssets.create({
          data: {
            userid: toUserId,
            assetid: assetId,
            creation_date: new Date(),
          },
        });

        const activeStatus = await tx.statusType.findFirst({
          where: { statustypename: { equals: "Active", mode: "insensitive" } },
          select: { statustypeid: true },
        });
        await tx.asset.update({
          where: { assetid: assetId },
          data: {
            change_date: new Date(),
            ...(activeStatus
              ? { statustypeid: activeStatus.statustypeid }
              : {}),
          },
        });

        // Create the transfer record
        const record = await tx.assetTransfer.create({
          data: {
            assetId,
            transferType,
            fromUserId,
            toUserId,
            reason: reason ?? null,
            transferredBy,
          },
        });

        return record;
      });
    } else if (transferType === "location") {
      const fromLocationId = asset.locationid ?? null;

      transfer = await prisma.$transaction(async (tx) => {
        // Update the asset location
        await tx.asset.update({
          where: { assetid: assetId },
          data: {
            locationid: toLocationId,
            change_date: new Date(),
          },
        });

        // Create the transfer record
        const record = await tx.assetTransfer.create({
          data: {
            assetId,
            transferType,
            fromLocationId,
            toLocationId,
            reason: reason ?? null,
            transferredBy,
          },
        });

        return record;
      });
    } else {
      // organization transfer
      const fromOrgId = asset.organizationId ?? null;

      transfer = await prisma.$transaction(async (tx) => {
        // Update the asset organization
        await tx.asset.update({
          where: { assetid: assetId },
          data: {
            organizationId: toOrgId,
            change_date: new Date(),
          },
        });

        // Create the transfer record
        const record = await tx.assetTransfer.create({
          data: {
            assetId,
            transferType,
            fromOrgId,
            toOrgId,
            reason: reason ?? null,
            transferredBy,
          },
        });

        return record;
      });
    }

    await createAuditLog({
      userId: transferredBy,
      action: AUDIT_ACTIONS.TRANSFER,
      entity: AUDIT_ENTITIES.ASSET,
      entityId: assetId,
      details: { transferType, reason: reason ?? null },
    });

    return NextResponse.json(transfer, { status: 201 });
  } catch (error) {
    logger.error("POST /api/asset/transfers error", { error });
    if (error instanceof Error) {
      if (error.message === "Unauthorized") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (error.message.includes("Forbidden")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    return NextResponse.json(
      { error: "Failed to create transfer" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
