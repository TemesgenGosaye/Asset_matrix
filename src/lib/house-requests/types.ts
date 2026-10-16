/**
 * House Request — API DTOs.
 *
 * Everything the House Request page and the queue integration consume. These
 * types are deliberately derived from the DATABASE SHAPE rather than from the
 * UI, so a client can never be handed a field the server did not intend to
 * expose (notably: no raw `nationalId` — see `EmployeeSnapshot.nationalIdMasked`).
 */

import type { HouseCategory } from "@/lib/house-queue/types";
import type { HouseRequestStatus } from "./constants";

// ---------------------------------------------------------------------------
// Lookup result
// ---------------------------------------------------------------------------

/** Why a lookup could not proceed. Drives the UI's error copy. */
export const LOOKUP_ERROR_CODES = [
  /** No employee carries this Employee ID in the caller's organization. */
  "EMPLOYEE_NOT_FOUND",
  /** The employee row exists but is archived (soft-deleted). */
  "EMPLOYEE_ARCHIVED",
  /** The employee row exists but `employmentStatus` is not `active`. */
  "EMPLOYEE_INACTIVE",
  /** Job grade falls outside the central eligibility rule (see eligibility.ts). */
  "NOT_ELIGIBLE",
  /** The employee already holds a live request. */
  "REQUEST_ALREADY_EXISTS",
  /** The employee already holds an allocated house. */
  "ALREADY_ALLOCATED",
] as const;

export type LookupErrorCode = (typeof LOOKUP_ERROR_CODES)[number];

/** Verbatim text for each rejection reason. */
export const LOOKUP_ERROR_MESSAGES: Record<LookupErrorCode, string> = {
  EMPLOYEE_NOT_FOUND:
    "No employee with this Employee ID was found in your organization.",
  EMPLOYEE_ARCHIVED:
    "This employee record has been archived. Restore the record before filing a house request.",
  EMPLOYEE_INACTIVE:
    "This employee is not currently active. House requests are only accepted for active employees.",
  NOT_ELIGIBLE:
    "This employee's job grade does not qualify for a house under the current allocation policy.",
  REQUEST_ALREADY_EXISTS:
    "This employee already has an active house request in the queue.",
  ALREADY_ALLOCATED:
    "This employee already holds an allocated house and cannot request another.",
};

/**
 * The employee record as shown in the read-only verification form.
 *
 * Every field is read from the Employee table at request time — the form is a
 * projection of live data, never a client-supplied copy.
 */
export interface EmployeeSnapshot {
  id: string;
  employeeNumber: string;
  firstname: string;
  lastname: string;
  /** Full display name, pre-joined server-side. */
  fullName: string;
  jobGrade: number | null;
  jobTitle: string | null;
  departmentId: string | null;
  departmentName: string | null;
  gender: string | null;
  /** Derived from `hireDate` by the MCDA helper — never stored, never trusted from the client. */
  serviceYears: number;
  hireDate: string | null;
  maritalStatus: string | null;
  familySize: number | null;
  disabilityStatus: boolean;
  employmentType: string;
  employmentStatus: string;
  phone: string | null;
  /** National ID is masked unless the caller holds `employee:sensitive_view`. */
  nationalIdMasked: string | null;
  /** Eligibility tier from the central grade→category rule. */
  houseCategory: HouseCategory | null;
}

/** The employee's existing request, when lookup is blocked because of one. */
export interface ExistingRequestSummary {
  id: string;
  status: HouseRequestStatus;
  remarks: string;
  submittedAt: string;
}

/**
 * The house this employee currently occupies, when they hold one.
 *
 * Carried in full rather than as a boolean alone because the page's job on an
 * already-allocated employee is to show WHICH house they hold: a refusal that
 * says only "already allocated" sends the user hunting for a house they already
 * know, and the actions that follow live on that allocation.
 *
 * `allocationId` is the handle the release and transfer workflows are driven
 * from, so the page can hand the user straight to them.
 */
export interface LiveAllocationSummary {
  allocationId: string;
  householdId: string | null;
  hid: string | null;
  houseNumber: string | null;
  houseType: string | null;
  locationName: string | null;
  houseStatus: string | null;
  occupancyStatus: string | null;
  /** When the allocation was decided, or null if it was never decided. */
  allocatedAt: string | null;
  /** How many times this employee has changed house on this allocation. */
  moveCount: number;
}

/** Successful lookup payload — everything the form needs, nothing more. */
export interface HouseRequestLookupResult {
  employee: EmployeeSnapshot;
  /** Present only when the employee already holds an active request. */
  existingRequest: ExistingRequestSummary | null;
  /** True when the employee already holds an allocated house. */
  hasAllocatedHouse: boolean;
  /**
   * The live allocation behind `hasAllocatedHouse`, with the house itself.
   * Null exactly when `hasAllocatedHouse` is false — the boolean stays because it
   * is the policy answer, this is the evidence for it.
   */
  allocation: LiveAllocationSummary | null;
  /** Human-readable band list, e.g. "> 17 → Staff · 15 – 17 → A · …". */
  eligibilityLegend: string;
}

// ---------------------------------------------------------------------------
// Verification (GET /api/house-requests/verify?empId=)
// ---------------------------------------------------------------------------

