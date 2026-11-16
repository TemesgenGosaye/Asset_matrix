-- Rollback for 20261030000000_canonical_employee_columns
--
-- Restores the pre-migration column types:
--   * maritalStatus    TEXT -> native enum "MaritalStatus" (single | married)
--   * disabilityStatus TEXT -> BOOLEAN NOT NULL DEFAULT false
--
-- DATA IMPACT:
--   * maritalStatus: values outside {single, married} (i.e. widowed / divorced,
--     which the old enum could not represent) are folded to NULL rather than
--     aborting the rollback. The rollback therefore succeeds but does lose
--     those two distinctions — take a snapshot first if that matters.
--   * disabilityStatus: 'Yes' -> true, everything else (including NULL and
--     'No') -> false. The free-text detail ("Physical", "None", ...) is lost,
--     which is unavoidable when the target type is a boolean.
--   * serviceYears is NOT dropped here: it belongs to the earlier
--     20261029000000_add_service_years migration, and the values backfilled
--     from hireDate remain accurate.

DROP INDEX IF EXISTS public."Employee_organizationId_maritalStatus_idx";

ALTER TABLE public."Employee"
    DROP CONSTRAINT IF EXISTS "Employee_maritalStatus_vocab_check";

-- 1. maritalStatus -> enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MaritalStatus') THEN
        CREATE TYPE public."MaritalStatus" AS ENUM ('single', 'married');
    END IF;
END
$$;

UPDATE public."Employee"
   SET "maritalStatus" = NULL
 WHERE "maritalStatus" IS NOT NULL
   AND lower(trim("maritalStatus")) NOT IN ('single', 'married');

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Employee'
          AND column_name = 'maritalStatus'
          AND data_type = 'text'
    ) THEN
        EXECUTE 'ALTER TABLE public."Employee" '
             || 'ALTER COLUMN "maritalStatus" TYPE public."MaritalStatus" '
             || 'USING ("maritalStatus"::public."MaritalStatus")';
    END IF;
END
$$;

-- 2. disabilityStatus -> boolean
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Employee'
          AND column_name = 'disabilityStatus'
          AND data_type = 'text'
    ) THEN
        EXECUTE 'ALTER TABLE public."Employee" '
             || 'ALTER COLUMN "disabilityStatus" TYPE BOOLEAN '
             || 'USING (lower(trim("disabilityStatus")) = ''yes'')';
    END IF;

    EXECUTE 'ALTER TABLE public."Employee" ALTER COLUMN "disabilityStatus" SET DEFAULT false';
    EXECUTE 'ALTER TABLE public."Employee" ALTER COLUMN "disabilityStatus" SET NOT NULL';
END
$$;
