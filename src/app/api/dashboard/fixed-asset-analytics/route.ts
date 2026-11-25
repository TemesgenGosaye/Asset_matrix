import { NextResponse, type NextRequest } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getFixedAssetContext } from "@/lib/fixed-asset-api";
import { logger } from "@/lib/logger";
import { parseFixedAssetAnalyticsFilters } from "@/lib/fixed-asset-analytics/contract";
import { loadFixedAssetAnalytics } from "@/lib/fixed-asset-analytics/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    if (!isFeatureEnabled("fixedAssetRegister")) {
      return NextResponse.json(
        { error: "Fixed asset register is disabled" },
        { status: 503 },
      );
    }

    const user = await requirePermission("asset:view");
    const context = await getFixedAssetContext(user);
    const filters = parseFixedAssetAnalyticsFilters(
      request.nextUrl.searchParams,
    );
    const data = await loadFixedAssetAnalytics(filters, context);

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("GET /api/dashboard/fixed-asset-analytics error", { error });

    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (message.startsWith("Forbidden")) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Failed to load fixed asset analytics" },
      { status: 500 },
    );
  }
}
