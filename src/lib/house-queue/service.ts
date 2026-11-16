/**
 * House Queue action service.
 *
 * Server-only. Implements the enterprise row actions over the
 * `HouseAllocation` decision ledger, with full validation against the
 * authoritative sources and audit logging:
 *
 *  - approve / reassign an employee to a house,
 *  - skip (permanently exclude) or defer (temporarily exclude) an employee,
 *  - the Release Workflow (initiate â†’ execute â†’ schedule inspection â†’
 *    complete inspection), replacing the flat reason-coded release, and
 *  - recalculate the queue (audit-marked), and
 *  - read the audit trail for an employee.
 *
 * A TRANSFER is NOT a release: it is the existing Reassign path
 * (`approveAllocation`), because moving an employee to a new house is exactly
 * what reassignment does. Only EMPLOYEE_LEAVE / RETIREMENT go through the
 * Release Workflow, where the vacated house enters `PendingInspection`.
 *
 * The Release Workflow is ONE GATE, and the transaction is the safety property:
 *
 *     execute  → allocation `RELEASE_PENDING`, house `PendingInspection`,
 *                inspection auto-scheduled and raised
 *     complete → inspection resolved AND the allocation archived as `released`
 *                with a `terminatedAt`, AND the house returned to `Active`
 *                (no damage) or `UnderMaintenance` (damage found).
 *
 * A vacated house therefore cannot reach the available pool before its handback
 * inspection is completed, and it cannot be archived as terminated without
 * having left the pool. Those writes share one transaction, so neither can happen
 * without the other.
 *
 * The House Queue is the SINGLE decision-making authority for allocation
 * state. Every decision is written in one atomic transaction together with
 * the household status / `occupancyStatus` transition and the audit entry, so
 * the ledger, the register availability and the audit trail can never drift.
 *
 * The ledger is HISTORIED: at most one row per employee has status
 * 'allocated' (enforced by a partial unique key), released rows remain for the
 * archive, and a transfer is release-old + create-new in one tx.
 *
 * Rules enforced here:
 *  - only organization-scoped records can be acted on,
 *  - grade must be eligible under the central rule, and the house must be of
 *    the matching category and Active,
 *  - a house that is already live-allocated can never be double-booked
 *    (re-verified inside the write transaction),
 *  - a live allocation must exit through the Release Workflow, and an archived
 *    row is never mutated again (see ARCHIVED_TERMINAL_STATUSES).
 */

import prisma from "@/lib/prisma";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, createAuditLog } from "@/lib/audit-log";
import { BadRequestError, ConflictError, NotFoundError } from "@/lib/api-route";
import type { Prisma } from "@prisma/client";
import {
  houseCategoryForJobGrade,
  eligibilityBandsToJobGradeRules,
  type JobGradeRule,
} from "./eligibility";
import { computeHouseQueueWithActiveConfig } from "./engine";
import { getActiveConfig } from "./config/service";
import {
  computeInspectionDate,
  formatInspectionDate,
} from "./inspection-schedule";
import {
  DAMAGE_ITEMS,
  validateDamage,
  type DamageCosts,
  type DamageLine,
  type DamageState,
} from "./damage";
import { CACHE_DOMAIN, invalidateAssistantCache } from "@/lib/ai/cache";
import { compareHouses } from "./recommendation";
import {
  type AllocationStatus,
  ARCHIVED_TERMINAL_STATUSES,
  canTransition,
  isReleasePending,
  LIVE_ALLOCATION_STATUSES,
  type PersistedAllocationStatus,
} from "./state";

/**
 * Is this a Prisma unique-constraint violation (P2002)?
 *
 * Distinguishes "this row already exists" from a genuine database failure,
 * which must propagate rather than be swallowed.
 */
