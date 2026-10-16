/**
 * House Request service — the authoritative write path for house applications.
 *
 * Design rules this module enforces (and the tests pin):
 *
 *  1. THE EMPLOYEE TABLE IS THE SINGLE SOURCE OF TRUTH. Callers pass an
 *     `employeeNumber`, never an id, never a name. Every employee field shown
 *     in the form and every field written to the audit log is re-read here.
 *  2. NEVER TRUST THE CLIENT. There is no path in which a name, job grade,
 *     department or service-years value supplied by a browser reaches the
 *     database.
 *  3. ELIGIBILITY IS THE CENTRAL RULE. `houseCategoryForJobGrade()` from
 *     `src/lib/house-queue/eligibility.ts` is the only thing consulted, and it
 *     is consulted against the ACTIVE engine-config bands so a re-banded policy
 *     takes effect immediately.
 *  4. ONE ACTIVE REQUEST PER EMPLOYEE. Enforced three ways, deliberately:
 *       a. the partial unique index `house_requests_active_employee_key`
 *          (database guarantee — the real one),
 *       b. a `pg_advisory_xact_lock` so the check-then-insert is atomic
 *          (turns a race into a clean 409 rather than a 500), and
 *       c. a plain in-transaction re-check (fast path, gives the good message).
 *  5. AN EMPLOYEE WITH A LIVE ALLOCATION CANNOT REQUEST. Checked at lookup and
 *     again inside the submit transaction.
 */

import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { BadRequestError, ConflictError, NotFoundError } from "@/lib/api-route";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, createAuditLog } from "@/lib/audit-log";
import {
  eligibilityBandsToJobGradeRules,
  houseCategoryForJobGrade,
  houseCategoryLegend,
  type JobGradeRule,
} from "@/lib/house-queue/eligibility";
import { calculateServiceYears } from "@/lib/house-queue/mcda";
import { activeEligibilityBands } from "@/lib/house-queue/service";
import { maskNationalId } from "@/lib/employees/constants";
import {
  ACTIVE_HOUSE_REQUEST_STATUS,
  HOUSE_REQUEST_ADVISORY_LOCK_NAMESPACE,
  houseRequestLockKey,
  type HouseRequestStatus,
} from "./constants";
import { createHouseRequestSchema } from "./schemas";
import type {
  ExistingRequestSummary,
  HouseRequestCandidatesResult,
  HouseRequestLookupResult,
  HouseRequestSubmissionResult,
  HouseRequestVerifyResult,
  LiveAllocationSummary,
} from "./types";

/**
 * Employee projection shared by lookup and submit.
 *
 * Deliberately narrow: exactly the fields the read-only form displays plus the
 * policy inputs. No password-adjacent or unrelated columns are dragged in.
 */
const EMPLOYEE_SELECT = {
  id: true,
  employeeNumber: true,
  firstname: true,
  lastname: true,
  jobGrade: true,
  jobTitle: true,
  departmentId: true,
  department: { select: { name: true } },
  gender: true,
  hireDate: true,
  maritalStatus: true,
  familySize: true,
  disabilityStatus: true,
  employmentType: true,
  employmentStatus: true,
  phone: true,
  nationalId: true,
  deletedAt: true,
} as const;

