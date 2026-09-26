/**
 * House Queue engine configuration — validation contracts.
 *
 * Mirrors spec §2. Every check is server-side and pure (no I/O) so it can be
 * unit-tested and shared by the draft-save route and the publish route. API
 * route schemas (zod) cover shape/typing; THIS module enforces the business
 * invariants that a generic zod schema cannot (weight sums, band
 * contiguity, recommendation rule values).
 */

import {
  ELIGIBILITY_GRADE_ZERO_INVARIANT,
  MCDA_SINGLE_WEIGHT_CAP,
  type EligibilityBand,
  type EngineConfigPayload,
  type HouseNumberSortMode,
  type LocationSortDirection,
  type McdaWeights,
  type RecommendationRules,
} from "./types";
import { HOUSE_TYPES } from "@/lib/household-constants";

export const WEIGHT_SUM_EPSILON = 1e-6;

// ---------------------------------------------------------------------------
// 2.1 MCDA weights
// ---------------------------------------------------------------------------

export function validateWeights(weights: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const keys: (keyof McdaWeights)[] = [
    "serviceYears",
    "maritalStatus",
    "disability",
    "gender",
  ];

  for (const key of keys) {
    const value = weights[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      errors.push(`weights.${key} must be a finite number`);
      continue;
    }
    if (value < 0 || value > 1) {
      errors.push(`weights.${key} must be between 0 and 1 (got ${value})`);
    }
    if (value > MCDA_SINGLE_WEIGHT_CAP) {
      errors.push(
        `weights.${key} (${value}) exceeds the single-criterion cap of ${MCDA_SINGLE_WEIGHT_CAP}. A policy override + reason is required.`,
      );
    }
  }

  const total = keys.reduce(
    (sum, key) => sum + (weights[key] as number) || 0,
    0,
  );
  if (Math.abs(total - 1) > WEIGHT_SUM_EPSILON) {
    errors.push(
      `weights must sum to 1 (±${WEIGHT_SUM_EPSILON}); got ${total.toFixed(6)}`,
    );
  }

  return errors;
}

// ---------------------------------------------------------------------------
// 2.2 Eligibility bands
// ---------------------------------------------------------------------------

const isValidBand = (band: Record<string, unknown>): boolean => {
  const category = band.category as unknown;
  return (
    HOUSE_TYPES.includes(category as (typeof HOUSE_TYPES)[number]) &&
    typeof band.gradeMin === "number" &&
    typeof band.gradeMax === "number"
  );
};

/**
 * Bands must be contiguous and non-overlapping across the full valid grade
 * range (1–17+). Grade 0/unset is never eligible — rejected as a system
 * invariant. Empty lists are allowed only if they mean "nobody is eligible";
 * for safety an empty band list is treated as an error because it silently
 * disables housing.
 */
