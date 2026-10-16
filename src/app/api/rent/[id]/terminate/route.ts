/**
 * POST /api/rent/[id]/terminate - end a lease early.
 *
 * Requires a reason and an effective date. Months still UNPAID on or after the
 * effective date become VOIDED; paid months are untouched. Nothing is deleted.
 */

import { type NextRequest, NextResponse } from "next/server";
import { canViewSensitiveRentData } from "@/lib/rent/access";
import {
  mapRentError,
  parseRentBody,
  parseUuid,
  withRentMutationContext,
} from "@/lib/rent/api";
import { terminateLeaseSchema } from "@/lib/rent/schemas";
import { getRenterWithSchedule } from "@/lib/rent/queries";
import { terminateLease } from "@/lib/rent/service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, context: RouteContext) {
  const { response, context: ctx } = await withRentMutationContext(
    "rent:terminate",
    "POST /api/rent/[id]/terminate",
  );
  if (response) return response;
  const { user, organizationId } = ctx!;

  try {
    const id = parseUuid((await context.params).id, "renter id");
    const { data, response: parseError } = await parseRentBody(
      req,
      terminateLeaseSchema,
    );
    if (parseError) return parseError;

    const { voidedMonths } = await terminateLease({
      organizationId,
      actorId: user.id ?? null,
      id,
      input: data,
    });

    const canSeeSensitive = await canViewSensitiveRentData(user);
    const updated = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive,
      includeArchived: true,
    });

    return NextResponse.json({ ...updated, voidedMonths }, { status: 200 });
  } catch (error) {
    return mapRentError(error, "POST /api/rent/[id]/terminate error");
  }
}

export const dynamic = "force-dynamic";
