import { type NextRequest, NextResponse } from "next/server";
import { requireNotDemoMode, requirePermission } from "@/lib/api-auth";
import { handleRouteError, requireOrgId } from "@/lib/api-route";
import {
  houseQueueApproveSchema,
  houseQueueSkipDeferSchema,
  validateBody,
} from "@/lib/validation";
import { approveAllocation, setSkipOrDefer } from "@/lib/house-queue/service";
import { notifyOrgAdmins } from "@/lib/notify";

// POST /api/house-queue/action
// Body: { action: "approve"|"reassign", employeeId, householdId }
//     | { action: "skip"|"defer", employeeId, reason? }
//
// Releasing an allocation now goes through the multi-step Release Workflow at
// POST /api/house-queue/release (initiate → execute → inspections).
//
// Permission split (enterprise RBAC):
//   approve / reassign → house_queue:allocate
//   skip / defer → house_queue:manage
export async function POST(req: NextRequest) {
  try {
    const requester = await requirePermission("house_queue:allocate");
    requireNotDemoMode();

    const orgId = await requireOrgId();
    const body = await req.json();

    if (!body || typeof body.action !== "string") {
      return NextResponse.json(
        { error: "Missing action. Use approve, reassign, skip or defer." },
        { status: 400 },
      );
    }

    const requesterId = requester.id;
    if (!requesterId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Skip/defer need the manage permission instead of allocate.
    if (body.action === "skip" || body.action === "defer") {
      await requirePermission("house_queue:manage");
    }

    switch (body.action) {
      case "approve":
      case "reassign": {
        const data = validateBody(houseQueueApproveSchema, body);
        if (data instanceof NextResponse) return data;
        const result = await approveAllocation({
          organizationId: orgId,
          employeeId: data.employeeId,
          householdId: data.householdId,
          decidedBy: requesterId,
        });
        const isReassign = body.action === "reassign";
        await notifyOrgAdmins(orgId, {
          type: isReassign ? "house_reassigned" : "house_allocated",
          category: "house",
          title: isReassign
            ? "House allocation reassigned"
            : "House allocated",
          body: `House ${result.houseNumber ? `${result.houseNumber} ` : ""}was ${
            isReassign ? "reassigned to" : "allocated to"
          } employee ${result.employeeId}.`,
          link: `/houses/allocated/${result.allocationId}`,
          metadata: {
            allocationId: result.allocationId,
            houseNumber: result.houseNumber,
          },
          dedupeWindowMs: 60_000,
        });
        return NextResponse.json({ success: true, result }, { status: 200 });
      }
      case "skip":
      case "defer": {
        const data = validateBody(houseQueueSkipDeferSchema, body);
        if (data instanceof NextResponse) return data;
        const result = await setSkipOrDefer({
          organizationId: orgId,
          employeeId: data.employeeId,
          mode: data.mode,
          reason: data.reason,
          decidedBy: requesterId,
        });
        await notifyOrgAdmins(orgId, {
          type: data.mode === "skip" ? "house_queue_skipped" : "house_queue_deferred",
          category: "house",
          title:
            data.mode === "skip"
              ? "Employee skipped from house queue"
              : "Employee deferred from house queue",
          body: `Employee ${result.employeeId} was ${
            data.mode === "skip" ? "skipped" : "deferred"
          }${data.reason ? `: ${data.reason}` : ""}.`,
          link: `/house-queue`,
          metadata: { employeeId: result.employeeId, mode: data.mode },
          dedupeWindowMs: 60_000,
        });
        return NextResponse.json({ success: true, result }, { status: 200 });
      }
      default:
        return NextResponse.json(
          { error: `Unknown action "${body.action}".` },
          { status: 400 },
        );
    }
  } catch (e) {
    return handleRouteError(e, {
      label: "POST /api/house-queue/action",
      message: "Failed to perform the queue action",
    });
  }
}