/**
 * The Employee-ID verification response.
 *
 * A SUPERSET of {@link HouseRequestLookupResult}, not a second shape. The
 * duplicate fields are deliberate and are the contract the House Request page
 * is written against:
 *
 *  - `empId`, `department`, `gender`, `hireDate`, `maritalStatus` and
 *    `disabilityStatus` are spelled flat because the info card reads them one by
 *    one, and a consumer integrating against the documented route should not
 *    have to walk `employee.*` to fill a label.
 *  - `alreadyHasActiveAllocation` and `hasOpenRequest` name the two blocking
 *    conditions in the page's own vocabulary. They are aliases of
 *    `hasAllocatedHouse` and `existingRequest != null`, kept so the boolean a
 *    form reads to disable its submit button is stated positively rather than
 *    inferred from the absence of something.
 *  - `isEligible` / `eligibleHouseType` / `eligibilityReason` state the policy
 *    answer directly instead of making the reader re-derive it from a nullable
 *    category.
 *
 * Every one of them is derived from the same live employee row by the same
 * service call, so the two views can never disagree.
 */
export interface HouseRequestVerifyResult extends HouseRequestLookupResult {
  /** As issued by HR. Identical to `employee.employeeNumber`. */
  empId: string;
  fullName: string;
  /** Department name, or null when the record carries none. */
  department: string | null;
  gender: string | null;
  hireDate: string | null;
  serviceYears: number;
  maritalStatus: string | null;
  disabilityStatus: boolean;
  /**
   * Employee photograph, when the deployment stores one.
   *
   * `Employee` carries no image column in this schema, so this is always null
   * today. It is part of the response contract so a deployment that adds a
   * portrait can fill it without breaking the page.
   */
  photoUrl: string | null;

  /** False when the job grade maps to no published band. */
  isEligible: boolean;
  /** The band this employee qualifies for, or null when not eligible. */
  eligibleHouseType: HouseCategory | null;
  /** Plain-language reason, shown beside the badge. Never empty. */
  eligibilityReason: string;

  /** The employee already occupies an allocated house. */
  alreadyHasActiveAllocation: boolean;
  /** The employee already holds a request that is still open. */
  hasOpenRequest: boolean;
}

// ---------------------------------------------------------------------------
// People search (the one field on the page)
// ---------------------------------------------------------------------------

/**
 * One suggestion from the people search that backs the Employee ID field.
 *
 * WHY THIS EXISTS AT ALL
 * The page's only input was an exact Employee ID, which quietly assumes the
 * person at the counter was handed a code. In practice they usually know a
 * NAME. So the field accepts a fragment and this is what comes back.
 *
 * WHY IT IS SO NARROW
 * Every field here is either an identity the user already typed part of, or a
 * fact the lookup endpoint already returns in full to the same permission.
 * Nothing new is exposed: `GET /api/house-requests/verify` hands the caller the
 * whole `EmployeeSnapshot` — names, title, department, grade, status — for any
 * Employee ID they can guess. A search that only arranges those same fields
 * differently adds reach, not disclosure.
 *
 * WHY IT CARRIES NO VERDICT
 * `houseCategory` is present because the band is how a person is recognised at
 * a counter, and `blocked` is present because telling somebody an applicant is
 * already in the queue saves a wasted lookup. But `blocked` is a HINT for the
 * list row. The authoritative answer is always the verification that follows,
 * and the submit path re-checks everything inside its own transaction regardless.
 */
export interface HouseRequestCandidate {
  employeeNumber: string;
  fullName: string;
  jobTitle: string | null;
  departmentName: string | null;
  jobGrade: number | null;
  /** The band this grade maps to, or null when the grade is outside the policy. */
  houseCategory: HouseCategory | null;
  employmentStatus: string;
  /** A live allocation or an active request — both of which block a new one. */
  blocked: boolean;
  /** Which of the two blocked it, so the list row can say so in words. */
  blockedBy: "allocation" | "request" | null;
}

/** Response body for the people search. */
export interface HouseRequestCandidatesResult {
  /** The fragment that produced these results, echoed for cache validation. */
  query: string;
  candidates: HouseRequestCandidate[];
  /**
   * False when the term matched nothing. Distinct from an empty list caused by a
   * failure, so the field can say "no match" rather than "cannot search".
   */
  truncated: boolean;
}

// ---------------------------------------------------------------------------
// Submission result
// ---------------------------------------------------------------------------

/** Confirmation payload returned by a successful submission. */
export interface HouseRequestSubmissionResult {
  requestId: string;
  employeeId: string;
  employeeNumber: string;
  fullName: string;
  remarks: string;
  status: HouseRequestStatus;
  submittedAt: string;
  /** Band the request lands in, so the UI can name the table up front. */
  houseCategory: HouseCategory | null;
}

// ---------------------------------------------------------------------------
// Listing (House Queue integration)
// ---------------------------------------------------------------------------

/** A live request joined to its employee, as shown on the request worklist. */
export interface HouseRequestListItem {
  id: string;
  employeeId: string;
  employeeNumber: string;
  fullName: string;
  jobGrade: number | null;
  houseCategory: HouseCategory | null;
  status: HouseRequestStatus;
  remarks: string;
  submittedAt: string;
  submittedByName: string | null;
  decidedAt: string | null;
}
