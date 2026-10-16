/**
 * ENGINE A — MCDA-based employee priority ranking.
 *
 * Two-stage priority engine:
 *   1. Employees are grouped by job grade (the central rule decides each
 *      grade's house category — see `eligibility.ts`).
 *   2. Within each grade cohort a Weighted Sum Model (WSM) combines
 *      serviceYears, maritalStatus, disability and gender. Each attribute is
 *      min-max normalized to [0,1] within the cohort, then multiplied by its
 *      policy weight (`weights.ts`) and summed. The resulting composite score
 *      is in [0,1], higher = higher priority.
 *
 * Deterministic tie-breaking after an (approximately) equal score:
 *   1. higher composite score,
 *   2. more service years,
 *   3. earlier hire date,
 *   4. employee number (ascending, lexicographic), and
 *   5. stable input order — the sort is the only source of truth, so results
 *      are fully reproducible.
 *
 * `scoreAndRankCohort` returns the per-criterion `components` alongside the
 * composite score, so the queue can display the arithmetic behind a rank rather
 * than an unexplained number.
 *
 * Pure module: no prisma, no I/O, so Engine A is independently unit-testable.
 * Client-safe.
 */

import {
  MCDA_SCORE_EPSILON,
  MCDA_SCORE_GRANULARITY,
  MCDA_WEIGHTS,
  disabilityLevel,
  genderLevel,
  maritalStatusLevel,
} from "./weights";
import type { McdaWeights } from "./config/types";

/** Default weights object shape — accepts the module default or a config set. */
export type WeightsInput = McdaWeights;

export interface MCDACandidate {
  candidateId: string;
  serviceYears: number;
  maritalStatus?: string | null;
  disabilityStatus?: boolean | null;
  gender?: string | null;
}

export interface MCDAComponentScore {
  serviceYears: number;
  maritalStatus: number;
  disability: number;
  gender: number;
}

export interface MCDAScore {
  candidateId: string;
  /** Composite priority score in [0, 1]. */
  score: number;
  /** Per-criterion normalized contributions for transparency/debugging. */
  components: MCDAComponentScore;
}

/** Input needed for the deterministic tie-break chain. */
export interface RankableEntry {
  candidateId: string;
  score: number;
  serviceYears: number;
  hireDate?: Date | string | null;
  employeeNumber?: string | null;
}

export interface RankedEntry extends RankableEntry {
  /** 1-based rank within the cohort (1 = highest priority). */
  rank: number;
}

/** Normalize each score to the input that ties to the special "System" actor. */
export function roundScore(value: number): number {
  return Math.round(value / MCDA_SCORE_GRANULARITY) * MCDA_SCORE_GRANULARITY;
}

export function scoresEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= MCDA_SCORE_EPSILON;
}

/**
 * Min-max normalize values to [0,1]. A degenerate cohort (all values equal)
 * normalizes to 0 for every member — with a zero range there is no signal.
 * Empty input yields an empty array.
 */
export function normalizeMinMax(values: readonly number[]): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  return values.map((v) => (range === 0 ? 0 : (v - min) / range));
}

/**
 * Whole years elapsed since the hire date — the canonical service-years
 * helper. Shared with the whole UI (re-exported as `serviceYears` by
 * `house-format.ts`) so the number is always computed the same way.
 */
export function calculateServiceYears(
  hireDate: Date | string | null | undefined,
): number {
  if (!hireDate) return 0;
  const t = new Date(hireDate).getTime();
  if (!Number.isFinite(t)) return 0;
  const ms = Date.now() - t;
  if (ms <= 0) return 0;
  return Math.floor(ms / (365.25 * 24 * 60 * 60 * 1000));
}

/**
 * Stage 1 — compute the composite MCDA score for every candidate in a cohort.
 * `weights` overrides the module default so versioned engine configs can vary
 * the priority policy per organization.
 */
