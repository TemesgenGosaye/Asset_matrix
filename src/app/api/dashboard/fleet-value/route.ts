import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireApiAuth } from "@/lib/api-auth";
import { scopeToOrganization } from "@/lib/organization-context";
import {
  calculateDepreciation,
  type DepreciationMethod,
} from "@/lib/depreciation";
import { cached } from "@/lib/cache";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireApiAuth();
    const orgId = user.organizationId;

    const cacheKey = `fleet_value:${orgId ?? "global"}`;

    const result = await cached(cacheKey, async () => {
      const assets = await prisma.asset.findMany({
        where: scopeToOrganization({ purchaseprice: { not: null } }, orgId),
        select: {
          purchaseprice: true,
          purchasedate: true,
          creation_date: true,
          assetcategorytypeid: true,
        },
      });

      // Fetch all depreciation settings in one query
      const depSettings = await prisma.depreciation_settings.findMany();
      const settingsMap = new Map(depSettings.map((s) => [s.categoryId, s]));

      let totalPurchaseValue = 0;
      let totalCurrentValue = 0;
      let assetCount = 0;

      for (const asset of assets) {
        const price = Number(asset.purchaseprice);
        if (!price || price <= 0) continue;

        totalPurchaseValue += price;
        assetCount++;

        const settings = asset.assetcategorytypeid
          ? settingsMap.get(asset.assetcategorytypeid)
          : null;

        if (settings && (asset.purchasedate || asset.creation_date)) {
          const depResult = calculateDepreciation({
            purchasePrice: price,
            purchaseDate: new Date(
              (asset.purchasedate || asset.creation_date) as Date,
            ),
            method: settings.method as DepreciationMethod,
            usefulLifeYears: settings.usefulLifeYears,
            salvagePercent: Number(settings.salvagePercent),
          });
          totalCurrentValue += depResult.currentValue;
        } else {
          totalCurrentValue += price;
        }
      }

      return {
        totalPurchaseValue,
        totalCurrentValue,
        totalDepreciation: totalPurchaseValue - totalCurrentValue,
        assetCount,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logger.error("GET /api/dashboard/fleet-value error", { error });
    return NextResponse.json(
      { error: "Failed to calculate fleet value" },
      { status: 500 },
    );
  }
}
