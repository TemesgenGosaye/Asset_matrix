-- Migration: split retained employee attributes into employee_profiles and
--            enforce the canonical eight-field Employee table.
--
-- WHY:
--   The approved employee schema is exactly eight business columns:
--     emp_id | first_name | last_name | gender | job_grade | service_years |
--     marital_status | disability
--   The live `public."Employee"` table still carried the attributes the old
--   HR form used to collect (National ID, job title, employment type/status,
--   hire/termination date, family size, phone, date of birth, address, notes).
--   Those values cannot simply be dropped: House Request eligibility needs
--   employment status, House Queue ranking needs hire date / family size, and
--   the employee detail page shows the rest. They are therefore moved into a
--   one-to-one `employee_profiles` table and removed from `Employee`.
--
-- WHAT THIS MIGRATION DOES:
--   1. Creates `employee_profiles` (1:1 with Employee, org-scoped).
--   2. Copies every retained attribute from every existing Employee row.
--      Reading through `to_jsonb(e)` means the copy works even on a database
--      that never had one of the legacy columns.
--   3. Drops the retained business columns from Employee.
--   4. Renames the eight canonical columns to their approved physical names
--      (emp_id, first_name, ...). The Prisma model maps its historical field
--      names onto these columns, so application code is unaffected.
--
-- SAFETY:
--   * Idempotent: every step is guarded and can be re-run safely.
--   * Lossless: every retained value is copied before the source column is
--     dropped; an existing profile row is never overwritten on re-run.
--   * One transaction: a failure leaves both tables untouched.
--   * Reversal script: ./down.sql.
--
-- ROLLBACK / DATA IMPACT SUMMARY:
--   * A rollback recreates the dropped columns, copies the profile values back,
--     drops `employee_profiles`, and renames the canonical columns back.
--   * Employee rows, department/manager/user relationships and all House Queue
--     / House Request data are untouched.

-- ===========================================================================
-- 1. Employee profile table (retained attributes)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public."employee_profiles" (
    "employeeId"       UUID PRIMARY KEY,
    "organizationId"   UUID NOT NULL,
    "nationalId"       VARCHAR(64),
    "jobTitle"         VARCHAR(100),
    "employmentType"   VARCHAR(30) NOT NULL DEFAULT 'full_time',
    "employmentStatus" VARCHAR(30) NOT NULL DEFAULT 'active',
    "hireDate"         DATE,
    "terminationDate"  DATE,
    "familySize"       SMALLINT,
    "phone"            VARCHAR(25),
    "dateOfBirth"      DATE,
    "address"          VARCHAR(255),
    "city"             VARCHAR(100),
    "state"            VARCHAR(100),
    "country"          VARCHAR(100),
    "postalCode"       VARCHAR(20),
    "notes"            VARCHAR(1000),
    "createdAt"        TIMESTAMP(6) NOT NULL DEFAULT now(),
    "updatedAt"        TIMESTAMP(6) NOT NULL DEFAULT now()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'employee_profiles_employeeId_fkey'
          AND conrelid = 'public."employee_profiles"'::regclass
    ) THEN
        ALTER TABLE public."employee_profiles"
            ADD CONSTRAINT "employee_profiles_employeeId_fkey"
            FOREIGN KEY ("employeeId") REFERENCES public."Employee"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'employee_profiles_organizationId_fkey'
          AND conrelid = 'public."employee_profiles"'::regclass
    ) THEN
        ALTER TABLE public."employee_profiles"
            ADD CONSTRAINT "employee_profiles_organizationId_fkey"
            FOREIGN KEY ("organizationId") REFERENCES public."organizations"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "employee_profiles_organizationId_nationalId_key"
    ON public."employee_profiles" ("organizationId", "nationalId");

CREATE INDEX IF NOT EXISTS "employee_profiles_organizationId_idx"
    ON public."employee_profiles" ("organizationId");

CREATE INDEX IF NOT EXISTS "employee_profiles_employmentStatus_idx"
    ON public."employee_profiles" ("employmentStatus");

CREATE INDEX IF NOT EXISTS "employee_profiles_organizationId_employmentStatus_idx"
    ON public."employee_profiles" ("organizationId", "employmentStatus");

-- National ID search stays index-backed after the move.
CREATE INDEX IF NOT EXISTS "employee_profiles_nationalId_trgm_idx"
    ON public."employee_profiles" USING gin ("nationalId" gin_trgm_ops);

