/**
 * House Request — input schemas.
 *
 * Every byte that reaches the House Request service passes through one of these
 * schemas first. Two rules are enforced here as well as in the service, because
 * the UI must be able to disable Submit before a round-trip and the API must
 * never trust the client's copy:
 *
 *  1. `employeeNumber` is the ONLY employee identity accepted. The client sends
 *     the typed Employee ID, never a UUID, never a name — so the server always
 *     performs the authoritative lookup itself.
 *  2. `remarks` is length-bounded to exactly the range the SQL CHECK constraint
 *     enforces (10..1000 after trimming).
 */

import { z } from "zod";
import {
  HOUSE_REQUEST_STATUSES,
  REMARKS_MAX_LENGTH,
  REMARKS_MIN_LENGTH,
} from "./constants";

/**
 * Employee ID as typed by the user.
 *
 * `Employee.employeeNumber` is `varchar(50)`, so 50 is the hard ceiling. It is
 * trimmed but NOT case-folded: employee numbers are issued by HR and may be
 * case-sensitive, and the server matches them exactly (with a case-insensitive
 * fallback so a mistyped case still resolves rather than silently 404-ing).
 */
export const employeeIdLookupSchema = z.object({
  employeeNumber: z
    .string({ error: "Employee ID is required" })
    .trim()
    .min(1, "Employee ID is required")
    .max(50, "Employee ID must be at most 50 characters"),
});

export type EmployeeIdLookupInput = z.infer<typeof employeeIdLookupSchema>;

/**
 * The people-search query behind the one field on the House Request page.
 *
 * This is the ONE place a free-text fragment is accepted, and it is a SEARCH,
 * not an identity: nothing it matches is ever written. Every hit is re-read by
 * `lookupEmployeeForHouseRequest` before a single field is rendered, so a
 * suggestion can only ever save the user from typing — it can never decide who a
 * request is for.
 *
 * `min(2)` is not arbitrary. One character matches most of the factory and turns
 * a search box into a scroll, and the page already carries an exact-ID path for
 * somebody who genuinely knows the code.
 */
export const houseRequestCandidatesQuerySchema = z.object({
  q: z
    .string({ error: "Search text is required" })
    .trim()
    .min(2, "Type at least 2 characters to search")
    .max(60, "Search text must be at most 60 characters"),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

export type HouseRequestCandidatesQuery = z.infer<
  typeof houseRequestCandidatesQuerySchema
>;

/**
 * Remarks / reason for the request.
 *
 * Trimmed before the length check so a whitespace-padded "short" reason is
 * rejected for the right reason. `.min` on a trimmed transform is applied by
 * Zod in pipeline order, hence the explicit `.pipe`.
 */
export const houseRequestRemarksSchema = z
  .string({ error: "Remarks / reason is required" })
  .trim()
  .min(
    REMARKS_MIN_LENGTH,
    `Remarks / reason must be at least ${REMARKS_MIN_LENGTH} characters`,
  )
  .max(
    REMARKS_MAX_LENGTH,
    `Remarks / reason must be at most ${REMARKS_MAX_LENGTH} characters`,
  );

/**
 * Submission body.
 *
 * Note what is ABSENT: no name, no job grade, no department, no marital status,
 * no service years. The client is never allowed to assert anything about the
 * employee — it identifies the employee and supplies the reason; everything
 * else is re-read from the database inside the service.
 */
export const createHouseRequestSchema = z.object({
  employeeNumber: employeeIdLookupSchema.shape.employeeNumber,
  remarks: houseRequestRemarksSchema,
});

export type CreateHouseRequestInput = z.infer<typeof createHouseRequestSchema>;

/** Query filter for the request worklist. */
export const listHouseRequestsQuerySchema = z.object({
  status: z.enum(HOUSE_REQUEST_STATUSES).optional(),
  search: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type ListHouseRequestsQuery = z.infer<
  typeof listHouseRequestsQuerySchema
>;

// ---------------------------------------------------------------------------
// Employee-ID verification
// ---------------------------------------------------------------------------

/**
 * Query for `GET /api/house-requests/verify?empId=…`.
 *
 * Deliberately the same 1–50 character bound as `employeeIdLookupSchema` and
 * nothing more: this route takes an exact Employee ID issued by HR, not a name
 * and not a fragment. The people-search endpoint is where free text belongs —
 * admitting it here would mean the verify route silently answered with the
 * wrong person, which is the one failure a verification step cannot have.
 */
export const verifyEmpIdQuerySchema = z.object({
  empId: z
    .string({ error: "Employee ID is required" })
    .trim()
    .min(1, "Employee ID is required")
    .max(50, "Employee ID must be at most 50 characters"),
});

export type VerifyEmpIdQuery = z.infer<typeof verifyEmpIdQuerySchema>;