function isUniqueViolation(error: unknown): error is { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/**
 * The CURRENT active-config eligibility bands for an organization.
 *
 * Exported because the central rule is not exclusive to the queue: the House
 * Request service must resolve the same bands when it decides whether an
 * employee may file, or a re-banded policy would let people into a queue that
 * then refuses to allocate them.
 */
export async function activeEligibilityBands(
  organizationId: string,
): Promise<JobGradeRule[]> {
  const active = await getActiveConfig(organizationId);
  return eligibilityBandsToJobGradeRules(active.payload.eligibilityBands);
}

/**
 * Drop the assistant's cached housing and queue aggregates after a decision.
 *
 * The assistant's fast lane reads a short-TTL cache of the housing overview and
 * of the full MCDA queue so a count does not have to recompute the ranking. That
 * cache is a latency optimisation, not a second source of truth â€” so the moment
 * a decision lands, the aggregates it could have changed are dropped, and the
 * next question recomputes rather than quoting a number that is already wrong.
 *
 * A user who approves an allocation and then immediately asks "how many vacant
 * houses are there?" must not be told the pre-approval figure.
 */
function invalidateQueueAggregates(organizationId: string): void {
  invalidateAssistantCache(organizationId, [
    CACHE_DOMAIN.housing,
    CACHE_DOMAIN.queue,
  ]);
}

export interface QueueActionResult {
  employeeId: string;
  allocationId: string;
  status: string;
  householdId: string | null;
  houseNumber: string | null;
  hid: string | null;
  mcdScore: number | null;
  priorityRank: number | null;
}

interface Snapshot {
  mcdScore: number | null;
  priorityRank: number | null;
  houseCategory: string | null;
}

/** Human labels for the registry checklist, reused by the damage summary. */
const DAMAGE_LABELS: Record<string, string> = {
  window: "Window",
  door: "Door",
  waterPanel: "Water panel",
  roof: "Roof",
  wall: "Wall",
  electricity: "Electricity",
};

async function assertHouseFree(
  txOrClient: Prisma.TransactionClient,
  householdId: string,
  excludeEmployeeId: string,
): Promise<void> {
  const conflicting = await txOrClient.houseAllocation.count({
    where: {
      householdId,
      status: "allocated",
      employeeId: { not: excludeEmployeeId },
    },
  });
  if (conflicting > 0) {
    throw new ConflictError(
      "This house is already allocated to another employee.",
    );
  }
}

interface AllocationThread {
  id: string;
  status: string;
  householdId: string | null;
  recommendedHouseId: string | null;
  employeeId: string;
  terminationReason: string | null;
  transferHouseholdId: string | null;
  moveCount: number;
  terminatedAt: Date | null;
}

/**
 * Read the employee's CURRENT decision thread. The ledger is historied — this
 * picks the newest row (the live allocation, or the most recent terminal
 * decision when there is no live one).
 *
 * Archived terminations (`released` / `terminated`) are excluded here: they are
 * immutable records owned by the Terminated Houses page, not threads a new
 * decision may act on. Returning one let the re-activation paths (approve /
 * skip / defer) UPDATE it in place, which rewrote `status` off `released` and
 * deleted the termination from the archive.
 */
async function findLatestThread(
  organizationId: string,
  employeeId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<AllocationThread | null> {
  return client.houseAllocation.findFirst({
    where: {
      organizationId,
      employeeId,
      status: { notIn: [...ARCHIVED_TERMINAL_STATUSES] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      householdId: true,
      recommendedHouseId: true,
      employeeId: true,
      terminationReason: true,
      transferHouseholdId: true,
      moveCount: true,
      terminatedAt: true,
    },
  });
}

/** Snapshot the employee's current Engine A score/rank from the live queue. */
async function snapshotForEmployee(
  organizationId: string,
  employeeId: string,
): Promise<Snapshot> {
  const result = await computeHouseQueueWithActiveConfig(organizationId);
  const row = result.rows.find((r) => r.employeeId === employeeId);
  if (!row) return { mcdScore: null, priorityRank: null, houseCategory: null };
  return {
    mcdScore: row.mcdScore,
    priorityRank: row.priorityRank,
    houseCategory: row.houseCategory,
  };
}

/**
 * The single source of truth for "which houses may this employee be offered?".
 *
 * The category is derived from the employee's grade read out of the database —
 * never from anything the client sent. The Transfer wizard and the transfer
 * confirmation both route through here, so the list a user picks from and the
 * house the server actually accepts are guaranteed to agree. A client that asks
 * for a house type the employee does not qualify for gets no such house back.
 *
 * Errors are the spec's stable codes so the UI can branch without string
 * matching: INELIGIBLE_HOUSE_TYPE, MISSING_EMPLOYEE_GRADE, NO_ELIGIBLE_HOUSE.
 */
export interface TransferCandidate {
  id: string;
  houseNumber: string;
  hid: string | null;
  rgType: string | null;
  locationName: string | null;
  houseType: string;
}

export interface EligibleTransferResult {
  employeeId: string;
  jobGrade: number | null;
  /** The one category this employee's grade qualifies for, or null. */
  eligibleCategory: string | null;
  candidates: TransferCandidate[];
}

export async function listEligibleTransferHouses(
  organizationId: string,
  employeeId: string,
): Promise<EligibleTransferResult> {
  const [employee, bands, config] = await Promise.all([
    prisma.employee.findFirst({
      where: { id: employeeId, organizationId, deletedAt: null },
      select: { id: true, jobGrade: true },
    }),
    activeEligibilityBands(organizationId),
    getActiveConfig(organizationId),
  ]);
  if (!employee)
    throw new NotFoundError("Employee not found in this organization.");

  if (employee.jobGrade == null) {
    throw new BadRequestError(
      "MISSING_EMPLOYEE_GRADE: this employee has no job grade on file, so no house category can be determined.",
    );
  }

  const eligibleCategory = houseCategoryForJobGrade(employee.jobGrade, bands);
  if (!eligibleCategory) {
    throw new BadRequestError(
      `INELIGIBLE_HOUSE_TYPE: job grade ${employee.jobGrade} does not qualify for a house under the current policy.`,
    );
  }

  // A house is only a candidate if it is Active, in the qualifying category, and
  // not held down by *any* live allocation. `RELEASE_PENDING` counts as held:
  // the outgoing employee is still in the house and its code is not yet burned.
  const [houses, allocations] = await Promise.all([
    prisma.household.findMany({
      where: { organizationId, houseType: eligibleCategory, status: "Active" },
      select: {
        id: true,
        houseNumber: true,
        hid: true,
        houseType: true,
        rgType: true,
        locationName: true,
        status: true,
      },
      orderBy: { houseNumber: "asc" },
    }),
    prisma.houseAllocation.findMany({
      where: {
        organizationId,
        // Everything that still ties an employee to a house.
        status: { in: [...LIVE_ALLOCATION_STATUSES] },
      },
      select: { householdId: true },
    }),
  ]);

  const heldHouseIds = new Set(
    allocations
      .map((a) => a.householdId)
      .filter((id): id is string => Boolean(id)),
  );
  const available = houses.filter((h) => !heldHouseIds.has(h.id));

  const sorted = [...available].sort((a, b) =>
    compareHouses(a, b, config.payload.recommendation),
  );

  if (sorted.length === 0) {
    throw new BadRequestError(
      `NO_ELIGIBLE_HOUSE: no ${eligibleCategory} house is currently available for this employee.`,
    );
  }

  return {
    employeeId: employee.id,
    jobGrade: employee.jobGrade,
    eligibleCategory,
    candidates: sorted.map((h) => ({
      id: h.id,
      houseNumber: h.houseNumber,
      hid: h.hid,
      rgType: h.rgType,
      locationName: h.locationName,
      houseType: h.houseType,
    })),
  };
}

export interface ApproveAllocationParams {
  organizationId: string;
  employeeId: string;
  householdId: string;
  decidedBy: string;
}

/**
 * Allocate (first approval) or reassign (approval on top of a live allocation)
 * an employee to a house.
 */
export async function approveAllocation(
  params: ApproveAllocationParams,
): Promise<QueueActionResult> {
  const { organizationId, employeeId, householdId, decidedBy } = params;

  const [employee, bands] = await Promise.all([
    prisma.employee.findFirst({
      where: { id: employeeId, organizationId, deletedAt: null },
      select: {
        id: true,
        employeeNumber: true,
        firstname: true,
        lastname: true,
        jobGrade: true,
      },
    }),
    activeEligibilityBands(organizationId),
  ]);
  if (!employee)
    throw new NotFoundError("Employee not found in this organization.");

  const category = houseCategoryForJobGrade(employee.jobGrade, bands);
  if (!category) {
    throw new BadRequestError(
      `Job grade ${employee.jobGrade ?? "unset"} does not qualify for a house under the current policy.`,
    );
  }

  const household = await prisma.household.findFirst({
    where: { id: householdId, organizationId },
    select: {
      id: true,
      hid: true,
      houseNumber: true,
      houseType: true,
      rgType: true,
      locationName: true,
      status: true,
    },
  });
  if (!household)
    throw new NotFoundError("House not found in this organization.");
  if (household.status !== "Active") {
    throw new BadRequestError("Only Active houses can be allocated.");
  }
  if (household.houseType !== category) {
    throw new BadRequestError(
      `House ${household.houseNumber} is type ${household.houseType}; grade ${employee.jobGrade} requires ${category}.`,
    );
  }

  const existing = await findLatestThread(organizationId, employeeId);
  if (
    existing &&
    existing.status === "allocated" &&
    existing.householdId === householdId
  ) {
    return {
      employeeId,
      allocationId: existing.id,
      status: existing.status,
      householdId: existing.householdId,
      houseNumber: household.houseNumber,
      hid: household.hid,
      mcdScore: null,
      priorityRank: null,
    };
  }
  // A live allocation may be reassigned to a different house (the write
  // transaction re-verifies the target house is free). Every other status must
  // respect the transition policy.
  const isReassign =
    existing?.status === "allocated" && existing.householdId !== householdId;
  if (
    existing &&
    !canTransition(existing.status as AllocationStatus, "allocated") &&
    !isReassign
  ) {
    throw new ConflictError(
      `Employee cannot be allocated while in status "${existing.status}". Release the current allocation first.`,
    );
  }

  const snapshot = await snapshotForEmployee(organizationId, employeeId);

  const saved = await prisma.$transaction(async (tx) => {
    // Reassign: the previously occupied house returns to the available pool
    // and its identity is captured for move prints / audits (former â†’ new).
    const previousHouse =
      isReassign && existing.householdId
        ? await tx.household.update({
            where: { id: existing.householdId },
            data: { occupancyStatus: "Vacant" },
            select: { hid: true, houseNumber: true },
          })
        : null;
    await assertHouseFree(tx, householdId, employeeId);
    // Create-or-update the CURRENT thread: the ledger keeps exactly one live
    // (`allocated`) row per employee, so reactivating a terminated/skipped/
    // deferred thread simply re-uses that row instead of appending history.
    const record = existing
      ? await tx.houseAllocation.update({
          where: { id: existing.id },
          data: {
            householdId,
            status: "allocated",
            recommendedHouseId: householdId,
            mcdScore: snapshot.mcdScore,
            priorityRank: snapshot.priorityRank,
            reason: null,
            decidedBy,
            decidedAt: new Date(),
            ...(isReassign
              ? {
                  previousHouseholdId: existing.householdId,
                  movedAt: new Date(),
                  moveCount: { increment: 1 },
                }
              : {}),
          },
          select: { id: true, status: true, householdId: true },
        })
      : await tx.houseAllocation.create({
          data: {
            organizationId,
            employeeId,
            householdId,
            status: "allocated",
            recommendedHouseId: householdId,
            mcdScore: snapshot.mcdScore,
            priorityRank: snapshot.priorityRank,
            decidedBy,
            decidedAt: new Date(),
          },
          select: { id: true, status: true, householdId: true },
        });
    await tx.household.update({
      where: { id: householdId },
      data: { occupancyStatus: "Occupied" },
    });
    await createAuditLog({
      userId: decidedBy,
      action:
        existing?.status === "allocated"
          ? AUDIT_ACTIONS.REASSIGN
          : AUDIT_ACTIONS.APPROVE,
      entity: AUDIT_ENTITIES.HOUSE_QUEUE,
      entityId: employeeId,
      details: {
        employeeNumber: employee.employeeNumber,
        employeeName: `${employee.firstname} ${employee.lastname}`.trim(),
        jobGrade: employee.jobGrade,
        houseCategory: category,
        hid: household.hid,
        houseNumber: household.houseNumber,
        houseType: household.houseType,
        rgType: household.rgType,
        locationName: household.locationName,
        ...(isReassign
          ? {
              previousHid: previousHouse?.hid ?? null,
              previousHouseNumber: previousHouse?.houseNumber ?? null,
            }
          : {}),
        mcdScore: snapshot.mcdScore,
        priorityRank: snapshot.priorityRank,
        action: existing?.status === "allocated" ? "reassign" : "approve",
      },
      tx,
    });
    return record;
  });

  invalidateQueueAggregates(organizationId);

  return {
    employeeId,
    allocationId: saved.id,
    status: saved.status,
    householdId: saved.householdId,
    houseNumber: household.houseNumber,
    hid: household.hid,
    mcdScore: snapshot.mcdScore,
    priorityRank: snapshot.priorityRank,
  };
}

export interface SkipDeferParams {
  organizationId: string;
  employeeId: string;
  mode: "skip" | "defer";
  reason?: string | null;
  decidedBy: string;
}

/**
 * Mark an employee as skipped (excluded from the queue) or deferred
 * (excluded until reactivated). A live allocation must be released first.
 */
export async function setSkipOrDefer(
  params: SkipDeferParams,
): Promise<QueueActionResult> {
  const { organizationId, employeeId, mode, reason, decidedBy } = params;

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, organizationId, deletedAt: null },
    select: {
      id: true,
      employeeNumber: true,
      firstname: true,
      lastname: true,
      jobGrade: true,
    },
  });
  if (!employee)
    throw new NotFoundError("Employee not found in this organization.");

  const existing = await findLatestThread(organizationId, employeeId);

  if (existing && existing.status === "allocated") {
    throw new ConflictError(
      "Employee has a live allocation. Release it before skipping or deferring.",
    );
  }
  const target: PersistedAllocationStatus =
    mode === "skip" ? "skipped" : "deferred";

  if (existing && !canTransition(existing.status as AllocationStatus, target)) {
    throw new ConflictError(
      `Employee cannot be ${mode}d while in status "${existing.status}".`,
    );
  }

  const saved = await prisma.$transaction(async (tx) => {
    const record = existing
      ? await tx.houseAllocation.update({
          where: { id: existing.id },
          data: {
            status: target,
            // Keep any archived house linkage (a previously terminated allocation
            // retains "who lived where" for the archive).
            householdId: existing.householdId ?? null,
            recommendedHouseId:
              existing.householdId ?? existing.recommendedHouseId ?? null,
            reason: reason ?? null,
            decidedBy,
            decidedAt: new Date(),
          },
          select: { id: true, status: true, householdId: true },
        })
      : await tx.houseAllocation.create({
          data: {
            organizationId,
            employeeId,
            status: target,
            reason: reason ?? null,
            decidedBy,
            decidedAt: new Date(),
          },
          select: { id: true, status: true, householdId: true },
        });
    await createAuditLog({
      userId: decidedBy,
      action: mode === "skip" ? AUDIT_ACTIONS.SKIP : AUDIT_ACTIONS.DEFER,
      entity: AUDIT_ENTITIES.HOUSE_QUEUE,
      entityId: employeeId,
      details: {
        employeeNumber: employee.employeeNumber,
        employeeName: `${employee.firstname} ${employee.lastname}`.trim(),
        jobGrade: employee.jobGrade,
        reason: reason ?? null,
      },
      tx,
    });
    return record;
  });

  invalidateQueueAggregates(organizationId);

  return {
    employeeId,
    allocationId: saved.id,
    status: saved.status,
    householdId: saved.householdId,
    houseNumber: null,
    hid: null,
    mcdScore: null,
    priorityRank: null,
  };
}

