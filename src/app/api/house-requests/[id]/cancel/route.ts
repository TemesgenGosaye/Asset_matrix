import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-auth";
import { handleRouteError, requireOrgId } from "@/lib/api-route";
import { validateBody } from "@/lib/validation";
import { REMARKS_MAX_LENGTH } from "@/lib/house-requests/constants";
import { cancelHouseRequest } from "@/lib/house-requests/service";
import { invalidateAssistantCache, CACHE_DOMAIN } from "@/lib/ai/cache";

export const dynamic = "force-dynamic";

const cancelSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(
      REMARKS_MAX_LENGTH,
      `Reason must be at most ${REMARKS_MAX_LENGTH} characters`,
    )
    .optional()
    .nullable(),
});

/**
 * POST /api/house-requests/[id]/cancel
 *
 * Closes a live request without an allocation, which is what removes an employee
 * from the House Queue and re-opens the one-active-request slot for them.
 *
 * Requires `house_request:manage` (Asset Manager / Admin) — an applicant cannot
 * withdraw themselves through this route; the queue's own skip/defer/release
 * actions are the allocator-side controls.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authUser = await requirePermission("house_request:manage");
    const orgId = await requireOrgId();
    const { id } = await params;

    const body = await req.json().catch(() => ({}));
    const data = validateBody(cancelSchema, body ?? {});
    if (data instanceof NextResponse) return data;

    const result = await cancelHouseRequest({
      organizationId: orgId,
      requestId: id,
      decidedBy: authUser.id!,
      reason: data.reason ?? null,
    });

    invalidateAssistantCache(orgId, [CACHE_DOMAIN.queue]);

    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    return handleRouteError(e, {
      label: "POST /api/house-requests/[id]/cancel",
      message: "Failed to cancel the house request",
    });
  }
}
