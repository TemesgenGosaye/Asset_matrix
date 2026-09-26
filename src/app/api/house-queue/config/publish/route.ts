import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { requireNotDemoMode, requirePermission } from "@/lib/api-auth";
import {
  BadRequestError,
  handleRouteError,
  requireOrgId,
} from "@/lib/api-route";
import { getConfigState, publishDraft } from "@/lib/house-queue/config/service";
import {
  diffSections,
  includesAdminOnlySection,
} from "@/lib/house-queue/config/types";
import {
  getReauthSecret,
  REAUTH_COOKIE,
  verifyReauthProof,
} from "@/lib/house-queue/config/reauth";
import { getClientIp, serializeState } from "../_shared";

// POST /api/house-queue/config/publish
// Body: { changeSummary? }
//
// Promotes the current draft to ACTIVE (the outgoing active version is
// archived — never deleted). Drafts that touch ADMIN-only sections
// (weights / eligibility bands) require a fresh re-auth proof; the
// low-risk Recommendation Rules section publishes without one.
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
    const changeSummary =
      typeof body?.changeSummary === "string"
        ? body.changeSummary.trim() || null
        : null;

    const state = await getConfigState(orgId);
    const draft = state.draft;
    if (!draft) {
      throw new BadRequestError("No draft to publish — save the draft first");
    }

    const changedSections = diffSections(state.active.payload, draft.payload);
    if (changedSections.length === 0) {
      throw new BadRequestError("Draft has no changes to publish");
    }

    const needsReauth = includesAdminOnlySection(changedSections);
    if (needsReauth) {
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
              "Re-authentication is required before publishing changes to weights or eligibility bands",
            code: "REAUTH_REQUIRED",
          },
          { status: 403 },
        );
      }
    }

    await publishDraft({
      organizationId: orgId,
      createdBy: requesterId,
      ipAddress: getClientIp(req),
      changeSummary,
    });

    const fresh = await getConfigState(orgId);
    return NextResponse.json(
      { success: true, state: serializeState(fresh) },
      { status: 200 },
    );
  } catch (e) {
    return handleRouteError(e, {
      label: "POST /api/house-queue/config/publish",
      message: "Failed to publish the engine configuration",
    });
  }
}

export const dynamic = "force-dynamic";