// ---------------------------------------------------------------------------
// Release Workflow (initiate â†’ execute â†’ schedule inspection â†’ complete)
// ---------------------------------------------------------------------------

/**
 * A release (EMPLOYEE_LEAVE / RETIREMENT only â€” a TRANSFER is a Reassign and
 * therefore belongs to `approveAllocation`) is the ONLY legal way to vacate a
 * house out of the pool. Every step audits to the employee's queue thread:
 *   1. initiate  â€” validates the live allocation, records the reason branch.
 *   2. execute   â€” terminates the live row, vacates the house to
 *      `PendingInspection`, raises a 1:1 handback inspection.
 *   3. schedule  â€” assigns a Facility inspector + date to the inspection.
 *   4. complete  â€” resolves the house back into the pool (Active) or into
 *      maintenance (UnderMaintenance), mirroring the damage checklist.
 */

/** Exit reasons that require the handback-inspection gate. */
export type ReleaseReason = "EMPLOYEE_LEAVE" | "RETIREMENT" | "TRANSFER";

export interface ReleaseInitiateParams {
  organizationId: string;
  employeeId: string;
  decidedBy: string;
  branch: ReleaseReason;
  reason?: string | null;
}

export interface ReleaseInitiateResult {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  jobGrade: number | null;
  houseCategory: string | null;
  allocationId: string;
  householdId: string | null;
  houseNumber: string | null;
  hid: string | null;
  houseType: string | null;
  rgType: string | null;
  locationName: string | null;
  branch: ReleaseReason;
}

