/**
 * GET    /api/rent/[id] - one renter with their full rent schedule.
 * PATCH  /api/rent/[id] - update renter details / unpaid months' amount.
 * DELETE /api/rent/[id] - archive (soft delete). There is no hard delete.
 *
 * Next 16: `params` is a Promise.
 */

import { type NextRequest, NextResponse } from "next/server";
import { hasPermission } from "@/lib/rbac";
import { canViewSensitiveRentData } from "@/lib/rent/access";
import {
  mapRentError,
  parseRentBody,
  parseUuid,
  withRentContext,
  withRentMutationContext,
} from "@/lib/rent/api";
import { archiveRenterSchema, updateRenterSchema } from "@/lib/rent/schemas";
import { getRenterWithSchedule } from "@/lib/rent/queries";
import { archiveRenter, updateRenter } from "@/lib/rent/service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  const { response, context: ctx } = await withRentContext(
    "rent:view",
    "GET /api/rent/[id]",
  );
  if (response) return response;
  const { user, organizationId } = ctx!;

  try {
    const id = parseUuid((await context.params).id, "renter id");
    const canSeeSensitive = await canViewSensitiveRentData(user);
    // Archived renters are still readable so a receipt or statement can be
    // reprinted after archiving - the row is never gone.
    const result = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive,
      includeArchived: true,
    });

    if (!result) {
      return NextResponse.json(
        { error: "Renter not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return mapRentError(error, "GET /api/rent/[id] error");
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const { response, context: ctx } = await withRentMutationContext(
    "rent:update",
    "PATCH /api/rent/[id]",
  );
  if (response) return response;
  const { user, organizationId } = ctx!;

  try {
    const id = parseUuid((await context.params).id, "renter id");
    const { data, response: parseError } = await parseRentBody(
      req,
      updateRenterSchema,
    );
    if (parseError) return parseError;

    // The elevated "change a schedule after payments" grant is re-checked here on
    // the server; the client only decides whether to show the reason field.
    const canOverrideTerms = user.isAdmin
      ? true
      : Boolean(user.id) &&
        (await hasPermission(user.id!, "rent:override_terms"));

    const result = await updateRenter({
      organizationId,
      actorId: user.id ?? null,
      id,
      input: data,
      canOverrideTerms,
    });

    const canSeeSensitive = await canViewSensitiveRentData(user);
    const updated = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive,
      includeArchived: true,
    });

    return NextResponse.json({ ...updated, ...result }, { status: 200 });
  } catch (error) {
    return mapRentError(error, "PATCH /api/rent/[id] error");
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const { response, context: ctx } = await withRentMutationContext(
    "rent:archive",
    "DELETE /api/rent/[id]",
  );
  if (response) return response;
  const { user, organizationId } = ctx!;

  try {
    const id = parseUuid((await context.params).id, "renter id");
    // Reason is optional for archiving but must still be a valid shape. Uses the
    // shared `parseRentBody`/`zodIssues` helpers like every other handler rather
    // than re-implementing the same 422 shape here.
    const body = await parseRentBody(req, archiveRenterSchema);
    if (body.response) return body.response;

    const { archivedAt } = await archiveRenter({
      organizationId,
      actorId: user.id ?? null,
      id,
      input: body.data,
    });

    return NextResponse.json(
      { message: "Renter archived", archivedAt: archivedAt.toISOString() },
      { status: 200 },
    );
  } catch (error) {
    return mapRentError(error, "DELETE /api/rent/[id] error");
  }
}

export const dynamic = "force-dynamic";
