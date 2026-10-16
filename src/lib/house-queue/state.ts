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
  "release_pending",
  "RELEASE_PENDING",
  "pending_inspection",
  "PENDING_INSPECTION",
  "skipped",
  "deferred",
  "released",
  "terminated",
] as const;
export type AllocationStatus = (typeof ALLOCATION_STATUSES)[number];

/** Statuses that are written to the `HouseAllocation` ledger. */
export const PERSISTED_ALLOCATION_STATUSES = [
  "allocated",
  "release_pending",
  "RELEASE_PENDING",
  "pending_inspection",
  "PENDING_INSPECTION",
  "skipped",
  "deferred",
  "released",
  "terminated",
] as const;
export type PersistedAllocationStatus =
  (typeof PERSISTED_ALLOCATION_STATUSES)[number];

/**
 * Persisted statuses that mean "this employee still holds this house".
 *
 * Used when computing availability, so a house cannot be offered to someone
 * else while its outgoing allocation is mid-release. `RELEASE_PENDING` is
 * deliberately included: until the handback inspection is completed the
 * employee is still resident, and the house is still out of the pool.
 */
export const LIVE_ALLOCATION_STATUSES = [
  "allocated",
  "release_pending",
  "RELEASE_PENDING",
  "pending_inspection",
  "PENDING_INSPECTION",
] as const satisfies readonly string[];

/**
 * Persisted statuses that are immutable archived history.
 *
 * A row in one of these states IS a Terminated Houses archive record: it carries
 * the reason, the actor and the timestamp that `listTerminatedHouses` reads. A
 * later decision (re-allocate, skip, defer) must therefore APPEND a new thread
 * rather than mutate this row in place — reusing it overwrites `status` and the
 * release silently drops out of the archive.
 */
export const ARCHIVED_TERMINAL_STATUSES = [
  "released",
  "terminated",
] as const satisfies readonly string[];

/** True when the ledger row is finished history and must never be written again. */
export function isArchivedTerminalStatus(
  status: string | null | undefined,
): boolean {
  return (ARCHIVED_TERMINAL_STATUSES as readonly string[]).includes(
    status ?? "",
  );
}

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
 *  - allocated → RELEASE_PENDING (release raised, awaiting the handback inspection)
 *  - RELEASE_PENDING → RELEASED (ONLY by completing that inspection)
 *  - anything except a live allocation → SKIP / DEFER
 *  - a skipped / deferred / released thread can be reactivated
 *
 * The asymmetry between `release_pending` and `RELEASE_PENDING` is deliberate
 * and load-bearing. A RELEASE_PENDING allocation is an *unfinished* release: the
 * house is out of the pool and its inspection may not have happened yet. The only
 * legal way out is `released`, and the service layer only takes that transition
 * inside `completeInspection`, in the same transaction that applies the damage
 * result and returns the house to stock. Listing `terminated` here would let the
 * old terminate-on-release path jump straight to an archived record and skip the
 * inspection entirely.
 *
 * The lowercase `release_pending` spelling is the legacy alias kept for rows
 * written before the vocabulary was capitalised; it may also only reach
 * `released`, never `terminated`.
 */
export const ALLOCATION_TRANSITIONS: Readonly<
  Record<AllocationStatus, readonly AllocationStatus[]>
> = {
  not_eligible: ["allocated", "skipped", "deferred"],
  waiting: ["allocated", "skipped", "deferred"],
  no_house_available: ["allocated", "skipped", "deferred"],
  ready_for_allocation: ["allocated", "skipped", "deferred"],
  allocated: ["released", "terminated", "release_pending", "RELEASE_PENDING"],
  release_pending: ["released"],
  RELEASE_PENDING: ["released"],
  pending_inspection: ["released", "terminated", "ready_for_allocation"],
  PENDING_INSPECTION: ["released", "terminated", "ready_for_allocation"],
  skipped: ["allocated", "released", "ready_for_allocation"],
  deferred: ["allocated", "released", "ready_for_allocation"],
  released: ["allocated", "skipped", "deferred", "ready_for_allocation"],
  /** A terminated (reason-coded release) thread can be reactivated later. */
  terminated: ["allocated", "skipped", "deferred", "ready_for_allocation"],
};

export function isPersistedStatus(
  status: string | null | undefined,
): status is PersistedAllocationStatus {
  return (PERSISTED_ALLOCATION_STATUSES as readonly string[]).includes(
    status ?? "",
  );
}

export function isAllocated(status: string | null | undefined): boolean {
  return status === "allocated";
}

export function isReleasePending(status: string | null | undefined): boolean {
  return status === "release_pending" || status === "RELEASE_PENDING";
}

export function isPendingInspection(
  status: string | null | undefined,
): boolean {
  return (
    status === "pending_inspection" ||
    status === "PENDING_INSPECTION" ||
    status === "PendingInspection"
  );
}

/** True when the requested state transition is allowed by the policy. */
export function canTransition(
  from: AllocationStatus | string | null | undefined,
  to: AllocationStatus | string,
): boolean {
  if (!from) return true;
  const fromNormalized = from as AllocationStatus;
  const toNormalized = to as AllocationStatus;
  const allowed = ALLOCATION_TRANSITIONS[fromNormalized] ?? [];
  if (allowed.includes(toNormalized)) return true;
  // Also check normalized lowercase comparison for flexibility
  return allowed.some((s) => s.toLowerCase() === to.toLowerCase());
}

/**
 * House status transitions (Household.status):
 *   Active → PendingInspection (release initiated / house vacated)
 *   PendingInspection → Active (clean handback inspection completed)
 *   PendingInspection → UnderMaintenance (damaged handback inspection completed)
 *   UnderMaintenance → Active (maintenance resolved)
 */
export const HOUSE_STATUS_TRANSITIONS: Readonly<
  Record<string, readonly string[]>
> = {
  Active: [
    "PendingInspection",
    "PENDING_INSPECTION",
    "UnderMaintenance",
    "Inactive",
  ],
  active: [
    "PendingInspection",
    "PENDING_INSPECTION",
    "UnderMaintenance",
    "Inactive",
  ],
  PendingInspection: ["Active", "UnderMaintenance", "Inactive"],
  PENDING_INSPECTION: ["Active", "UnderMaintenance", "Inactive"],
  UnderMaintenance: ["Active", "Inactive"],
  Inactive: ["Active", "UnderMaintenance"],
};

export function canHouseTransition(
  from: string | null | undefined,
  to: string,
): boolean {
  if (!from) return true;
  const allowed = HOUSE_STATUS_TRANSITIONS[from] ?? [];
  return (
    allowed.includes(to) ||
    allowed.some((s) => s.toLowerCase() === to.toLowerCase())
  );
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
  if (isReleasePending(persisted)) return "release_pending";
  if (persisted === "skipped") return "skipped";
  if (persisted === "deferred") return "deferred";
  if (persisted === "terminated") return "terminated";
  // released / waiting / no persisted thread → derive from live inputs
  if (!input.houseCategory) return "not_eligible";
  return input.hasAvailableHouse
    ? "ready_for_allocation"
    : "no_house_available";
}
