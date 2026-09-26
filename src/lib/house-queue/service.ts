/**
 * House Queue action service.
 *
 * Server-only. Implements the enterprise row actions over the
 * `HouseAllocation` decision ledger, with full validation against the
 * authoritative sources and audit logging:
 *
 *  - approve / reassign an employee to a house,
 *  - skip (permanently exclude) or defer (temporarily exclude) an employee,
 *  - the Release Workflow (initiate → execute → schedule inspection →
 *    complete inspection), replacing the flat reason-coded release, and
 *  - recalculate the queue (audit-marked), and
 *  - read the audit trail for an employee.
 *
 * A TRANSFER is NOT a release: it is the existing Reassign path
 * (`approveAllocation`), because moving an employee to a new house is exactly
 * what reassignment does. Only EMPLOYEE_LEAVE / RETIREMENT go through the
 * Release Workflow, where the vacated house enters `PendingInspection` and a
 * completed handback inspection brings it back to the pool (Active) or into
 * maintenance (UnderMaintenance).
 *
 * The House Queue is the SINGLE decision-making authority for allocation
 * state. Every decision is written in one atomic transaction together with
 * the household status / `occupancyStatus` transition and the audit entry, so
 * the ledger, the register availability and the audit trail can never drift.
 *
 * The ledger is HISTORIED: at most one row per employee has status
 * 'allocated' (enforced by a partial unique key), terminated rows remain for
 * the archive, and a transfer is terminate-old + create-new in one tx.
 *
 * Rules enforced here:
 *  - only organization-scoped records can be acted on,
 *  - grade must be eligible under the central rule, and the house must be of
 *    the matching category and Active,
 *  - a house that is already live-allocated can never be double-booked
 *    (re-verified inside the write transaction),
 *  - a live allocation must exit through the Release Workflow; released
 *    houses go to `PendingInspection` and only a completed handback inspection
 *    puts them back in the pool (Active) or into maintenance
 *    (UnderMaintenance).
 */

import prisma from "@/lib/prisma";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, createAuditLog } from "@/lib/audit-log";
import { BadRequestError, ConflictError, NotFoundError } from "@/lib/api-route";
import type { Prisma } from "@prisma/client";
import { houseCategoryForJobGrade, eligibilityBandsToJobGradeRules, type JobGradeRule } from "./eligibility";
import { computeHouseQueueWithActiveConfig } from "./engine";
import { getActiveConfig } from "./config/service";
import { CACHE_DOMAIN, invalidateAssistantCache } from "@/lib/ai/cache";

/** The CURRENT active-config eligibility bands for an organization. */
async function activeEligibilityBands(organizationId: string): Promise<JobGradeRule[]> {
  const active = await getActiveConfig(organizationId);
  return eligibilityBandsToJobGradeRules(active.payload.eligibilityBands);
}
import {
  type AllocationStatus,
  canTransition,
  type PersistedAllocationStatus,
} from "./state";

/**
 * Drop the assistant's cached housing and queue aggregates after a decision.
 *
 * The assistant's fast lane reads a short-TTL cache of the housing overview and
 * of the full MCDA queue so a count does not have to recompute the ranking. That
 * cache is a latency optimisation, not a second source of truth — so the moment
 * a decision lands, the aggregates it could have changed are dropped, and the
 * next question recomputes rather than quoting a number that is already wrong.
 *
 * A user who approves an allocation and then immediately asks "how many vacant
 * houses are there?" must not be told the pre-approval figure.
 */
function invalidateQueueAggregates(organizationId: string): void {
  invalidateAssistantCache(organizationId, [CACHE_DOMAIN.housing, CACHE_DOMAIN.queue]);
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
    throw new ConflictError("This house is already allocated to another employee.");
  }
}

interface AllocationThread {
  id: string;
  status: string;
  householdId: string | null;
  recommendedHouseId: string | null;
}

/**
 * Read the employee's CURRENT decision thread. The ledger is historied — this
 * picks the newest row (the live allocation, or the most recent terminal
 * decision when there is no live one).
 */