/**
 * Release Workflow â€” Step 1 (initiate). Validates the employee holds a live
 * allocation and audits that the reason branch was entered. No ledger write â€”
 * the actual termination is folded atomically into Step 2.
 */
export async function initiateRelease(
  params: ReleaseInitiateParams,
): Promise<ReleaseInitiateResult> {
  const { organizationId, employeeId, decidedBy, branch, reason } = params;

  if (branch === "TRANSFER") {
    throw new BadRequestError(
      "A TRANSFER is a Reassign, not a release. Use the transfer surface for house moves.",
    );
  }

  const [employee, existing] = await Promise.all([
    prisma.employee.findFirst({
      where: { id: employeeId, organizationId, deletedAt: null },
      select: {
        id: true,
        employeeNumber: true,
        firstname: true,
        lastname: true,
        jobGrade: true,
      },
    }),
    findLatestThread(organizationId, employeeId),
  ]);
  if (!employee)
    throw new NotFoundError("Employee not found in this organization.");
  if (!existing)
    throw new NotFoundError("No allocation record exists for this employee.");
  if (existing.status !== "allocated") {
    throw new ConflictError(
      `Employee is not allocated (status "${existing.status}"). Nothing to release.`,
    );
  }

  const household = existing.householdId
    ? await prisma.household.findFirst({
        where: { id: existing.householdId, organizationId },
        select: {
          id: true,
          hid: true,
          houseNumber: true,
          houseType: true,
          rgType: true,
          locationName: true,
        },
      })
    : null;

  const category = houseCategoryForJobGrade(
    employee.jobGrade,
    await activeEligibilityBands(organizationId),
  );

  await createAuditLog({
    userId: decidedBy,
    action: AUDIT_ACTIONS.RELEASE,
    entity: AUDIT_ENTITIES.HOUSE_QUEUE,
    entityId: employeeId,
    details: {
      step: "release_initiated",
      branch,
      reason: reason ?? null,
      employeeNumber: employee.employeeNumber,
      employeeName: `${employee.firstname} ${employee.lastname}`.trim(),
      jobGrade: employee.jobGrade,
      houseCategory: category,
      hid: household?.hid ?? null,
      houseNumber: household?.houseNumber ?? null,
    },
  });

  invalidateQueueAggregates(organizationId);

  return {
    employeeId,
    employeeNumber: employee.employeeNumber,
    employeeName: `${employee.firstname} ${employee.lastname}`.trim(),
    jobGrade: employee.jobGrade,
    houseCategory: category,
    allocationId: existing.id,
    householdId: existing.householdId,
    houseNumber: household?.houseNumber ?? null,
    hid: household?.hid ?? null,
    houseType: household?.houseType ?? null,
    rgType: household?.rgType ?? null,
    locationName: household?.locationName ?? null,
    branch,
  };
}

export interface ExecuteReleaseParams {
  organizationId: string;
  employeeId: string;
  decidedBy: string;
  branch: ReleaseReason;
  /** Free-text note persisted on the allocation row. */
  reason?: string | null;
  /** Optional effective date for the release. */
  effectiveDate?: string | null;
  /** Chosen replacement house for TRANSFER. */
  transferHouseholdId?: string | null;
  targetHouseholdId?: string | null;
}

export interface ExecuteReleaseResult {
  inspectionId: string;
  allocationId: string;
  householdId: string | null;
  houseNumber: string | null;
  hid: string | null;
  branch: ReleaseReason;
  /** When the raised inspection is due (working-day rule, never a weekend). */
  scheduledDate: string;
}

/**
 * Release Workflow — Step 1 (Request Release). Atomically:
 *  - compare-and-set the live allocation → RELEASE_PENDING_INSPECTION,
 *  - the house status moves to UNDER_INSPECTION (never available during this state),
 *  - raises a 1:1 handback inspection with status PENDING,
 *  - blocks duplicate requests.
 */
