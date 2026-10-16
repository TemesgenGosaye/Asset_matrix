-- ============================================================================
-- ROLLBACK for: 20260926000000_employee_management_module
--
-- NOT executed by `prisma migrate deploy` — run it by hand if this migration
-- must be reverted:
--
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f \
--         prisma/migrations/20260926000000_employee_management_module/down.sql
--
-- This script is IRREVERSIBLE BY DESIGN in one respect and says so loudly:
-- the `Gender` / `MaritalStatus` columns revert to free-text `varchar(20)`
-- with their ORIGINAL VALUES RESTORED (the enum text is written back as
-- lowercase, which is how the values are stored today after this migration).
-- The one thing that cannot be recovered is the original title-casing of
-- `gender` ('Male' / 'Female' -> 'male' / 'female'), nor any `nationalId`
-- values that were entered after this migration ran. The soft-delete markers
-- in `deletedAt` are also dropped, which will RESURFACE soft-deleted rows.
--
-- Steps are ordered so the script is safe to run even if it is interrupted
-- part-way: relax constraints first, then widen types, then drop new objects.
-- ============================================================================

BEGIN;

-- 1. Drop the job-grade range CHECK so out-of-range values can be written back.
ALTER TABLE public."Employee"
    DROP CONSTRAINT IF EXISTS "Employee_jobGrade_range_check";

-- 2. Drop the trigram search indexes.
DROP INDEX IF EXISTS public."Employee_firstname_trgm_idx";
DROP INDEX IF EXISTS public."Employee_lastname_trgm_idx";
DROP INDEX IF EXISTS public."Employee_employeeNumber_trgm_idx";
DROP INDEX IF EXISTS public."Employee_nationalId_trgm_idx";

-- 3. Revert soft-delete / department-filter indexes, and restore the original
--    (lower-cased) name of the job-grade index.
DROP INDEX IF EXISTS public."Employee_organizationId_deletedAt_idx";
DROP INDEX IF EXISTS public."Employee_organizationId_departmentId_idx";

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'Employee_organizationId_jobGrade_idx'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'employee_organizationId_jobGrade_idx'
    ) THEN
        ALTER INDEX public."Employee_organizationId_jobGrade_idx"
            RENAME TO "employee_organizationId_jobGrade_idx";
    END IF;
END
$$;

-- 4. Revert uniqueness: org-scoped composites -> global unique indexes.
--    Re-applying the GLOBAL unique index is what makes this step able to fail:
--    if two organizations now hold the same `email` or `employeeNumber`, the
--    original constraint genuinely cannot be restored until a human decides
--    which row wins. The pre-flight query below reports that up front.
DO $$
DECLARE
    dup_email  bigint;
    dup_empnum bigint;
BEGIN
    SELECT count(*) INTO dup_email FROM (
        SELECT lower(btrim("email")) AS k
          FROM public."Employee"
         WHERE "email" IS NOT NULL
         GROUP BY 1 HAVING count(*) > 1
    ) t;

    SELECT count(*) INTO dup_empnum FROM (
        SELECT lower(btrim("employeeNumber")) AS k
          FROM public."Employee"
         GROUP BY 1 HAVING count(*) > 1
    ) t;

    IF dup_email > 0 OR dup_empnum > 0 THEN
        RAISE EXCEPTION
            'Cannot restore global uniqueness: % duplicated email value(s) and % duplicated employeeNumber value(s) now exist across organizations. Resolve them manually, then re-run this script.',
            dup_email, dup_empnum;
    END IF;
END
$$;

DROP INDEX IF EXISTS public."Employee_org_employeeNumber_key";
DROP INDEX IF EXISTS public."Employee_org_email_key";
DROP INDEX IF EXISTS public."Employee_org_nationalId_key";

-- 5. Widen the enum columns back to free text and drop the new National ID /
--    soft-delete columns. The enum text is written back verbatim.
ALTER TABLE public."Employee"
    DROP COLUMN IF EXISTS "nationalId";

ALTER TABLE public."Employee"
    DROP COLUMN IF EXISTS "deletedAt";

ALTER TABLE public."Employee"
    ALTER COLUMN "gender" TYPE VARCHAR(20)
    USING ("gender"::text);

ALTER TABLE public."Employee"
    ALTER COLUMN "maritalStatus" TYPE VARCHAR(20)
    USING ("maritalStatus"::text);

ALTER TABLE public."Employee"
    ALTER COLUMN "disabilityStatus" DROP NOT NULL;
ALTER TABLE public."Employee"
    ALTER COLUMN "disabilityStatus" DROP DEFAULT;

CREATE UNIQUE INDEX IF NOT EXISTS "Employee_employeeNumber_key"
    ON public."Employee" ("employeeNumber");

CREATE UNIQUE INDEX IF NOT EXISTS "Employee_email_key"
    ON public."Employee" ("email");

-- 6. Drop the enum types. Safe now that no column references them.
DROP TYPE IF EXISTS public."Gender";
DROP TYPE IF EXISTS public."MaritalStatus";

COMMIT;
