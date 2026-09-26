import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import {
  BadRequestError,
  handleRouteError,
  requireOrgId,
} from "@/lib/api-route";
import {
  previewEngineA,
  previewEngineBRules,
} from "@/lib/house-queue/config/preview";
import { validateEngineConfigPayload } from "@/lib/house-queue/config/validate";
import type { EngineConfigPayload } from "@/lib/house-queue/config/types";

// POST /api/house-queue/config/preview
// Body: { payload: EngineConfigPayload } — a proposed (full) payload.
// Re-runs the engine twice (live ACTIVE vs proposed) and diffs the outputs.
// Read-only — nothing is written.
export async function POST(req: NextRequest) {
  try {
    await requirePermission("house_queue:manage");
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

    const [engineA, engineB] = await Promise.all([
      previewEngineA(orgId, payload),
      previewEngineBRules(orgId),
    ]);

    return NextResponse.json({ engineA, engineB }, { status: 200 });
  } catch (e) {
    return handleRouteError(e, {
      label: "POST /api/house-queue/config/preview",
      message: "Failed to compute the configuration preview",
    });
  }
}

export const dynamic = "force-dynamic";
