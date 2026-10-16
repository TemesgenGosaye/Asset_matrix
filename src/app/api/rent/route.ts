/**
 * GET  /api/rent - paginated, filtered, sorted renter register.
 * POST /api/rent - register a renter and generate their full rent schedule.
 *
 * Both handlers are thin: auth + org scoping come from ./withRentContext, the
 * read layer owns the aggregates and the service owns the transaction.
 */

import { type NextRequest, NextResponse } from "next/server";
import { canViewSensitiveRentData } from "@/lib/rent/access";
import {
  mapRentError,
  parseRentBody,
  parseRentQuery,
  withRentContext,
  withRentMutationContext,
} from "@/lib/rent/api";
import { createRenterSchema, rentListQuerySchema } from "@/lib/rent/schemas";
import { listRenters, getRenterWithSchedule } from "@/lib/rent/queries";
import { createRenter } from "@/lib/rent/service";

export async function GET(req: NextRequest) {
  const { response, context } = await withRentContext(
    "rent:view",
    "GET /api/rent",
  );
  if (response) return response;
  const { user, organizationId } = context!;

  try {
    const query = parseRentQuery(new URL(req.url), rentListQuerySchema);
    const canSeeSensitive = await canViewSensitiveRentData(user);
    const result = await listRenters({
      organizationId,
      query,
      canSeeSensitive,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return mapRentError(error, "GET /api/rent error");
  }
}

export async function POST(req: NextRequest) {
  const { response, context } = await withRentMutationContext(
    "rent:create",
    "POST /api/rent",
  );
  if (response) return response;
  const { user, organizationId } = context!;

  try {
    const { data, response: parseError } = await parseRentBody(
      req,
      createRenterSchema,
    );
    if (parseError) return parseError;

    const { id } = await createRenter({
      organizationId,
      actorId: user.id ?? null,
      input: data,
    });

    // Return the freshly created renter WITH its generated schedule so the UI can
    // open the detail view immediately without a second round trip.
    const canSeeSensitive = await canViewSensitiveRentData(user);
    const created = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return mapRentError(error, "POST /api/rent error");
  }
}

export const dynamic = "force-dynamic";
