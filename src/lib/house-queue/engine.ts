/**
 * House Queue engine — composes Engine A (priority) and Engine B (house
 * recommendation) elements into the live queue table.
 *
 * READ-ONLY. This is a pure computation over the three authoritative sources:
 *  - Employee Management (employees, via Employee model) — never duplicated,
 *  - House Hold Register (households, via Household model) — never duplicated,
 *  - the decision ledger (HouseAllocation) — only persisted decisions.
 *
 * Nothing in this module writes to the database. Every call recomputes the
 * whole queue so ranks, recommendations and availability always reflect the
 * current employee/house data plus the latest persisted decisions.
 *
 * Ordering: rows are grouped by job grade (higher grades first) and sorted by
 * Engine A rank within each grade. A grade filter or free-text search only
 * trims the *view*; rank and recommendation values stay cohort-true.
 */

import prisma from "@/lib/prisma";
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

/** Fetch all employee/household/allocation source data in parallel. */
async function fetchSourceData(organizationId: string) {
  const [employees, households, allocations] = await Promise.all([
    prisma.employee.findMany({
      where: { organizationId, employmentStatus: "active" },
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
  ]);

  return { employees, households, allocations };
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
  const { employees, households, allocations } =
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
  // Coarse grouping by job grade (the spec's Stage 1).
  // ---------------------------------------------------------------------
  const byGrade = new Map<number | null, EmployeeRow[]>();
  for (const emp of employees) {
    const key = emp.jobGrade ?? null;
    const bucket = byGrade.get(key) ?? [];
    bucket.push(emp);
    byGrade.set(key, bucket);
  }

  const gradesDesc = [...byGrade.keys()].sort((a, b) => {
    if (a === null) return 1; // ungraded cohort always last
    if (b === null) return -1;
    return b - a;
  });

  // Houses recommended to a higher-priority employee earlier in this same
  // pass — so each available house is recommended at most once.
  const recommendedThisPass = new Set<string>();

  const rows: HouseQueueRow[] = [];

  for (const grade of gradesDesc) {
    const cohort = byGrade.get(grade) ?? [];
    const category = houseCategoryForJobGrade(grade, bands);

    // -----------------------------------------------------------------
    // Engine A — priority ranking within this grade cohort.
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
    const scoreByEmployee = new Map(ranked.map((r) => [r.candidateId, r.score]));

    const candidatesPool = category ? housesByCategory.get(category) ?? [] : [];
    const inCohortOrder = [...cohort].sort(
      (a, b) =>
        (rankByEmployee.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (rankByEmployee.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );

    for (const emp of inCohortOrder) {
      const allocation = allocationByEmployee.get(emp.id);
      const persistedStatus = allocation?.status ?? null;

      let recommendedHouse:
        | { id: string; houseNumber: string; hid: string; locationName: string | null }
        | null = null;

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
          (h) =>
            !allocatedHouseIds.has(h.id) && !recommendedThisPass.has(h.id),
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
        houseCategory: category,
        mcdScore: category ? scoreByEmployee.get(emp.id) ?? null : null,
        priorityRank: category ? rankByEmployee.get(emp.id) ?? null : null,
        queueStatus,
        allocationStatus: persistedStatus,
        isAllocated: persistedStatus === "allocated",
        recommendedHouseId: recommendedHouse?.id ?? null,
        recommendedHouseNumber: recommendedHouse?.houseNumber ?? null,
        recommendedHid: recommendedHouse?.hid ?? null,
        recommendedLocation: recommendedHouse?.locationName ?? null,
        note: allocation?.reason ?? null,
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

  return { rows: displayed, gradeGroups, availability, summary };
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

function buildGradeGroups(rows: HouseQueueRow[]): GradeGroup[] {
  const map = new Map<number | null, GradeGroup>();
  for (const row of rows) {
    const key = row.jobGrade ?? null;
    const group = map.get(key) ?? {
      grade: key,
      category: row.houseCategory,
      total: 0,
      ready: 0,
      allocated: 0,
    };
    group.total += 1;
    if (row.queueStatus === "ready_for_allocation") group.ready += 1;
    if (row.queueStatus === "allocated") group.allocated += 1;
    map.set(key, group);
  }
  return [...map.values()].sort((a, b) => {
    if (a.grade === null) return 1;
    if (b.grade === null) return -1;
    return b.grade - a.grade;
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