export async function executeRelease(
  params: ExecuteReleaseParams,
): Promise<ExecuteReleaseResult> {
  const {
    organizationId,
    employeeId,
    decidedBy,
    branch,
    reason,
    effectiveDate,
    transferHouseholdId,
    targetHouseholdId,
  } = params;

  const chosenTransferHouseId = transferHouseholdId ?? targetHouseholdId ?? null;
  if (branch === "TRANSFER" && !chosenTransferHouseId) {
    throw new BadRequestError(
      "A TRANSFER is a Reassign, not a release. Use the transfer surface for house moves.",
    );
  }

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, organizationId, deletedAt: null },
    select: {
      id: true,
      employeeNumber: true,
      firstname: true,
      lastname: true,
      jobGrade: true,
    },
  });
  if (!employee)
    throw new NotFoundError("Employee not found in this organization.");

  const existing = await findLatestThread(organizationId, employeeId);
  if (!existing)
    throw new NotFoundError("No allocation record exists for this employee.");
  if (isReleasePending(existing.status)) {
    throw new ConflictError(
      "A release request is already open for this allocation. Awaiting inspection.",
    );
  }
  if (existing.status !== "allocated") {
    throw new ConflictError(
      `Employee is not allocated (status "${existing.status}"). Nothing to release.`,
    );
  }

  if (branch === "TRANSFER") {
    if (chosenTransferHouseId === existing.householdId) {
      throw new BadRequestError(
        "Replacement house must be different from the currently allocated house.",
      );
    }
    const transferHouse = await prisma.household.findFirst({
      where: { id: chosenTransferHouseId, organizationId },
      select: { id: true, status: true, houseNumber: true },
    });
    if (!transferHouse) {
      throw new NotFoundError("Replacement house not found in this organization.");
    }
    if (transferHouse.status !== "Active") {
      throw new ConflictError(
        `House ${transferHouse.houseNumber} is not active (status "${transferHouse.status}").`,
      );
    }
    const activeBooking = await prisma.houseAllocation.findFirst({
      where: {
        organizationId,
        householdId: chosenTransferHouseId,
        status: { in: [...LIVE_ALLOCATION_STATUSES] },
      },
      select: { id: true },
    });
    if (activeBooking) {
      throw new ConflictError(
        `House ${transferHouse.houseNumber} is already allocated to another employee.`,
      );
    }
  }

  const vacatedHouse = existing.householdId
    ? await prisma.household.findFirst({
        where: { id: existing.householdId, organizationId },
        select: {
          id: true,
          hid: true,
          houseNumber: true,
          houseType: true,
          rgType: true,
          locationName: true,
        },
      })
    : null;
  if (!vacatedHouse) {
    throw new ConflictError("The allocated house could not be resolved.");
  }

  const category = houseCategoryForJobGrade(
    employee.jobGrade,
    await activeEligibilityBands(organizationId),
  );
  const initiatedAt = new Date();
  const scheduledDate = computeInspectionDate(initiatedAt);

  const inspectionId = await prisma.$transaction(async (tx) => {
    // Compare-and-set: only a currently-allocated ledger row can be moved to
    // RELEASE_PENDING_INSPECTION. A competing release wins the race; the loser gets a 409.
    const updated = await tx.houseAllocation.updateMany({
      where: { id: existing.id, status: "allocated" },
      data: {
        status: "RELEASE_PENDING",
        reason: reason ?? null,
        decidedBy,
        decidedAt: initiatedAt,
        terminationReason: branch,
        effectiveDate: effectiveDate ? new Date(effectiveDate) : null,
        transferHouseholdId: branch === "TRANSFER" ? chosenTransferHouseId : null,
      },
    });
    if (updated.count === 0) {
      throw new ConflictError(
        "This allocation is no longer live or another release request was submitted. Refresh and retry.",
      );
    }

    // The house status moves to PendingInspection (never available during this state)
    // while awaiting inspection.
    await tx.household.update({
      where: { id: vacatedHouse.id },
      data: {
        status: "PendingInspection",
        occupancyStatus: "Vacant",
      },
    });

    // Raise the 1:1 handback inspection with status PENDING.
    const inspection = await tx.houseInspection.create({
      data: {
        organizationId,
        allocationId: existing.id,
        householdId: vacatedHouse.id,
        reason: branch,
        status: "SCHEDULED",
        scheduledDate,
        createdBy: decidedBy,
      },
      select: { id: true },
    });

    await createAuditLog({
      userId: decidedBy,
      action: AUDIT_ACTIONS.RELEASE,
      entity: AUDIT_ENTITIES.HOUSE_QUEUE,
      entityId: employeeId,
      details: {
        step: "release_executed",
        awaitingHandbackInspection: true,
        branch,
        reason: reason ?? null,
        effectiveDate: effectiveDate ?? null,
        transferHouseholdId: branch === "TRANSFER" ? chosenTransferHouseId : null,
        employeeNumber: employee.employeeNumber,
        employeeName: `${employee.firstname} ${employee.lastname}`.trim(),
        jobGrade: employee.jobGrade,
        houseCategory: category,
        hid: vacatedHouse.hid,
        houseNumber: vacatedHouse.houseNumber,
        inspectionId: inspection.id,
        scheduledDate: formatInspectionDate(scheduledDate),
        status: "RELEASE_PENDING_INSPECTION",
      },
      tx,
    });

    return inspection.id;
  });

  invalidateQueueAggregates(organizationId);

  return {
    inspectionId,
    allocationId: existing.id,
    householdId: vacatedHouse.id,
    houseNumber: vacatedHouse.houseNumber,
    hid: vacatedHouse.hid,
    branch,
    scheduledDate: formatInspectionDate(scheduledDate),
  };
}

export interface ScheduleInspectionParams {
  organizationId: string;
  inspectionId: string;
  inspectorId: string;
  /** YYYY-MM-DD */
  scheduledDate: string;
  decidedBy: string;
}

export interface ScheduleInspectionResult {
  inspectionId: string;
  inspectorId: string;
  scheduledDate: string;
}

/**
 * Release Workflow â€” Step 3 (schedule). Assigns a Facility inspector and a
 * date to the open handback inspection.
 */
export async function scheduleInspection(
  params: ScheduleInspectionParams,
): Promise<ScheduleInspectionResult> {
  const {
    organizationId,
    inspectionId,
    inspectorId,
    scheduledDate,
    decidedBy,
  } = params;

  const inspection = await prisma.houseInspection.findFirst({
    where: { id: inspectionId, organizationId },
    select: { id: true, resolvedTo: true },
  });
  if (!inspection)
    throw new NotFoundError("Inspection not found in this organization.");
  if (inspection.resolvedTo) {
    throw new ConflictError("This inspection is already completed.");
  }

  const scheduled = new Date(`${scheduledDate}T00:00:00.000Z`);

  await prisma.$transaction(async (tx) => {
    // Compare-and-set on the open inspection guards a concurrent completion.
    const updated = await tx.houseInspection.updateMany({
      where: { id: inspectionId, resolvedTo: null },
      data: { inspectorId, scheduledDate: scheduled },
    });
    if (updated.count === 0) {
      throw new ConflictError(
        "This inspection is already completed; you can no longer schedule it.",
      );
    }
    await createAuditLog({
      userId: decidedBy,
      action: AUDIT_ACTIONS.RELEASE,
      entity: AUDIT_ENTITIES.HOUSE_QUEUE,
      entityId: null,
      details: {
        step: "inspection_scheduled",
        inspectionId,
        inspectorId,
        scheduledDate,
      },
      tx,
    });
  });

  invalidateQueueAggregates(organizationId);

  return { inspectionId, inspectorId, scheduledDate };
}

export interface CompleteInspectionParams {
  organizationId: string;
  inspectionId: string;
  decidedBy: string;
  checklist: {
    window: boolean;
    door: boolean;
    waterPanel: boolean;
    roof: boolean;
    wall: boolean;
    electricity: boolean;
    bedCount?: number;
    chairsCount?: number;
    lockerCount?: number;
    tablesCount?: number;
  };
  costs?: Record<string, unknown>;
  conditionNote?: string | null;
}

export interface CompleteInspectionResult {
  inspectionId: string;
  allocationId?: string;
  /** What the inspection found, and where the house ended up. */
  resolvedTo: "Active" | "UnderMaintenance";
  householdId: string;
  houseNumber: string | null;
  hid: string | null;
  /** Damaged parts with their costs, in taxonomy order — the receipt's rows. */
  damageLines: DamageLine[];
  /** Sum of `damageLines`. 0 when nothing was damaged. */
  totalDamageCost: number;
  completedAt: string;
  terminatedAt: string;
  transferredAllocationId?: string | null;
  transferHouseholdId?: string | null;
  status?: string;
}

/**
 * Release Workflow — Complete inspection & atomically finalise release:
 * Records handback findings, marks inspection as COMPLETED, archives
 * the allocation as released with terminatedAt, returns house to stock
 * (or handles transfer assignment), and writes both audit entries.
 */
