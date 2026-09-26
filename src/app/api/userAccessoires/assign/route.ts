import type { NextRequest } from "next/server";
import prisma from "../../../../lib/prisma";
import { Prisma } from "@prisma/client";
import { requireApiAdmin, requireNotDemoMode } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

// POST /api/userAccessoires/assign
// Body: { userId, accessorieId }
export async function POST(req: NextRequest) {
  try {
    const demoBlock = requireNotDemoMode();
    if (demoBlock) return demoBlock;

    await requireApiAdmin();
    const { userId, accessorieId } = await req.json();
    if (!userId || !accessorieId) {
      return new Response(
        JSON.stringify({ error: "userId and accessorieId are required" }),
        { status: 400 },
      );
    }
    // Wrap check + create in a transaction to prevent duplicate assignments
    const { record, idempotent } = await prisma.$transaction(async (tx) => {
      const exists = await tx.userAccessoires.findFirst({
        where: { userid: userId, accessorieid: accessorieId },
      });

      // Idempotent: if already assigned to the same user, return as-is
      if (exists) {
        return { record: exists, idempotent: true };
      }

      const created = await tx.userAccessoires.create({
        data: {
          userid: userId,
          accessorieid: accessorieId,
          creation_date: new Date(),
        } as Prisma.userAccessoiresUncheckedCreateInput,
      });

      return { record: created, idempotent: false };
    });

    return new Response(
      JSON.stringify({
        message: idempotent
          ? "Accessory already assigned to this user"
          : "Accessory assigned",
        userAccessoire: record,
      }),
      { status: 200 },
    );
  } catch (e) {
    logger.error("POST /api/userAccessoires/assign error", { error: e });
    if (e instanceof Error && e.message === "Unauthorized") {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
      });
    }
    if (e instanceof Error && e.message.startsWith("Forbidden")) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 403,
      });
    }
    return new Response(
      JSON.stringify({ error: "Failed to assign accessory" }),
      { status: 500 },
    );
  }
}
