/**
 * POST /api/rent/payments/[paymentId]/void - reverse a recorded payment.
 *
 * Requires `rent:void` and a reason. The receipt keeps its number, gains
 * voidedAt/voidedById/voidReason, and the month reverts to UNPAID so it can be
 * re-paid with a fresh receipt. Nothing is hard-deleted.
 *
 * Returns the refreshed renter + schedule so the UI can update outstanding
 * totals immediately.
 */

import { type NextRequest, NextResponse } from "next/server";
import { canViewSensitiveRentData } from "@/lib/rent/access";
import {
  mapRentError,
  parseRentBody,
  parseUuid,
  withRentMutationContext,
} from "@/lib/rent/api";
import { voidPaymentSchema } from "@/lib/rent/schemas";
import { getRenterWithSchedule } from "@/lib/rent/queries";
import { voidPayment } from "@/lib/rent/service";

interface RouteContext {
  params: Promise<{ paymentId: string }>;
}

export async function POST(req: NextRequest, context: RouteContext) {
  const { response, context: ctx } = await withRentMutationContext(
    "rent:void",
    "POST /api/rent/payments/[paymentId]/void",
  );
  if (response) return response;
  const { user, organizationId } = ctx!;

  try {
    const paymentId = parseUuid((await context.params).paymentId, "payment id");
    const { data, response: parseError } = await parseRentBody(
      req,
      voidPaymentSchema,
    );
    if (parseError) return parseError;

    const result = await voidPayment({
      organizationId,
      actorId: user.id ?? null,
      paymentId,
      input: data,
    });

    const canSeeSensitive = await canViewSensitiveRentData(user);
    const updated = await getRenterWithSchedule({
      organizationId,
      id: result.renterId,
      canSeeSensitive,
      includeArchived: true,
    });

    return NextResponse.json({ ...updated, ...result }, { status: 200 });
  } catch (error) {
    return mapRentError(
      error,
      "POST /api/rent/payments/[paymentId]/void error",
    );
  }
}

export const dynamic = "force-dynamic";