export async function completeInspection(
  params: CompleteInspectionParams,
): Promise<CompleteInspectionResult> {
  const { organizationId, inspectionId, decidedBy, checklist, conditionNote } =
    params;

  const inspection = await prisma.houseInspection.findFirst({
    where: { id: inspectionId, organizationId },
    select: {
      id: true,
      status: true,
      resolvedTo: true,
      householdId: true,
      allocationId: true,
      inspectorId: true,
      scheduledDate: true,
      photoUrls: true,
    },
  });
  if (!inspection)
    throw new NotFoundError("Inspection not found in this organization.");
  if (inspection.resolvedTo) {
    throw new ConflictError("This inspection is already completed.");
  }

  const damageState: DamageState = {};
  const costMap: DamageCosts = {};
  for (const item of DAMAGE_ITEMS) {
    damageState[item.stateKey] = Boolean(checklist[item.key]);
    costMap[item.costKey] = params.costs?.[item.key];
  }
  const damage = validateDamage(damageState, costMap);
  if (damage.errors.length > 0) {
    throw new BadRequestError(damage.errors.join(" "));
  }
  const { lines: damageLines, totalCost: totalDamageCost } = damage;
  const costColumns: Record<string, number> = {};
  for (const item of DAMAGE_ITEMS) {
    costColumns[item.costKey] =
      damageLines.find((l) => l.key === item.key)?.cost ?? 0;
  }

  const household = await prisma.household.findFirst({
    where: { id: inspection.householdId, organizationId },
    select: { id: true, hid: true, houseNumber: true },
  });
  if (!household)
    throw new NotFoundError("Household not found for this inspection.");

  const damaged = damageLines.length > 0;
  const resolvedTo: "Active" | "UnderMaintenance" = damaged
    ? "UnderMaintenance"
    : "Active";
  const completedAt = new Date();
  let transferredAllocationId: string | null = null;
  let transferHouseholdId: string | null = null;

  await prisma.$transaction(async (tx) => {
    // 1. Mark inspection completed
    const cas = await tx.houseInspection.updateMany({
      where: { id: inspectionId, resolvedTo: null, status: { not: "COMPLETED" } },
      data: {
        checklistWindow: checklist.window,
        checklistDoor: checklist.door,
        checklistWaterPanel: checklist.waterPanel,
        checklistRoof: checklist.roof,
        checklistWall: checklist.wall,
        checklistElectricity: checklist.electricity,
        checklistBedCount: checklist.bedCount ?? 0,
        checklistChairsCount: checklist.chairsCount ?? 0,
        checklistLockerCount: checklist.lockerCount ?? 0,
        checklistTablesCount: checklist.tablesCount ?? 0,
        checklistInsideItemsOk:
          (checklist.bedCount ?? 0) >= 0 &&
          (checklist.chairsCount ?? 0) >= 0 &&
          (checklist.lockerCount ?? 0) >= 0 &&
          (checklist.tablesCount ?? 0) >= 0,
        ...costColumns,
        totalDamageCost,
        conditionNote: conditionNote ?? null,
        photoUrls: inspection.photoUrls,
        status: "COMPLETED",
        resolvedTo,
        completedAt,
        completedBy: decidedBy,
      },
    });
    if (cas.count === 0) {
      throw new ConflictError(
        "This inspection was just completed elsewhere; refresh and retry.",
      );
    }

    // 2. Archive outgoing allocation with CAS
    let casAlloc = await tx.houseAllocation.updateMany({
      where: {
        id: inspection.allocationId,
        status: "RELEASE_PENDING",
        terminatedAt: null,
      },
      data: {
        status: "released",
        terminatedAt: completedAt,
        terminatedBy: decidedBy,
        decidedAt: completedAt,
        decidedBy,
      },
    });
    if (casAlloc.count === 0) {
      casAlloc = await tx.houseAllocation.updateMany({
        where: {
          id: inspection.allocationId,
          status: "RELEASE_PENDING_INSPECTION",
          terminatedAt: null,
        },
        data: {
          status: "released",
          terminatedAt: completedAt,
          terminatedBy: decidedBy,
          decidedAt: completedAt,
          decidedBy,
        },
      });
    }
    if (casAlloc.count === 0) {
      throw new ConflictError(
        "This release is no longer pending or has already been finalized.",
      );
    }

    // 3. Return house to stock / maintenance
    if (resolvedTo === "Active") {
      await tx.household.update({
        where: { id: inspection.householdId },
        data: {
          status: "Active",
          occupancyStatus: "Vacant",
          damageWindow: false,
          damageDoor: false,
          damageWaterPanel: false,
          damageRoof: false,
          damageWall: false,
          damageElectricity: false,
          damageNotes: null,
        },
      });
    } else {
      await tx.household.update({
        where: { id: inspection.householdId },
        data: {
          status: "UnderMaintenance",
          occupancyStatus: "Maintenance",
          damageWindow: checklist.window,
          damageDoor: checklist.door,
          damageWaterPanel: checklist.waterPanel,
          damageRoof: checklist.roof,
          damageWall: checklist.wall,
          damageElectricity: checklist.electricity,
          damageNotes:
            damageLines.length > 0
              ? `${damageLines.map((l) => l.label).join(", ")}${conditionNote?.trim() ? ` — ${conditionNote.trim()}` : ""}`
              : (conditionNote ?? null),
        },
      });
    }

    const allocRow = await tx.houseAllocation.findFirst({
      where: { id: inspection.allocationId },
      select: {
        id: true,
        employeeId: true,
        terminationReason: true,
        transferHouseholdId: true,
        moveCount: true,
      },
    });
    if (allocRow?.transferHouseholdId) {
      transferHouseholdId = allocRow.transferHouseholdId;
    }

    // 4. For TRANSFER: atomically allocate replacement house
    if (allocRow?.terminationReason === "TRANSFER") {
      const destId = allocRow.transferHouseholdId;
      if (!destId) {
        throw new BadRequestError(
          "Transfer allocation is missing the replacement house choice.",
        );
      }
      const destHouse = await tx.household.findFirst({
        where: { id: destId, organizationId },
      });
      if (!destHouse) {
        throw new NotFoundError(
          "The replacement house chosen for transfer could not be found.",
        );
      }
      if (destHouse.status !== "Active") {
        throw new ConflictError(
          `Replacement house ${destHouse.houseNumber} is not active (status "${destHouse.status}").`,
        );
      }

      // Double-booking check
      const conflictingBooking = await tx.houseAllocation.findFirst({
        where: {
          organizationId,
          householdId: destId,
          status: { in: [...LIVE_ALLOCATION_STATUSES] },
        },
      });
      if (conflictingBooking) {
        throw new ConflictError(
          `Replacement house ${destHouse.houseNumber} was allocated to another occupant.`,
        );
      }

      // Create new allocation for employee
      const newAllocation = await tx.houseAllocation.create({
        data: {
          organizationId,
          employeeId: allocRow.employeeId,
          householdId: destId,
          status: "allocated",
          decidedBy,
          decidedAt: completedAt,
          previousHouseholdId: inspection.householdId,
          movedAt: completedAt,
          moveCount: (allocRow.moveCount || 0) + 1,
        },
      });
      transferredAllocationId = newAllocation.id;

      // Update destination house to Occupied
      await tx.household.update({
        where: { id: destId },
        data: {
          status: "Active",
          occupancyStatus: "Occupied",
        },
      });

      await createAuditLog({
        userId: decidedBy,
        action: AUDIT_ACTIONS.RELEASE,
        entity: AUDIT_ENTITIES.HOUSE_QUEUE,
        entityId: allocRow.employeeId,
        details: {
          step: "transfer_completed",
          outgoingAllocationId: allocRow.id,
          incomingAllocationId: newAllocation.id,
          vacatedHouseNumber: household.houseNumber,
          newHouseNumber: destHouse.houseNumber,
          movedAt: completedAt.toISOString(),
        },
        tx,
      });
    }

    // 5. Audit logs for both steps
    await createAuditLog({
      userId: decidedBy,
      action: AUDIT_ACTIONS.RELEASE,
      entity: AUDIT_ENTITIES.HOUSE_QUEUE,
      entityId: null,
      details: {
        step: "inspection_completed",
        inspectionId,
        allocationId: inspection.allocationId,
        householdId: inspection.householdId,
        hid: household.hid,
        houseNumber: household.houseNumber,
        resolvedTo,
        damaged,
        damageLines: damageLines.map((l) => ({ part: l.label, cost: l.cost })),
        totalDamageCost,
        hasConditionNote: Boolean(conditionNote?.trim()),
      },
      tx,
    });

    await createAuditLog({
      userId: decidedBy,
      action: AUDIT_ACTIONS.RELEASE,
      entity: AUDIT_ENTITIES.HOUSE_QUEUE,
      entityId: inspection.allocationId,
      details: {
        step: "release_finalized",
        allocationId: inspection.allocationId,
        inspectionId,
        householdId: inspection.householdId,
        hid: household.hid,
        houseNumber: household.houseNumber,
        branch: allocRow?.terminationReason,
        resolvedTo,
        terminatedAt: completedAt.toISOString(),
      },
      tx,
    });
  });

  invalidateQueueAggregates(organizationId);

  return {
    inspectionId,
    allocationId: inspection.allocationId,
    resolvedTo,
    householdId: inspection.householdId,
    houseNumber: household.houseNumber,
    hid: household.hid,
    damageLines,
    totalDamageCost,
    completedAt: completedAt.toISOString(),
    terminatedAt: completedAt.toISOString(),
    transferredAllocationId,
    transferHouseholdId,
    status: "released",
  };
}