-- ===========================================================================
-- 2. Backfill from the legacy Employee columns
-- ===========================================================================
-- `to_jsonb(e)` exposes only the columns that actually exist, so this works
-- for both the live legacy table and a freshly provisioned database. Blank
-- strings become NULL; missing keys also become NULL.
DO $$
BEGIN
    EXECUTE $backfill$
        INSERT INTO public."employee_profiles" (
            "employeeId",
            "organizationId",
            "nationalId",
            "jobTitle",
            "employmentType",
            "employmentStatus",
            "hireDate",
            "terminationDate",
            "familySize",
            "phone",
            "dateOfBirth",
            "address",
            "city",
            "state",
            "country",
            "postalCode",
            "notes"
        )
        SELECT
            e."id",
            e."organizationId",
            NULLIF(btrim(to_jsonb(e)->>'nationalId'), ''),
            NULLIF(btrim(to_jsonb(e)->>'jobTitle'), ''),
            COALESCE(NULLIF(to_jsonb(e)->>'employmentType', ''), 'full_time'),
            COALESCE(NULLIF(to_jsonb(e)->>'employmentStatus', ''), 'active'),
            NULLIF(to_jsonb(e)->>'hireDate', '')::date,
            NULLIF(to_jsonb(e)->>'terminationDate', '')::date,
            NULLIF(to_jsonb(e)->>'familySize', '')::smallint,
            NULLIF(to_jsonb(e)->>'phone', ''),
            NULLIF(to_jsonb(e)->>'dateOfBirth', '')::date,
            NULLIF(to_jsonb(e)->>'address', ''),
            NULLIF(to_jsonb(e)->>'city', ''),
            NULLIF(to_jsonb(e)->>'state', ''),
            NULLIF(to_jsonb(e)->>'country', ''),
            NULLIF(to_jsonb(e)->>'postalCode', ''),
            NULLIF(to_jsonb(e)->>'notes', '')
        FROM public."Employee" e
        ON CONFLICT ("employeeId") DO NOTHING;
    $backfill$;
END
$$;

-- ===========================================================================
-- 3. Remove retained business columns from the canonical Employee row
-- ===========================================================================
ALTER TABLE public."Employee"
    DROP COLUMN IF EXISTS "nationalId",
    DROP COLUMN IF EXISTS "jobTitle",
    DROP COLUMN IF EXISTS "employmentType",
    DROP COLUMN IF EXISTS "employmentStatus",
    DROP COLUMN IF EXISTS "hireDate",
    DROP COLUMN IF EXISTS "terminationDate",
    DROP COLUMN IF EXISTS "familySize",
    DROP COLUMN IF EXISTS "phone",
    DROP COLUMN IF EXISTS "dateOfBirth",
    DROP COLUMN IF EXISTS "address",
    DROP COLUMN IF EXISTS "city",
    DROP COLUMN IF EXISTS "state",
    DROP COLUMN IF EXISTS "country",
    DROP COLUMN IF EXISTS "postalCode",
    DROP COLUMN IF EXISTS "notes";

-- ===========================================================================
-- 4. Rename the eight canonical columns to their approved physical names
-- ===========================================================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Employee'
          AND column_name = 'employeeNumber'
    ) THEN
        EXECUTE 'ALTER TABLE public."Employee" RENAME COLUMN "employeeNumber" TO "emp_id"';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Employee'
          AND column_name = 'firstname'
    ) THEN
        EXECUTE 'ALTER TABLE public."Employee" RENAME COLUMN "firstname" TO "first_name"';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Employee'
          AND column_name = 'lastname'
    ) THEN
        EXECUTE 'ALTER TABLE public."Employee" RENAME COLUMN "lastname" TO "last_name"';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Employee'
          AND column_name = 'jobGrade'
    ) THEN
        EXECUTE 'ALTER TABLE public."Employee" RENAME COLUMN "jobGrade" TO "job_grade"';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Employee'
          AND column_name = 'serviceYears'
    ) THEN
        EXECUTE 'ALTER TABLE public."Employee" RENAME COLUMN "serviceYears" TO "service_years"';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Employee'
          AND column_name = 'maritalStatus'
    ) THEN
        EXECUTE 'ALTER TABLE public."Employee" RENAME COLUMN "maritalStatus" TO "marital_status"';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Employee'
          AND column_name = 'disabilityStatus'
    ) THEN
        EXECUTE 'ALTER TABLE public."Employee" RENAME COLUMN "disabilityStatus" TO "disability"';
    END IF;
END
$$;
