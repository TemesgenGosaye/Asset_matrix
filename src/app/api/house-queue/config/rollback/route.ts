import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { requireNotDemoMode, requirePermission } from "@/lib/api-auth";
import {
  BadRequestError,
  handleRouteError,
  requireOrgId,
} from "@/lib/api-route";
import {
  getConfigState,
  rollbackConfig,
} from "@/lib/house-queue/config/service";
import {
  getReauthSecret,
  REAUTH_COOKIE,
  verifyReauthProof,
} from "@/lib/house-queue/config/reauth";
import { getClientIp, serializeState } from "../_shared";

// POST /api/house-queue/config/rollback
// Body: { targetVersionId, changeSummary }
//
// Re-publishes an archived version's payload as a NEW version number.
// Admin-level operation — always requires a fresh re-auth proof.
export async function POST(req: NextRequest) {
  try {
    const requester = await requirePermission("house_queue:manage");
    requireNotDemoMode();
    const orgId = await requireOrgId();

    const requesterId = requester.id;
    if (!requesterId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const targetVersionId =
      typeof body?.targetVersionId === "string" ? body.targetVersionId : "";
    const changeSummary =
      typeof body?.changeSummary === "string" ? body.changeSummary : "";

    if (!targetVersionId) {
      throw new BadRequestError("targetVersionId is required");
    }
    if (!changeSummary.trim()) {
      throw new BadRequestError("A change summary is required for rollback");
    }

    const cookieStore = await cookies();
    const claims = verifyReauthProof(
      cookieStore.get(REAUTH_COOKIE)?.value ?? null,
      getReauthSecret(),
    );
    if (
      !claims ||
      claims.userId !== requesterId ||
      claims.organizationId !== orgId
    ) {
      return NextResponse.json(
        {
          error:
            "Re-authentication is required before rolling back the engine configuration",
          code: "REAUTH_REQUIRED",
        },
        { status: 403 },
      );
    }

    await rollbackConfig({
      organizationId: orgId,
      targetVersionId,
      createdBy: requesterId,
      ipAddress: getClientIp(req),
      changeSummary: changeSummary.trim(),
    });

    const fresh = await getConfigState(orgId);
    return NextResponse.json(
      { success: true, state: serializeState(fresh) },
      { status: 200 },
    );
  } catch (e) {
    return handleRouteError(e, {
      label: "POST /api/house-queue/config/rollback",
      message: "Failed to roll back the engine configuration",
    });
  }
}

export const dynamic = "force-dynamic";
