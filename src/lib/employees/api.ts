/**
 * Shared helpers for the employee API routes.
 *
 * Centralising the auth / organisation / error plumbing keeps each route
 * handler short and guarantees that every employee endpoint fails the same way
 * (401 / 403 / 400 / 404 / 409 / 422 / 500) instead of each handler inventing
 * its own mapping.
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
import { EmployeeServiceError } from "./service";

/** Resolved caller context for an employee request. */
export interface EmployeeRequestContext {
  user: AuthUser;
  organizationId: string;
}

/**
 * Authenticate, authorise and resolve the organization in one step.
 *
 * Returns either a 4xx `NextResponse` (to be returned immediately) or the
 * resolved context.
 */
export async function withEmployeeContext(
  permissions: Permission | Permission[],
): Promise<
  | { response: NextResponse; context?: undefined }
  | {
      response?: undefined;
      context: EmployeeRequestContext;
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
    return { response: mapErrorToResponse(error, "GET /api/employees") };
  }
}

/** Convenience wrapper: also blocks mutations in demo mode. */
export async function withEmployeeMutationContext(
  permissions: Permission | Permission[],
): Promise<
  | { response: NextResponse; context?: undefined }
  | {
      response?: undefined;
      context: EmployeeRequestContext;
    }
> {
  const demoBlock = requireNotDemoMode();
  if (demoBlock) return { response: demoBlock };
  return withEmployeeContext(permissions);
}

/** Validate a JSON body, returning either data or a 422 response. */
export async function parseJsonBody<S extends ZodTypeAny>(
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
        {
          error: "Validation failed",
          details: zodIssues(parsed.error),
        },
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
export function parseQuery<S extends ZodTypeAny>(
  url: URL,
  schema: S,
): z.infer<S> {
  const result = schema.safeParse(
    Object.fromEntries(url.searchParams.entries()),
  );
  if (!result.success) {
    throw new EmployeeServiceError(
      "Invalid query parameters.",
      400,
      "INVALID_QUERY",
    );
  }
  return result.data as z.infer<S>;
}

/**
 * Convert any thrown value into an appropriate JSON response.
 *
 * Expected failures (`EmployeeServiceError`, auth, Prisma not-found/duplicate,
 * Zod) become 4xx with an actionable message. Anything else is logged in full
 * and reported as an opaque 500 so internals never leak to the client.
 */
export function mapErrorToResponse(
  error: unknown,
  context: string,
): NextResponse {
  if (error instanceof EmployeeServiceError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error.message.startsWith("Forbidden")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 },
      );
    }
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "An employee with those details already exists" },
        { status: 409 },
      );
    }
    if (error.code === "P2003") {
      return NextResponse.json(
        {
          error:
            "This employee is still referenced by other records and cannot be changed.",
        },
        { status: 409 },
      );
    }
  }

  logger.error(context, { error });
  return NextResponse.json(
    { error: "An unexpected error occurred. Please try again." },
    { status: 500 },
  );
}

export type { z };
