/**
 * House Queue engine — composes Engine A (priority) and Engine B (house
 * recommendation) elements into the live queue table.
 *
 * READ-ONLY. This is a pure computation over the three authoritative sources:
 *  - Employee Management (employees, via Employee model) — never duplicated,
 *  - House Hold Register (households, via Household model) — never duplicated,
 *  - the decision ledger (HouseAllocation) — only persisted decisions.
 *
 * QUEUE ENTRY IS REQUEST-GATED. A fourth source — the live `HouseRequest`
 * rows — decides who is in the queue at all. An employee with no active request
 * is not scored, not ranked, not recommended to, and not returned by this
 * function. That is the whole point of the House Request page: the queue ranks
 * people who asked for a house, not a staff directory.
 *
 * Nothing in this module writes to the database. Every call recomputes the
 * whole queue so ranks, recommendations and availability always reflect the
 * current employee/house data plus the latest persisted decisions.
 *
 * Ordering: requesters are grouped into their JOB GRADE INTERVAL (Staff, A, B,
 * C, D, E — highest interval first) and scored by Engine A against everyone else
 * in that same interval, so the rank and score shown in a table are the ones the
 * engine produced. A grade filter or free-text search only trims the *view*; rank
 * and recommendation values stay cohort-true. The `gradeGroups` projection then
 * buckets the result into one table per interval.
 */

import prisma from "@/lib/prisma";
import { ACTIVE_HOUSE_REQUEST_STATUS } from "@/lib/house-requests/constants";
import {
  eligibilityBandsToJobGradeRules,
  houseCategoryForJobGrade,
} from "./eligibility";
import {
  scoreAndRankCohort,
  calculateServiceYears,
  type RankCohortCandidate,
} from "./mcda";
import { pickBestHouse } from "./recommendation";
import { deriveQueueStatus } from "./state";
import { getActiveConfig } from "./config/service";
import {
  DEFAULT_ENGINE_CONFIG,
  type EngineConfigPayload,
} from "./config/types";
import {
  HOUSE_CATEGORIES,
  type GradeGroup,
  type HouseAvailability,
  type HouseCategory,
  type HouseQueueQuery,
  type HouseQueueResult,
  type HouseQueueRow,
  type HouseQueueSummary,
} from "./types";

interface EmployeeRow {
  id: string;
  employeeNumber: string;
  firstname: string;
  lastname: string | null;
  jobGrade: number | null;
  gender: string | null;
  maritalStatus: string | null;
  disabilityStatus: boolean;
  hireDate: Date | null;
  familySize: number | null;
}

interface HouseholdRow {
  id: string;
  houseNumber: string;
  hid: string;
  houseType: string;
  rgType: string;
  locationName: string | null;
  status: string;
}

interface AllocationRow {
  id: string;
  employeeId: string;
  householdId: string | null;
  status: string;
  reason: string | null;
}

/** A live HouseRequest — the queue-entry ticket carried onto the row. */
interface RequestRow {
  id: string;
  employeeId: string;
  createdAt: Date;
}

/**
 * Resolve each employee's live request.
 *
 * There SHOULD be at most one active request per employee — the partial unique
 * index `house_requests_active_employee_key` guarantees it — but the index is a
 * database invariant, not a promise this read path makes to itself. Taking the
 * EARLIEST request per employee is the deterministic choice if that invariant is
 * ever violated by an out-of-band write (import, manual SQL): ranking and audit
 * must not depend on row order.
 */
export function pickEarliestRequestByEmployee(
  requests: readonly RequestRow[],
): Map<string, RequestRow> {
  const byEmployee = new Map<string, RequestRow>();
  for (const request of requests) {
    const existing = byEmployee.get(request.employeeId);
    if (!existing || request.createdAt < existing.createdAt) {
      byEmployee.set(request.employeeId, request);
    }
  }
  return byEmployee;
}

