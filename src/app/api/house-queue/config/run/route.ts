import { type NextRequest, NextResponse } from "next/server";
import { requireNotDemoMode, requirePermission } from "@/lib/api-auth";
import { handleRouteError, requireOrgId } from "@/lib/api-route";
import {
  isManualRunRateLimited,
  MANUAL_RUN_COOLDOWN_MS,
  recordConfigRun,
} from "@/lib/house-queue/config/service";
import { getClientIp } from "../_shared";

// POST /api/house-queue/config/run
// Manual "Run Now" — audits the recompute (rate-limited to one per user
// per cooldown window). The queue itself is recomputed live on every read
// by `computeHouseQueueWithActiveConfig`, so the run only records evidence.
export async function POST(req: NextRequest) {
  try {
    const requester = await requirePermission("house_queue:manage");
    requireNotDemoMode();
    const orgId = await requireOrgId();

    const requesterId = requester.id;
    if (!requesterId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (await isManualRunRateLimited(orgId, requesterId)) {
      return NextResponse.json(
        {
          error:
            "Manual run is rate-limited — wait a few minutes before running again",
          code: "RATE_LIMITED",
          cooldownMs: MANUAL_RUN_COOLDOWN_MS,
        },
        { status: 429 },
      );
    }

    await recordConfigRun({
      organizationId: orgId,
      action: "manual_run",
      actor: requesterId,
      ipAddress: getClientIp(req),
    });

    return NextResponse.json(
      { success: true, cooldownMs: MANUAL_RUN_COOLDOWN_MS },
      { status: 200 },
    );
  } catch (e) {
    return handleRouteError(e, {
      label: "POST /api/house-queue/config/run",
      message: "Failed to run the house queue engine",
    });
  }
}

export const dynamic = "force-dynamic";