export interface CancelReleaseRequestParams {
  organizationId: string;
  allocationId?: string | null;
  employeeId?: string | null;
  cancelledBy: string;
}

export interface CancelReleaseRequestResult {
  allocationId: string;
  householdId: string | null;
  houseNumber: string | null;
  status: string;
}

/**
 * Cancel release request (allowed ONLY before inspection is completed).
 * Restores allocation to `allocated`, house to `Active`/`Occupied`,
 * removes the open inspection, and writes an audit log.
 */
export async function cancelReleaseRequest(
  params: CancelReleaseRequestParams,
): Promise<CancelReleaseRequestResult> {
  const { organizationId, allocationId, employeeId, cancelledBy } = params;

  const allocation = allocationId
    ? await prisma.houseAllocation.findFirst({
        where: { id: allocationId, organizationId },
      })
    : employeeId
      ? await findLatestThread(organizationId, employeeId)
      : null;

  if (!allocation) {
    throw new NotFoundError("Allocation record not found in this organization.");
  }

  if (!isReleasePending(allocation.status)) {
    throw new ConflictError(
      `Allocation is not in a release pending state (status: "${allocation.status}").`,
    );
  }

  const inspection = await prisma.houseInspection.findFirst({
    where: { allocationId: allocation.id, organizationId },
  });

  if (inspection && (inspection.status === "COMPLETED" || inspection.resolvedTo)) {
    throw new ConflictError(
      "Cannot cancel release request: the inspection has already been completed.",
    );
  }

  const householdId = allocation.householdId;
  const household = householdId
    ? await prisma.household.findFirst({
        where: { id: householdId, organizationId },
        select: { id: true, houseNumber: true, hid: true },
      })
    : null;

  await prisma.$transaction(async (tx) => {
    const updated = await tx.houseAllocation.updateMany({
      where: {
        id: allocation.id,
        status: {
          in: [
            "RELEASE_PENDING_INSPECTION",
            "RELEASE_PENDING",
            "release_pending",
          ],
        },
      },
      data: {
        status: "allocated",
        terminationReason: null,
        reason: null,
        effectiveDate: null,
        transferHouseholdId: null,
      },
    });
    if (updated.count === 0) {
      throw new ConflictError(
        "Could not cancel release request: allocation status has changed.",
      );
    }

    if (householdId) {
      await tx.household.update({
        where: { id: householdId },
        data: {
          status: "Active",
          occupancyStatus: "Occupied",
        },
      });
    }

    if (inspection) {
      await tx.houseInspection.delete({
        where: { id: inspection.id },
      });
    }

    await createAuditLog({
      userId: cancelledBy,
      action: AUDIT_ACTIONS.RELEASE,
      entity: AUDIT_ENTITIES.HOUSE_QUEUE,
      entityId: allocation.employeeId,
      details: {
        step: "release_request_cancelled",
        allocationId: allocation.id,
        householdId,
        houseNumber: household?.houseNumber ?? null,
      },
      tx,
    });
  });

  invalidateQueueAggregates(organizationId);

  return {
    allocationId: allocation.id,
    householdId,
    houseNumber: household?.houseNumber ?? null,
    status: "allocated",
  };
}

export interface FinalizeReleaseParams {
  organizationId: string;
  allocationId?: string | null;
  employeeId?: string | null;
  decidedBy: string;
}

export interface FinalizeReleaseResult {
  allocationId: string;
  householdId: string | null;
  houseNumber: string | null;
  hid: string | null;
  status: string;
  resolvedTo: string;
  terminatedAt: string;
  transferredAllocationId?: string | null;
  transferHouseholdId?: string | null;
}

/**
 * Release Workflow — Step 5 (Final Release). Atomically:
 *  - validates inspection is COMPLETED (rejects otherwise),
 *  - moves allocation.status -> released with terminatedAt,
 *  - returns house to House Register as UNASSIGNED / available (status Active/Vacant or UnderMaintenance),
 *  - for TRANSFER: creates/approves new allocation for replacement house with double-booking check,
 *  - writes audit logs.
 */
