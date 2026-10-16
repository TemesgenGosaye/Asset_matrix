/**
 * Shared helpers for the Pay Rent API routes.
 *
 * Mirrors src/lib/employees/api.ts: auth, organisation resolution, validation and
 * error mapping live here so every rent endpoint fails the same way
 * (400 / 401 / 403 / 404 / 409 / 422 / 500) instead of each handler inventing its
 * own mapping.
 */

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError, type ZodTypeAny, type z } from "zod";
import {
  requireNotDemoMode,
  requirePermission,
  type AuthUser,
} from "@/lib/api-auth";
import { getOrganizationContext } from "@/lib/organization-context";
import type { Permission } from "@/lib/rbac";
import { logger } from "@/lib/logger";
import { RentServiceError } from "./service";

/** Resolved caller context for a rent request. */
export interface RentRequestContext {
  user: AuthUser;
  organizationId: string;
}

/**
 * Authenticate, authorise and resolve the organization in one step.
 *
 * Returns either a 4xx `NextResponse` (return it immediately) or the context.
 */
export async function withRentContext(
  permissions: Permission | Permission[],
  /**
   * Route label for the error log. Without it every 500 from any of the 11 rent
   * endpoints was logged as "GET /api/rent", pointing incident triage at the
   * wrong endpoint.
   */
  routeLabel = "GET /api/rent",
): Promise<
  | { response: NextResponse; context?: undefined }
  | {
      response?: undefined;
      context: RentRequestContext;
    }
> {
  try {
    const required = Array.isArray(permissions) ? permissions : [permissions];
    const user = await requirePermission(...required);

    const orgCtx = await getOrganizationContext();
    const organizationId = orgCtx?.organization?.id;
    if (!organizationId) {
      return {
        response: NextResponse.json(
          { error: "Your account is not assigned to an organization." },
          { status: 400 },
        ),
      };
    }

    return { context: { user, organizationId } };
  } catch (error) {
    return { response: mapRentError(error, routeLabel) };
  }
}

/** Convenience wrapper: also blocks mutations in demo mode. */
export async function withRentMutationContext(
  permissions: Permission | Permission[],
  routeLabel = "POST /api/rent",
): Promise<
  | { response: NextResponse; context?: undefined }
  | {
      response?: undefined;
      context: RentRequestContext;
    }
> {
  // Auth runs BEFORE the demo check: otherwise an anonymous caller receives
  // "this action is disabled in demo mode" (403) instead of 401, which both
  // contradicts the documented status table and discloses that demo mode is on.
  const authed = await withRentContext(permissions, routeLabel);
  if (authed.response) return authed;

  const demoBlock = requireNotDemoMode();
  if (demoBlock) return { response: demoBlock };

  return authed;
}

/** Validate a JSON body, returning either data or a 422 response. */
export async function parseRentBody<S extends ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<
  | { data: z.infer<S>; response?: undefined }
  | { data?: undefined; response: NextResponse }
> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      response: NextResponse.json(
        { error: "Request body must be valid JSON." },
        { status: 400 },
      ),
    };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      response: NextResponse.json(
        { error: "Validation failed", details: zodIssues(parsed.error) },
        { status: 422 },
      ),
    };
  }

  return { data: parsed.data as z.infer<S> };
}

/** Flatten Zod issues into `{ field, message }` for form-level display. */
export function zodIssues(
  error: ZodError,
): { field: string; message: string }[] {
  return error.issues.map((issue) => ({
    field: issue.path.join(".") || "_root",
    message: issue.message,
  }));
}

/** Parse query-string search params with a Zod schema. */
export function parseRentQuery<S extends ZodTypeAny>(
  url: URL,
  schema: S,
): z.infer<S> {
  const result = schema.safeParse(
    Object.fromEntries(url.searchParams.entries()),
  );
  if (!result.success) {
    // Surface which parameter was wrong, matching `parseRentBody`'s 422 shape.
    // An opaque 400 for `?pageSize=999` gives the caller nothing to act on.
    throw new RentServiceError(
      "Validation failed",
      422,
      "INVALID_QUERY",
      zodIssues(result.error)[0],
    );
  }
  return result.data as z.infer<S>;
}

/** Validate a UUID path/body parameter. */
export function parseUuid(value: unknown, label = "id"): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      text,
    )
  ) {
    throw new RentServiceError(`Invalid ${label}.`, 400, "INVALID_ID");
  }
  return text;
}

/**
 * Convert any thrown value into an appropriate JSON response.
 *
 * Expected failures become 4xx with an actionable message. Anything else is
 * logged in full and reported as an opaque 500 so internals never leak.
 */
export function mapRentError(error: unknown, context: string): NextResponse {
  if (error instanceof RentServiceError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        // Carried when the failure is a field-level one, so the form can
        // highlight the input instead of showing only a banner.
        ...(error.details ? { details: error.details } : {}),
      },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Validation failed", details: zodIssues(error) },
      { status: 422 },
    );
  }

  if (error instanceof Error) {
    if (error.message === "Unauthorized") {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }
    if (error.message.startsWith("Forbidden")) {
      return NextResponse.json(
        {
          error: error.message.replace(/^Forbidden:?\s*/, ""),
          code: "FORBIDDEN",
        },
        { status: 403 },
      );
    }
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") {
      return NextResponse.json(
        { error: "Renter not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }
    if (error.code === "P2002") {
      return NextResponse.json(
        {
          error: "A record with these unique values already exists.",
          code: "DUPLICATE",
        },
        { status: 409 },
      );
    }
    // P2003 = FK RESTRICT: a financial record is still referenced.
    if (error.code === "P2003") {
      return NextResponse.json(
        {
          error:
            "This record is still referenced by rent payments or schedule rows and cannot be removed.",
          code: "REFERENCED",
        },
        { status: 409 },
      );
    }
    // P2014 = a CHECK constraint rejected the row.
    if (error.code === "P2014" || error.code === "P2004") {
      return NextResponse.json(
        {
          error:
            "The values submitted violate a database rule for rent records.",
          code: "CONSTRAINT_VIOLATION",
        },
        { status: 422 },
      );
    }
  }

  logger.error(context, { error });
  return NextResponse.json(
    {
      error: "An unexpected error occurred. Please try again.",
      code: "SERVER_ERROR",
    },
    { status: 500 },
  );
}

export type { z };
