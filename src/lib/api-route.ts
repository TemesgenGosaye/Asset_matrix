import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";
import { getOrganizationContext } from "@/lib/organization-context";

// ---------------------------------------------------------------------------
// Typed route errors
// ---------------------------------------------------------------------------

/**
 * Base class for errors that map directly to an HTTP status. Throwing these
 * from a route handler lets `handleRouteError` produce the response without
 * per-route boilerplate.
 */
export class RouteError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "RouteError";
  }
}

export class OrgContextRequiredError extends RouteError {
  constructor() {
    super("Organization context required", 400, "ORG_CONTEXT_REQUIRED");
    this.name = "OrgContextRequiredError";
  }
}

export class NotFoundError extends RouteError {
  constructor(message = "Resource not found") {
    super(message, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class ConflictError extends RouteError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
    this.name = "ConflictError";
  }
}

export class BadRequestError extends RouteError {
  constructor(message: string) {
    super(message, 400, "BAD_REQUEST");
    this.name = "BadRequestError";
  }
}

// ---------------------------------------------------------------------------
// Organization context
// ---------------------------------------------------------------------------

/**
 * Resolve the current user's organization id or throw an `OrgContextRequiredError`
 * (mapped to HTTP 400 by `handleRouteError`). Keeps the "Organization context
 * required" guard a single call instead of a three-line if-check in every route.
 */
export async function requireOrgId(): Promise<string> {
  const ctx = await getOrganizationContext();
  const orgId = ctx?.organization?.id;
  if (!orgId) throw new OrgContextRequiredError();
  return orgId;
}

// ---------------------------------------------------------------------------
// Error → NextResponse normalizer
// ---------------------------------------------------------------------------

export interface HandleRouteErrorOptions {
  /** Route label used when logging the unhandled error (e.g. "GET /api/household"). */
  label: string;
  /** Fallback message returned for unhandled errors (HTTP 500). */
  message: string;
}

/**
 * Normalize an arbitrary thrown value into a JSON `NextResponse`, replacing the
 * identical try/catch tails that previously lived in every route:
 *
 *  - `RouteError`          → its own status (400/404/409/...)
 *  - Error "Unauthorized"  → 401
 *  - Error "Forbidden*"    → 403 (drops the "Forbidden: " prefix from the message)
 *  - Known error prefixes  → 404/409 (HOUSEHOLD_NOT_FOUND, HOUSE_NUMBER_EXISTS:,
 *    HOUSE_ID_EXISTS:, NOT_FOUND:, CONFLICT:)
 *  - Prisma unique violation (P2002) → 409
 *  - Anything else         → logs + 500 with the supplied fallback message
 */
export function handleRouteError(
  e: unknown,
  opts: HandleRouteErrorOptions,
): NextResponse {
  if (e instanceof RouteError) {
    return NextResponse.json(
      { error: e.message, code: e.code },
      { status: e.status },
    );
  }

  if (e instanceof Error && e.message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (e instanceof Error && e.message.startsWith("Forbidden")) {
    return NextResponse.json(
      { error: e.message.replace(/^Forbidden:?\s*/, "") },
      { status: 403 },
    );
  }

  if (e instanceof Error) {
    if (e.message === "HOUSEHOLD_NOT_FOUND") {
      return NextResponse.json(
        { error: "Household not found in this organization" },
        { status: 404 },
      );
    }
    if (e.message.startsWith("HOUSE_NUMBER_EXISTS:")) {
      const num = e.message.replace("HOUSE_NUMBER_EXISTS:", "");
      return NextResponse.json(
        { error: `House number '${num}' is already registered in this organization.` },
        { status: 409 },
      );
    }
    if (e.message.startsWith("HOUSE_ID_EXISTS:")) {
      const hid = e.message.replace("HOUSE_ID_EXISTS:", "");
      return NextResponse.json(
        { error: `House ID '${hid}' is already registered in this organization.` },
        { status: 409 },
      );
    }
    if (e.message.startsWith("NOT_FOUND:")) {
      return NextResponse.json(
        { error: e.message.replace("NOT_FOUND:", "") },
        { status: 404 },
      );
    }
    if (e.message.startsWith("CONFLICT:")) {
      return NextResponse.json(
        { error: e.message.replace("CONFLICT:", "") },
        { status: 409 },
      );
    }
  }

  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    return NextResponse.json(
      { error: "A record with these unique fields already exists." },
      { status: 409 },
    );
  }

  logger.error(opts.label, { error: e });
  return NextResponse.json({ error: opts.message }, { status: 500 });
}