-- Migration: remove the 4-digit house release code
--
-- WHY
--   The release code was a second gate between the handback inspection and a
--   house returning to the available pool. It has been removed: completing the
--   handback inspection is now the single gate, and that same transaction is
--   what archives the allocation (status `released` + `terminatedAt`) and
--   returns the house to stock. Keeping the table would leave an orphaned set of
--   4-digit secrets with no reader, no writer, and no gate to protect.
--
-- WHAT
--   1. Drop `house_release_codes`.
--   2. Backfill any release that was left mid-flight with an unconsumed code:
--      finalise it, because an inspection that was already resolved and a code
--      that was already burned together mean the handback really happened.
--   3. Repair terminations whose `status` was overwritten by a later
--      re-allocation, so they reappear on the Terminated Houses page.
--
-- The Terminated Houses page selects on `terminatedAt IS NOT NULL`, which is the
-- immutable fact of a termination, so step 3 changes no query — it only restores
-- the data those queries were already written against.
--
-- Idempotent so it is safe to re-run.

-- "?" Release codes are removed. The table is dropped outright rather than
-- emptied: nothing reads it once the code gate is gone, and a code is a
-- credential, not evidence. The inspection that justified each release is kept
-- in full by `house_inspections`.
DROP TABLE IF EXISTS "public"."house_release_codes";

-- "?" Finalise releases stranded by the removed gate.
--
-- A row is stranded when its handback inspection is already resolved (an
-- inspector did the work and recorded the damage) but the allocation never
-- reached `released`. Those are exactly the rows that were waiting on a code
-- that nobody is going to enter now. Stamping them is the same write
-- `completeInspection` performs today.
UPDATE "public"."house_allocations" a
   SET "status"       = 'released',
       "terminatedAt" = COALESCE(a."terminatedAt", i."completedAt"),
       "terminatedBy" = COALESCE(a."terminatedBy", i."completedBy"),
       "decidedAt"    = COALESCE(a."decidedAt", i."completedAt"),
       "updatedAt"    = NOW()
  FROM "public"."house_inspections" i
 WHERE i."allocationId" = a."id"
   AND i."resolvedTo" IS NOT NULL
   AND i."completedAt" IS NOT NULL
   AND a."terminatedAt" IS NULL
   AND a."status" IN ('RELEASE_PENDING', 'release_pending');

-- "?" Restore terminations destroyed by the archived-row reuse bug.
--
-- `findLatestThread` used to return the newest row for an employee whatever its
-- status, and the re-activation paths updated that row in place. When the newest
-- row was a completed release, `status` was rewritten to `allocated` / `skipped`
-- / `deferred` and the termination vanished from the archive even though
-- `terminationReason` and `terminatedAt` were still on the row.
--
-- A row carrying BOTH a reason and a timestamp was finalised as a release
-- (`completeInspection` writes them together), so it is restored. A row with no
-- timestamp is left alone: absence of one is not evidence of a lost archive
-- entry, and guessing would fabricate a termination.
--
-- NOTE ON LIVE ROWS: a row restored to `released` while still being somebody's
-- current house is left as-is on purpose. The application no longer keys the
-- archive on `status`, so it is listed correctly either way, and rewriting it
-- would silently take a house away from a current occupant. Re-resolving those
-- by hand is an operational decision, not a migration's.
UPDATE "public"."house_allocations"
   SET "status"    = 'released',
       "updatedAt" = NOW()
 WHERE "terminatedAt"   IS NOT NULL
   AND "terminationReason" IS NOT NULL
   AND "status" NOT IN ('released', 'terminated')
   AND "status" <> 'allocated';

-- Index the column the Terminated Houses page filters and sorts on. The archive
-- is read on every page load and previously had no supporting index.
CREATE INDEX IF NOT EXISTS "house_allocations_org_terminated_at_idx"
    ON "public"."house_allocations"("organizationId", "terminatedAt" DESC);