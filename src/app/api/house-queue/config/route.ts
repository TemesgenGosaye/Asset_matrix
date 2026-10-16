import { type NextRequest, NextResponse } from "next/server";
import { requireNotDemoMode, requirePermission } from "@/lib/api-auth";
import {
  BadRequestError,
  handleRouteError,
  requireOrgId,
} from "@/lib/api-route";
import { getConfigState, saveDraft } from "@/lib/house-queue/config/service";
import { validateEngineConfigPayload } from "@/lib/house-queue/config/validate";
import type { EngineConfigPayload } from "@/lib/house-queue/config/types";
import { buildPublishGate, getClientIp, serializeState } from "./_shared";

// GET /api/house-queue/config
// Full state snapshot: active version, draft (if any), archived history,
// editing baseline, last-run/publish timestamps, and the caller's publish
// gate. Seed v1 on first access.
export async function GET() {
  try {
    const requester = await requirePermission("house_queue:manage");
    const orgId = await requireOrgId();
    const state = await getConfigState(orgId);
    const publishGate = await buildPublishGate(state, requester.id ?? null);
    return NextResponse.json(
      { state: serializeState(state, publishGate) },
      { status: 200 },
    );
  } catch (e) {
    return handleRouteError(e, {
      label: "GET /api/house-queue/config",
      message: "Failed to load the engine configuration",
    });
  }
}

// POST /api/house-queue/config
// Body: { payload: EngineConfigPayload } — save (create/update) the draft.
// Validated server-side; never touches the ACTIVE version.
export async function POST(req: NextRequest) {
  try {
    const requester = await requirePermission("house_queue:manage");
    requireNotDemoMode();
    const orgId = await requireOrgId();

    const body = await req.json();
    const payload = body?.payload as EngineConfigPayload | undefined;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new BadRequestError("A config payload is required");
    }

    const errors = validateEngineConfigPayload(payload);
    if (errors.length > 0) {
      return NextResponse.json(
        { error: "Validation failed", details: errors },
        { status: 400 },
      );
    }

    const requesterId = requester.id;
    if (!requesterId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await saveDraft({
      organizationId: orgId,
      payload,
      createdBy: requesterId,
      ipAddress: getClientIp(req),
    });

    const state = await getConfigState(orgId);
    // Re-derived from the draft that was just written, so the client's publish
    // button reflects the save it just made rather than the one before it.
    const publishGate = await buildPublishGate(state, requester.id ?? null);
    return NextResponse.json(
      { state: serializeState(state, publishGate) },
      { status: 200 },
    );
  } catch (e) {
    return handleRouteError(e, {
      label: "POST /api/house-queue/config",
      message: "Failed to save the engine configuration draft",
    });
  }
}

export const dynamic = "force-dynamic";
