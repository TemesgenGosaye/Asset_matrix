/**
 * ────────────────────────────────────────────────────────────────────────────
 * CENTRAL JOB GRADE → HOUSE CATEGORY RULE   (SINGLE SOURCE OF TRUTH)
 * ────────────────────────────────────────────────────────────────────────────
 * This is the ONE place the business rule lives:
 *
 *     Job Grade                        House Category
 *     > 17                             →  Staff
 *     15 – 17                          →  A
 *     12 – 14                          →  B
 *     10 – 11                          →  C
 *     7 – 9                            →  D
 *     < 7 (1 – 6)                      →  E
 *     unset (null) / 0 / negative      →  not eligible
 *
 * Every consumer MUST call `houseCategoryForJobGrade(...)` instead of
 * re-implementing this mapping, so a single policy change updates the whole
 * portal (Engine A priority, Engine B recommendation, the queue table, the
 * Employee form eligibility hint and all tests).
 *
 * Client-safe: no server-only imports (prisma, next/server, …) so this module
 * can be bundled into client components.
 */

import type { HouseCategory } from "./types";
import type { EligibilityBand } from "./config/types";

export interface JobGradeRule {
  category: HouseCategory;
  /** Lowest grade (inclusive) covered by this tier. */
  minGrade: number;
  /** Highest grade (inclusive), or null when unbounded (18…∞). */
  maxGrade: number | null;
}

/** Order matters for display and legend only; tiers are disjoint. */
export const JOB_GRADE_HOUSE_RULES: readonly JobGradeRule[] = [
  { category: "Staff", minGrade: 18, maxGrade: null }, // > 17
  { category: "A", minGrade: 15, maxGrade: 17 },
  { category: "B", minGrade: 12, maxGrade: 14 },
  { category: "C", minGrade: 10, maxGrade: 11 },
  { category: "D", minGrade: 7, maxGrade: 9 },
  { category: "E", minGrade: 1, maxGrade: 6 },
] as const;

/** Convert engine-config band rows (config payload) into lookup rules. */
export function eligibilityBandsToJobGradeRules(
  bands: readonly EligibilityBand[],
): JobGradeRule[] {
  return bands.map((b) => ({
    category: b.category,
    minGrade: b.gradeMin,
    maxGrade: b.gradeMax,
  }));
}

/**
 * Resolve a job grade to its house category.
 * Returns `null` when the grade is unset, zero, negative or NaN (not eligible).
 * `bands` defaults to the central `JOB_GRADE_HOUSE_RULES` so existing
 * callers/tests keep passing unchanged; versioned configs pass their own.
 */
export function houseCategoryForJobGrade(
  grade: number | string | null | undefined,
  bands: readonly JobGradeRule[] = JOB_GRADE_HOUSE_RULES,
): HouseCategory | null {
  if (grade === null || grade === undefined || grade === "") return null;
  const g = typeof grade === "number" ? grade : Number(grade);
  if (!Number.isFinite(g)) return null;
  for (const rule of bands) {
    if (rule.maxGrade === null) {
      if (g >= rule.minGrade) return rule.category;
    } else if (g >= rule.minGrade && g <= rule.maxGrade) {
      return rule.category;
    }
  }
  return null;
}

/** True when the grade qualifies for a house under the central rule. */
export function isEligibleForHouse(
  grade: number | string | null | undefined,
  bands: readonly JobGradeRule[] = JOB_GRADE_HOUSE_RULES,
): boolean {
  return houseCategoryForJobGrade(grade, bands) !== null;
}

/** Human-readable range for a rule, e.g. `> 17` or `15 – 17`. */
export function jobGradeRangeLabel(rule: JobGradeRule): string {
  if (rule.maxGrade === null) return `> ${rule.minGrade - 1}`;
  if (rule.minGrade === rule.maxGrade) return `${rule.minGrade}`;
  return `${rule.minGrade} – ${rule.maxGrade}`;
}

/**
 * The job-grade range that maps to a house category, e.g. `B` → `12 – 14`.
 *
 * Used wherever the UI shows a category badge next to the concrete cohort it
 * covers, so an allocator can see at a glance that "Band B" and "job grade 13"
 * are the same rule stated two ways. Returns null for an unmapped category
 * (including a re-cut config that no longer covers it).
 */
export function jobGradeBandLabel(
  category: string | null | undefined,
  bands: readonly JobGradeRule[] = JOB_GRADE_HOUSE_RULES,
): string | null {
  if (!category) return null;
  const rule = bands.find((r) => r.category === category);
  if (!rule) return null;
  return `job grades ${jobGradeRangeLabel(rule)}`;
}

/**
 * One-line eligibility legend, e.g. `> 17 → Staff · 15 – 17 → A · …`.
 * Used by the Employee form so the hint can never drift from the rule.
 */
export function houseCategoryLegend(): string {
  return JOB_GRADE_HOUSE_RULES.map(
    (rule) => `${jobGradeRangeLabel(rule)} → ${rule.category}`,
  ).join("  ·  ");
}
