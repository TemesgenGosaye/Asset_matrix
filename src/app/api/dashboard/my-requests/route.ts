import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireApiAuth, type AuthUser } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user: AuthUser = await requireApiAuth();

    const reservations = await prisma.assetReservation.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        asset: { select: { assetname: true, assettag: true } },
      },
    });

    const items = reservations.map((r) => ({
      id: r.id,
      assetName: r.asset.assetname,
      assetTag: r.asset.assettag,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    }));

    return NextResponse.json(items);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logger.error("GET /api/dashboard/my-requests error", { error });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