/**
 * Bucket rows into one table per JOB GRADE INTERVAL, in the central rule's own
 * order (Staff → A → B → C → D → E), with ungraded requesters trailing.
 *
 * The interval is the unit of competition because that is what Engine A ranks
 * over: everyone inside `12 – 14` is scored and ranked against each other, so a
 * table shows a genuine 1..n ordering and the MCDA scores have a real spread to
 * normalize against. Bucketing per individual job grade gives every one-person
 * grade its own "#1" and a score of 0, which is what made the queue unreadable.
 *
 * Empty intervals are omitted — the UI has no use for an empty table. A single
 * trailing `null` cohort collects requesters with no job grade, so a data gap
 * can never make a person disappear from the queue.
 *
 * `srNo` is documented as display-only and is renumbered 1..n WITHIN each
 * interval, so every table on the page reads 1, 2, 3.
 */
export function buildGradeGroups(rows: readonly HouseQueueRow[]): GradeGroup[] {
  const buckets = new Map<string, HouseQueueRow[]>();
  for (const row of rows) {
    const key = row.houseCategory ?? "";
    const bucket = buckets.get(key) ?? [];
    bucket.push(row);
    buckets.set(key, bucket);
  }

  const groups: GradeGroup[] = [];
  for (const category of HOUSE_CATEGORIES) {
    const bucket = buckets.get(category);
    if (!bucket || bucket.length === 0) continue;
    groups.push(summarizeGradeGroup(category, bucket));
  }

  // A published config may introduce a category the canonical register list
  // does not know. Never drop those people — append them after the known
  // intervals rather than silently losing them from the queue.
  for (const [key, bucket] of buckets) {
    if (key === "" || (HOUSE_CATEGORIES as readonly string[]).includes(key))
      continue;
    groups.push(summarizeGradeGroup(key as HouseCategory, bucket));
  }

  const ungraded = buckets.get("");
  if (ungraded && ungraded.length > 0) {
    groups.push(summarizeGradeGroup(null, ungraded));
  }

  return groups;
}

function summarizeGradeGroup(
  category: GradeGroup["category"],
  bucket: HouseQueueRow[],
): GradeGroup {
  return {
    // Display-only representative of the interval — the cohort spans a whole
    // grade range, so this is the first row's grade, not a group key.
    grade: bucket[0]?.jobGrade ?? null,
    category,
    total: bucket.length,
    ready: bucket.filter((r) => r.queueStatus === "ready_for_allocation")
      .length,
    allocated: bucket.filter((r) => r.isAllocated).length,
    rows: bucket.map((row, index) => ({ ...row, srNo: index + 1 })),
  };
}

/** Fetch all employee/household/allocation/request source data in parallel. */
async function fetchSourceData(organizationId: string) {
  const [employees, households, allocations, requests] = await Promise.all([
    prisma.employee.findMany({
      // Archived employees are excluded: a soft-deleted person must never be
      // scored into the house queue.
      where: { organizationId, employmentStatus: "active", deletedAt: null },
      select: {
        id: true,
        employeeNumber: true,
        firstname: true,
        lastname: true,
        jobGrade: true,
        gender: true,
        maritalStatus: true,
        disabilityStatus: true,
        hireDate: true,
        familySize: true,
      },
    }),
    prisma.household.findMany({
      where: { organizationId },
      select: {
        id: true,
        houseNumber: true,
        hid: true,
        houseType: true,
        rgType: true,
        locationName: true,
        status: true,
      },
    }),
    prisma.houseAllocation.findMany({
      where: { organizationId },
      select: {
        id: true,
        employeeId: true,
        householdId: true,
        status: true,
        reason: true,
      },
      // The ledger is historied: an employee may have many rows (terminated
      // history + one live). Newest first so `allocationByEmployee` resolves
      // the CURRENT decision thread.
      orderBy: { createdAt: "desc" },
    }),
    // Queue-entry gate. Only `submitted` requests admit an employee; a
    // fulfilled or cancelled request must not resurrect them into the queue.
    prisma.houseRequest.findMany({
      where: { organizationId, status: ACTIVE_HOUSE_REQUEST_STATUS },
      select: { id: true, employeeId: true, createdAt: true },
    }),
  ]);

  return { employees, households, allocations, requests };
}

