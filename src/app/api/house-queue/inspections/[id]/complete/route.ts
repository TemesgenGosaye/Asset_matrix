import { type NextRequest, NextResponse } from "next/server";
import { requireNotDemoMode, requirePermission } from "@/lib/api-auth";
import { handleRouteError, requireOrgId } from "@/lib/api-route";
import { houseQueueInspectionCompleteSchema, validateBody } from "@/lib/validation";
import { completeInspection } from "@/lib/house-queue/service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/house-queue/inspections/[id]/complete
// Body: { checklistWindow, checklistDoor, checklistWaterPanel, checklistRoof,
//         checklistWall, checklistElectricity, conditionNote? }
// Release Workflow Step 4: resolves the house back into the pool (Active) or
// into maintenance (UnderMaintenance), mirroring the checklist onto the house.
// Requires house_queue:manage.
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

    const data = validateBody(houseQueueInspectionCompleteSchema, body);
    if (data instanceof NextResponse) return data;

    const result = await completeInspection({
      organizationId: orgId,
      inspectionId: id,
      decidedBy: requesterId,
      checklist: {
        window: data.checklistWindow,
        door: data.checklistDoor,
        waterPanel: data.checklistWaterPanel,
        roof: data.checklistRoof,
        wall: data.checklistWall,
        electricity: data.checklistElectricity,
      },
      conditionNote: data.conditionNote,
    });

    return NextResponse.json({ success: true, result }, { status: 200 });
  } catch (e) {
    return handleRouteError(e, {
      label: "POST /api/house-queue/inspections/[id]/complete",
      message: "Failed to complete the inspection",
    });
  }
}

export const dynamic = "force-dynamic";