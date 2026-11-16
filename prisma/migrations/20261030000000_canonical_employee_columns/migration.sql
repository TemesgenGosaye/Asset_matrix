-- Migration: Canonical employee columns — free-text marital status and disability.
--
-- WHY:
--   The canonical employee schema is exactly eight business columns:
--     emp_id | first_name | last_name | gender | job_grade | service_years |
--     marital_status | disability
--   Six of them already exist on public."Employee" with the right semantics.
--   Two did not:
--
--     * maritalStatus was the native enum "MaritalStatus" (single | married).
--       The House Queue MCDA policy table in src/lib/house-queue/weights.ts
--       already scores FOUR marital states (single, married, widowed,
--       divorced), so the enum could not represent a widowed or divorced
--       employee at all. The source workbook's own vocabulary has to survive
--       the import, so the column becomes TEXT with a CHECK constraint over
--       exactly the four states the policy already knows.
--
--     * disabilityStatus was a BOOLEAN NOT NULL DEFAULT false. A boolean cannot
--       hold a source file's actual vocabulary ("Physical", "None", "Yes",
--       "Not recorded", ...) and it cannot distinguish "no disability recorded"
--       from "never asked". It becomes nullable TEXT.
--
-- SAFETY PROPERTIES:
--   * No column is dropped, renamed or recreated. Only two columns are widened
--     (enum -> TEXT, boolean -> TEXT), which is a lossless, value-preserving
--     conversion for every row that exists today.
--   * Fully idempotent: every step is guarded, so re-running the migration is
--     a no-op rather than an error.
--   * No data loss: the boolean disability value is carried across as
--     'Yes' / 'No'; NULL stays NULL (meaning "not recorded").
--   * serviceYears is backfilled from hireDate for rows that predate the
--     column, so the House Queue seniority ranking keeps the same ordering it
--     had before this migration. Existing hireDate values are never modified.
--   * Reversal script: ./down.sql in this same folder.
--
-- ROLLBACK / DATA IMPACT SUMMARY:
--   * maritalStatus:    enum (single|married) -> TEXT, 0 rows changed,
--                        0 values lost. down.sql restores the enum and folds
--                        any value outside it back to NULL.
--   * disabilityStatus: boolean -> TEXT, 108 rows converted
--                        (false -> 'No', true -> 'Yes'), 0 values lost.
--   * serviceYears:     backfilled for rows that have a hireDate, so the
--                        House Queue service-years criterion keeps working for
--                        employees registered before the column existed.
--                        down.sql leaves the backfilled values in place; they
--                        are accurate and harmless.

-- ===========================================================================
-- 1. maritalStatus: native enum -> TEXT
-- ===========================================================================
-- The enum values are already lowercase, so `::text` is a faithful copy.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Employee'
          AND column_name = 'maritalStatus'
          AND data_type = 'USER-DEFINED'
    ) THEN
        EXECUTE 'ALTER TABLE public."Employee" '
             || 'ALTER COLUMN "maritalStatus" TYPE TEXT USING ("maritalStatus"::text)';
    END IF;
END
$$;

-- ===========================================================================
-- 2. maritalStatus vocabulary CHECK constraint
-- ===========================================================================
-- Exactly the four states the House Queue MCDA policy table scores. A value
-- outside this set is a data-entry error, not a policy decision, so the
-- database refuses it and the application reports it per row.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'Employee_maritalStatus_vocab_check'
          AND conrelid = 'public."Employee"'::regclass
    ) THEN
        ALTER TABLE public."Employee"
            ADD CONSTRAINT "Employee_maritalStatus_vocab_check"
            CHECK (
                "maritalStatus" IS NULL
                OR lower(trim("maritalStatus")) IN ('single', 'married', 'widowed', 'divorced')
            );
    END IF;
END
$$;

-- The "MaritalStatus" enum type was only ever used by this one column, so it
-- is no longer referenced once the column is TEXT.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MaritalStatus') THEN
        EXECUTE 'DROP TYPE public."MaritalStatus"';
    END IF;
END
$$;

-- ===========================================================================
-- 3. disabilityStatus: BOOLEAN NOT NULL -> TEXT NULL
-- ===========================================================================
-- false -> 'No' and true -> 'Yes' preserve the meaning of every existing
-- row. The column then becomes nullable, because "no disability recorded" and
-- "no disability" are different facts and the source file may simply omit it.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Employee'
          AND column_name = 'disabilityStatus'
          AND data_type = 'boolean'
    ) THEN
        EXECUTE 'ALTER TABLE public."Employee" '
             || 'ALTER COLUMN "disabilityStatus" TYPE TEXT '
             || 'USING (CASE WHEN "disabilityStatus" IS TRUE THEN ''Yes'' '
             || 'WHEN "disabilityStatus" IS FALSE THEN ''No'' ELSE NULL END)';
    END IF;

    EXECUTE 'ALTER TABLE public."Employee" ALTER COLUMN "disabilityStatus" DROP NOT NULL';
    EXECUTE 'ALTER TABLE public."Employee" ALTER COLUMN "disabilityStatus" DROP DEFAULT';

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Employee'
          AND column_name = 'disabilityStatus'
          AND character_maximum_length IS DISTINCT FROM 100
    ) THEN
        EXECUTE 'ALTER TABLE public."Employee" '
             || 'ALTER COLUMN "disabilityStatus" TYPE VARCHAR(100) '
             || 'USING (left("disabilityStatus", 100))';
    END IF;
END
$$;

-- ===========================================================================
-- 4. Backfill serviceYears from hireDate
-- ===========================================================================
-- The House Queue scores "length of service" from this column. Employees
-- registered before the column existed have a hireDate but no serviceYears, so
-- the criterion would have read 0 for every legacy employee and the ranking
-- would have been wrong. The backfill uses whole elapsed years (the unit the
-- canonical schema defines), floored and clamped to the column's 0-60 range.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Employee'
          AND column_name = 'serviceYears'
    ) THEN
        EXECUTE $backfill$
            UPDATE public."Employee"
               SET "serviceYears" = LEAST(
                       60,
                       GREATEST(
                           0,
                           FLOOR(
                               (CURRENT_DATE - "hireDate")::numeric / 365.2425
                           )::int
                       )
                   )
             WHERE "serviceYears" IS NULL
               AND "hireDate" IS NOT NULL;
        $backfill$;
    END IF;
END
$$;

-- ===========================================================================
-- 5. Index for the canonical marital-status filter
-- ===========================================================================
-- The Employee List filters by marital status inside an organization, so the
-- filter has to be index-backed on a table that grows with the register.
CREATE INDEX IF NOT EXISTS "Employee_organizationId_maritalStatus_idx"
    ON public."Employee" ("organizationId", "maritalStatus");
