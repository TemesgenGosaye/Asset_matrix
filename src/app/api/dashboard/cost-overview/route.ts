import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireApiAuth } from "@/lib/api-auth";
import { scopeToOrganization } from "@/lib/organization-context";
import { cached } from "@/lib/cache";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Aggregates cost data server-side, avoiding shipping the full asset table to
// the client (the previous widget fetched up to 1000 assets just to sum prices).
export async function GET() {
  try {
    const user = await requireApiAuth();
    const orgId = user.organizationId;

    const cacheKey = `cost_overview:${orgId ?? "global"}`;

    const result = await cached(cacheKey, async () => {
      const where = scopeToOrganization({}, orgId);

      const aggregate = await prisma.asset.aggregate({
        where,
        _count: { _all: true },
        _sum: { purchaseprice: true },
        _avg: { purchaseprice: true },
      });

      return {
        totalAssets: aggregate._count._all,
        totalValue: Number(aggregate._sum.purchaseprice ?? 0),
        avgValue: Number(aggregate._avg.purchaseprice ?? 0),
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logger.error("GET /api/dashboard/cost-overview error", { error });
    return NextResponse.json(
      { error: "Failed to calculate cost overview" },
      { status: 500 },
    );
  }
}
