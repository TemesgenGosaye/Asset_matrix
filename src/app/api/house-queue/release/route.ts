import { type NextRequest, NextResponse } from "next/server";
import { requireNotDemoMode, requirePermission } from "@/lib/api-auth";
import { handleRouteError, requireOrgId } from "@/lib/api-route";
import {
  houseQueueReleaseCancelSchema,
  houseQueueReleaseFinalizeSchema,
  houseQueueReleaseRequestSchema,
  validateBody,
} from "@/lib/validation";
import {
  cancelReleaseRequest,
  executeRelease,
  finalizeRelease,
} from "@/lib/house-queue/service";
import { notifyOrgAdmins } from "@/lib/notify";

// POST /api/house-queue/release — Inspection-gated Release Workflow
// Body:
//   { step: "request" | "initiate" | "execute", employeeId, branch, reason?, effectiveDate?, transferHouseholdId? }
//   { step: "cancel", allocationId?, employeeId? }
//   { step: "finalize", allocationId?, employeeId? }
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
    const step = body?.step;

    if (step === "request" || step === "initiate" || step === "execute") {
      const data = validateBody(houseQueueReleaseRequestSchema, body);
      if (data instanceof NextResponse) return data;

      const result = await executeRelease({
        organizationId: orgId,
        employeeId: data.employeeId,
        branch: data.branch,
        reason: data.reason,
        effectiveDate: data.effectiveDate,
        transferHouseholdId: data.transferHouseholdId,
        decidedBy: requesterId,
      });

      await notifyOrgAdmins(orgId, {
        type: "house_released",
        category: "house",
        title: "House release requested",
        body: result.houseNumber
          ? `House ${result.houseNumber} release requested (${data.branch}). Awaiting inspection.`
          : `House release requested (${data.branch}). Awaiting inspection.`,
        link: `/houses/inspections`,
        metadata: {
          employeeId: data.employeeId,
          branch: data.branch,
          allocationId: result.allocationId ?? null,
          inspectionId: result.inspectionId ?? null,
        },
        dedupeWindowMs: 60_000,
      });

      return NextResponse.json({ success: true, result }, { status: 200 });
    }

    if (step === "cancel") {
      const data = validateBody(houseQueueReleaseCancelSchema, body);
      if (data instanceof NextResponse) return data;

      const result = await cancelReleaseRequest({
        organizationId: orgId,
        allocationId: data.allocationId,
        employeeId: data.employeeId,
        cancelledBy: requesterId,
      });

      return NextResponse.json({ success: true, result }, { status: 200 });
    }

    if (step === "finalize") {
      const data = validateBody(houseQueueReleaseFinalizeSchema, body);
      if (data instanceof NextResponse) return data;

      const result = await finalizeRelease({
        organizationId: orgId,
        allocationId: data.allocationId,
        employeeId: data.employeeId,
        decidedBy: requesterId,
      });

      await notifyOrgAdmins(orgId, {
        type: "house_released",
        category: "house",
        title: "House release finalized",
        body: result.houseNumber
          ? `House ${result.houseNumber} was released and finalized.`
          : `House allocation was finalized and released.`,
        link: `/houses/terminated`,
        metadata: {
          allocationId: result.allocationId,
          houseNumber: result.houseNumber,
        },
        dedupeWindowMs: 60_000,
      });

      return NextResponse.json({ success: true, result }, { status: 200 });
    }

    return NextResponse.json(
      {
        error: `Unknown release step "${step}". Use "request", "cancel", or "finalize".`,
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
