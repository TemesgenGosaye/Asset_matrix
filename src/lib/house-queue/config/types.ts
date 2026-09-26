/**
 * House Queue engine configuration — shared types and defaults.
 *
 * Client-safe: no server-only imports, so the payload shapes can cross the
 * server/client boundary (the Engine Config page) and be consumed by the
 * pure engine modules (`eligibility`, `weights`, `mcda`, `recommendation`).
 *
 * The payload is versioned (`EngineConfigVersion`). The DEFAULT_* constants
 * below are the seed values for v1 of every organization and the fallback
 * whenever an explicit config is not threaded through.
 */

import type { HouseCategory } from "@/lib/house-queue/types";

// ---------------------------------------------------------------------------
// 2.1 MCDA weights
// ---------------------------------------------------------------------------

export interface McdaWeights {
  serviceYears: number;
  maritalStatus: number;
  disability: number;
  gender: number;
}

/** Seed / default weights — matches the historical `weights.ts` policy. */
export const DEFAULT_MCDA_WEIGHTS: McdaWeights = {
  serviceYears: 0.4,
  maritalStatus: 0.25,
  disability: 0.2,
  gender: 0.15,
};

/** A single weight beyond this requires an explicit override (see validation). */
export const MCDA_SINGLE_WEIGHT_CAP = 0.7;

// ---------------------------------------------------------------------------
// 2.2 Eligibility bands (job grade → house category)
// ---------------------------------------------------------------------------

export interface EligibilityBand {
  category: HouseCategory;
  /** Lowest grade (inclusive) covered by this band. Must be >= 1. */
  gradeMin: number;
  /** Highest grade (inclusive), or null when unbounded (e.g. 18…∞). */
  gradeMax: number | null;
}

/** Seed / default bands — mirrors the central rule in `eligibility.ts`. */
export const DEFAULT_ELIGIBILITY_BANDS: readonly EligibilityBand[] = [
  { category: "Staff", gradeMin: 18, gradeMax: null }, // > 17
  { category: "A", gradeMin: 15, gradeMax: 17 },
  { category: "B", gradeMin: 12, gradeMax: 14 },
  { category: "C", gradeMin: 10, gradeMax: 11 },
  { category: "D", gradeMin: 7, gradeMax: 9 },
  { category: "E", gradeMin: 1, gradeMax: 6 },
];

/** Grade 0 / null is always "not eligible" — a system invariant, not configurable. */
export const ELIGIBILITY_GRADE_ZERO_INVARIANT =
  "Job grade 0 (and unset grades) are never eligible for a house. This cannot be configured.";

// ---------------------------------------------------------------------------
// 2.3 Recommendation rules
// ---------------------------------------------------------------------------

export type LocationSortDirection = "asc" | "desc";
export type HouseNumberSortMode = "numeric_aware" | "lexical";

export interface RecommendationRules {
  preferRegularOverGuest: boolean;
  locationSortDirection: LocationSortDirection;
  houseNumberSortMode: HouseNumberSortMode;
}

export const DEFAULT_RECOMMENDATION_RULES: RecommendationRules = {
  preferRegularOverGuest: true,
  locationSortDirection: "asc",
  houseNumberSortMode: "numeric_aware",
};

// ---------------------------------------------------------------------------
// Full payload + section metadata
// ---------------------------------------------------------------------------

export interface EngineConfigPayload {
  weights: McdaWeights;
  eligibilityBands: EligibilityBand[];
  recommendation: RecommendationRules;
}

export const DEFAULT_ENGINE_CONFIG: EngineConfigPayload = {
  weights: DEFAULT_MCDA_WEIGHTS,
  eligibilityBands: [...DEFAULT_ELIGIBILITY_BANDS],
  recommendation: DEFAULT_RECOMMENDATION_RULES,
};

export type BlastRadius = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type EngineConfigSection = keyof EngineConfigPayload;

export interface EngineConfigSectionMeta {
  key: EngineConfigSection;
  label: string;
  description: string;
  blastRadius: BlastRadius;
  /** False = direct save, no preview/death ceremony required. */
  previewRequiredBeforePublish: boolean;
  /** True = admin-only publish (weights/eligibility/retention per spec 3). */
  adminOnlyPublish: boolean;
}

/** Order defines the tab order on the Engine Config page. */
export const ENGINE_CONFIG_SECTIONS: readonly EngineConfigSectionMeta[] = [
  {
    key: "weights",
    label: "MCDA Weights",
    description: "Engine A criterion weights — reorders every active cohort.",
    blastRadius: "HIGH",
    previewRequiredBeforePublish: true,
    adminOnlyPublish: true,
  },
  {
    key: "eligibilityBands",
    label: "Eligibility Bands",
    description:
      "Job grade → house category mapping. Changes who is eligible at all.",
    blastRadius: "CRITICAL",
    previewRequiredBeforePublish: true,
    adminOnlyPublish: true,
  },
  {
    key: "recommendation",
    label: "Recommendation Rules",
    description:
      "Engine B ordering preferences within an already-eligible pool.",
    blastRadius: "LOW",
    previewRequiredBeforePublish: false,
    adminOnlyPublish: false,
  },
];

export function sectionMeta(
  section: EngineConfigSection,
): EngineConfigSectionMeta {
  return ENGINE_CONFIG_SECTIONS.find((s) => s.key === section)!;
}

/** Sections touched by a draft diff, for the sticky "unsaved changes" footer. */
export function diffSections(
  active: EngineConfigPayload,
  draft: EngineConfigPayload,
): EngineConfigSection[] {
  return ENGINE_CONFIG_SECTIONS.filter(
    (s) => JSON.stringify(active[s.key]) !== JSON.stringify(draft[s.key]),
  ).map((s) => s.key);
}

/** True when any of the given sections require admin-only publish / re-auth. */
export function includesAdminOnlySection(
  sections: readonly EngineConfigSection[],
): boolean {
  return sections.some((s) => sectionMeta(s).adminOnlyPublish);
}
