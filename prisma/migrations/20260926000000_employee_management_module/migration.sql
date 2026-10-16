-- Migration: Employee Management module — strict HR types, org-scoped identity,
-- National ID, soft delete and search indexes.
--
-- WHY THIS IS HAND-WRITTEN INSTEAD OF `prisma migrate dev`:
--   The shared database also carries an unrelated legacy "Horilla" HR schema
--   (employee_employee, employee_jobgrade, pms_*, payroll_*, attendance_*,
--   ~60 tables, ~2000 FK constraints) that is NOT part of the Prisma datamodel.
--   `prisma migrate dev` would try to DROP all of it. It is also unusable
--   because no migration in this repo has ever created the `"Employee"` table —
--   it exists only out-of-band in the live DB. So this migration is strictly
--   ADDITIVE: it never recreates a table and never touches the legacy schema.
--
-- DATA PRESERVATION NOTE:
--   `prisma migrate diff` emits `ALTER TABLE "Employee" DROP COLUMN "gender",
--   ADD COLUMN "gender" "Gender"` for the varchar -> enum change, which SILENTLY
--   DESTROYS every existing gender value. This migration instead uses
--   `ALTER COLUMN ... TYPE ... USING <normalised>::"Gender"` so the 98 mapped
--   rows keep their data.
--
-- SAFETY PROPERTIES:
--   * Every statement is idempotent (`IF NOT EXISTS` / `IF EXISTS` / guarded
--     DO blocks) so the migration is safe to re-run.
--   * Values that cannot be mapped into a tightened domain are NULLed with an
--     explicit, auditable UPDATE rather than aborting the migration.
--   * No column or table is dropped, so a rollback is always possible.
--   * Reversal script: ./down.sql in this same folder.
--
-- ROLLBACK / DATA IMPACT SUMMARY (current dev data: 101 employees, 1 org):
--   * gender:          Male 51 -> male, Female 47 -> female, NULL 3 -> NULL
--   * maritalStatus:   married 2 -> married, single 1 -> single, NULL 98 -> NULL
--   * disabilityStatus: NULL 0 -> false (no-op today, guards future rows)
--   * jobGrade:        0 rows out of the 1-50 range (NULLed defensively)

-- ─── 1. Extensions ──────────────────────────────────────────────────────────
-- pg_trgm powers the debounced substring search over name / Emp ID / National ID.
-- A plain btree cannot serve `ILIKE '%term%'`, which would otherwise seq-scan
-- the table once the dataset passes a few thousand rows.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── 2. Enums ───────────────────────────────────────────────────────────────
-- Member names are LOWERCASE on purpose. The House Queue MCDA reads these two
-- columns through `genderLevel()` / `maritalStatusLevel()` in
-- src/lib/house-queue/weights.ts, whose lookup tables are keyed on lowercase
-- strings (`{ male: 1, female: 1 }`, `{ single: 0, married: 3, ... }`).
-- Storing exactly those values means the scoring engine needed NO change.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Gender') THEN
        CREATE TYPE "Gender" AS ENUM ('male', 'female');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MaritalStatus') THEN
        CREATE TYPE "MaritalStatus" AS ENUM ('single', 'married');
    END IF;
END
$$;

-- ─── 3. New columns (additive) ─────────────────────────────────────────────
-- `nationalId` is nullable + uniquely indexed. Postgres allows unlimited NULLs
-- in a unique index, so all 101 pre-existing rows are legal with no backfill.
ALTER TABLE public."Employee" ADD COLUMN IF NOT EXISTS "nationalId" VARCHAR(64);

-- `deletedAt` implements soft delete. NULL = live. Every read path filters
-- `deletedAt IS NULL`.
ALTER TABLE public."Employee" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(6);