export function computeMCDAScores(
  candidates: readonly MCDACandidate[],
  weights: WeightsInput = MCDA_WEIGHTS,
): MCDAScore[] {
  const serviceYears = normalizeMinMax(candidates.map((c) => c.serviceYears));
  const maritalStatus = normalizeMinMax(
    candidates.map((c) => maritalStatusLevel(c.maritalStatus)),
  );
  const disability = normalizeMinMax(
    candidates.map((c) => disabilityLevel(c.disabilityStatus)),
  );
  const gender = normalizeMinMax(candidates.map((c) => genderLevel(c.gender)));

  return candidates.map((candidate, i) => {
    const components: MCDAComponentScore = {
      serviceYears: serviceYears[i],
      maritalStatus: maritalStatus[i],
      disability: disability[i],
      gender: gender[i],
    };
    const score = roundScore(
      components.serviceYears * weights.serviceYears +
        components.maritalStatus * weights.maritalStatus +
        components.disability * weights.disability +
        components.gender * weights.gender,
    );
    return { candidateId: candidate.candidateId, score, components };
  });
}

/** Deterministic comparator (see module docblock for the tie-break chain). */
export function compareCandidates(a: RankableEntry, b: RankableEntry): number {
  if (!scoresEqual(a.score, b.score)) return b.score - a.score;

  if (a.serviceYears !== b.serviceYears) {
    return b.serviceYears - a.serviceYears;
  }

  const aTime = a.hireDate ? new Date(a.hireDate).getTime() : Infinity;
  const bTime = b.hireDate ? new Date(b.hireDate).getTime() : Infinity;
  if (aTime !== bTime) return aTime - bTime;

  const aNum = String(a.employeeNumber ?? "");
  const bNum = String(b.employeeNumber ?? "");
  return aNum.localeCompare(bNum);
}

/**
 * Stage 2 — rank scored candidates within a cohort.
 * The comparator is the single source of truth, so the result is fully
 * deterministic even when scores tie.
 *
 * Generic in the entry type so extra fields (the per-criterion components) are
 * carried onto the ranked output instead of being dropped here.
 */
export function rankCandidates<T extends RankableEntry>(
  entries: readonly T[],
): Array<T & { rank: number }> {
  return [...entries]
    .sort(compareCandidates)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

/** Candidate that also carries the tie-break identity fields. */
export interface RankCohortCandidate extends MCDACandidate {
  hireDate?: Date | string | null;
  employeeNumber?: string | null;
}

/** A ranked candidate that still exposes WHY it scored what it scored. */
export interface RankedCandidate extends RankedEntry {
  /**
   * Per-criterion normalized contributions, each in [0, 1].
   *
   * Carried all the way to the queue row so the UI can show the arithmetic
   * behind the composite score instead of an unexplained number.
   */
  components: MCDAComponentScore;
}

/** Zeroed components — used only when a candidate id is missing from the score map. */
const ZERO_COMPONENTS: MCDAComponentScore = {
  serviceYears: 0,
  maritalStatus: 0,
  disability: 0,
  gender: 0,
};

/**
 * One-shot convenience: score then rank a full cohort by MCDA.
 *
 * The returned entries carry BOTH the composite score and the per-criterion
 * breakdown, so the queue table can show how the score was reached.
 */
export function scoreAndRankCohort(
  candidates: readonly RankCohortCandidate[],
  weights: WeightsInput = MCDA_WEIGHTS,
): RankedCandidate[] {
  const scores = computeMCDAScores(candidates, weights);
  const scoreByCandidate = new Map(scores.map((s) => [s.candidateId, s]));
  return rankCandidates(
    candidates.map((candidate) => {
      const scored = scoreByCandidate.get(candidate.candidateId);
      return {
        candidateId: candidate.candidateId,
        score: scored?.score ?? 0,
        components: scored?.components ?? ZERO_COMPONENTS,
        serviceYears: candidate.serviceYears,
        hireDate: candidate.hireDate,
        employeeNumber: candidate.employeeNumber,
      };
    }),
  );
}
