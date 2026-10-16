/**
 * POST /api/rent/[id]/restore - return an archived renter to the live register.
 *
 * The counterpart to DELETE /api/rent/[id]. There is no hard delete in this
 * module, so Archive is always reversible.
 */

import { type NextRequest, NextResponse } from "next/server";
import { canViewSensitiveRentData } from "@/lib/rent/access";
import {
  mapRentError,
  parseRentBody,
  parseUuid,
  withRentMutationContext,
} from "@/lib/rent/api";
import { restoreRenterSchema } from "@/lib/rent/schemas";
import { getRenterWithSchedule } from "@/lib/rent/queries";
import { restoreRenter } from "@/lib/rent/service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, context: RouteContext) {
  const { response, context: ctx } = await withRentMutationContext(
    "rent:archive",
    "POST /api/rent/[id]/restore",
  );
  if (response) return response;
  const { user, organizationId } = ctx!;

  try {
    const id = parseUuid((await context.params).id, "renter id");
    const { data, response: parseError } = await parseRentBody(
      req,
      restoreRenterSchema,
    );
    if (parseError) return parseError;

    await restoreRenter({
      organizationId,
      actorId: user.id ?? null,
      id,
      input: data,
    });

    const canSeeSensitive = await canViewSensitiveRentData(user);
    const restored = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive,
    });

    return NextResponse.json(restored, { status: 200 });
  } catch (error) {
    return mapRentError(error, "POST /api/rent/[id]/restore error");
  }
}

export const dynamic = "force-dynamic";
