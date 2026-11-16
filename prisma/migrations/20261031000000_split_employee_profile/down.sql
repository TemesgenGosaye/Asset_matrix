-- Rollback for 20261031000000_split_employee_profile
--
-- Restores the pre-migration shape:
--   1. renames the canonical columns back to their historical names;
--   2. recreates the retained columns on Employee;
--   3. copies every profile value back;
--   4. drops employee_profiles.
--
-- DATA IMPACT: lossless. The only irreducible loss is that updates made to
-- either side after the forward migration are not merged: this script copies
-- the profile values back verbatim, which is the source of truth for the
-- retained attributes.

-- ===========================================================================
-- 1. Canonical column names -> historical names
-- ===========================================================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Employee'
          AND column_name = 'emp_id'
    ) THEN
        EXECUTE 'ALTER TABLE public."Employee" RENAME COLUMN "emp_id" TO "employeeNumber"';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Employee'
          AND column_name = 'first_name'
    ) THEN
        EXECUTE 'ALTER TABLE public."Employee" RENAME COLUMN "first_name" TO "firstname"';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Employee'
          AND column_name = 'last_name'
    ) THEN
        EXECUTE 'ALTER TABLE public."Employee" RENAME COLUMN "last_name" TO "lastname"';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Employee'
          AND column_name = 'job_grade'
    ) THEN
        EXECUTE 'ALTER TABLE public."Employee" RENAME COLUMN "job_grade" TO "jobGrade"';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Employee'
          AND column_name = 'service_years'
    ) THEN
        EXECUTE 'ALTER TABLE public."Employee" RENAME COLUMN "service_years" TO "serviceYears"';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Employee'
          AND column_name = 'marital_status'
    ) THEN
        EXECUTE 'ALTER TABLE public."Employee" RENAME COLUMN "marital_status" TO "maritalStatus"';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Employee'
          AND column_name = 'disability'
    ) THEN
        EXECUTE 'ALTER TABLE public."Employee" RENAME COLUMN "disability" TO "disabilityStatus"';
    END IF;
END
$$;

-- ===========================================================================
-- 2. Recreate retained columns
-- ===========================================================================
ALTER TABLE public."Employee"
    ADD COLUMN IF NOT EXISTS "nationalId" VARCHAR(64),
    ADD COLUMN IF NOT EXISTS "jobTitle" VARCHAR(100),
    ADD COLUMN IF NOT EXISTS "employmentType" VARCHAR(30) NOT NULL DEFAULT 'full_time',
    ADD COLUMN IF NOT EXISTS "employmentStatus" VARCHAR(30) NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS "hireDate" DATE,
    ADD COLUMN IF NOT EXISTS "terminationDate" DATE,
    ADD COLUMN IF NOT EXISTS "familySize" SMALLINT,
    ADD COLUMN IF NOT EXISTS "phone" VARCHAR(25),
    ADD COLUMN IF NOT EXISTS "dateOfBirth" DATE,
    ADD COLUMN IF NOT EXISTS "address" VARCHAR(255),
    ADD COLUMN IF NOT EXISTS "city" VARCHAR(100),
    ADD COLUMN IF NOT EXISTS "state" VARCHAR(100),
    ADD COLUMN IF NOT EXISTS "country" VARCHAR(100),
    ADD COLUMN IF NOT EXISTS "postalCode" VARCHAR(20),
    ADD COLUMN IF NOT EXISTS "notes" VARCHAR(1000);

-- ===========================================================================
-- 3. Copy profile values back
-- ===========================================================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'employee_profiles'
    ) THEN
        EXECUTE $backfill$
            UPDATE public."Employee" e
               SET "nationalId"       = p."nationalId",
                   "jobTitle"         = p."jobTitle",
                   "employmentType"   = p."employmentType",
                   "employmentStatus" = p."employmentStatus",
                   "hireDate"         = p."hireDate",
                   "terminationDate"  = p."terminationDate",
                   "familySize"       = p."familySize",
                   "phone"            = p."phone",
                   "dateOfBirth"      = p."dateOfBirth",
                   "address"          = p."address",
                   "city"             = p."city",
                   "state"            = p."state",
                   "country"          = p."country",
                   "postalCode"       = p."postalCode",
                   "notes"            = p."notes"
              FROM public."employee_profiles" p
             WHERE p."employeeId" = e."id";
        $backfill$;
    END IF;
END
$$;

-- ===========================================================================
-- 4. Restore indexes that the forward migration removed with the columns
-- ===========================================================================
CREATE UNIQUE INDEX IF NOT EXISTS "Employee_org_nationalId_key"
    ON public."Employee" ("organizationId", "nationalId");

CREATE INDEX IF NOT EXISTS "Employee_employmentStatus_idx"
    ON public."Employee" ("employmentStatus");

CREATE INDEX IF NOT EXISTS "Employee_nationalId_trgm_idx"
    ON public."Employee" USING gin ("nationalId" gin_trgm_ops);

-- ===========================================================================
-- 5. Drop the profile table
-- ===========================================================================
DROP TABLE IF EXISTS public."employee_profiles";