export function validateEligibilityBands(bands: unknown[]): string[] {
  const errors: string[] = [];
  if (!Array.isArray(bands)) return ["eligibilityBands must be an array"];

  if (bands.length === 0) {
    return [
      "eligibilityBands is empty — this silently makes every employee ineligible. At least one band is required.",
    ];
  }

  const parsed: EligibilityBand[] = [];
  for (let i = 0; i < bands.length; i++) {
    const band = bands[i] as Record<string, unknown> | null;
    if (!band || typeof band !== "object") {
      errors.push(`eligibilityBands[${i}] must be an object`);
      continue;
    }
    const { category, gradeMin, gradeMax } = band as Record<string, unknown>;
    if (!HOUSE_TYPES.includes(category as (typeof HOUSE_TYPES)[number])) {
      errors.push(
        `eligibilityBands[${i}].category must be one of ${HOUSE_TYPES.join(", ")}`,
      );
      continue;
    }
    if (
      typeof gradeMin !== "number" ||
      !Number.isInteger(gradeMin) ||
      gradeMin < 1
    ) {
      errors.push(
        `eligibilityBands[${i}].gradeMin must be an integer >= 1. ${ELIGIBILITY_GRADE_ZERO_INVARIANT}`,
      );
      continue;
    }
    if (gradeMax !== null) {
      if (typeof gradeMax !== "number" || !Number.isInteger(gradeMax)) {
        errors.push(
          `eligibilityBands[${i}].gradeMax must be an integer or null`,
        );
        continue;
      }
      if (gradeMax < gradeMin) {
        errors.push(
          `eligibilityBands[${i}] has gradeMax (${gradeMax}) below gradeMin (${gradeMin})`,
        );
        continue;
      }
    }
    parsed.push({ category, gradeMin, gradeMax } as EligibilityBand);
  }

  if (errors.length > 0) return errors;

  // Contiguity check: sort by gradeMin, normalize gradeMax:null → very large
  // number, and verify no gaps and no overlaps.
  const sorted = [...parsed].sort((a, b) => a.gradeMin - b.gradeMin);
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    const currentTop = current.gradeMax ?? Number.MAX_SAFE_INTEGER;
    if (next.gradeMin <= currentTop) {
      errors.push(
        `eligibilityBands overlap between ${current.category} (${current.gradeMin}–${currentTop === Number.MAX_SAFE_INTEGER ? "∞" : currentTop}) and ${next.category} (starting at ${next.gradeMin}). Bands must not overlap.`,
      );
    }
    if (next.gradeMin > currentTop + 1) {
      errors.push(
        `eligibilityBands have a gap between ${current.category} (ends ${currentTop === Number.MAX_SAFE_INTEGER ? "∞" : currentTop}) and ${next.category} (starts ${next.gradeMin}). Grades ${currentTop + 1}–${next.gradeMin - 1} would be silently ineligible.`,
      );
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// 2.3 Recommendation rules
// ---------------------------------------------------------------------------

export function validateRecommendationRules(
  rules: Record<string, unknown>,
): string[] {
  const errors: string[] = [];
  const { preferRegularOverGuest, locationSortDirection, houseNumberSortMode } =
    rules as Record<string, unknown>;

  if (typeof preferRegularOverGuest !== "boolean") {
    errors.push("recommendation.preferRegularOverGuest must be a boolean");
  }
  if (locationSortDirection !== "asc" && locationSortDirection !== "desc") {
    errors.push("recommendation.locationSortDirection must be 'asc' or 'desc'");
  }
  if (
    houseNumberSortMode !== "numeric_aware" &&
    houseNumberSortMode !== "lexical"
  ) {
    errors.push(
      "recommendation.houseNumberSortMode must be 'numeric_aware' or 'lexical'",
    );
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Full payload
// ---------------------------------------------------------------------------

/**
 * Validate a full config payload. Returns a list of dotted-path error strings
 * (empty = valid). `partial` allows weight/band/... objects to be validated in
 * isolation before a draft save (per-section edits).
 */
export function validateEngineConfigPayload(
  payload: Partial<EngineConfigPayload>,
): string[] {
  const errors: string[] = [];

  const validateIfPresent = <T>(
    section: keyof EngineConfigPayload,
    value: T | undefined,
    fn: (v: T) => string[],
  ) => {
    if (value === undefined) return;
    errors.push(...fn(value));
  };

  validateIfPresent("weights", payload.weights as never, (w: unknown) =>
    validateWeights(w as Record<string, unknown>),
  );
  validateIfPresent(
    "eligibilityBands",
    payload.eligibilityBands as never,
    (b: unknown) => validateEligibilityBands(b as unknown[]),
  );
  validateIfPresent(
    "recommendation",
    payload.recommendation as never,
    (r: unknown) => validateRecommendationRules(r as Record<string, unknown>),
  );

  return errors;
}

/** Type re-exports for route schemas / consumers beyond types.ts. */
export type {
  EligibilityBand,
  HouseNumberSortMode,
  LocationSortDirection,
  RecommendationRules,
};