type EmployeeRow = {
  id: string;
  employeeNumber: string;
  firstname: string;
  lastname: string;
  jobGrade: number | null;
  jobTitle: string | null;
  departmentId: string | null;
  department: { name: string } | null;
  gender: string | null;
  hireDate: Date | null;
  maritalStatus: string | null;
  familySize: number | null;
  disabilityStatus: boolean;
  employmentType: string;
  employmentStatus: string;
  phone: string | null;
  nationalId: string | null;
  deletedAt: Date | null;
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * A policy-level rejection with a stable machine code.
 *
 * Distinct from `BadRequestError` because the client branches on `code` to
 * decide whether to show an inline error or to keep the form visible (e.g. a
 * duplicate must NOT wipe the remarks the user already typed).
 */
export class HouseRequestRejectedError extends BadRequestError {
  constructor(
    public readonly code:
      | "EMPLOYEE_NOT_FOUND"
      | "EMPLOYEE_ARCHIVED"
      | "EMPLOYEE_INACTIVE"
      | "NOT_ELIGIBLE"
      | "REQUEST_ALREADY_EXISTS"
      | "ALREADY_ALLOCATED",
    message: string,
  ) {
    super(message);
    this.name = "HouseRequestRejectedError";
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** Resolve the eligibility bands from the ACTIVE engine config for this org. */
async function activeBands(organizationId: string): Promise<JobGradeRule[]> {
  return activeEligibilityBands(organizationId);
}

/**
 * Find the employee by Employee ID, scoped to the organization.
 *
 * Two-step by design: a soft-deleted or inactive row must produce a SPECIFIC
 * message ("archived" vs "not active"), which a single `where` clause cannot
 * express. Case-sensitive match first, then a case-insensitive fallback so a
 * mistyped case resolves instead of silently reporting "not found".
 */
async function findEmployeeByNumber(
  organizationId: string,
  employeeNumber: string,
): Promise<EmployeeRow | null> {
  const exact = await prisma.employee.findFirst({
    where: { organizationId, employeeNumber },
    select: EMPLOYEE_SELECT,
  });
  if (exact) return exact;

  return prisma.employee.findFirst({
    where: {
      organizationId,
      employeeNumber: { equals: employeeNumber, mode: "insensitive" },
    },
    select: EMPLOYEE_SELECT,
  });
}

/**
 * The employee's live allocation, with the house, if any.
 *
 * `house_allocations` holds at most one `allocated` row per employee (partial
 * unique index), so `findFirst` on that status is unambiguous.
 *
 * The house is joined rather than left behind: the page has to be able to answer
 * "which house do they hold?" without a second round trip, and a stale answer
 * from a second call would be worse than no answer.
 */
async function findLiveAllocation(
  organizationId: string,
  employeeId: string,
): Promise<LiveAllocationSummary | null> {
  const row = await prisma.houseAllocation.findFirst({
    where: { organizationId, employeeId, status: "allocated" },
    select: {
      id: true,
      householdId: true,
      decidedAt: true,
      moveCount: true,
      household: {
        select: {
          hid: true,
          houseNumber: true,
          houseType: true,
          locationName: true,
          status: true,
          occupancyStatus: true,
        },
      },
    },
  });
  if (!row) return null;
  return {
    allocationId: row.id,
    householdId: row.householdId,
    hid: row.household?.hid ?? null,
    houseNumber: row.household?.houseNumber ?? null,
    houseType: row.household?.houseType ?? null,
    locationName: row.household?.locationName ?? null,
    houseStatus: row.household?.status ?? null,
    occupancyStatus: row.household?.occupancyStatus ?? null,
    allocatedAt: row.decidedAt?.toISOString() ?? null,
    moveCount: row.moveCount,
  };
}

/** The employee's active request, if any. */
async function findActiveRequest(
  organizationId: string,
  employeeId: string,
): Promise<ExistingRequestSummary | null> {
  const row = await prisma.houseRequest.findFirst({
    where: { organizationId, employeeId, status: ACTIVE_HOUSE_REQUEST_STATUS },
    select: { id: true, status: true, remarks: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  if (!row) return null;
  return {
    id: row.id,
    status: row.status as ExistingRequestSummary["status"],
    remarks: row.remarks,
    submittedAt: row.createdAt.toISOString(),
  };
}

/**
 * Liveness gate, shared by lookup and submit.
 *
 * Order matters: archived beats inactive beats not-eligible, so the message the
 * user sees names the most fundamental problem rather than a downstream symptom.
 */
function assertEmployeeUsable(employee: EmployeeRow): void {
  if (employee.deletedAt !== null) {
    throw new HouseRequestRejectedError(
      "EMPLOYEE_ARCHIVED",
      "This employee record has been archived. Restore the record before filing a house request.",
    );
  }
  if (employee.employmentStatus !== "active") {
    throw new HouseRequestRejectedError(
      "EMPLOYEE_INACTIVE",
      `This employee is "${employee.employmentStatus}", not active. House requests are only accepted for active employees.`,
    );
  }
}

/** Eligibility gate using the ACTIVE engine-config bands. */
function assertEligible(
  employee: EmployeeRow,
  bands: readonly JobGradeRule[],
): NonNullable<ReturnType<typeof houseCategoryForJobGrade>> {
  const category = houseCategoryForJobGrade(employee.jobGrade, bands);
  if (!category) {
    throw new HouseRequestRejectedError(
      "NOT_ELIGIBLE",
      `Job grade ${employee.jobGrade ?? "unset"} does not qualify for a house under the current allocation policy.`,
    );
  }
  return category;
}

/** Project an employee row into the read-only form DTO. */
function toSnapshot(
  employee: EmployeeRow,
  bands: readonly JobGradeRule[],
  canViewSensitive: boolean,
) {
  return {
    id: employee.id,
    employeeNumber: employee.employeeNumber,
    firstname: employee.firstname,
    lastname: employee.lastname,
    fullName: `${employee.firstname} ${employee.lastname}`.trim(),
    jobGrade: employee.jobGrade,
    jobTitle: employee.jobTitle,
    departmentId: employee.departmentId,
    departmentName: employee.department?.name ?? null,
    gender: employee.gender,
    serviceYears: calculateServiceYears(employee.hireDate),
    hireDate: employee.hireDate ? employee.hireDate.toISOString() : null,
    maritalStatus: employee.maritalStatus,
    familySize: employee.familySize,
    disabilityStatus: employee.disabilityStatus,
    employmentType: employee.employmentType,
    employmentStatus: employee.employmentStatus,
    phone: employee.phone,
    nationalIdMasked: canViewSensitive
      ? employee.nationalId
      : employee.nationalId
        ? maskNationalId(employee.nationalId)
        : null,
    houseCategory: houseCategoryForJobGrade(employee.jobGrade, bands),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface VerifyParams {
  organizationId: string;
  /** The Employee ID exactly as typed. Trimmed by the schema before it arrives. */
  empId: string;
  /** Whether the caller may see an unmasked National ID. */
  canViewSensitive: boolean;
}

/**
 * Verify an Employee ID and return everything the House Request page shows.
 *
 * WHY THIS IS NOT `lookupEmployeeForHouseRequest`
 * Lookup is a policy gate: it raises on not-eligible and on any blocked state,
 * because a form that has just refused has nothing left to render. Verification
 * is the opposite — it must SUCCEED for a blocked employee and hand back their
 * details alongside the reason, because the page's job then becomes "say what is
 * blocking this and what would clear it".
 *
 * So the two differ in exactly one dimension, and they share every input:
 *
 *   lookup   — throws NOT_ELIGIBLE / REQUEST_ALREADY_EXISTS / ALREADY_ALLOCATED
 *   verify   — returns the same facts, with `isEligible: false` or the blocking
 *              flags set, and never throws for either
 *
 * Both still raise for the two conditions that leave nothing to display at all:
 * an unknown Employee ID and an archived record. Inactive is deliberately NOT
 * raised here — an employee on leave is a real person with a real record, and
 * the honest answer is "here is their file, they are on leave", not a 404 that
 * reads as "this ID does not exist".
 *
 * WHY ELIGIBILITY IS NEVER RE-DERIVED HERE
 * The band comes from `houseCategoryForJobGrade(employee.jobGrade, bands)` —
 * the same call, against the same ACTIVE engine-config bands, that
 * `submitHouseRequest` uses inside its transaction. The `eligibilityReason` is
 * written from the returned category rather than from a second grade mapping, so
 * the badge on the page and the band the request is filed into cannot disagree.
 */
export async function verifyEmployeeForHouseRequest({
  organizationId,
  empId,
  canViewSensitive,
}: VerifyParams): Promise<HouseRequestVerifyResult> {
  const [employee, bands] = await Promise.all([
    findEmployeeByNumber(organizationId, empId),
    activeBands(organizationId),
  ]);

  if (!employee) {
    throw new HouseRequestRejectedError(
      "EMPLOYEE_NOT_FOUND",
      "Employee ID not found",
    );
  }

  // An archived record has been deliberately withdrawn from the register, so
  // unlike an inactive one it must not be displayed as if it were live.
  if (employee.deletedAt !== null) {
    throw new HouseRequestRejectedError(
      "EMPLOYEE_ARCHIVED",
      "Employee ID not found",
    );
  }

  const [existingRequest, allocation] = await Promise.all([
    findActiveRequest(organizationId, employee.id),
    findLiveAllocation(organizationId, employee.id),
  ]);

  const snapshot = toSnapshot(employee, bands, canViewSensitive);
  const category = snapshot.houseCategory;
  const active = isActiveEmployment(employee.employmentStatus);
  const alreadyHasActiveAllocation = allocation !== null;
  const hasOpenRequest = existingRequest !== null;

  return {
    employee: snapshot,
    existingRequest,
    hasAllocatedHouse: alreadyHasActiveAllocation,
    allocation,
    eligibilityLegend: houseCategoryLegend(),

    empId: snapshot.employeeNumber,
    fullName: snapshot.fullName,
    department: snapshot.departmentName,
    gender: snapshot.gender,
    hireDate: snapshot.hireDate,
    serviceYears: snapshot.serviceYears,
    maritalStatus: snapshot.maritalStatus,
    disabilityStatus: snapshot.disabilityStatus,
    // `Employee` carries no portrait column; the field exists so a deployment
    // that adds one can populate it without changing this contract.
    photoUrl: null,

    isEligible: category !== null,
    eligibleHouseType: category,
    eligibilityReason: describeEligibility({
      category,
      jobGrade: employee.jobGrade,
      active,
      alreadyHasActiveAllocation,
      hasOpenRequest,
    }),

    alreadyHasActiveAllocation,
    hasOpenRequest,
  };
}

/**
 * The sentence that sits beside the eligibility badge.
 *
 * Ordered by what the reader has to do next rather than by gate order: a person
 * who is on leave AND already allocated only needs to hear about being on leave,
 * because fixing that is what releases everything behind it. Every branch states
 * a fact the page can act on; none of them is a bare "not eligible".
 */
function describeEligibility(input: {
  category: ReturnType<typeof houseCategoryForJobGrade>;
  jobGrade: number | null;
  active: boolean;
  alreadyHasActiveAllocation: boolean;
  hasOpenRequest: boolean;
}): string {
  if (!input.active) {
    return "This employee is not currently active. Only an active employee may file a house request.";
  }
  if (!input.category) {
    return `Job grade ${
      input.jobGrade ?? "is not set"
    } does not fall inside any published house band, so no house category is available.`;
  }
  if (input.alreadyHasActiveAllocation) {
    return "This employee already holds an allocated house, so no second request can be filed.";
  }
  if (input.hasOpenRequest) {
    return "A request for this employee is already open in the House Queue. Withdraw it first.";
  }
  return `Eligible for a Type ${input.category} house under the published job grade rule.`;
}

/** Whether an employment status counts as live for the request gate. */
function isActiveEmployment(status: string): boolean {
  return status.toLowerCase() === "active";
}

export interface LookupParams {
  organizationId: string;
  /** As typed by the user. Trimmed by the schema before it reaches here. */
  employeeNumber: string;
  /** Whether the caller may see an unmasked National ID. */
  canViewSensitive: boolean;
  /**
   * When false, an existing request / live allocation is reported through
   * `existingRequest` / `hasAllocatedHouse` instead of raising. The form uses
   * `true` (so it can render "already requested") and submit uses `false`.
   */
  throwOnBlocked?: boolean;
}

/**
 * Verify an Employee ID against the Employee table and return the read-only
 * form payload.
 *
 * Throws `HouseRequestRejectedError` (HTTP 400 + stable `code`) when the
 * employee cannot request a house. When `throwOnBlocked` is false the
 * duplicate/allocated conditions are reported in the result instead, because
 * the page still needs to render the employee's details alongside the notice.
 */
export async function lookupEmployeeForHouseRequest(
  params: LookupParams,
): Promise<HouseRequestLookupResult> {
  const { organizationId, employeeNumber, canViewSensitive } = params;
  const throwOnBlocked = params.throwOnBlocked ?? false;

  const [employee, bands] = await Promise.all([
    findEmployeeByNumber(organizationId, employeeNumber),
    activeBands(organizationId),
  ]);

  if (!employee) {
    throw new HouseRequestRejectedError(
      "EMPLOYEE_NOT_FOUND",
      "No employee with this Employee ID was found in your organization.",
    );
  }

  assertEmployeeUsable(employee);
  assertEligible(employee, bands);

  const [existingRequest, allocation] = await Promise.all([
    findActiveRequest(organizationId, employee.id),
    findLiveAllocation(organizationId, employee.id),
  ]);
  const hasAllocatedHouse = allocation !== null;

  if (throwOnBlocked) {
    if (existingRequest) {
      throw new HouseRequestRejectedError(
        "REQUEST_ALREADY_EXISTS",
        "This employee already has an active house request in the queue.",
      );
    }
    if (hasAllocatedHouse) {
      throw new HouseRequestRejectedError(
        "ALREADY_ALLOCATED",
        "This employee already holds an allocated house and cannot request another.",
      );
    }
  }

  return {
    employee: toSnapshot(employee, bands, canViewSensitive),
    existingRequest,
    hasAllocatedHouse,
    allocation,
    eligibilityLegend: houseCategoryLegend(),
  };
}

// ---------------------------------------------------------------------------
// People search
// ---------------------------------------------------------------------------

export interface CandidatesParams {
  organizationId: string;
  /** Free-text fragment: a name, a job title, or part of an Employee ID. */
  query: string;
  limit: number;
}

/**
 * Find the people a counter officer might be filing for.
 *
 * WHY A SEARCH EXISTS HERE
 * The page had exactly one input and it accepted only an exact Employee ID,
 * which quietly assumed the officer had been handed a code. They usually know a
 * name. The alternative — sending the user to the Employee register to look up
 * a number, then back here to type it — is two page loads and a context switch
 * for what is one decision.
 *
 * WHY IT CANNOT BE USED AS AN IDENTITY
 * This function returns SUGGESTIONS. Each one is a row from the same
 * `Employee` table the authoritative lookup reads, scoped to the caller's
 * organization, and choosing one merely pre-fills the field. The lookup still
 * runs, still throws its own `HouseRequestRejectedError` for archived, inactive
 * and ineligible records, and the submit path re-checks every gate inside its
 * transaction. Nothing a browser asserts from this list reaches the database.
 *
 * WHY BLOCKED EMPLOYEES ARE STILL RETURNED
 * A search that hid people who cannot file would be answering a question the
 * user did not ask — "can I file for Aster?" — when they asked "where is Aster?".
 * Returning them with an honest reason turns a dead end into a hand-off.
 *
 * WHY ARCHIVED ROWS ARE EXCLUDED
 * An archived record is not a person at this counter; restoring one is an HR
 * task, not a housing one. Non-active employees ARE returned, because "they are
 * not active" is an answer the officer needs, not a reason to hide the row.
 */
export async function searchHouseRequestCandidates({
  organizationId,
  query,
  limit,
}: CandidatesParams): Promise<HouseRequestCandidatesResult> {
  const term = query.trim();
  const [employees, bands] = await Promise.all([
    prisma.employee.findMany({
      where: {
        organizationId,
        deletedAt: null,
        OR: [
          { firstname: { contains: term, mode: "insensitive" } },
          { lastname: { contains: term, mode: "insensitive" } },
          { employeeNumber: { contains: term, mode: "insensitive" } },
          { jobTitle: { contains: term, mode: "insensitive" } },
        ],
      },
      select: {
        employeeNumber: true,
        firstname: true,
        lastname: true,
        jobTitle: true,
        jobGrade: true,
        employmentStatus: true,
        department: { select: { name: true } },
      },
      // An exact ID outranks a name that merely contains it, because somebody
      // typing "EMP-0042" means THAT employee and not the four other people
      // whose job title happens to contain the same digits.
      orderBy: [
        { employeeNumber: "asc" },
        { lastname: "asc" },
        { firstname: "asc" },
      ],
      // One extra row, so `truncated` can be answered honestly rather than
      // guessed from a `take` that happened to come back full.
      take: limit + 1,
    }),
    activeBands(organizationId),
  ]);

  const truncated = employees.length > limit;
  const page = truncated ? employees.slice(0, limit) : employees;
  const numbers = page.map((e) => e.employeeNumber);

  // The two blocking conditions, resolved in one pass over the identifiers we
  // already have. `house_allocations` and `house_requests` are both indexed on
  // (organizationId, employeeId/status), and the page is at most twenty rows,
  // so a pair of `in` queries is cheaper than teaching Prisma the joins.
  const [allocations, requests] = numbers.length
    ? await Promise.all([
        prisma.houseAllocation.findMany({
          where: {
            organizationId,
            status: "allocated",
            employee: { employeeNumber: { in: numbers } },
          },
          select: { employee: { select: { employeeNumber: true } } },
          distinct: ["employeeId"],
        }),
        prisma.houseRequest.findMany({
          where: {
            organizationId,
            status: ACTIVE_HOUSE_REQUEST_STATUS,
            employee: { employeeNumber: { in: numbers } },
          },
          select: { employee: { select: { employeeNumber: true } } },
          distinct: ["employeeId"],
        }),
      ])
    : [[], []];

  const allocated = new Set(
    allocations.map((a) => a.employee.employeeNumber.toLowerCase()),
  );
  const requested = new Set(
    requests.map((r) => r.employee.employeeNumber.toLowerCase()),
  );

  return {
    query: term,
    truncated,
    candidates: page.map((employee) => {
      const key = employee.employeeNumber.toLowerCase();
      // An allocation is the more fundamental block and is reported in
      // preference to a request, matching the order the lookup throws them.
      const blockedBy = allocated.has(key)
        ? ("allocation" as const)
        : requested.has(key)
          ? ("request" as const)
          : null;
      return {
        employeeNumber: employee.employeeNumber,
        fullName: `${employee.firstname} ${employee.lastname}`.trim(),
        jobTitle: employee.jobTitle,
        departmentName: employee.department?.name ?? null,
        jobGrade: employee.jobGrade,
        houseCategory: houseCategoryForJobGrade(employee.jobGrade, bands),
        employmentStatus: employee.employmentStatus,
        blocked: blockedBy !== null,
        blockedBy,
      };
    }),
  };
}

export interface SubmitParams {
  organizationId: string;
  employeeNumber: string;
  remarks: string;
  /** Portal user filing the request (recorded as `submittedBy`). */
  submittedBy: string;
  canViewSensitive?: boolean;
}

/**
 * Create a house request.
 *
 * The whole thing is one transaction:
 *   advisory lock (employee) → re-read employee → re-check liveness, eligibility,
 *   duplicate and live allocation → INSERT → audit row.
 *
 * The employee is read INSIDE the transaction on purpose: between the client's
 * form render and this write, HR may have changed the grade or terminated the
 * employee. A request must never be created from a stale snapshot.
 */
export async function submitHouseRequest(
  params: SubmitParams,
): Promise<HouseRequestSubmissionResult> {
  const { organizationId, submittedBy } = params;

  // Defence in depth: this is the single authoritative write path, so it
  // re-validates its own input instead of trusting that every caller ran the
  // Zod schema. A future script or route that calls the service directly still
  // cannot write a 5 000-character remark.
  const parsed = validateSubmissionInput(params);
  const employeeNumber = parsed.employeeNumber;
  const remarks = parsed.remarks;

  // Bands come from the active engine config; read once outside the transaction
  // so the lock is held for the minimum time possible.
  const bands = await activeBands(organizationId);

  let created: {
    id: string;
    employeeId: string;
    remarks: string;
    status: string;
    createdAt: Date;
    employee: { employeeNumber: string; firstname: string; lastname: string };
  } | null = null;

  try {
    created = await prisma.$transaction(async (tx) => {
      // Resolve the employee FIRST (we need its uuid for the lock key). This is
      // still inside the transaction so the row read is transactionally
      // consistent with the INSERT that follows.
      const employee = await resolveEmployeeForUpdate(tx, {
        organizationId,
        employeeNumber,
        bands,
      });

      // Serialize concurrent submits for this employee. Two requests that both
      // pass the duplicate probe would otherwise both INSERT; the partial unique
      // index would reject the loser with a raw P2002, which reads as a 500.
      await tx.$executeRawUnsafe(
        "SELECT pg_advisory_xact_lock($1, $2)",
        HOUSE_REQUEST_ADVISORY_LOCK_NAMESPACE,
        houseRequestLockKey(employee.id),
      );

      // Re-check every gate now that we hold the lock.
      await assertNoLiveAllocation(tx, organizationId, employee.id);
      await assertNoActiveRequest(tx, organizationId, employee.id);

      const request = await tx.houseRequest.create({
        data: {
          organizationId,
          employeeId: employee.id,
          remarks,
          status: ACTIVE_HOUSE_REQUEST_STATUS,
          submittedBy,
        },
        select: {
          id: true,
          employeeId: true,
          remarks: true,
          status: true,
          createdAt: true,
          employee: {
            select: {
              employeeNumber: true,
              firstname: true,
              lastname: true,
            },
          },
        },
      });

      await createAuditLog({
        userId: submittedBy,
        action: AUDIT_ACTIONS.REQUEST,
        entity: AUDIT_ENTITIES.HOUSE_REQUEST,
        entityId: request.id,
        details: {
          employeeId: employee.id,
          employeeNumber: employee.employeeNumber,
          employeeName: `${employee.firstname} ${employee.lastname}`.trim(),
          jobGrade: employee.jobGrade,
          houseCategory: houseCategoryForJobGrade(employee.jobGrade, bands),
          remarks,
        },
        tx,
      });

      return request;
    });
  } catch (error) {
    throw translateSubmitError(error);
  }

  if (!created) {
    // Defensive: the transaction callback always returns or throws.
    throw new ConflictError("The house request could not be created.");
  }

  return {
    requestId: created.id,
    employeeId: created.employeeId,
    employeeNumber: created.employee.employeeNumber,
    fullName:
      `${created.employee.firstname} ${created.employee.lastname}`.trim(),
    remarks: created.remarks,
    status: ACTIVE_HOUSE_REQUEST_STATUS,
    submittedAt: created.createdAt.toISOString(),
    houseCategory: houseCategoryForJobGrade(
      await resolveJobGrade(organizationId, created.employeeId),
      bands,
    ),
  };
}

// ---------------------------------------------------------------------------
// Transaction helpers
// ---------------------------------------------------------------------------

/**
 * Validate the submission input against the shared schemas.
 *
 * The route already runs `createHouseRequestSchema`, so this is normally a cheap
 * pass-through — but the service is reachable from tests, scripts and any future
 * route, and an unvalidated 5 000-character remark would surface as a raw
 * database constraint error (HTTP 500) instead of a field-level 400.
 */
function validateSubmissionInput(params: SubmitParams): {
  employeeNumber: string;
  remarks: string;
} {
  const result = createHouseRequestSchema.safeParse({
    employeeNumber: params.employeeNumber,
    remarks: params.remarks,
  });
  if (result.success) return result.data;

  const message = result.error.issues.map((issue) => issue.message).join(" ");
  throw new BadRequestError(message);
}

/** Minimal transaction surface the submit path needs. */
type Tx = Prisma.TransactionClient;

/**
 * Look up, validate and lock the employee row for submission.
 *
 * Split out so the identical rules run for both the pre-transaction fast path
 * and the authoritative in-transaction read.
 */
async function resolveEmployeeForUpdate(
  tx: Tx,
  args: {
    organizationId: string;
    employeeNumber: string;
    bands: JobGradeRule[];
  },
): Promise<EmployeeRow> {
  const { organizationId, employeeNumber, bands } = args;

  const exact = await tx.employee.findFirst({
    where: { organizationId, employeeNumber },
    select: EMPLOYEE_SELECT,
  });
  const employee =
    exact ??
    (await tx.employee.findFirst({
      where: {
        organizationId,
        employeeNumber: { equals: employeeNumber, mode: "insensitive" },
      },
      select: EMPLOYEE_SELECT,
    }));

  if (!employee) {
    throw new HouseRequestRejectedError(
      "EMPLOYEE_NOT_FOUND",
      "No employee with this Employee ID was found in your organization.",
    );
  }

  assertEmployeeUsable(employee);
  assertEligible(employee, bands);
  return employee;
}

async function assertNoLiveAllocation(
  tx: Tx,
  organizationId: string,
  employeeId: string,
): Promise<void> {
  const allocation = await tx.houseAllocation.findFirst({
    where: { organizationId, employeeId, status: "allocated" },
    select: { id: true },
  });
  if (allocation) {
    throw new HouseRequestRejectedError(
      "ALREADY_ALLOCATED",
      "This employee already holds an allocated house and cannot request another.",
    );
  }
}

async function assertNoActiveRequest(
  tx: Tx,
  organizationId: string,
  employeeId: string,
): Promise<void> {
  const existing = await tx.houseRequest.findFirst({
    where: { organizationId, employeeId, status: ACTIVE_HOUSE_REQUEST_STATUS },
    select: { id: true },
  });
  if (existing) {
    throw new HouseRequestRejectedError(
      "REQUEST_ALREADY_EXISTS",
      "This employee already has an active house request in the queue.",
    );
  }
}

/** Re-read the grade used for the confirmation band (never a client value). */
async function resolveJobGrade(
  organizationId: string,
  employeeId: string,
): Promise<number | null> {
  const row = await prisma.employee.findFirst({
    where: { id: employeeId, organizationId, deletedAt: null },
    select: { jobGrade: true },
  });
  return row?.jobGrade ?? null;
}

/**
 * Turn a raw driver error into a typed API error.
 *
 * The important case is P2002 on `house_requests_active_employee_key`: the
 * partial unique index fired, which means a concurrent submit won the race.
 * That is a duplicate, not a server fault, so it must surface as 409.
 */
function translateSubmitError(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      const target = JSON.stringify(error.meta?.target ?? "");
      if (target.includes("house_requests") || target.includes("employeeId")) {
        return new ConflictError(
          "This employee already has an active house request in the queue.",
        );
      }
    }
    if (error.code === "P2025") {
      return new NotFoundError("Employee not found in this organization.");
    }
    // A failed CHECK constraint means the remarks bound was violated by a
    // writer that skipped the schema (import, script, direct SQL).
    if (error.code === "P2010" || error.code === "P2004") {
      return new BadRequestError(
        "The request remarks did not satisfy the storage constraints.",
      );
    }
  }
  return error;
}

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

export interface CancelParams {
  organizationId: string;
  requestId: string;
  decidedBy: string;
  /** Optional justification recorded in the audit trail. */
  reason?: string | null;
}

/**
 * Close a live request without an allocation.
 *
 * This is the ONLY transition out of `submitted`, and it is what makes the
 * one-active-request rule fair: a mistaken or duplicate application must not
 * lock an employee out of the queue forever.
 *
 * Refused while the employee holds a live allocation — cancelling the ticket for
 * somebody who already has a house would remove them from the queue that is
 * supposed to be showing that allocation.
 */
export async function cancelHouseRequest(params: CancelParams): Promise<{
  requestId: string;
  employeeId: string;
  status: HouseRequestStatus;
}> {
  const { organizationId, requestId, decidedBy, reason } = params;

  const cancelled = await prisma.$transaction(async (tx) => {
    const request = await tx.houseRequest.findFirst({
      where: { id: requestId, organizationId },
      select: { id: true, employeeId: true, status: true, remarks: true },
    });
    if (!request) {
      throw new NotFoundError("House request not found in this organization.");
    }
    if (request.status !== ACTIVE_HOUSE_REQUEST_STATUS) {
      throw new ConflictError(
        `This request is already ${request.status} and cannot be cancelled.`,
      );
    }

    await assertNoLiveAllocation(tx, organizationId, request.employeeId);

    const updated = await tx.houseRequest.update({
      where: { id: request.id },
      data: {
        status: "cancelled",
        decidedAt: new Date(),
        decidedBy,
      },
      select: { id: true, employeeId: true, status: true },
    });

    await createAuditLog({
      userId: decidedBy,
      action: AUDIT_ACTIONS.CANCEL,
      entity: AUDIT_ENTITIES.HOUSE_REQUEST,
      entityId: request.id,
      details: {
        employeeId: request.employeeId,
        previousStatus: request.status,
        newStatus: updated.status,
        reason: reason ?? null,
      },
      tx,
    });

    return updated;
  });

  return {
    requestId: cancelled.id,
    employeeId: cancelled.employeeId,
    status: cancelled.status as HouseRequestStatus,
  };
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------
export interface ListParams {
  organizationId: string;
  status?: string;
  search?: string;
  limit?: number;
}

/** House requests joined to their employee, newest first. */
export async function listHouseRequests(params: ListParams) {
  const { organizationId, status, search, limit = 50 } = params;

  return prisma.houseRequest.findMany({
    where: {
      organizationId,
      ...(status ? { status } : {}),
      ...(search
        ? {
            employee: {
              OR: [
                { employeeNumber: { contains: search, mode: "insensitive" } },
                { firstname: { contains: search, mode: "insensitive" } },
                { lastname: { contains: search, mode: "insensitive" } },
              ],
            },
          }
        : {}),
    },
    select: {
      id: true,
      employeeId: true,
      remarks: true,
      status: true,
      createdAt: true,
      decidedAt: true,
      employee: {
        select: {
          employeeNumber: true,
          firstname: true,
          lastname: true,
          jobGrade: true,
        },
      },
      submitter: { select: { firstname: true, lastname: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