/**
 * Effective config snapshot passed into the engine. `versionNumber` is
 * display/debug only. When omitted, the DEFAULT_ENGINE_CONFIG fallback is used
 * so unit tests that mock only employee/household/houseAllocation keep
 * passing.
 */
export interface EngineConfigSnapshot {
  payload: EngineConfigPayload;
  versionNumber: number;
}

export const DEFAULT_CONFIG_SNAPSHOT: EngineConfigSnapshot = {
  payload: DEFAULT_ENGINE_CONFIG,
  versionNumber: 0,
};

/**
 * Compute the live house queue for an organization.
 * Returns rows plus per-grade groups, per-category house availability and a
 * top-level summary.
 *
 * `config` accepts a versioned payload (weights / eligibility bands /
 * recommendation rules). It MUST be explicitly passed by callers that need the
 * live engine-config; the default keeps legacy behavior for pure tests.
 */
export async function computeHouseQueue(
  organizationId: string,
  query: HouseQueueQuery = {},
  config: EngineConfigSnapshot = DEFAULT_CONFIG_SNAPSHOT,
): Promise<HouseQueueResult> {
  const { employees, households, allocations, requests } =
    await fetchSourceData(organizationId);

  const weights = config.payload.weights;
  const rules = config.payload.recommendation;
  const bands = eligibilityBandsToJobGradeRules(
    config.payload.eligibilityBands,
  );

  const householdById = new Map<string, HouseholdRow>(
    households.map((h) => [h.id, h]),
  );
  const allocationByEmployee = new Map<string, AllocationRow>();
  for (const a of allocations) {
    const existing = allocationByEmployee.get(a.employeeId);
    if (!existing) allocationByEmployee.set(a.employeeId, a);
  }
  // House ids that are live-allocated to someone (kept out of the pool).
  const allocatedHouseIds = new Set(
    allocations
      .filter((a) => a.status === "allocated" && a.householdId)
      .map((a) => a.householdId as string),
  );

  // Active houses per category for Engine B.
  const housesByCategory = new Map<string, HouseholdRow[]>();
  for (const h of households) {
    if (h.status !== "Active") continue;
    const bucket = housesByCategory.get(h.houseType) ?? [];
    bucket.push(h);
    housesByCategory.set(h.houseType, bucket);
  }

  // ---------------------------------------------------------------------
  // QUEUE ENTRY GATE — only employees holding a live HouseRequest.
  // ---------------------------------------------------------------------
  const requestByEmployee = pickEarliestRequestByEmployee(requests);
  const requesters = employees.filter((emp) => requestByEmployee.has(emp.id));

  // ---------------------------------------------------------------------
  // Coarse grouping by JOB GRADE INTERVAL (the spec's Stage 1).
  //
  // The cohort is the band, not the individual grade: a grade 12 and a grade 13
  // both sit in `12 – 14` and must compete against each other, because that is
  // the table they are shown in. Ranking per exact grade produced a cohort of
  // one for every grade, so each table row read "#1" and every MCDA score read
  // 0.00 (min-max normalization has zero range in a one-person cohort).
  // ---------------------------------------------------------------------
  const byCategory = new Map<string | null, EmployeeRow[]>();
  for (const emp of requesters) {
    const key = houseCategoryForJobGrade(emp.jobGrade, bands);
    const bucket = byCategory.get(key) ?? [];
    bucket.push(emp);
    byCategory.set(key, bucket);
  }

  // Intervals in descending seniority, so Staff comes before A, A before B, and
  // so on. Driven by the ACTIVE config's bands (not a hardcoded list) so a
  // re-cut policy reorders the queue correctly. The ungraded cohort trails.
  const intervalsDesc = [...bands].sort((a, b) => b.minGrade - a.minGrade);
  const cohortOrder: Array<HouseCategory | null> = [];
  for (const band of intervalsDesc) {
    if (byCategory.has(band.category)) cohortOrder.push(band.category);
  }
  if (byCategory.has(null)) cohortOrder.push(null);

  // Houses recommended to a higher-priority employee earlier in this same
  // pass — so each available house is recommended at most once.
  const recommendedThisPass = new Set<string>();

  const rows: HouseQueueRow[] = [];

  for (const category of cohortOrder) {
    const cohort = byCategory.get(category) ?? [];

    // -----------------------------------------------------------------
    // Engine A — priority ranking within this grade INTERVAL.
    // -----------------------------------------------------------------
    const candidates: RankCohortCandidate[] = cohort.map((emp) => ({
      candidateId: emp.id,
      serviceYears: calculateServiceYears(emp.hireDate),
      maritalStatus: emp.maritalStatus,
      disabilityStatus: emp.disabilityStatus,
      gender: emp.gender,
      hireDate: emp.hireDate,
      employeeNumber: emp.employeeNumber,
    }));
    const ranked = scoreAndRankCohort(candidates, weights);
    const rankByEmployee = new Map(ranked.map((r) => [r.candidateId, r.rank]));
    const scoreByEmployee = new Map(
      ranked.map((r) => [r.candidateId, r.score]),
    );
    // Per-criterion contributions travel onto the row so the queue table can
    // show how the composite score was reached, criterion by criterion.
    const componentsByEmployee = new Map(
      ranked.map((r) => [r.candidateId, r.components]),
    );

    const candidatesPool = category
      ? (housesByCategory.get(category) ?? [])
      : [];
    const inCohortOrder = [...cohort].sort(
      (a, b) =>
        (rankByEmployee.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (rankByEmployee.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );

    for (const emp of inCohortOrder) {
      const allocation = allocationByEmployee.get(emp.id);
      const persistedStatus = allocation?.status ?? null;

      let recommendedHouse: {
        id: string;
        houseNumber: string;
        hid: string;
        locationName: string | null;
      } | null = null;

      // Allocated employees keep their persisted house as the recommendation
      // and are excluded from the live pool (the house is in allocatedHouseIds).
      if (persistedStatus === "allocated" && allocation.householdId) {
        const house = householdById.get(allocation.householdId);
        if (house) {
          recommendedHouse = {
            id: house.id,
            houseNumber: house.houseNumber,
            hid: house.hid,
            locationName: house.locationName,
          };
        }
      } else if (
        category &&
        persistedStatus !== "skipped" &&
        persistedStatus !== "deferred"
      ) {
        // Engine B — best available house for this employee this pass.
        const available = candidatesPool.filter(
          (h) => !allocatedHouseIds.has(h.id) && !recommendedThisPass.has(h.id),
        );
        const best = pickBestHouse(available, rules);
        if (best) {
          recommendedThisPass.add(best.id);
          recommendedHouse = {
            id: best.id,
            houseNumber: best.houseNumber,
            hid: best.hid,
            locationName: best.locationName,
          };
        }
      }

      const queueStatus = deriveQueueStatus({
        houseCategory: category,
        persistedStatus,
        hasAvailableHouse: recommendedHouse !== null,
      });

      rows.push({
        srNo: 0,
        employeeId: emp.id,
        employeeNumber: emp.employeeNumber,
        firstname: emp.firstname,
        lastname: emp.lastname,
        jobGrade: emp.jobGrade,
        gender: emp.gender,
        maritalStatus: emp.maritalStatus,
        disabilityStatus: emp.disabilityStatus,
        serviceYears: calculateServiceYears(emp.hireDate),
        hireDate: emp.hireDate ? emp.hireDate.toISOString() : null,
        familySize: emp.familySize,
        houseCategory: category,
        mcdScore: category ? (scoreByEmployee.get(emp.id) ?? null) : null,
        cohortSize: category ? cohort.length : 0,
        mcdComponents: category
          ? (componentsByEmployee.get(emp.id) ?? null)
          : null,
        priorityRank: category ? (rankByEmployee.get(emp.id) ?? null) : null,
        queueStatus,
        allocationStatus: persistedStatus,
        allocationId: allocation?.id ?? null,
        isAllocated: persistedStatus === "allocated",
        recommendedHouseId: recommendedHouse?.id ?? null,
        recommendedHouseNumber: recommendedHouse?.houseNumber ?? null,
        recommendedHid: recommendedHouse?.hid ?? null,
        recommendedLocation: recommendedHouse?.locationName ?? null,
        note: allocation?.reason ?? null,
        requestId: requestByEmployee.get(emp.id)!.id,
        requestSubmittedAt: requestByEmployee
          .get(emp.id)!
          .createdAt.toISOString(),
      });
    }
  }

  // ---------------------------------------------------------------------
  // Display filtering (view only — ranks stay cohort-true).
  // ---------------------------------------------------------------------
  let displayed = rows;
  if (query.grade !== undefined && query.grade !== null) {
    displayed = displayed.filter((r) => r.jobGrade === query.grade);
  }
  if (query.status && query.status !== "all") {
    displayed = displayed.filter((r) => r.queueStatus === query.status);
  }
  if (query.search) {
    const needle = query.search.trim().toLowerCase();
    if (needle) {
      displayed = displayed.filter(
        (r) =>
          r.employeeNumber.toLowerCase().includes(needle) ||
          r.firstname.toLowerCase().includes(needle) ||
          (r.lastname ?? "").toLowerCase().includes(needle),
      );
    }
  }

  displayed.forEach((row, index) => {
    row.srNo = index + 1;
  });

  const gradeGroups = buildGradeGroups(displayed);
  const availability = buildAvailability(households, allocatedHouseIds);
  const summary = buildSummary(displayed);

  return {
    rows: displayed,
    gradeGroups,
    availability,
    summary,
    mcdaWeights: weights,
  };
}

/**
 * Server entry point that always runs the engine against the CURRENT ACTIVE
 * engine-config version. Use everywhere the live queue is materialized for
 * real users (pages, GET routes, allocation snapshots, recompute).
 */
export async function computeHouseQueueWithActiveConfig(
  organizationId: string,
  query: HouseQueueQuery = {},
): Promise<HouseQueueResult> {
  const active = await getActiveConfig(organizationId);
  return computeHouseQueue(organizationId, query, {
    payload: active.payload,
    versionNumber: active.versionNumber,
  });
}

function buildAvailability(
  households: HouseholdRow[],
  allocatedHouseIds: ReadonlySet<string>,
): HouseAvailability[] {
  return HOUSE_CATEGORIES.map((category) => {
    const active = households.filter(
      (h) => h.houseType === category && h.status === "Active",
    );
    const allocated = active.filter((h) => allocatedHouseIds.has(h.id)).length;
    return {
      category,
      totalActive: active.length,
      allocated,
      available: active.length - allocated,
    };
  });
}

function buildSummary(rows: HouseQueueRow[]): HouseQueueSummary {
  return {
    totalEmployees: rows.length,
    eligibleCount: rows.filter((r) => r.houseCategory !== null).length,
    allocatedCount: rows.filter((r) => r.isAllocated).length,
    readyCount: rows.filter((r) => r.queueStatus === "ready_for_allocation")
      .length,
    noHouseCount: rows.filter((r) => r.queueStatus === "no_house_available")
      .length,
    notEligibleCount: rows.filter((r) => r.queueStatus === "not_eligible")
      .length,
  };
}