async function findLatestThread(
  organizationId: string,
  employeeId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<AllocationThread | null> {
  return client.houseAllocation.findFirst({
    where: { organizationId, employeeId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      householdId: true,
      recommendedHouseId: true,
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
      where: { id: employeeId, organizationId },
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
  if (!employee) throw new NotFoundError("Employee not found in this organization.");

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
  if (!household) throw new NotFoundError("House not found in this organization.");
  if (household.status !== "Active") {
    throw new BadRequestError("Only Active houses can be allocated.");
  }
  if (household.houseType !== category) {
    throw new BadRequestError(
      `House ${household.houseNumber} is type ${household.houseType}; grade ${employee.jobGrade} requires ${category}.`,
    );
  }

  const existing = await findLatestThread(organizationId, employeeId);
  if (existing && existing.status === "allocated" && existing.householdId === householdId) {
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
    // and its identity is captured for move prints / audits (former → new).
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
    where: { id: employeeId, organizationId },
    select: { id: true, employeeNumber: true, firstname: true, lastname: true, jobGrade: true },
  });
  if (!employee) throw new NotFoundError("Employee not found in this organization.");

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
// Release Workflow (initiate → execute → schedule inspection → complete)
// ---------------------------------------------------------------------------

/**
 * A release (EMPLOYEE_LEAVE / RETIREMENT only — a TRANSFER is a Reassign and
 * therefore belongs to `approveAllocation`) is the ONLY legal way to vacate a
 * house out of the pool. Every step audits to the employee's queue thread:
 *   1. initiate  — validates the live allocation, records the reason branch.
 *   2. execute   — terminates the live row, vacates the house to
 *      `PendingInspection`, raises a 1:1 handback inspection.
 *   3. schedule  — assigns a Facility inspector + date to the inspection.
 *   4. complete  — resolves the house back into the pool (Active) or into
 *      maintenance (UnderMaintenance), mirroring the damage checklist.
 */

/** Exit reasons that require the handback-inspection gate. */
export type ReleaseReason = "EMPLOYEE_LEAVE" | "RETIREMENT";

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
 * Release Workflow — Step 1 (initiate). Validates the employee holds a live
 * allocation and audits that the reason branch was entered. No ledger write —
 * the actual termination is folded atomically into Step 2.
 */
export async function initiateRelease(
  params: ReleaseInitiateParams,
): Promise<ReleaseInitiateResult> {
  const { organizationId, employeeId, decidedBy, branch, reason } = params;

  if (branch === ("TRANSFER" as ReleaseReason)) {
    throw new BadRequestError(
      "A TRANSFER is a Reassign, not a release. Use the transfer surface for house moves.",
    );
  }

  const [employee, existing] = await Promise.all([
    prisma.employee.findFirst({
      where: { id: employeeId, organizationId },
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
  if (!employee) throw new NotFoundError("Employee not found in this organization.");
  if (!existing) throw new NotFoundError("No allocation record exists for this employee.");
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
  /** Only inspection-gated reasons can execute a release. A TRANSFER is the
   *  Reassign action and never reaches this function. */
  branch: ReleaseReason;
  /** Free-text note carried from Step 1, persisted on the terminated row. */
  reason?: string | null;
}

export interface ExecuteReleaseResult {
  inspectionId: string;
  allocationId: string;
  householdId: string | null;
  houseNumber: string | null;
  hid: string | null;
}

/**
 * Release Workflow — Step 2 (execute). Atomically:
 *  - compare-and-set the live allocation → terminated (reason-coded),
 *  - the vacated house leaves the Active pool (`PendingInspection`/`Vacant`)
 *    with a 1:1 handback inspection raised against the terminated row.
 */
export async function executeRelease(
  params: ExecuteReleaseParams,
): Promise<ExecuteReleaseResult> {
  const { organizationId, employeeId, decidedBy, branch, reason } = params;

  if (branch === ("TRANSFER" as ReleaseReason)) {
    throw new BadRequestError(
      "A TRANSFER is a Reassign, not a release. Use the transfer surface for house moves.",
    );
  }

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, organizationId },
    select: {
      id: true,
      employeeNumber: true,
      firstname: true,
      lastname: true,
      jobGrade: true,
    },
  });
  if (!employee) throw new NotFoundError("Employee not found in this organization.");

  const existing = await findLatestThread(organizationId, employeeId);
  if (!existing) throw new NotFoundError("No allocation record exists for this employee.");
  if (existing.status !== "allocated") {
    throw new ConflictError(
      `Employee is not allocated (status "${existing.status}"). Nothing to release.`,
    );
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
  const snapshot = await snapshotForEmployee(organizationId, employeeId);
  const terminatedAt = new Date();

  const inspectionId = await prisma.$transaction(async (tx) => {
    // Compare-and-set: only a currently-allocated ledger row can be
    // terminated. A competing release wins the race; the loser gets a 409.
    const updated = await tx.houseAllocation.updateMany({
      where: { id: existing.id, status: "allocated" },
      data: {
        status: "terminated",
        reason: reason ?? null,
        decidedBy,
        decidedAt: terminatedAt,
        terminationReason: branch,
        terminatedAt,
        terminatedBy: decidedBy,
      },
    });
    if (updated.count === 0) {
      throw new ConflictError(
        "This allocation is no longer live. It may have just been released elsewhere; refresh and retry.",
      );
    }

    // The vacated house leaves the Active pool until its handback inspection
    // resolves it (Active → back in pool, UnderMaintenance → stays out).
    await tx.household.update({
      where: { id: vacatedHouse.id },
      data: {
        status: "PendingInspection",
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

    // Raise the 1:1 handback inspection against the terminated release row.
    const inspection = await tx.houseInspection.create({
      data: {
        organizationId,
        allocationId: existing.id,
        householdId: vacatedHouse.id,
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
        branch,
        reason: reason ?? null,
        employeeNumber: employee.employeeNumber,
        employeeName: `${employee.firstname} ${employee.lastname}`.trim(),
        jobGrade: employee.jobGrade,
        houseCategory: category,
        hid: vacatedHouse.hid,
        houseNumber: vacatedHouse.houseNumber,
        inspectionId: inspection.id,
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
 * Release Workflow — Step 3 (schedule). Assigns a Facility inspector and a
 * date to the open handback inspection.
 */
export async function scheduleInspection(
  params: ScheduleInspectionParams,
): Promise<ScheduleInspectionResult> {
  const { organizationId, inspectionId, inspectorId, scheduledDate, decidedBy } =
    params;

  const inspection = await prisma.houseInspection.findFirst({
    where: { id: inspectionId, organizationId },
    select: { id: true, resolvedTo: true },
  });
  if (!inspection) throw new NotFoundError("Inspection not found in this organization.");
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
  };
  conditionNote?: string | null;
}

export interface CompleteInspectionResult {
  inspectionId: string;
  resolvedTo: "Active" | "UnderMaintenance";
  householdId: string;
  houseNumber: string | null;
  hid: string | null;
}

/**
 * Release Workflow — Step 4 (complete). Resolves the handback inspection:
 *  - no damage  → house re-enters the Active pool (Vacant),
 *  - any damage → house stays out of the pool as `UnderMaintenance`
 *    (`Maintenance` occupancy) with the damage checklist mirrored onto the
 *    household record.
 * All writes — household status/damage, inspection resolution and the audit
 * entry — happen in one transaction.
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
      resolvedTo: true,
      householdId: true,
      allocationId: true,
      inspectorId: true,
      scheduledDate: true,
      photoUrls: true,
    },
  });
  if (!inspection) throw new NotFoundError("Inspection not found in this organization.");
  if (inspection.resolvedTo) {
    throw new ConflictError("This inspection is already completed.");
  }

  const household = await prisma.household.findFirst({
    where: { id: inspection.householdId, organizationId },
    select: { id: true, hid: true, houseNumber: true },
  });
  if (!household) throw new NotFoundError("Household not found for this inspection.");

  const damaged =
    checklist.window ||
    checklist.door ||
    checklist.waterPanel ||
    checklist.roof ||
    checklist.wall ||
    checklist.electricity;
  const resolvedTo: "Active" | "UnderMaintenance" = damaged
    ? "UnderMaintenance"
    : "Active";
  const completedAt = new Date();

  await prisma.$transaction(async (tx) => {
    const cas = await tx.houseInspection.updateMany({
      where: { id: inspectionId, resolvedTo: null },
      data: {
        checklistWindow: checklist.window,
        checklistDoor: checklist.door,
        checklistWaterPanel: checklist.waterPanel,
        checklistRoof: checklist.roof,
        checklistWall: checklist.wall,
        checklistElectricity: checklist.electricity,
        conditionNote: conditionNote ?? null,
        photoUrls: inspection.photoUrls,
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

    if (resolvedTo === "Active") {
      await tx.household.update({
        where: { id: household.id },
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
        where: { id: household.id },
        data: {
          status: "UnderMaintenance",
          occupancyStatus: "Maintenance",
          damageWindow: checklist.window,
          damageDoor: checklist.door,
          damageWaterPanel: checklist.waterPanel,
          damageRoof: checklist.roof,
          damageWall: checklist.wall,
          damageElectricity: checklist.electricity,
          damageNotes: conditionNote ?? null,
        },
      });
    }

    await createAuditLog({
      userId: decidedBy,
      action: AUDIT_ACTIONS.RELEASE,
      entity: AUDIT_ENTITIES.HOUSE_QUEUE,
      entityId: null,
      details: {
        step: "inspection_completed",
        inspectionId,
        inspectorId: inspection.inspectorId ?? null,
        scheduledDate: inspection.scheduledDate
          ? inspection.scheduledDate.toISOString().slice(0, 10)
          : null,
        resolvedTo,
        hid: household.hid,
        houseNumber: household.houseNumber,
        checklist,
        conditionNote: conditionNote ?? null,
      },
      tx,
    });
  });

  invalidateQueueAggregates(organizationId);

  return {
    inspectionId,
    resolvedTo,
    householdId: household.id,
    houseNumber: household.houseNumber,
    hid: household.hid,
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
  if (!employee) throw new NotFoundError("Employee not found in this organization.");

  const logs = await prisma.audit_logs.findMany({
    where: { entity: AUDIT_ENTITIES.HOUSE_QUEUE, entityId: employeeId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return logs;
}