/**
 * House Request — failure taxonomy.
 *
 * WHY THIS EXISTS
 * Every rejected request must tell the user WHAT went wrong and WHAT TO DO NEXT.
 * The previous behaviour collapsed every non-policy failure onto a single
 * fallback code, so a 500, a 403, a 400 validation error and an offline browser
 * were all rendered to the user as "Employee ID not found — check the Employee ID
 * exactly as issued by HR". That is actively misleading: it tells the user to
 * retype a perfectly correct ID when the real problem is a server fault, an
 * expired session or a permission they do not hold.
 *
 * This module is the ONE place that maps an HTTP response to a
 * `HouseRequestFailure`. Nothing else in the client is allowed to guess a code,
 * so a message can never be attributed to the wrong cause again.
 *
 * Client-safe: no prisma / next-server imports, so the client component can
 * bundle it and vitest can exercise it without a database.
 */

import { LOOKUP_ERROR_CODES, type LookupErrorCode } from "./types";

// ---------------------------------------------------------------------------
// Codes
// ---------------------------------------------------------------------------

/**
 * Failures that are NOT house-request policy decisions.
 *
 * These are transport / framework outcomes. They are listed explicitly so the
 * mapper is exhaustive over `Response.status` and TypeScript can prove it: if a
 * new branch is ever added without a code, the switch stops type-checking.
 */
export const TRANSPORT_FAILURE_CODES = [
  /** 400 from `validateBody` — the body did not satisfy the Zod schema. */
  "VALIDATION_FAILED",
  /** 401 — no session, or the session's user is no longer active. */
  "UNAUTHORIZED",
  /** 403 — authenticated, but lacks `house_request:create`. */
  "FORBIDDEN",
  /** 409 — a concurrent submit won the race on the partial unique index. */
  "CONFLICT",
  /** 404 — the request is not in this organization (withdraw/close paths). */
  "NOT_FOUND",
  /** 409 — the request was already withdrawn or closed before this call. */
  "STATE_CONFLICT",
  /** 5xx — unhandled server fault. */
  "SERVER_ERROR",
  /** `fetch` itself rejected — offline, DNS failure, connection reset. */
  "NETWORK_ERROR",
] as const;

export type TransportFailureCode = (typeof TRANSPORT_FAILURE_CODES)[number];

/** Every code the UI can be asked to render. */
export type HouseRequestFailureCode = LookupErrorCode | TransportFailureCode;

/**
 * Whether a code came from the house-request policy layer.
 * Policy rejections are about the EMPLOYEE and may reset the form; transport
 * failures are about the REQUEST and must never wipe what the user typed.
 */
export function isPolicyFailureCode(
  code: HouseRequestFailureCode,
): code is LookupErrorCode {
  return (LOOKUP_ERROR_CODES as readonly string[]).includes(code);
}

// ---------------------------------------------------------------------------
// The failure object the UI renders
// ---------------------------------------------------------------------------

/** How severe the problem is — drives the banner styling. */
export type FailureSeverity = "policy" | "input" | "access" | "system";

