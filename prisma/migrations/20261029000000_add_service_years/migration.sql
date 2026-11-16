-- Migration: Add serviceYears column to Employee table
--
-- WHY: The canonical 8-column employee schema requires a "Service Years" field
-- which is a whole-number count of years of service. This column does not exist
-- in the current schema. This migration adds it additively.
--
-- SAFETY PROPERTIES:
--   * Purely additive: no column is dropped, renamed or type-changed.
--   * Idempotent: the IF NOT EXISTS guard makes it safe to re-run.
--   * No data loss: existing rows gain a NULL serviceYears, which is valid.
--   * Consistent with the existing jobGrade CHECK pattern: a range guard
--     (0-60 years) is added as a named constraint so the column can never hold
--     a negative or impossibly large value.
--
-- ROLLBACK: DROP COLUMN "serviceYears" from public."Employee". The down.sql
-- below performs this cleanly.

-- ─── 1. Add serviceYears column ─────────────────────────────────────────────
-- SMALLINT (2-byte integer) is sufficient: 0–32,767 far exceeds the practical
-- range of service years. Nullable because most existing employees will not
-- have this field populated yet.

ALTER TABLE public."Employee"
  ADD COLUMN IF NOT EXISTS "serviceYears" SMALLINT;

-- ─── 2. Range validation ─────────────────────────────────────────────────────
-- Service years must be between 0 and 60 inclusive when supplied.
-- Zod repeats the same bounds client-side for field-level validation messages.
-- The constraint is the authoritative backstop (including for raw SQL / imports).

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'Employee_serviceYears_range_check'
          AND conrelid = 'public."Employee"'::regclass
    ) THEN
        ALTER TABLE public."Employee"
            ADD CONSTRAINT "Employee_serviceYears_range_check"
            CHECK ("serviceYears" IS NULL OR "serviceYears" BETWEEN 0 AND 60);
    END IF;
END
$$;

-- ─── 3. Index for House Queue sorting by service years ───────────────────────
-- House Queue ranking uses service years as a scoring criterion, so queries
-- that sort or filter on this column should be index-backed.

CREATE INDEX IF NOT EXISTS "Employee_organizationId_serviceYears_idx"
    ON public."Employee" ("organizationId", "serviceYears");
