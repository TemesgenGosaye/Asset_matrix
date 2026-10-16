/**
 * Engine A (priority) — MCDA weights and attribute level tables.
 *
 * Policy lives HERE, in one editable place:
 *  - the weight each attribute contributes to the composite score, and
 *  - the level a raw attribute value maps to before it is min-max normalized
 *    within the job-grade cohort.
 *
 * The weights are stored per-module so unit tests can prove they sum to 1 and
 * stay within [0, 1]. They apply to normalized [0,1] inputs, so the composite
 * score is always in [0, 1].
 */

/** Relative importance of each criterion (must sum to 1). */
export const MCDA_WEIGHTS = {
  /** Length of service in whole years — seniority. */
  serviceYears: 0.4,
  /** Marital status — household need (family vs single). */
  maritalStatus: 0.25,
  /** Disability — accessibility/priority need. */
  disability: 0.2,
  /** Gender — equal treatment by default; adjust levels below per policy. */
  gender: 0.15,
} as const;

/** Sum of all criterion weights (used by tests / self-check). */
export const MCDA_WEIGHTS_TOTAL = Object.values(MCDA_WEIGHTS).reduce(
  (sum, w) => sum + w,
  0,
);

function assertValidWeights(): void {
  if (Math.abs(MCDA_WEIGHTS_TOTAL - 1) > 1e-9) {
    throw new Error(
      `MCDA weights must sum to 1 (got ${MCDA_WEIGHTS_TOTAL}). Update src/lib/house-queue/weights.ts.`,
    );
  }
}
// Fail fast at import time if the policy table is accidentally misconfigured.
assertValidWeights();

/**
 * Two scores closer than this are considered a tie and fall through to the
 * deterministic tie-break chain. All scores are rounded to 1e-9 so equality
 * checks are stable.
 */
export const MCDA_SCORE_EPSILON = 1e-9;

/** Scores are rounded to this granularity before comparison. */
export const MCDA_SCORE_GRANULARITY = 1e-9;

// ---------------------------------------------------------------------------
// Criterion metadata (labels for the UI breakdown)
// ---------------------------------------------------------------------------

/** One criterion's identity, for rendering the score breakdown. */
export interface McdaCriterionMeta {
  key: "serviceYears" | "maritalStatus" | "disability" | "gender";
  /** Full name, used in the detail breakdown. */
  label: string;
  /** 1–2 character tag used in the compact table cell. */
  short: string;
  /** What the criterion measures, shown as help text. */
  description: string;
}

/**
 * Display metadata for the four criteria, in the same order as `MCDA_WEIGHTS`.
 *
 * Lives beside the weights on purpose: a new criterion must be added to the
 * weight table, the level table and this list together, so the UI can never
 * show a criterion the engine does not score (or omit one it does).
 */
export const MCDA_CRITERIA: readonly McdaCriterionMeta[] = [
  {
    key: "serviceYears",
    label: "Service years",
    short: "Sv",
    description: "Length of service in whole years — seniority.",
  },
  {
    key: "maritalStatus",
    label: "Marital status",
    short: "Ms",
    description:
      "Household need: married 3 · widowed 2 · divorced 1 · single 0.",
  },
  {
    key: "disability",
    label: "Disability",
    short: "Ds",
    description: "Recorded disability on the employee record (1 = yes).",
  },
  {
    key: "gender",
    label: "Gender",
    short: "Gn",
    description:
      "Equal by default — both levels score 1 unless policy sets otherwise.",
  },
] as const;

// ---------------------------------------------------------------------------
// Attribute level tables (raw value → 0..∞ level used for normalization)
// ---------------------------------------------------------------------------

/** Marital status levels — higher = larger household need. */
export const MARITAL_STATUS_LEVELS: Readonly<Record<string, number>> = {
  married: 3,
  widowed: 2,
  divorced: 1,
  single: 0,
};

export function maritalStatusLevel(value: string | null | undefined): number {
  if (!value) return 0;
  return MARITAL_STATUS_LEVELS[value.trim().toLowerCase()] ?? 0;
}

/**
 * Gender levels. Equal by default — set different values here if the local
 * housing policy ever prioritises one gender over the other.
 */
export const GENDER_LEVELS: Readonly<Record<string, number>> = {
  male: 1,
  female: 1,
};

export function genderLevel(value: string | null | undefined): number {
  if (!value) return 1;
  return GENDER_LEVELS[value.trim().toLowerCase()] ?? 1;
}

/** Level used for the disability criterion (1 = some, 0 = none). */
export function disabilityLevel(
  disabilityStatus: boolean | null | undefined,
): number {
  return disabilityStatus ? 1 : 0;
}