export interface HouseRequestFailure {
  code: HouseRequestFailureCode;
  severity: FailureSeverity;
  /** Short headline, e.g. "Request already submitted". */
  title: string;
  /** One sentence naming the specific problem. */
  message: string;
  /** What the user can do about it. Omitted when there is nothing useful. */
  hint?: string;
  /**
   * Per-field messages from the server's Zod validation, keyed by field name
   * (`remarks`, `employeeNumber`). Rendered inline next to the field so the user
   * sees WHY it was rejected instead of a generic "Validation failed".
   */
  fields?: Record<string, string[]>;
  /**
   * True when the verified employee must be re-checked — the rejection came
   * from live employee data that has since changed. The form is dropped back to
   * the search stage rather than left showing a stale record.
   */
  requiresReverification: boolean;
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

interface FailureCopy {
  severity: FailureSeverity;
  title: string;
  /** Overrides `LOOKUP_ERROR_MESSAGES` when the server has nothing better. */
  message?: string;
  hint: string;
  requiresReverification: boolean;
}

/**
 * Copy for every code. `message` is deliberately omitted for policy codes so
 * the server's own `LOOKUP_ERROR_MESSAGES` text stays the single source of
 * truth — the server knows the job grade, the archive state and so on.
 */
const FAILURE_COPY: Record<HouseRequestFailureCode, FailureCopy> = {
  // ── Policy: the employee cannot be requested for ──────────────────────────
  EMPLOYEE_NOT_FOUND: {
    severity: "input",
    title: "Employee ID not found",
    hint: "Check the Employee ID exactly as issued by HR. Only employees registered in your organization can be verified.",
    requiresReverification: true,
  },
  EMPLOYEE_ARCHIVED: {
    severity: "input",
    title: "Employee record archived",
    hint: "This employee has been soft-deleted. An administrator must restore the record before a house can be requested.",
    requiresReverification: true,
  },
  EMPLOYEE_INACTIVE: {
    severity: "input",
    title: "Employee not active",
    hint: "House requests are only accepted for employees whose employment status is active.",
    requiresReverification: true,
  },
  NOT_ELIGIBLE: {
    severity: "input",
    title: "Not eligible under the job grade rule",
    hint: "The active allocation policy maps job grades to house categories. This employee's grade falls outside every band, or has no grade set at all.",
    requiresReverification: true,
  },
  REQUEST_ALREADY_EXISTS: {
    severity: "policy",
    title: "Request already submitted",
    hint: "This employee already has an active request waiting in the House Queue. Look it up again to see its status and reason.",
    requiresReverification: true,
  },
  ALREADY_ALLOCATED: {
    severity: "policy",
    title: "Employee already holds an allocated house",
    hint: "An employee with a live allocation cannot file another request. Release the house from the House Queue first if the allocation is wrong.",
    requiresReverification: true,
  },

  // ── Transport: the request, not the employee ─────────────────────────────
  VALIDATION_FAILED: {
    severity: "input",
    title: "Check the highlighted field",
    message:
      "The request was rejected by validation before it reached the house queue.",
    hint: "Correct the highlighted field and submit again.",
    requiresReverification: false,
  },
  UNAUTHORIZED: {
    severity: "access",
    title: "Your session has expired",
    message: "You are no longer signed in, so the request was not submitted.",
    hint: "Sign in again, then re-verify the employee — nothing was lost.",
    requiresReverification: false,
  },
  FORBIDDEN: {
    severity: "access",
    title: "You do not have permission to do this",
    message:
      "Your account is missing the house request permission, so nothing was submitted.",
    hint: "Ask an administrator to grant the house request permission for your role.",
    requiresReverification: false,
  },
  CONFLICT: {
    severity: "policy",
    title: "Request already submitted",
    message:
      "Another request for this employee was filed a moment before yours, so only one could be recorded.",
    hint: "Look the employee up again to see the request that is now in the queue.",
    requiresReverification: true,
  },
  NOT_FOUND: {
    severity: "policy",
    title: "Request not found",
    message:
      "That house request is no longer on file for this organization, so nothing was changed.",
    hint: "Someone may have withdrawn it already. Verify the employee again to see their current position.",
    requiresReverification: true,
  },
  STATE_CONFLICT: {
    severity: "policy",
    title: "Request is no longer active",
    message:
      "This request was already withdrawn or closed, so there was nothing left to close.",
    hint: "Verify the employee again to see what is currently on file for them.",
    requiresReverification: true,
  },
  SERVER_ERROR: {
    severity: "system",
    title: "Could not submit the request",
    message:
      "The server hit an unexpected error. Your request was NOT recorded.",
    hint: "Nothing was saved, so it is safe to try again. If it keeps failing, tell an administrator — the details are in the server log.",
    requiresReverification: false,
  },
  NETWORK_ERROR: {
    severity: "system",
    title: "Could not reach the server",
    message: "The request never left this device, so nothing was submitted.",
    hint: "Check your connection and try again. Your typed reason is still here.",
    requiresReverification: false,
  },
};

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

/** Shape of the JSON body the house-request routes return on failure. */
interface ErrorBody {
  error?: string;
  code?: string;
  fields?: Record<string, string[]>;
}

/** Read `code` as a known code, or null when it is absent/unrecognised. */
function asKnownCode(raw: string | undefined): HouseRequestFailureCode | null {
  if (!raw) return null;
  const known = FAILURE_COPY[raw as HouseRequestFailureCode];
  return known ? (raw as HouseRequestFailureCode) : null;
}

/** Fallback code for a status that carries no usable body code. */
function codeForStatus(status: number): TransportFailureCode {
  if (status === 400) return "VALIDATION_FAILED";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 409) return "CONFLICT";
  return "SERVER_ERROR";
}

/**
 * Build the failure object for a code, letting the server's `error` string win
 * over the static copy when it carries more specific detail.
 */
function build(
  code: HouseRequestFailureCode,
  body: ErrorBody,
): HouseRequestFailure {
  const copy = FAILURE_COPY[code];
  const serverMessage = body.error?.trim();

  // Prefer the server's message for policy codes (it names the actual job
  // grade) and for transport codes (it names the actual server fault).
  const message =
    copy.message && serverMessage && code !== "VALIDATION_FAILED"
      ? serverMessage
      : (copy.message ?? serverMessage ?? FAILURE_COPY[code].title);

  const failure: HouseRequestFailure = {
    code,
    severity: copy.severity,
    title: copy.title,
    message,
    hint: copy.hint,
    requiresReverification: copy.requiresReverification,
  };

  if (body.fields && Object.keys(body.fields).length > 0) {
    failure.fields = body.fields;
  }

  return failure;
}