-- ─── 4. Normalise values BEFORE tightening the column types ────────────────
-- The whole step is guarded on the column still being text. Without that guard
-- the migration is NOT idempotent: on a second run `btrim("gender")` is called
-- on an enum, which raises `function btrim("Gender") does not exist`.
DO $$
DECLARE
    gender_is_text boolean;
    marital_is_text boolean;
BEGIN
    SELECT data_type = 'character varying' INTO gender_is_text
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'Employee' AND column_name = 'gender';

    SELECT data_type = 'character varying' INTO marital_is_text
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'Employee' AND column_name = 'maritalStatus';

    -- 4a. gender: the varchar column holds 'Male'/'Female' (title case) from
    --     the legacy seed. Normalise to the lowercase enum members, then NULL
    --     out anything outside the modelled set rather than letting ALTER TYPE
    --     abort the whole migration.
    IF gender_is_text THEN
        UPDATE public."Employee"
           SET "gender" = lower(btrim("gender"))
         WHERE "gender" IS NOT NULL
           AND lower(btrim("gender")) IN ('male', 'female');

        UPDATE public."Employee"
           SET "gender" = NULL
         WHERE "gender" IS NOT NULL
           AND lower(btrim("gender")) NOT IN ('male', 'female');
    END IF;

    -- 4b. maritalStatus: already lowercase in the data ('married' / 'single').
    IF marital_is_text THEN
        UPDATE public."Employee"
           SET "maritalStatus" = lower(btrim("maritalStatus"))
         WHERE "maritalStatus" IS NOT NULL
           AND lower(btrim("maritalStatus")) IN ('single', 'married');

        UPDATE public."Employee"
           SET "maritalStatus" = NULL
         WHERE "maritalStatus" IS NOT NULL
           AND lower(btrim("maritalStatus")) NOT IN ('single', 'married');
    END IF;
END
$$;

-- 4c. jobGrade: NULL out-of-range values so the CHECK constraint in step 8
--     can be added without a full-table validation failure. No current row is
--     affected (observed range 1-18, zero NULLs). Safe on re-run because the
--     predicate is already false once the values are in range.
UPDATE public."Employee"
   SET "jobGrade" = NULL
 WHERE "jobGrade" IS NOT NULL
   AND ("jobGrade" < 1 OR "jobGrade" > 50);

-- 4d. disabilityStatus: collapse NULL -> false before SET NOT NULL.
--     No current row is affected (99 false / 2 true / 0 NULL).
UPDATE public."Employee"
   SET "disabilityStatus" = false
 WHERE "disabilityStatus" IS NULL;

-- ─── 5. Tighten column types (in place — data is preserved) ─────────────────
ALTER TABLE public."Employee"
    ALTER COLUMN "gender" TYPE "Gender"
    USING ("gender"::"Gender");

ALTER TABLE public."Employee"
    ALTER COLUMN "maritalStatus" TYPE "MaritalStatus"
    USING ("maritalStatus"::"MaritalStatus");

ALTER TABLE public."Employee"
    ALTER COLUMN "disabilityStatus" SET DEFAULT false;

ALTER TABLE public."Employee"
    ALTER COLUMN "disabilityStatus" SET NOT NULL;

-- ─── 6. Uniqueness: global -> per organization ─────────────────────────────
-- `employeeNumber` and `email` were globally @unique, which meant two tenants
-- could never issue the same employee number and could never share an email.
-- The app IS multi-tenant (Organization model, every query org-scoped), so
-- both constraints become org-scoped composites.
--
-- No de-duplication pass is needed here: the outgoing GLOBAL unique indexes
-- guarantee the table currently contains zero duplicate emails, and scoping to
-- `(organizationId, email)` can only ever ACCEPT MORE rows, never fewer. So the
-- replacement indexes below cannot fail.
--
-- `email` stays NOT NULL. It is simply no longer one of the nine columns the
-- UI exposes, so the application layer synthesises a deterministic
-- `<empid-slug>@placeholder.invalid` address when HR leaves it blank and flags
-- the row in the import error report. Keeping NOT NULL means the column can
-- never become ambiguous for the modules that read it.
DROP INDEX IF EXISTS public."Employee_employeeNumber_key";
DROP INDEX IF EXISTS public."Employee_email_key";

