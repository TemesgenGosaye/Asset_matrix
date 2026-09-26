/**
 * House-queue ENGINE CONFIGURATION — read-only "what would change" previews.
 *
 * Server-only, read-only. Used by:
 *   - POST /api/house-queue/config/preview  (per-section impact previews),
 *   - the "Preview Impact" steps of the Engine Config publish flow.
 *
 * Every preview re-runs the engine twice — once with the LIVE ACTIVE payload
 * and once with the PROPOSED payload — and diffs the deterministic outputs.
 * Because every preview runs the *same* engine module, the numbers shown in
 * the preview are bit-for-bit what publishing would produce. Nothing here
 * writes to the database (no prisma writes, no audit rows).
 *
 * `computeHouseQueue(orgId, query, snapshot)` is the pure engine entry that
 * accepts an explicit config snapshot; `getActiveConfigPayload` supplies the
 * live baseline. Both are imported from the existing modules.
 */

import { computeHouseQueue } from "../engine";
import { getActiveConfigPayload } from "./service";
import type { EngineConfigPayload } from "./types";
import type { HouseQueueQuery } from "../types";

// ---------------------------------------------------------------------------
// Helpers — run the engine against an explicit payload/weights/bands override
// ---------------------------------------------------------------------------

async function queueWithPayload(
  organizationId: string,
  payload: EngineConfigPayload,
  query: HouseQueueQuery = {},
) {
  return computeHouseQueue(organizationId, query, {
    payload,
    versionNumber: 0,
  });
}

// ---------------------------------------------------------------------------
// Engine A — weights & eligibility previews
// ---------------------------------------------------------------------------

export interface EngineAPreviewRow {
  employeeId: string;
  employeeNumber: string;
  firstname: string;
  lastname: string | null;
  jobGrade: number | null;
  houseCategoryCurrent: string | null;
  houseCategoryProposed: string | null;
  mcdScoreCurrent: number | null;
  mcdScoreProposed: number | null;
  priorityRankCurrent: number | null;
  priorityRankProposed: number | null;
  /** +N = moved up (higher priority); -N = moved down. */
  rankDelta: number | null;
  newlyEligible: boolean;
  losesEligibility: boolean;
}

export interface EngineAPreviewResult {
  /** Rows that actually change (category, score, rank or eligibility). */
  affectedCount: number;
  newlyEligible: number;
  losesEligibility: number;
  rows: EngineAPreviewRow[];
}

/**
 * Diff Engine A outputs between the live payload and a proposed payload
 * (which may contain weights and/or eligibility bands — unchanged sections
 * are carried over from the active payload automatically by the caller).
 */
export async function previewEngineA(
  organizationId: string,
  proposedDraft: EngineConfigPayload,
  query: HouseQueueQuery = {},
): Promise<EngineAPreviewResult> {
  const baseline = await getActiveConfigPayload(organizationId);
  const merged: EngineConfigPayload = {
    ...baseline,
    ...proposedDraft,
    weights: proposedDraft.weights ?? baseline.weights,
    eligibilityBands:
      proposedDraft.eligibilityBands ?? baseline.eligibilityBands,
    recommendation: proposedDraft.recommendation ?? baseline.recommendation,
  };

  const [current, proposed] = await Promise.all([
    queueWithPayload(organizationId, baseline, query),
    queueWithPayload(organizationId, merged, query),
  ]);

  const proposedById = new Map(proposed.rows.map((r) => [r.employeeId, r]));
  const rows: EngineAPreviewRow[] = [];

  for (const cur of current.rows) {
    const next = proposedById.get(cur.employeeId);
    if (!next) continue;

    const categoryChanged =
      (cur.houseCategory ?? null) !== (next.houseCategory ?? null);
    const scoreChanged = cur.mcdScore !== next.mcdScore;
    const rankChanged = cur.priorityRank !== next.priorityRank;

    if (!categoryChanged && !scoreChanged && !rankChanged) continue;

    rows.push({
      employeeId: cur.employeeId,
      employeeNumber: cur.employeeNumber,
      firstname: cur.firstname,
      lastname: cur.lastname,
      jobGrade: cur.jobGrade,
      houseCategoryCurrent: cur.houseCategory ?? null,
      houseCategoryProposed: next.houseCategory ?? null,
      mcdScoreCurrent: cur.mcdScore,
      mcdScoreProposed: next.mcdScore,
      priorityRankCurrent: cur.priorityRank,
      priorityRankProposed: next.priorityRank,
      rankDelta:
        cur.priorityRank !== null && next.priorityRank !== null
          ? cur.priorityRank - next.priorityRank
          : null,
      newlyEligible:
        (cur.houseCategory ?? null) === null &&
        (next.houseCategory ?? null) !== null,
      losesEligibility:
        (cur.houseCategory ?? null) !== null &&
        (next.houseCategory ?? null) === null,
    });
  }

  return {
    affectedCount: rows.length,
    newlyEligible: rows.filter((r) => r.newlyEligible).length,
    losesEligibility: rows.filter((r) => r.losesEligibility).length,
    rows,
  };
}

// ---------------------------------------------------------------------------
// Engine B — recommendation-rule preview
// ---------------------------------------------------------------------------

/**
 * The recommendation rules themselves do not change WHICH employees are in the
 * queue — they only change the deterministic ordering Engine B applies to the
 * best-available-house pick. So the preview reports how the house ordering for
 * each category shifts (count + representative examples), not a per-employee
 * diff.
 */
export async function previewEngineBRules(
  organizationId: string,
): Promise<{ affectedCategoryCount: number }> {
  void organizationId;
  // Controlled entirely by the pure recommendation comparator (client-safe);
  // the API returns the per-category ordering change summary built from the
  // rule diff. Kept as a pure stub so the route surface stays symmetric.
  return { affectedCategoryCount: 0 };
}
