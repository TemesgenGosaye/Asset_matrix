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

/**
 * Canonical house categories, derived from the same list used by the
 * House Hold Register (`HOUSE_TYPES`) so the two can never drift apart.
 */
export const HOUSE_CATEGORIES = HOUSE_TYPES;
export type HouseCategory = (typeof HOUSE_CATEGORIES)[number];

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
  /** Eligibility tier from the central grade→category rule (null = not eligible). */
  houseCategory: HouseCategory | null;
  /** Engine A (MCDA) score within the job-grade cohort (null when not ranked). */
  mcdScore: number | null;
  /** Engine A rank within the job-grade cohort (1 = highest priority). */
  priorityRank: number | null;
  queueStatus: string;
  /** Persisted decision status (allocated / skipped / deferred / released) or null. */
  allocationStatus: string | null;
  isAllocated: boolean;
  /** Engine B best available house for this employee right now. */
  recommendedHouseId: string | null;
  recommendedHouseNumber: string | null;
  recommendedHid: string | null;
  recommendedLocation: string | null;
  /** Reason attached to the last persisted decision (skip/defer/release/...). */
  note: string | null;
}

/** Per-grade rollup shown as the grouped table headings. */
export interface GradeGroup {
  grade: number | null;
  /** Eligibility tier for this grade (null for the ungraded cohort). */
  category: HouseCategory | null;
  total: number;
  ready: number;
  allocated: number;
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
  gradeGroups: GradeGroup[];
  availability: HouseAvailability[];
  summary: HouseQueueSummary;
}

export interface HouseQueueQuery {
  /** Restrict to a single job grade (display filter only; ranks stay cohort-true). */
  grade?: number | null;
  /** Free-text filter on name / employee number (display filter only). */
  search?: string;
  /** Filter by computed queue status. */
  status?: string;
}