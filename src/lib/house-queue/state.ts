/**
 * House Queue allocation state machine + status derivation.
 *
 * Two status vocabularies, deliberately separated:
 *
 *  - PERSISTED statuses live in the `HouseAllocation` decision ledger and
 *    survive recomputation (allocated / skipped / deferred / released).
 *  - DERIVED statuses are recomputed on every read by the engine. Both
 *    vocabularies share the `AllocationStatus` type.
 *
 * The queue table shows the *derived* status: an employee only shows
 * `allocated` when the ledger says so; otherwise eligibility + house
 * availability (from the live engines) decide between
 * `ready_for_allocation` and `no_house_available`.
 *
 * Client-safe.
 */

export const ALLOCATION_STATUSES = [
  "not_eligible",
  "waiting",
  "no_house_available",
  "ready_for_allocation",
  "allocated",
  "skipped",
  "deferred",
  "released",
  "terminated",
] as const;
export type AllocationStatus = (typeof ALLOCATION_STATUSES)[number];

/** Statuses that are written to the `HouseAllocation` ledger. */
export const PERSISTED_ALLOCATION_STATUSES = [
  "allocated",
  "skipped",
  "deferred",
  "released",
  "terminated",
] as const;
export type PersistedAllocationStatus = (typeof PERSISTED_ALLOCATION_STATUSES)[number];

/** Statuses that are purely computed live and never persisted. */
const DERIVED_ALLOCATION_STATUSES: readonly AllocationStatus[] = [
  "not_eligible",
  "waiting",
  "no_house_available",
  "ready_for_allocation",
];

/**
 * Allowed explicit transitions (the row-action flows the UI exposes):
 *  - anything except a live allocation → APPROVE / REASSIGN (→ `allocated`)
 *  - allocated → RELEASE (→ `released`)
 *  - anything except a live allocation → SKIP / DEFER
 *  - a skipped / deferred / released thread can be reactivated (→ goes back
 *    to being recomputed, i.e. `ready_for_allocation` / `no_house_available`
 *    / `not_eligible`)
 */
export const ALLOCATION_TRANSITIONS: Readonly<
  Record<AllocationStatus, readonly AllocationStatus[]>
> = {
  not_eligible: ["allocated", "skipped", "deferred"],
  waiting: ["allocated", "skipped", "deferred"],
  no_house_available: ["allocated", "skipped", "deferred"],
  ready_for_allocation: ["allocated", "skipped", "deferred"],
  allocated: ["released", "terminated"],
  skipped: ["allocated", "released", "ready_for_allocation"],
  deferred: ["allocated", "released", "ready_for_allocation"],
  released: ["allocated", "skipped", "deferred", "ready_for_allocation"],
  /** A terminated (reason-coded release) thread can be reactivated later. */
  terminated: ["allocated", "skipped", "deferred", "ready_for_allocation"],
};

export function isPersistedStatus(
  status: string | null | undefined,
): status is PersistedAllocationStatus {
  return (
    PERSISTED_ALLOCATION_STATUSES as readonly string[]
  ).includes(status ?? "");
}

export function isAllocated(status: string | null | undefined): boolean {
  return status === "allocated";
}

/** True when the requested state transition is allowed by the policy. */
export function canTransition(
  from: AllocationStatus | null | undefined,
  to: AllocationStatus,
): boolean {
  if (!from) return true;
  return (ALLOCATION_TRANSITIONS[from] ?? []).includes(to);
}

export interface DeriveStatusInput {
  /** Eligibility tier from the central rule (null = not eligible). */
  houseCategory: string | null;
  /** Persisted ledger status, if any. */
  persistedStatus?: string | null;
  /** Whether Engine B found an available house for this employee right now. */
  hasAvailableHouse: boolean;
}

/**
 * Compute the live queue status from persisted decision + live eligibility +
 * live house availability.
 */
export function deriveQueueStatus(input: DeriveStatusInput): AllocationStatus {
  const persisted = isPersistedStatus(input.persistedStatus)
    ? input.persistedStatus
    : null;

  if (persisted === "allocated") return "allocated";
  if (persisted === "skipped") return "skipped";
  if (persisted === "deferred") return "deferred";
  if (persisted === "terminated") return "terminated";
  // released / waiting / no persisted thread → derive from live inputs
  if (!input.houseCategory) return "not_eligible";
  return input.hasAvailableHouse ? "ready_for_allocation" : "no_house_available";
}