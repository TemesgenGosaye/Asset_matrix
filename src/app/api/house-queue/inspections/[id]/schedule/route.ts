import { type NextRequest, NextResponse } from "next/server";
import { requireNotDemoMode, requirePermission } from "@/lib/api-auth";
import { handleRouteError, requireOrgId } from "@/lib/api-route";
import { houseQueueInspectionScheduleSchema, validateBody } from "@/lib/validation";
import { scheduleInspection } from "@/lib/house-queue/service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/house-queue/inspections/[id]/schedule
// Body: { inspectorId, scheduledDate: "YYYY-MM-DD" }
// Release Workflow Step 3. Requires house_queue:manage.
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const demoBlock = requireNotDemoMode();
    if (demoBlock) return demoBlock;

    const requester = await requirePermission("house_queue:manage");
    const requesterId = requester.id;
    if (!requesterId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await requireOrgId();
    const { id } = await context.params;
    const body = await req.json();

    const data = validateBody(houseQueueInspectionScheduleSchema, body);
    if (data instanceof NextResponse) return data;

    const result = await scheduleInspection({
      organizationId: orgId,
      inspectionId: id,
      inspectorId: data.inspectorId,
      scheduledDate: data.scheduledDate,
      decidedBy: requesterId,
    });

    return NextResponse.json({ success: true, result }, { status: 200 });
  } catch (e) {
    return handleRouteError(e, {
      label: "POST /api/house-queue/inspections/[id]/schedule",
      message: "Failed to schedule the inspection",
    });
  }
}

export const dynamic = "force-dynamic";