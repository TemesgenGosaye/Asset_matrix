import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import {
  getHamsCohortAlerts,
  getHamsKpis,
  getHamsRecentActivity,
  type HamsActivityItem,
  type HamsCohortAlert,
  type HamsKpiData,
} from "@/lib/hams/queries";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * The whole housing picture for the main dashboard's House Admin widgets, in one
 * response.
 *
 * WHY ONE ROUTE FOR THREE WIDGETS
 * `housingSummary`, `housingAlerts` and `housingActivity` are three cards of one
 * story: where the estate stands, what is stuck, and what has been decided
 * lately. Three separate routes would mean three round trips for data that comes
 * from the same three aggregate queries, on a page that is already the heaviest
 * in the app — `getHamsKpis` runs seven aggregates and `getHamsCohortAlerts` runs
 * the full house-queue engine. The widgets dedupe concurrent calls on the client
 * (see `fetchHousingOverview` in `DashboardGrid`), so the third card costs no
 * extra request.
 *
 * WHY THE PERMISSION IS ANY-OF-TWO
 * `household:view` covers the estate — how many houses, how full, how many
 * vacant. `house_queue:view` covers the decisions — who is waiting, who was
 * allocated. A policy or compliance officer legitimately needs the estate without
 * the queue, and an allocator legitimately needs the queue without the register,
 * so neither role is refused a card it can read. What nobody can get is the pair
 * unless they hold at least one, and the widgets themselves carry the same check
 * in `WidgetDefinition.permission`.
 */
export async function GET() {
  try {
    const user = await requirePermission("household:view", "house_queue:view");
    const organizationId = user.organizationId;

    if (!organizationId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const [kpis, alerts, activity] = await Promise.all([
      getHamsKpis(organizationId),
      getHamsCohortAlerts(organizationId),
      getHamsRecentActivity(organizationId, 6),
    ]);

    const body: {
      kpis: HamsKpiData;
      alerts: HamsCohortAlert[];
      activity: HamsActivityItem[];
    } = { kpis, alerts, activity };

    return NextResponse.json(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (message.startsWith("Forbidden")) {
      return NextResponse.json(
        { error: "You do not have permission to view housing data" },
        { status: 403 },
      );
    }
    logger.error("GET /api/dashboard/housing error", { error });
    return NextResponse.json(
      { error: "Failed to load housing overview" },
      { status: 500 },
    );
  }
}
