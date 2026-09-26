import { type NextRequest, NextResponse } from "next/server";
import { requireNotDemoMode, requirePermission } from "@/lib/api-auth";
import { handleRouteError, requireOrgId } from "@/lib/api-route";
import {
  houseQueueReleaseExecuteSchema,
  houseQueueReleaseInitiateSchema,
  validateBody,
} from "@/lib/validation";
import {
  executeRelease,
  initiateRelease,
} from "@/lib/house-queue/service";
import { notifyOrgAdmins } from "@/lib/notify";

// POST /api/house-queue/release  —  Release Workflow (Steps 1 & 2)
// Body: { step: "initiate", employeeId, branch, reason? }
//     | { step: "execute", employeeId, branch, reason? }
//
//   initiate → validates the live allocation + records the reason branch.
//   execute  → terminates the row, vacates the house to PendingInspection,
//              raises the 1:1 handback inspection.
//
// Only the inspection-gated reasons (EMPLOYEE_LEAVE / RETIREMENT) are legal.
// A TRANSFER is the Reassign action (`POST /api/house-queue/action`,
// action "reassign") and never calls this endpoint.
//
// Requires house_queue:manage.
export async function POST(req: NextRequest) {
  try {
    const demoBlock = requireNotDemoMode();
    if (demoBlock) return demoBlock;

    const requester = await requirePermission("house_queue:manage");
    const requesterId = requester.id;
    if (!requesterId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await requireOrgId();
    const body = await req.json();

    if (body?.step === "initiate") {
      // `step` is unknown to the schema, so it is stripped, not rejected.
      const data = validateBody(houseQueueReleaseInitiateSchema, body);
      if (data instanceof NextResponse) return data;
      const result = await initiateRelease({
        organizationId: orgId,
        employeeId: data.employeeId,
        branch: data.branch,
        reason: data.reason,
        decidedBy: requesterId,
      });
      return NextResponse.json({ success: true, result }, { status: 200 });
    }

    if (body?.step === "execute") {
      const data = validateBody(houseQueueReleaseExecuteSchema, body);
      if (data instanceof NextResponse) return data;
      const result = await executeRelease({
        organizationId: orgId,
        employeeId: data.employeeId,
        branch: data.branch,
        reason: data.reason,
        decidedBy: requesterId,
      });
      await notifyOrgAdmins(orgId, {
        type: "house_released",
        category: "house",
        title: "House released",
        body: result.houseNumber
          ? `House ${result.houseNumber} was released ${
              data.branch === "RETIREMENT" ? "for retirement" : "on employee leave"
            }.`
          : `An allocation was released ${
              data.branch === "RETIREMENT" ? "for retirement" : "on employee leave"
            }.`,
        link: `/houses/inspections`,
        metadata: {
          employeeId: data.employeeId,
          branch: data.branch,
          allocationId: result.allocationId ?? null,
        },
        dedupeWindowMs: 60_000,
      });
      return NextResponse.json({ success: true, result }, { status: 200 });
    }

    return NextResponse.json(
      {
        error: `Unknown release step "${body?.step}". Use "initiate" or "execute".`,
      },
      { status: 400 },
    );
  } catch (e) {
    return handleRouteError(e, {
      label: "POST /api/house-queue/release",
      message: "Failed to run the release workflow",
    });
  }
}

export const dynamic = "force-dynamic";