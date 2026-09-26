import { type NextRequest, NextResponse } from "next/server";
import { requireNotDemoMode, requirePermission } from "@/lib/api-auth";
import { handleRouteError, requireOrgId } from "@/lib/api-route";
import { houseQueueRecalculateSchema, validateBody } from "@/lib/validation";
import { recalculateQueue } from "@/lib/house-queue/service";

// POST /api/house-queue/recalculate
// Re-runs the live queue engine (audit-marked) and returns the fresh result.
// Optional body: { grade: number } to limit the returned view to one grade.
export async function POST(req: NextRequest) {
  try {
    const requester = await requirePermission("house_queue:manage");
    requireNotDemoMode();

    const orgId = await requireOrgId();

    if (!requester.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let grade: number | null | undefined;
    try {
      const raw = await req.json();
      const data = validateBody(houseQueueRecalculateSchema, raw);
      if (data instanceof NextResponse) return data;
      grade = data.grade ?? null;
    } catch {
      // Body is optional — recalculate the whole queue.
      grade = null;
    }

    const result = await recalculateQueue({
      organizationId: orgId,
      decidedBy: requester.id,
      grade: grade ?? undefined,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    return handleRouteError(e, {
      label: "POST /api/house-queue/recalculate",
      message: "Failed to recalculate the house queue",
    });
  }
}