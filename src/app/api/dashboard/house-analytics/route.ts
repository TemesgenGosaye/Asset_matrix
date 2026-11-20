import { NextResponse, type NextRequest } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { houseAnalyticsQuerySchema } from "@/lib/house-analytics/contract";
import { loadHouseAnalytics } from "@/lib/house-analytics/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission("household:view", "house_queue:view");
    if (!user.organizationId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const params = request.nextUrl.searchParams;
    const parsed = houseAnalyticsQuerySchema.safeParse({
      range: params.get("range") ?? "month",
      from: params.get("from") ?? undefined,
      to: params.get("to") ?? undefined,
      houseType: params.get("houseType") ?? "all",
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid analytics query", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const payload = await loadHouseAnalytics(user.organizationId, parsed.data);
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (message.startsWith("Forbidden")) {
      return NextResponse.json(
        { error: "You do not have permission to view analytics" },
        { status: 403 },
      );
    }
    logger.error("GET /api/dashboard/house-analytics error", { error });
    return NextResponse.json(
      { error: "Failed to load house analytics" },
      { status: 500 },
    );
  }
}
