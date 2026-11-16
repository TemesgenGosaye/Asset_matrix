import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { handleRouteError } from "@/lib/api-route";
import { validateBody } from "@/lib/validation";
import { createAuditLog, AUDIT_ACTIONS, AUDIT_ENTITIES } from "@/lib/audit-log";
import {
  findLockedKeys,
  findUnknownKeys,
  getNavigationState,
  setUserHiddenKeys,
} from "@/lib/navigation/preferences";

/**
 * How many keys one payload may carry. The registry is ~50 items today; the cap
 * only stops a runaway/hostile body from being stored verbatim.
 */
const MAX_KEYS = 1000;

const payloadSchema = z.object({
  /**
   * The full set of menu keys the user wants HIDDEN. It is a set, not a delta:
   * sending the whole list keeps server and client convergent without a diff
   * protocol, and makes a lost update impossible to misread.
   */
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

/** GET /api/navigation/preferences — the caller's resolved navigation state. */
export async function GET() {
  try {
    const user = await requireApiAuth();
    const state = await getNavigationState({
      userId: user.id,
      organizationId: user.organizationId,
    });
    return NextResponse.json(state);
  } catch (error) {
    return handleRouteError(error, {
      label: "GET /api/navigation/preferences",
      message: "Failed to load navigation preferences",
    });
  }
}

/**
 * PUT /api/navigation/preferences — replace the caller's hidden-key list.
 *
 * This is a UI preference only; it never grants or removes access. A user may
 * only write their own row, and unknown or locked keys are rejected rather than
 * silently dropped so the client cannot believe it saved something it did not.
 */
export async function PUT(request: NextRequest) {
  try {
    const user = await requireApiAuth();
    const userId = user.id;
    if (!userId) throw new Error("Unauthorized");

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

    const before = await getNavigationState({
      userId: user.id,
      organizationId: user.organizationId,
    });

    await setUserHiddenKeys(userId, user.organizationId ?? null, data.hiddenKeys);

    await createAuditLog({
      userId,
      action: AUDIT_ACTIONS.UPDATE,
      entity: AUDIT_ENTITIES.NAVIGATION_PREFERENCE,
      entityId: userId,
      details: { scope: "user", before: before.userHiddenKeys, after: data.hiddenKeys },
    });

    const state = await getNavigationState({
      userId: user.id,
      organizationId: user.organizationId,
    });
    return NextResponse.json(state);
  } catch (error) {
    return handleRouteError(error, {
      label: "PUT /api/navigation/preferences",
      message: "Failed to save navigation preferences",
    });
  }
}

export const dynamic = "force-dynamic";
