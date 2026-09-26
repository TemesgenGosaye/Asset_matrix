import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "../../../../lib/prisma";
import { requireApiAdmin, requireNotDemoMode } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const demoBlock = requireNotDemoMode();
    if (demoBlock) return demoBlock;

    await requireApiAdmin();
    const { assetId, userId } = await req.json();

    if (!assetId || !userId) {
      return new Response(
        JSON.stringify({ error: "Asset ID and User ID are required" }),
        {
          status: 400,
        },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // Resolve the "Active" status id (case-insensitive), falling back to
      // the first available status type if "Active" is not configured.
      let activeStatus = await tx.statusType.findFirst({
        where: { statustypename: { equals: "Active", mode: "insensitive" } },
      });
      if (!activeStatus) {
        activeStatus = await tx.statusType.findFirst({
          orderBy: { statustypename: "asc" },
        });
      }
      if (!activeStatus) {
        throw new Error("No status type configured");
      }

      // Check for existing assignment inside the transaction to prevent TOCTOU race
      const existingAssignment = await tx.userAssets.findFirst({
        where: { assetid: assetId },
      });

      let assignment;

      if (existingAssignment) {
        // Idempotent: if already assigned to the same user, no-op
        if (existingAssignment.userid === userId) {
          return { assignment: existingAssignment, idempotent: true };
        }
        // Reassign to the new user within the transaction
        assignment = await tx.userAssets.update({
          where: { userassetsid: existingAssignment.userassetsid },
          data: { userid: userId },
        });
      } else {
        assignment = await tx.userAssets.create({
          data: {
            assetid: assetId,
            userid: userId,
            creation_date: new Date(),
          } as Prisma.userAssetsUncheckedCreateInput,
        });
      }

      await tx.asset.update({
        where: { assetid: assetId },
        data: { statustypeid: activeStatus.statustypeid },
      });

      return { assignment, idempotent: false };
    });

    return new Response(
      JSON.stringify({
        message: result.idempotent
          ? "Asset already assigned to this user"
          : "Asset assigned successfully",
        userAsset: result.assignment,
      }),
      {
        status: 200,
      },
    );
  } catch (error) {
    logger.error("Error assigning asset", { error });
    if (error instanceof Error && error.message === "Unauthorized") {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
      });
    }
    if (error instanceof Error && error.message.startsWith("Forbidden")) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 403,
      });
    }
    if (
      error instanceof Error &&
      error.message === "No status type configured"
    ) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
      });
    }
    return new Response(JSON.stringify({ error: "Error assigning asset" }), {
      status: 500,
    });
  }
}
