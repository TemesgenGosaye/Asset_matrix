import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth, requireApiAdmin, requireNotDemoMode } from "@/lib/api-auth";
import { handleRouteError, requireOrgId } from "@/lib/api-route";
import { validateBody } from "@/lib/validation";
import { createAuditLog, AUDIT_ACTIONS, AUDIT_ENTITIES } from "@/lib/audit-log";
import {
  findLockedKeys,
  findUnknownKeys,
  getOrgHiddenKeys,
  setOrgHiddenKeys,
} from "@/lib/navigation/preferences";

/**
 * Organisation-wide navigation default.
 *
 * Every member of the org inherits this list unless they have saved their own
 * preference, in which case theirs wins. Only an admin may change it.
 */

const MAX_KEYS = 1000;

const payloadSchema = z.object({
  hiddenKeys: z.array(z.string().min(1).max(120)).max(MAX_KEYS),
});

function invalidKeysResponse(
  code: string,
  message: string,
  field: string,
  keys: string[],
): NextResponse {
  return NextResponse.json({ error: message, code, [field]: keys }, { status: 422 });
}

/** GET /api/navigation/organization — the org default hidden keys. */
export async function GET() {
  try {
    await requireApiAuth();
    const organizationId = await requireOrgId();
    return NextResponse.json({
      hiddenKeys: (await getOrgHiddenKeys(organizationId)) ?? [],
    });
  } catch (error) {
    return handleRouteError(error, {
      label: "GET /api/navigation/organization",
      message: "Failed to load the organization navigation default",
    });
  }
}

/** PUT /api/navigation/organization — replace the org default (admin only). */
export async function PUT(request: NextRequest) {
  try {
    const demo = requireNotDemoMode();
    if (demo) return demo;

    const user = await requireApiAdmin();
    const organizationId = await requireOrgId();

    const data = validateBody(payloadSchema, await request.json());
    if (data instanceof NextResponse) return data;

    const unknown = findUnknownKeys(data.hiddenKeys);
    if (unknown.length > 0) {
      return invalidKeysResponse(
        "UNKNOWN_NAV_KEYS",
        "This payload contains menu keys the registry does not know.",
        "unknownKeys",
        unknown,
      );
    }

    const locked = findLockedKeys(data.hiddenKeys);
    if (locked.length > 0) {
      return invalidKeysResponse(
        "LOCKED_NAV_KEYS",
        "These menu items are locked and cannot be hidden.",
        "lockedKeys",
        locked,
      );
    }

    const before = await getOrgHiddenKeys(organizationId);
    const saved = await setOrgHiddenKeys(organizationId, data.hiddenKeys);

    await createAuditLog({
      userId: user.id ?? null,
      action: AUDIT_ACTIONS.UPDATE,
      entity: AUDIT_ENTITIES.NAVIGATION_PREFERENCE,
      entityId: organizationId,
      details: { scope: "organization", before, after: saved },
    });

    return NextResponse.json({ hiddenKeys: saved });
  } catch (error) {
    return handleRouteError(error, {
      label: "PUT /api/navigation/organization",
      message: "Failed to save the organization navigation default",
    });
  }
}

export const dynamic = "force-dynamic";
