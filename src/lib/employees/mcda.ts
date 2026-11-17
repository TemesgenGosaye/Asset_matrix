/**
 * MCDA priority score for the Employee Register.
 *
 * The register shows a disability employee their MCDA priority score, so the
 * number on the row is produced by the SAME engine the House Queue uses:
 * `scoreAndRankCohort` from `src/lib/house-queue/mcda.ts`, the organization's
 * ACTIVE weights from the engine config, and the central job-grade → house
 * category rule from `src/lib/house-queue/eligibility.ts`.
 *
 * WHAT THE COHORT IS
 * The queue scores the employees who hold a live house request, because that is
 * the competition the queue answers. The register has no requests to gate on —
 * it lists the whole workforce — so the cohort here is the BAND of the LIVE
 * register: every employee in the same house band competes in the same
 * normalization, and an employee without a job grade forms the ungraded
 * cohort (the queue treats ungraded employees the same way).
 *
 * The score therefore answers "how strong is this employee's priority inside
 * their own band", which is the question a housing officer asks when they read
 * a disability on a record. It is deliberately NOT the queue rank: the queue
 * rank is request-gated and is read from the House Queue page.
 *
 * The score is only computed when the caller actually asks for an employee who
 * has a disability recorded, so a page with no disabled employee costs no
 * extra query.
 */

import prisma from "@/lib/prisma";
import { getActiveConfigPayload } from "@/lib/house-queue/config/service";
import {
  eligibilityBandsToJobGradeRules,
  houseCategoryForJobGrade,
} from "@/lib/house-queue/eligibility";
import {
  resolveServiceYears,
  scoreAndRankCohort,
  type RankCohortCandidate,
} from "@/lib/house-queue/mcda";
import type { HouseCategory } from "@/lib/house-queue/types";

/** Where one employee stands in their band. */
export interface EmployeeMcdaStanding {
  /** Composite priority score in [0, 1]; higher means higher priority. */
  score: number;
  /** 1-based position inside the employee's band cohort. */
  rank: number;
  /** How many employees compete in the same band. */
  cohortSize: number;
  /** The band the employee competes in; `null` when the grade is not set. */
  category: HouseCategory | null;
}

/**
 * The MCDA scores of the requested employees, keyed by employee id.
 *
 * Only the employees that need a score are loaded. The cohort is then read
 * once, band by band, and scored with the engine's own comparator so the
 * ranking is deterministic.
 */
export async function computeEmployeeMcdaScores(
  organizationId: string,
  employeeIds: readonly string[],
): Promise<Map<string, EmployeeMcdaStanding>> {
  const result = new Map<string, EmployeeMcdaStanding>();
  const wanted = [...new Set(employeeIds.filter((id) => id.length > 0))];
  if (wanted.length === 0) return result;

  const targets = await prisma.employee.findMany({
    where: {
      organizationId,
      id: { in: wanted },
      deletedAt: null,
    },
    select: { id: true, jobGrade: true },
  });
  if (targets.length === 0) return result;

  const payload = await getActiveConfigPayload(organizationId);
  const bands = eligibilityBandsToJobGradeRules(payload.eligibilityBands);

  // The bands the requested employees actually compete in.
  const categories = new Set<HouseCategory | null>();
  for (const target of targets) {
    categories.add(houseCategoryForJobGrade(target.jobGrade, bands));
  }

  // One query for every band involved, so the cohort is read once.
  const gradeFilters = bands
    .filter((rule) => categories.has(rule.category))
    .map((rule) => ({
      jobGrade: {
        gte: rule.minGrade,
        ...(rule.maxGrade === null ? {} : { lte: rule.maxGrade }),
      },
    }));

  const cohortRows = await prisma.employee.findMany({
    where: {
      organizationId,
      deletedAt: null,
      OR: [
        ...gradeFilters,
        ...(categories.has(null) ? [{ jobGrade: null }] : []),
      ],
    },
    select: {
      id: true,
      employeeNumber: true,
      jobGrade: true,
      gender: true,
      maritalStatus: true,
      disabilityStatus: true,
      serviceYears: true,
      profile: { select: { hireDate: true } },
    },
  });

  // Split the cohort by band: each band is normalized on its own.
  const byCategory = new Map<HouseCategory | null, typeof cohortRows>();
  for (const row of cohortRows) {
    const key = houseCategoryForJobGrade(row.jobGrade, bands);
    const bucket = byCategory.get(key) ?? [];
    bucket.push(row);
    byCategory.set(key, bucket);
  }

  for (const [category, cohort] of byCategory) {
    const candidates: RankCohortCandidate[] = cohort.map((row) => ({
      candidateId: row.id,
      serviceYears: resolveServiceYears(
        row.serviceYears,
        row.profile?.hireDate,
      ),
      maritalStatus: row.maritalStatus,
      disabilityStatus: row.disabilityStatus,
      gender: row.gender,
      hireDate: row.profile?.hireDate ?? null,
      employeeNumber: row.employeeNumber,
    }));

    const ranked = scoreAndRankCohort(candidates, payload.weights);
    for (const entry of ranked) {
      if (!wanted.includes(entry.candidateId)) continue;
      result.set(entry.candidateId, {
        score: entry.score,
        rank: entry.rank,
        cohortSize: cohort.length,
        category,
      });
    }
  }

  return result;
}
