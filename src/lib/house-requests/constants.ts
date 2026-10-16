/**
 * House Request — shared constants.
 *
 * A house request is the employee's own application for a house. It is the
 * ENTRY TICKET into the House Queue: the engine only scores, ranks and lists
 * employees who hold a request in the `submitted` status (see
 * `src/lib/house-queue/engine.ts`). Without a request nobody appears in the
 * queue, however senior they are.
 *
 * Client-safe: no prisma / next-server imports.
 */

/**
 * Lifecycle of a house request — exactly two states.
 *
 * Note what is deliberately absent: an "allocated/fulfilled" state. An employee
 * who receives a house must REMAIN in the House Queue (as `allocated`) and in
 * the Allocated Houses ledger, so retiring their request on approval would drop
 * them out of the queue they were ranked in. Allocation truth lives in
 * `HouseAllocation.status`; the request only answers "did this person ask for a
 * house, and is that ask still live?".
 */
export const HOUSE_REQUEST_STATUSES = ["submitted", "cancelled"] as const;

export type HouseRequestStatus = (typeof HOUSE_REQUEST_STATUSES)[number];

/**
 * The single "active" status. Only these rows place an employee in the queue,
 * and only these rows are covered by the partial unique index that enforces one
 * live request per employee.
 */
export const ACTIVE_HOUSE_REQUEST_STATUS: HouseRequestStatus = "submitted";

/**
 * Whether a status keeps queue entry. Closed statuses free the employee to file
 * again.
 */
export function isActiveHouseRequestStatus(
  status: string | null | undefined,
): status is HouseRequestStatus {
  return status === ACTIVE_HOUSE_REQUEST_STATUS;
}

/** Statuses that keep the request out of the queue. */
export const CLOSED_HOUSE_REQUEST_STATUSES = [
  "cancelled",
] as const satisfies readonly HouseRequestStatus[];

/** Human-readable labels for the UI. */
export const HOUSE_REQUEST_STATUS_LABELS: Record<HouseRequestStatus, string> = {
  submitted: "Submitted",
  cancelled: "Cancelled",
};

// ---------------------------------------------------------------------------
// Remarks validation
// ---------------------------------------------------------------------------

/** DB column width — `HouseRequest.remarks` is `varchar(1000)`. */
export const REMARKS_MAX_LENGTH = 1000;

/**
 * Minimum meaningful length. A single character ("x") is not a justification,
 * and the SQL CHECK constraint mirrors this bound so the rule holds even for
 * writes that bypass the API (imports, scripts, psql).
 */
export const REMARKS_MIN_LENGTH = 10;

/**
 * Transaction-scoped advisory lock key used to serialize the duplicate check.
 *
 * Two concurrent submits for the same employee can both pass a
 * `SELECT ... WHERE status='submitted'` probe before either INSERT commits, so
 * the read alone is not sufficient. Taking `pg_advisory_xact_lock(key, hash)`
 * on the organization+employee pair makes the check-then-insert atomic; the
 * partial unique index remains the backstop if this lock is ever bypassed.
 *
 * Kept inside PostgreSQL's signed 32-bit key space (1..2^31-1).
 */
export const HOUSE_REQUEST_ADVISORY_LOCK_NAMESPACE = 7282711;

/**
 * Derive a stable per-employee advisory lock key.
 *
 * Uses the employee's UUID hex, masked to 31 bits, so different employees in
 * the same organization never block each other and the same employee always
 * hashes to the same lock.
 */
export function houseRequestLockKey(employeeId: string): number {
  let hash = 0;
  for (let i = 0; i < employeeId.length; i += 1) {
    hash = (Math.imul(31, hash) + employeeId.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % 2_147_483_647) + 1;
}
