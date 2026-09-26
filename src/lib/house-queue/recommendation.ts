/**
 * ENGINE B — best-available-house recommendation.
 *
 * Pure selection logic lives here (`pickBestHouse` / `compareHouses`); the
 * async `recommendBestHouse` wrapper pulls the candidate pool from the House
 * Hold Register (the authoritative house source) and returns `null` when the
 * category has no available house.
 *
 * Candidate pool = active households whose `houseType` equals the employee's
 * eligibility category (from `eligibility.ts`), minus houses already
 * allocated through the decision ledger, minus houses already recommended to a
 * higher-priority employee in the same pass.
 *
 * Deterministic ranking:
 *   1. Regular houses before Guest houses,
 *   2. location name (ascending, case-insensitive),
 *   3. numeric house-number suffix (ascending, e.g. A10 before A2's lexicographic order is corrected to 2),
 *   4. house ID (ascending) — final anchor.
 *
 * Pure functions are client-safe; the prisma-backed helper is server-only.
 */

import prisma from "@/lib/prisma";
import type { Household } from "@prisma/client";
import type { HouseCategory } from "./types";
import {
  DEFAULT_RECOMMENDATION_RULES,
  type RecommendationRules,
} from "./config/types";

export interface HouseCandidate {
  id: string;
  houseNumber: string;
  hid: string;
  houseType: string;
  rgType: string;
  locationName?: string | null;
  status: string;
}

export interface RecommendedHouse {
  id: string;
  houseNumber: string;
  hid: string;
  rgType: string;
  locationName: string | null;
  houseType: string;
}

type HouseRow = Pick<
  Household,
  "id" | "houseNumber" | "hid" | "houseType" | "rgType" | "locationName" | "status"
>;

/** Extract the trailing numeric part of a house number (A10 → 10, SA3 → 3). */
export function houseNumberNumeric(houseNumber: string): number {
  const match = houseNumber.trim().match(/(\d+)$/);
  return match ? Number.parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
}

/**
 * Compare two houses by the deterministic Engine B ordering.
 * `rules` default preserves the historical behavior, so existing tests and
 * callers see no change unless an explicit ruleset is supplied.
 */
export function compareHouses(
  a: HouseCandidate,
  b: HouseCandidate,
  rules: RecommendationRules = DEFAULT_RECOMMENDATION_RULES,
): number {
  if (rules.preferRegularOverGuest) {
    const regularA = a.rgType.trim().toLowerCase() === "regular" ? 0 : 1;
    const regularB = b.rgType.trim().toLowerCase() === "regular" ? 0 : 1;
    if (regularA !== regularB) return regularA - regularB;
  }

  const locA = (a.locationName ?? "").trim().toLowerCase();
  const locB = (b.locationName ?? "").trim().toLowerCase();
  const locCompare = locA.localeCompare(locB);
  if (locCompare !== 0) {
    return rules.locationSortDirection === "asc" ? locCompare : -locCompare;
  }

  if (rules.houseNumberSortMode === "lexical") {
    const cmp = a.houseNumber.localeCompare(b.houseNumber, undefined, {
      numeric: false,
    });
    if (cmp !== 0) return cmp;
  } else {
    const numA = houseNumberNumeric(a.houseNumber);
    const numB = houseNumberNumeric(b.houseNumber);
    if (numA !== numB) return numA - numB;
  }

  return a.hid.localeCompare(b.hid);
}

/** Pick the best available house from a candidate set (deterministic). */
export function pickBestHouse(
  houses: readonly HouseCandidate[],
  rules: RecommendationRules = DEFAULT_RECOMMENDATION_RULES,
): HouseCandidate | null {
  if (houses.length === 0) return null;
  const [best] = [...houses].sort((a, b) => compareHouses(a, b, rules));
  return best;
}

export interface RecommendOptions {
  organizationId: string;
  houseType: HouseCategory | string;
  /** House ids that must be excluded (already allocated / already recommended). */
  excludeHouseIds: ReadonlySet<string>;
  /** Effective recommendation rules from the active engine config. */
  rules?: RecommendationRules;
}

/**
 * Find the best available house of a category: query the House Hold Register
 * for active houses, drop the excluded ones, and apply the deterministic
 * Engine B ordering. Returns `null` when no house is available.
 */
export async function recommendBestHouse(
  options: RecommendOptions,
): Promise<RecommendedHouse | null> {
  const houses = await prisma.household.findMany({
    where: {
      organizationId: options.organizationId,
      houseType: options.houseType,
      status: "Active",
    },
    select: {
      id: true,
      houseNumber: true,
      hid: true,
      houseType: true,
      rgType: true,
      locationName: true,
      status: true,
    },
  });

  const available = houses.filter(
    (house) => !options.excludeHouseIds.has(house.id),
  );
  const best = pickBestHouse(
    available as HouseRow[],
    options.rules ?? DEFAULT_RECOMMENDATION_RULES,
  );
  if (!best) return null;

  return {
    id: best.id,
    houseNumber: best.houseNumber,
    hid: best.hid,
    rgType: best.rgType,
    locationName: best.locationName,
    houseType: best.houseType,
  };
}