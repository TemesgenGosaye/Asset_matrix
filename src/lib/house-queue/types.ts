/**
 * Shared DTOs for the House Queue engine.
 *
 * The queue is a READ-ONLY decision/ranking engine: it never creates,
 * duplicates or caches employee or household records. All data here is
 * recomputed live on every read from the authoritative sources (Employee
 * Management + House Hold Register) plus the `HouseAllocation` decision
 * ledger.
 */

import { HOUSE_TYPES } from "@/lib/household-constants";
import type { McdaWeights } from "./config/types";

/**
 * Canonical house categories, derived from the same list used by the
 * House Hold Register (`HOUSE_TYPES`) so the two can never drift apart.
 */
export const HOUSE_CATEGORIES = HOUSE_TYPES;
export type HouseCategory = (typeof HOUSE_CATEGORIES)[number];

/**
 * Per-criterion MCDA contributions, each normalized to [0, 1] WITHIN the cohort.
 *
 * Declared here rather than imported from `mcda.ts` on purpose: `mcda.ts`
 * imports the engine-config types, which import this file, so importing back
 * would close an import cycle. The shapes are structurally identical, so the
 * engine's `MCDAComponentScore` assigns to this without a cast.
 */
export interface McdaComponents {
  serviceYears: number;
  maritalStatus: number;
  disability: number;
  gender: number;
}

/** One computed row of the live queue table. */
export interface HouseQueueRow {
  /** Display-only auto-incrementing sequence number. */
  srNo: number;
  employeeId: string;
  employeeNumber: string;
  firstname: string;
  lastname: string | null;
  jobGrade: number | null;
  gender: string | null;
  maritalStatus: string | null;
  disabilityStatus: boolean;
  serviceYears: number;
  hireDate: string | null;
  /** Dependants on record, used as an MCDA band input. Null when not captured. */
  familySize: number | null;
  /** Eligibility tier from the central grade→category rule (null = not eligible). */
  houseCategory: HouseCategory | null;
  /** Engine A (MCDA) score within the job-grade cohort (null when not ranked). */
  mcdScore: number | null;
  /**
   * How many people shared this employee's Engine A cohort.
   *
   * MCDA normalizes each criterion min-max WITHIN the cohort, so a cohort of one
   * has zero range and every component — and therefore the score — is 0. The
   * rank is still correct (they are the only candidate), but the score carries
   * no information. The UI uses this to show "—" instead of a misleading `0.00`.
   */
  cohortSize: number;
  /**
   * The per-criterion arithmetic behind `mcdScore`, so the UI can show
   * `normalized × weight` per criterion instead of a bare composite number.
   * Null when the employee was not scored (no eligible band).
   */
  mcdComponents: McdaComponents | null;
  /** Engine A rank within the job-grade INTERVAL (1 = highest priority). */
  priorityRank: number | null;
  queueStatus: string;
  /** Persisted decision status (allocated / skipped / deferred / released) or null. */
  allocationStatus: string | null;
  /** Persisted allocation ID if any (e.g. allocated or RELEASE_PENDING row). */
  allocationId?: string | null;
  isAllocated: boolean;
  /** Engine B best available house for this employee right now. */
  recommendedHouseId: string | null;
  recommendedHouseNumber: string | null;
  recommendedHid: string | null;
  recommendedLocation: string | null;
  /** Reason attached to the last persisted decision (skip/defer/release/...). */
  note: string | null;
  /** The live HouseRequest that admitted this employee to the queue. */
  requestId: string;
  /** When that request was submitted, for FIFO/audit display. */
  requestSubmittedAt: string | null;
}

/**
 * ONE ENGINE A COHORT — every requester inside a single JOB GRADE INTERVAL —
 * plus the rows ranked inside it.
 *
 * A cohort is one of the central rule's grade intervals (Staff, A, B, C, D, E),
 * NOT an individual job grade. Two employees at grade 13 compete with each other
 * because both sit inside the 12–14 interval; the engine ranks them against
 * everyone else in that same interval, so the "Rank" column inside one table
 * reads 1, 2, 3 truthfully and the MCDA score has a real spread to normalize
 * against.
 *
 * Grouping by the exact grade instead (which the engine briefly did) split each
 * interval across several tables and stamped several rows "#1", because each
 * one-person grade cohort ranks itself first.
 *
 * `category` is null only for a requester with no job grade at all. They are
 * collected in one trailing group instead of being dropped, because a queue that
 * hides people is worse than a queue that shows an exception.
 */
export interface GradeGroup {
  /** Job grade represented, for display only — the cohort spans a whole interval. */
  grade: number | null;
  /** The grade interval this group is (null for the ungraded cohort). */
  category: HouseCategory | null;
  total: number;
  ready: number;
  allocated: number;
  /** Rows in Engine A rank order within this cohort; `srNo` renumbered 1..n. */
  rows: HouseQueueRow[];
}

/** Per-category house availability (live from the House Hold Register). */
export interface HouseAvailability {
  category: HouseCategory;
  totalActive: number;
  allocated: number;
  available: number;
}

export interface HouseQueueSummary {
  totalEmployees: number;
  eligibleCount: number;
  allocatedCount: number;
  readyCount: number;
  noHouseCount: number;
  notEligibleCount: number;
}

export interface HouseQueueResult {
  rows: HouseQueueRow[];
  /** Requesters bucketed per Engine A cohort (exact job grade) — one table each. */
  gradeGroups: GradeGroup[];
  availability: HouseAvailability[];
  summary: HouseQueueSummary;
  /**
   * The MCDA weights this result was computed with, i.e. the ACTIVE engine
   * config version — not the module defaults.
   *
   * Carried so the UI can show the exact arithmetic behind each score. Reading
   * the weights from the defaults instead would silently disagree with the
   * ranking the moment an admin published a different weight set.
   */
  mcdaWeights: McdaWeights;
}

export interface HouseQueueQuery {
  /** Restrict to a single job grade (display filter only; ranks stay cohort-true). */
  grade?: number | null;
  /** Free-text filter on name / employee number (display filter only). */
  search?: string;
  /** Filter by computed queue status. */
  status?: string;
}
