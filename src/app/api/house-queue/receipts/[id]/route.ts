import { type NextRequest, NextResponse } from "next/server";
import { requireNotDemoMode, requirePermission } from "@/lib/api-auth";
import { handleRouteError, requireOrgId } from "@/lib/api-route";
import { houseQueueReceiptSchema, validateBody } from "@/lib/validation";
import { getOrCreateTerminationReceipt } from "@/lib/house-queue/receipt";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET  /api/house-queue/receipts/[id] — read a receipt snapshot without printing.
// POST /api/house-queue/receipts/[id] — print: snapshot on first print, then read.
//
// `[id]` is the INSPECTION id, not the receipt id: a receipt has no existence
// before it is printed, so the thing a caller holds (from the inspections
// worklist) is the inspection, and the receipt number is what the print creates.
//
// The gate is enforced in the service, not here, so the button on the page and
// this endpoint can never disagree about whether printing is allowed — and it
// runs before any write, so a blocked print leaves no receipt row behind.
//
// Requires house_queue:manage: a receipt quotes damage costs and carries an
// employee's name, and printing one is an assertion about a handback.
export async function GET(_req: NextRequest, context: RouteContext) {
  return respond(context, false);
}

export async function POST(req: NextRequest, context: RouteContext) {
  const demoBlock = requireNotDemoMode();
  if (demoBlock) return demoBlock;
  return respond(context, true);
}

async function respond(context: RouteContext, isPrint: boolean) {
  try {
    const requester = await requirePermission("house_queue:manage");
    const requesterId = requester.id;
    if (!requesterId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await requireOrgId();
    const { id } = await context.params;

    // `houseQueueReceiptSchema` validates the id shape only; it exists so a
    // malformed uuid is a 400 from validation rather than a Prisma error.
    const data = validateBody(houseQueueReceiptSchema, { inspectionId: id });
    if (data instanceof NextResponse) return data;

    const { gate, snapshot } = await getOrCreateTerminationReceipt({
      organizationId: orgId,
      inspectionId: data.inspectionId,
      printedBy: requesterId,
    });

    if (!gate.allowed || !snapshot) {
      return NextResponse.json(
        {
          error: gate.allowed
            ? "The receipt snapshot could not be produced."
            : gate.message,
          code: gate.allowed ? "RECEIPT_UNAVAILABLE" : gate.reason,
        },
        // 409 rather than 403: the caller is allowed to print receipts in
        // general, this particular house is not ready yet.
        { status: 409 },
      );
    }

    return NextResponse.json(
      { success: true, gate, receipt: snapshot, isPrint },
      { status: 200 },
    );
  } catch (e) {
    return handleRouteError(e, {
      label: "GET/POST /api/house-queue/receipts/[id]",
      message: "Failed to produce the termination receipt",
    });
  }
}

export const dynamic = "force-dynamic";
