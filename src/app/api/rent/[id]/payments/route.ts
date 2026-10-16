/**
 * POST /api/rent/[id]/payments - record a rent payment for one month.
 *
 * The write is atomic and idempotent (see `recordPayment`): a conditional update
 * on the installment row means a double-click or a retried request can never
 * produce two receipts for one month - the loser gets a 409 ALREADY_PAID.
 *
 * Returns the whole renter + schedule so the client can update its state without
 * a second fetch.
 */

import { type NextRequest, NextResponse } from "next/server";
import { canViewSensitiveRentData } from "@/lib/rent/access";
import {
  mapRentError,
  parseRentBody,
  parseUuid,
  withRentMutationContext,
} from "@/lib/rent/api";
import { recordPaymentSchema } from "@/lib/rent/schemas";
import { getRenterWithSchedule } from "@/lib/rent/queries";
import { recordPayment } from "@/lib/rent/service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, context: RouteContext) {
  const { response, context: ctx } = await withRentMutationContext(
    "rent:pay",
    "POST /api/rent/[id]/payments",
  );
  if (response) return response;
  const { user, organizationId } = ctx!;

  try {
    const renterId = parseUuid((await context.params).id, "renter id");
    const { data, response: parseError } = await parseRentBody(
      req,
      recordPaymentSchema,
    );
    if (parseError) return parseError;

    const result = await recordPayment({
      organizationId,
      actorId: user.id ?? null,
      renterId,
      input: data,
    });

    const canSeeSensitive = await canViewSensitiveRentData(user);
    const updated = await getRenterWithSchedule({
      organizationId,
      id: renterId,
      canSeeSensitive,
      includeArchived: true,
    });

    return NextResponse.json({ ...updated, ...result }, { status: 201 });
  } catch (error) {
    return mapRentError(error, "POST /api/rent/[id]/payments error");
  }
}

export const dynamic = "force-dynamic";
