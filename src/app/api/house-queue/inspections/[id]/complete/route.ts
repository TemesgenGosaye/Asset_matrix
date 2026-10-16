import { type NextRequest, NextResponse } from "next/server";
import { requireNotDemoMode, requirePermission } from "@/lib/api-auth";
import { handleRouteError, requireOrgId } from "@/lib/api-route";
import {
  houseQueueInspectionCompleteSchema,
  validateBody,
} from "@/lib/validation";
import { completeInspection } from "@/lib/house-queue/service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/house-queue/inspections/[id]/complete
// Body: { checklistWindow, checklistDoor, checklistWaterPanel, checklistRoof,
//         checklistWall, checklistElectricity,
//         costWindow?, costDoor?, costWaterPanel?, costRoof?, costWall?, costElectricity?,
//         conditionNote? }
//
// Release Workflow Step 4: records the handback result and FINALISES the
// release. In one transaction this archives the allocation (status `released`
// plus a `terminatedAt`, which files it on the Terminated Houses page) and
// returns the house to the pool.
//
// Costs are optional on the wire but not in practice: a part marked Damaged must
// carry one, and that rule is enforced in the service by `validateDamage` — the
// same function the form calls, so a submission the UI called valid is exactly a
// submission the server accepts.
//
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
      // Passed through unparsed: deciding what a usable amount is belongs to the
      // one validator shared with the form, not to a second copy here.
      costs: {
        window: data.costWindow,
        door: data.costDoor,
        waterPanel: data.costWaterPanel,
        roof: data.costRoof,
        wall: data.costWall,
        electricity: data.costElectricity,
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
