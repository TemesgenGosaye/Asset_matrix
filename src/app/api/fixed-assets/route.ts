import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import {
  buildFixedAssetWhere,
  buildFixedAssetOrderBy,
} from "@/lib/fixed-asset-register";
import {
  getFixedAssetContext,
  parseFixedAssetParams,
  serializeFixedAsset,
} from "@/lib/fixed-asset-api";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isFeatureEnabled("fixedAssetRegister")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const user = await requirePermission("asset:view");
    const context = await getFixedAssetContext(user);
    const params = parseFixedAssetParams(request.nextUrl.searchParams);
    const where = buildFixedAssetWhere(
      params,
      context.organizationId,
      context.isAdmin,
      context.assignedAssetIds,
      context.availableStatusIds,
    );
    const orderBy = buildFixedAssetOrderBy(params);
    const skip = ((params.page ?? 1) - 1) * (params.pageSize ?? 25);

    const [items, total] = await Promise.all([
      prisma.asset.findMany({
        where,
        orderBy,
        skip,
        take: params.pageSize,
        include: {
          department: true,
          statusType: true,
          location: true,
          assetCategoryType: true,
          manufacturer: true,
          model: true,
          supplier: true,
        },
      }),
      prisma.asset.count({ where }),
    ]);

    let facets: { key: string; count: number }[] = [];
    if (params.groupBy && params.groupBy !== "none") {
      if (params.groupBy === "department") {
        const grouped = await prisma.asset.groupBy({
          by: ["sourceDepartment"],
          where,
          _count: { _all: true },
        });
        facets = grouped.map((row) => ({
          key: row.sourceDepartment || "(blank)",
          count: row._count._all,
        }));
      } else if (params.groupBy === "categoryCode") {
        const grouped = await prisma.asset.groupBy({
          by: ["categoryCode"],
          where,
          _count: { _all: true },
        });
        facets = grouped.map((row) => ({
          key: row.categoryCode || "(blank)",
          count: row._count._all,
        }));
      } else {
        const grouped = await prisma.asset.groupBy({
          by: ["condition1"],
          where,
          _count: { _all: true },
        });
        facets = grouped.map((row) => ({
          key: row.condition1 || "(blank)",
          count: row._count._all,
        }));
      }
    }

    return NextResponse.json({
      items: items.map(serializeFixedAsset),
      total,
      page: params.page,
      pageSize: params.pageSize,
      pageCount: Math.ceil(total / (params.pageSize ?? 25)),
      facets,
    });
  } catch (error) {
    logger.error("Failed to list fixed assets", { error });
    const message = error instanceof Error ? error.message : "Unknown error";
    const status =
      message === "Unauthorized"
        ? 401
        : message.startsWith("Forbidden")
          ? 403
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