export async function finalizeRelease(
  params: FinalizeReleaseParams,
): Promise<FinalizeReleaseResult> {
  const { organizationId, allocationId, employeeId, decidedBy } = params;

  const allocation = allocationId
    ? await prisma.houseAllocation.findFirst({
        where: { id: allocationId, organizationId },
      })
    : employeeId
      ? await findLatestThread(organizationId, employeeId)
      : null;

  if (!allocation) {
    throw new NotFoundError("Allocation record not found in this organization.");
  }

  if (
    !isReleasePending(allocation.status) &&
    allocation.status !== "RELEASE_PENDING_INSPECTION" &&
    allocation.status !== "RELEASE_PENDING"
  ) {
    if (allocation.status === "released" || allocation.terminatedAt) {
      throw new ConflictError("This allocation has already been released.");
    }
    throw new ConflictError(
      `Allocation cannot be released from status "${allocation.status}".`,
    );
  }

  const inspection = await prisma.houseInspection.findFirst({
    where: { allocationId: allocation.id, organizationId },
  });

  if (!inspection || inspection.status !== "COMPLETED" || !inspection.resolvedTo) {
    throw new BadRequestError(
      "Cannot release house: inspection has not been completed yet.",
    );
  }

  const vacatedHouse = allocation.householdId
    ? await prisma.household.findFirst({
        where: { id: allocation.householdId, organizationId },
      })
    : null;

  if (!vacatedHouse) {
    throw new ConflictError("The allocated house could not be resolved.");
  }

  const resolvedTo = inspection.resolvedTo;
  const completedAt = new Date();
  let transferredAllocationId: string | null = null;

  await prisma.$transaction(async (tx) => {
    // 1. Archive outgoing allocation
    const archived = await tx.houseAllocation.updateMany({
      where: {
        id: allocation.id,
        status: {
          in: [
            "RELEASE_PENDING_INSPECTION",
            "RELEASE_PENDING",
            "release_pending",
          ],
        },
        terminatedAt: null,
      },
      data: {
        status: "released",
        terminatedAt: completedAt,
        terminatedBy: decidedBy,
        decidedAt: completedAt,
        decidedBy,
      },
    });
    if (archived.count === 0) {
      throw new ConflictError(
        "This release is no longer pending or has already been finalized.",
      );
    }

    // 2. Return vacated house to House Register as UNASSIGNED
    if (resolvedTo === "Active") {
      await tx.household.update({
        where: { id: vacatedHouse.id },
        data: {
          status: "Active",
          occupancyStatus: "Vacant",
          damageWindow: false,
          damageDoor: false,
          damageWaterPanel: false,
          damageRoof: false,
          damageWall: false,
          damageElectricity: false,
          damageNotes: null,
        },
      });
    } else {
      await tx.household.update({
        where: { id: vacatedHouse.id },
        data: {
          status: "UnderMaintenance",
          occupancyStatus: "Maintenance",
          damageWindow: inspection.checklistWindow,
          damageDoor: inspection.checklistDoor,
          damageWaterPanel: inspection.checklistWaterPanel,
          damageRoof: inspection.checklistRoof,
          damageWall: inspection.checklistWall,
          damageElectricity: inspection.checklistElectricity,
          damageNotes:
            inspection.conditionNote ?? "Damage recorded during handback inspection",
        },
      });
    }

    // 3. For TRANSFER: atomically allocate replacement house
    if (allocation.terminationReason === "TRANSFER") {
      const destId = allocation.transferHouseholdId;
      if (!destId) {
        throw new BadRequestError(
          "Transfer allocation is missing the replacement house choice.",
        );
      }
      const destHouse = await tx.household.findFirst({
        where: { id: destId, organizationId },
      });
      if (!destHouse) {
        throw new NotFoundError(
          "The replacement house chosen for transfer could not be found.",
        );
      }
      if (destHouse.status !== "Active") {
        throw new ConflictError(
          `Replacement house ${destHouse.houseNumber} is not active (status "${destHouse.status}").`,
        );
      }

      // Double-booking check
      const conflictingBooking = await tx.houseAllocation.findFirst({
        where: {
          organizationId,
          householdId: destId,
          status: { in: [...LIVE_ALLOCATION_STATUSES] },
        },
      });
      if (conflictingBooking) {
        throw new ConflictError(
          `Replacement house ${destHouse.houseNumber} was allocated to another occupant.`,
        );
      }

      // Create new allocation for employee
      const newAllocation = await tx.houseAllocation.create({
        data: {
          organizationId,
          employeeId: allocation.employeeId,
          householdId: destId,
          status: "allocated",
          decidedBy,
          decidedAt: completedAt,
          previousHouseholdId: vacatedHouse.id,
          movedAt: completedAt,
          moveCount: (allocation.moveCount || 0) + 1,
        },
      });
      transferredAllocationId = newAllocation.id;

      // Update destination house to Occupied
      await tx.household.update({
        where: { id: destId },
        data: {
          status: "Active",
          occupancyStatus: "Occupied",
        },
      });

      await createAuditLog({
        userId: decidedBy,
        action: AUDIT_ACTIONS.RELEASE,
        entity: AUDIT_ENTITIES.HOUSE_QUEUE,
        entityId: allocation.employeeId,
        details: {
          step: "transfer_completed",
          outgoingAllocationId: allocation.id,
          incomingAllocationId: newAllocation.id,
          vacatedHouseNumber: vacatedHouse.houseNumber,
          newHouseNumber: destHouse.houseNumber,
          movedAt: completedAt.toISOString(),
        },
        tx,
      });
    }

    // 4. Release finalization audit log
    await createAuditLog({
      userId: decidedBy,
      action: AUDIT_ACTIONS.RELEASE,
      entity: AUDIT_ENTITIES.HOUSE_QUEUE,
      entityId: allocation.id,
      details: {
        step: "release_finalized",
        allocationId: allocation.id,
        inspectionId: inspection.id,
        householdId: vacatedHouse.id,
        hid: vacatedHouse.hid,
        houseNumber: vacatedHouse.houseNumber,
        branch: allocation.terminationReason,
        resolvedTo,
        terminatedAt: completedAt.toISOString(),
      },
      tx,
    });
  });

  invalidateQueueAggregates(organizationId);

  return {
    allocationId: allocation.id,
    householdId: vacatedHouse.id,
    houseNumber: vacatedHouse.houseNumber,
    hid: vacatedHouse.hid,
    status: "released",
    resolvedTo,
    terminatedAt: completedAt.toISOString(),
    transferredAllocationId,
    transferHouseholdId: allocation.transferHouseholdId,
  };
}

export interface RecalculateQueueParams {
  organizationId: string;
  decidedBy: string;
  grade?: number | null;
}

/**
 * Re-run the queue engine (audit-marked so decisions remain attributable).
 * The engine is live, so this is primarily an explicit recompute + audit
 * trigger — there is no stale cache to purge.
 */
export async function recalculateQueue(params: RecalculateQueueParams) {
  const { organizationId, decidedBy, grade } = params;
  const result = await computeHouseQueueWithActiveConfig(organizationId, {
    grade: grade ?? undefined,
  });

  await createAuditLog({
    userId: decidedBy,
    action: AUDIT_ACTIONS.RECALCULATE,
    entity: AUDIT_ENTITIES.HOUSE_QUEUE,
    entityId: null,
    details: {
      grade: grade ?? null,
      totalEmployees: result.summary.totalEmployees,
      readyCount: result.summary.readyCount,
      allocatedCount: result.summary.allocatedCount,
    },
  });

  return result;
}

/**
 * Read the audit trail for one employee's queue thread.
 * Scoped to the organization via the owning employee.
 */
export async function listAuditForEmployee(
  organizationId: string,
  employeeId: string,
) {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, organizationId },
    select: { id: true },
  });
  if (!employee)
    throw new NotFoundError("Employee not found in this organization.");

  const logs = await prisma.audit_logs.findMany({
    where: { entity: AUDIT_ENTITIES.HOUSE_QUEUE, entityId: employeeId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return logs;
}