/**
 * Map a non-OK house-request response to a failure the UI can render.
 *
 * Resolution order — body `code` first (the routes emit a stable code for every
 * policy rejection), then the HTTP status, then a server fault. An unrecognised
 * `code` is deliberately NOT trusted: a 400 carrying `code: "SOMETHING_NEW"`
 * still maps by status rather than rendering an empty banner.
 */
export function describeFailureResponse(
  status: number,
  body: unknown,
): HouseRequestFailure {
  const b = (body ?? {}) as ErrorBody;
  const known = asKnownCode(b.code);
  const code = known ?? codeForStatus(status);

  // A 400 with no field map would otherwise say "check the highlighted field"
  // with nothing highlighted, so name the request body instead.
  if (code === "VALIDATION_FAILED" && !b.fields) {
    return build(code, {
      ...b,
      error:
        b.error ??
        "The request was rejected before it reached the house queue.",
    });
  }

  return build(code, b);
}

/**
 * The failure shown when `fetch` rejects outright — offline, connection reset,
 * or an aborted request. The user's typed reason is still on screen, so the
 * copy must not imply anything was lost.
 */
export function describeNetworkFailure(
  stage: "lookup" | "submit",
): HouseRequestFailure {
  const base = build("NETWORK_ERROR", {});
  if (stage === "lookup") {
    return {
      ...base,
      message:
        "The verification request never left this device, so no employee record was loaded.",
    };
  }
  return base;
}

/**
 * Withdrawal-specific copy.
 *
 * The submit path and the withdraw path reject for completely different reasons
 * on the same status code — a 409 on submit means "you lost a race", a 409 on
 * withdraw means "somebody got here first" — so the two must not share
 * sentences. Only the codes a withdraw can actually produce are overridden;
 * everything else falls through to the shared `FAILURE_COPY`.
 */
const CANCEL_COPY: Partial<Record<TransportFailureCode, Partial<FailureCopy>>> =
  {
    CONFLICT: {
      title: "Already withdrawn",
      message:
        "Somebody closed this request before you did, so it was already off the queue.",
      hint: "Nothing was changed. Verify the employee again to see what is on file.",
    },
    NOT_FOUND: {
      title: "Request not found",
      message:
        "That house request is no longer on file for this organization, so nothing was changed.",
      hint: "Verify the employee again to see their current position.",
    },
    STATE_CONFLICT: {
      title: "Request is no longer active",
      message:
        "This request was already withdrawn or closed, so there was nothing left to close.",
      hint: "Verify the employee again to see what is on file for them.",
    },
    SERVER_ERROR: {
      title: "Could not withdraw the request",
      message:
        "The server hit an unexpected error. The request is still in the queue exactly as it was.",
      hint: "Nothing was changed, so it is safe to try again. If it keeps failing, tell an administrator.",
    },
    NETWORK_ERROR: {
      title: "Could not reach the server",
      message:
        "The withdrawal never left this device, so the request is still in the queue.",
      hint: "Check your connection and try again — nothing has been changed.",
    },
  };

/**
 * Status → code, for the withdraw route (which emits no policy vocabulary).
 *
 * `0` is the sentinel this page passes when `fetch` itself rejected — there is
 * no status at all in that case, and folding it into `SERVER_ERROR` would tell
 * the user to look at a server log for a request that never left the browser.
 */
function cancelCodeForStatus(status: number): TransportFailureCode {
  if (status === 0) return "NETWORK_ERROR";
  if (status === 400) return "VALIDATION_FAILED";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "STATE_CONFLICT";
  return "SERVER_ERROR";
}

/**
 * Map a non-OK withdrawal response to a failure the UI can render.
 *
 * Separate from `describeFailureResponse` on purpose: the withdraw route answers
 * through `handleRouteError`, so its bodies carry a human `error` string but no
 * house-request `code`. Trusting the submit mapper here would render "Request
 * already submitted" the moment somebody tried to withdraw a request that was
 * already gone — an instruction to do the one thing the user just tried to do.
 */
export function describeCancelFailure(
  status: number,
  body: unknown,
): HouseRequestFailure {
  const b = (body ?? {}) as ErrorBody;
  const bodyCode = asKnownCode(b.code);
  const code: HouseRequestFailureCode =
    bodyCode && isPolicyFailureCode(bodyCode)
      ? bodyCode
      : cancelCodeForStatus(status);

  const override = CANCEL_COPY[code as TransportFailureCode];
  if (!override) return build(code, b);

  return {
    ...build(code, b),
    ...override,
    requiresReverification: override.requiresReverification ?? true,
  };
}

/**
 * Copy for the field-level messages a server-side Zod rejection produced, so the
 * remarks box can show the server's own wording rather than the client's guess.
 */
export function fieldMessages(
  failure: HouseRequestFailure | null,
  field: string,
): string[] | null {
  const messages = failure?.fields?.[field];
  return messages && messages.length > 0 ? messages : null;
}