CREATE UNIQUE INDEX IF NOT EXISTS "Employee_org_employeeNumber_key"
    ON public."Employee" ("organizationId", "employeeNumber");

CREATE UNIQUE INDEX IF NOT EXISTS "Employee_org_email_key"
    ON public."Employee" ("organizationId", "email");

CREATE UNIQUE INDEX IF NOT EXISTS "Employee_org_nationalId_key"
    ON public."Employee" ("organizationId", "nationalId");

-- ─── 7. Soft-delete and department-filter indexes ──────────────────────────
-- Every list query is `organizationId = ? AND deletedAt IS NULL`, so this
-- composite is what stops the soft-delete predicate from degrading to a scan.
CREATE INDEX IF NOT EXISTS "Employee_organizationId_deletedAt_idx"
    ON public."Employee" ("organizationId", "deletedAt");

-- Composite department filter. The pre-existing standalone
-- "Employee_departmentId_idx" is kept because the datamodel still declares
-- `@@index([departmentId])`; this composite is what org-scoped filters use.
CREATE INDEX IF NOT EXISTS "Employee_organizationId_departmentId_idx"
    ON public."Employee" ("organizationId", "departmentId");

-- Align the pre-existing index name's letter case with what the Prisma
-- datamodel expects, so this migration leaves zero Employee drift.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'employee_organizationId_jobGrade_idx'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'Employee_organizationId_jobGrade_idx'
    ) THEN
        ALTER INDEX public."employee_organizationId_jobGrade_idx"
            RENAME TO "Employee_organizationId_jobGrade_idx";
    END IF;
END
$$;

-- ─── 8. Job grade range validation ─────────────────────────────────────────
-- Prisma cannot express CHECK constraints; Zod repeats the same 1-50 bound
-- client-side so the user gets a field-level message instead of a 500. This
-- constraint is the authoritative backstop (including for raw SQL / imports).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'Employee_jobGrade_range_check'
          AND conrelid = 'public."Employee"'::regclass
    ) THEN
        ALTER TABLE public."Employee"
            ADD CONSTRAINT "Employee_jobGrade_range_check"
            CHECK ("jobGrade" IS NULL OR "jobGrade" BETWEEN 1 AND 50);
    END IF;
END
$$;

-- ─── 9. Trigram indexes for the debounced search box ───────────────────────
-- The search is `firstname ILIKE '%q%' OR lastname ILIKE '%q%'
-- OR employeeNumber ILIKE '%q%' OR nationalId ILIKE '%q%'`. One GIN trigram
-- index per column lets Postgres answer that OR as a BitmapOr instead of a
-- sequential scan. Indexed on the raw column (not a lower() expression) so the
-- indexes match the `ILIKE` that Prisma emits for `mode: "insensitive"`.
CREATE INDEX IF NOT EXISTS "Employee_firstname_trgm_idx"
    ON public."Employee" USING gin ("firstname" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Employee_lastname_trgm_idx"
    ON public."Employee" USING gin ("lastname" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Employee_employeeNumber_trgm_idx"
    ON public."Employee" USING gin ("employeeNumber" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Employee_nationalId_trgm_idx"
    ON public."Employee" USING gin ("nationalId" gin_trgm_ops);

-- ─── 10. Verified: NO foreign key is added to house_allocations ────────────
-- Deliberate. `house_allocations.employeeId` has no FK to "Employee" today
-- (the two house-queue migrations that tried to add one referenced lowercase
-- `public.employees`, a table that never existed, so the constraint silently
-- no-opped). Adding it with `ON DELETE CASCADE` would DESTROY allocation
-- history on a hard delete — exactly what soft delete exists to prevent. It is
-- tracked as a follow-up in the module README, not fixed here.
