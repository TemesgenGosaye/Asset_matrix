-- Migration: Pay Rent - house / shop / grocery rent management.
--
-- WHY: the Facility & House module allocates staff houses through the House
-- Queue, but the factory also rents shops, groceries and other premises out to
-- external parties. Those leases carry a recurring monthly price and therefore
-- need a real payment ledger (schedule + receipts) rather than the allocation
-- state machine, which models occupancy and not money.
--
-- DATA-PRESERVATION: pure addition. No existing table is altered and no
-- existing row is read or written, so every other module is unaffected and the
-- Pay Rent register simply starts empty. That is the intended policy.
--
-- DESIGN RULES ENCODED HERE:
--   * Money is Decimal(12,2) everywhere. No float column exists.
--   * Financial rows are never hard-deleted. Renters archive via "deletedAt",
--     installments are VOIDED, payments are voided-but-kept. Every FK that a
--     financial row depends on is ON DELETE RESTRICT so a careless DELETE loses
--     on the constraint instead of silently orphaning an amount that was
--     reported to the treasury.
--   * The schedule is materialised eagerly: creating a renter writes one
--     rent_installments row per month of the term in the same transaction.
--   * Derived facts (OVERDUE, outstanding, next due, Completed) are NOT stored.
--     They are computed by aggregation on read, so they cannot drift.
--
-- SAFETY PROPERTIES:
--   * CREATE TYPE / CREATE TABLE / CREATE INDEX IF NOT EXISTS - re-running the
--     migration against a partially applied database is a no-op.
--   * The partial unique indexes are the authoritative concurrency guarantees.
--     Prisma cannot express `WHERE ... = ...`, so they are hand-written here
--     exactly like the existing house_requests / house_allocations indexes:
--       - rent_renters_active_national_id_key  -> one live renter per National
--         ID, so a concurrent double registration loses on the index and the
--         service turns that into a 409 instead of creating two renters.
--       - rent_renter_phones_primary_key        -> exactly one primary phone
--         per renter, so the "mark as primary" update can never produce two.
--       - rent_installments_renterId_monthNumber_key -> the double-pay guard.
--   * Foreign keys are added inside guarded DO blocks so the migration is safe
--     to replay against a database where they already exist.
--
-- ROLLBACK / DATA IMPACT:
--   DROP TABLE public.rent_payments, public.rent_installments,
--              public.rent_renter_phones, public.rent_receipt_sequences,
--              public.rent_renters CASCADE;
--   DROP TYPE public."RentInstallmentStatus", public."RentPaymentMethod",
--              public."RentLeaseStatus", public."RentType";
--   -- Destroys every receipt ever issued. Do not run against production.

-- ---------------------------------------------------------------------------
-- pg_trgm powers the debounced substring search over name / National ID /
-- phone in the Pay Rent table. Created by the employee migration; repeated
-- here so this migration is self-contained on a fresh database.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- Enums
--
-- PostgreSQL has no `CREATE TYPE IF NOT EXISTS`, so each is guarded. Note what
-- is deliberately ABSENT: no `OVERDUE` member on RentInstallmentStatus and no
-- `Overdue` member on RentLeaseStatus. Overdue is DERIVED at read time
-- (`dueDate < today AND status = UNPAID`), never persisted, never settable by
-- a human - see src/lib/rent/schedule.ts and src/lib/rent/queries.ts.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                   WHERE t.typname = 'RentType' AND n.nspname = 'public') THEN
        CREATE TYPE "public"."RentType" AS ENUM ('Shop', 'Grocery', 'Other');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                   WHERE t.typname = 'RentInstallmentStatus' AND n.nspname = 'public') THEN
        CREATE TYPE "public"."RentInstallmentStatus" AS ENUM ('UNPAID', 'PAID', 'VOIDED');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                   WHERE t.typname = 'RentPaymentMethod' AND n.nspname = 'public') THEN
        CREATE TYPE "public"."RentPaymentMethod" AS ENUM ('Cash', 'BankTransfer', 'Other');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                   WHERE t.typname = 'RentLeaseStatus' AND n.nspname = 'public') THEN
        CREATE TYPE "public"."RentLeaseStatus" AS ENUM ('Active', 'Completed', 'Terminated');
    END IF;
END $$;

COMMENT ON TYPE "public"."RentType" IS
    'Kind of premises rented. Other requires rent_renters."rentTypeDetail".';
COMMENT ON TYPE "public"."RentInstallmentStatus" IS
    'Persisted month state. OVERDUE is derived from dueDate + today and is never stored.';
COMMENT ON TYPE "public"."RentLeaseStatus" IS
    'Persisted lease state. Overdue is a display state derived from the installment rows.';

-- ---------------------------------------------------------------------------
-- Table: rent_renters
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."rent_renters" (
    "id"                UUID             NOT NULL DEFAULT gen_random_uuid(),
    "organizationId"    UUID             NOT NULL,
    "firstName"         VARCHAR(50)      NOT NULL,
    "lastName"          VARCHAR(50)      NOT NULL,
    "gender"            "Gender"         NOT NULL,
    "nationalId"        VARCHAR(64)      NOT NULL,
    "rentType"          "RentType"       NOT NULL,
    "rentTypeDetail"    VARCHAR(200),
    "monthlyPrice"      DECIMAL(12,2)    NOT NULL,
    "startDate"         DATE             NOT NULL,
    "termMonths"        SMALLINT         NOT NULL,
    "endDate"           DATE             NOT NULL,
    "status"            "RentLeaseStatus" NOT NULL DEFAULT 'Active',
    "terminatedAt"      TIMESTAMP(6),
    "terminatedById"    UUID,
    "terminationReason" VARCHAR(500),
    "archivedReason"    VARCHAR(500),
    "createdById"       UUID,
    "updatedById"       UUID,
    "deletedAt"         TIMESTAMP(6),
    "createdAt"         TIMESTAMP(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rent_renters_pkey" PRIMARY KEY ("id"),

    -- Mirrored from Zod (src/lib/rent/schemas.ts) so an import or a direct SQL
    -- write cannot produce an impossible lease.
    CONSTRAINT "rent_renters_price_positive_check"
        CHECK ("monthlyPrice" > 0),
    CONSTRAINT "rent_renters_term_range_check"
        CHECK ("termMonths" BETWEEN 1 AND 120),
    CONSTRAINT "rent_renters_names_length_check"
        CHECK (char_length(btrim("firstName")) BETWEEN 2 AND 50
           AND char_length(btrim("lastName"))  BETWEEN 2 AND 50),
    -- Digits only. Kept as a CHECK (not just Zod) so personal-data hygiene is
    -- a storage guarantee rather than an application convention.
    CONSTRAINT "rent_renters_national_id_digits_check"
        CHECK ("nationalId" ~ '^[0-9]+$'),
    -- "Other" is meaningless without a description. The converse (a description
    -- left over after switching away from Other) is allowed so an edit that adds
    -- a helpful note to a Shop is not rejected.
    CONSTRAINT "rent_renters_rent_type_detail_check"
        CHECK ("rentType" <> 'Other'
            OR ("rentTypeDetail" IS NOT NULL AND char_length(btrim("rentTypeDetail")) > 0)),
    -- A terminated lease must carry its reason; an active lease must not claim
    -- a termination timestamp. Both halves matter for the audit trail.
    CONSTRAINT "rent_renters_termination_consistency_check"
        CHECK (("status" = 'Terminated') = ("terminatedAt" IS NOT NULL)),
    CONSTRAINT "rent_renters_dates_ordered_check"
        CHECK ("endDate" >= "startDate")
);

COMMENT ON TABLE "public"."rent_renters" IS
    'People renting shops, groceries or other premises from the factory, with their lease terms. Archived via deletedAt, never hard-deleted.';

-- ---------------------------------------------------------------------------
-- Table: rent_renter_phones
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."rent_renter_phones" (
    "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID         NOT NULL,
    "renterId"       UUID         NOT NULL,
    "phone"          VARCHAR(20)  NOT NULL,
    "isPrimary"      BOOLEAN      NOT NULL DEFAULT false,
    "createdAt"      TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rent_renter_phones_pkey" PRIMARY KEY ("id"),

    -- Stored in E.164 by src/lib/rent/validators.ts, so a '+' and 9..15 digits.
    -- "At least one and at most three phones per renter" is enforced by Zod and
    -- by the service (a CHECK cannot contain a subquery, and a deferrable
    -- per-parent count would need a trigger, which this codebase avoids).
    CONSTRAINT "rent_renter_phones_e164_check"
        CHECK ("phone" ~ '^\+[1-9][0-9]{9,14}$')
);

COMMENT ON TABLE "public"."rent_renter_phones" IS
    'Renter contact numbers in E.164 form. Personal data: never written to the application log.';

-- ---------------------------------------------------------------------------
-- Table: rent_installments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."rent_installments" (
    "id"             UUID                       NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID                       NOT NULL,
    "renterId"       UUID                       NOT NULL,
    "monthNumber"    SMALLINT                   NOT NULL,
    "dueDate"        DATE                       NOT NULL,
    "amountDue"      DECIMAL(12,2)              NOT NULL,
    "status"         "RentInstallmentStatus"    NOT NULL DEFAULT 'UNPAID',
    "paidAt"         DATE,
    "paidById"       UUID,
    "receiptNumber"  VARCHAR(40),
    "paymentMethod"  "RentPaymentMethod",
    "referenceNumber" VARCHAR(100),
    "note"           VARCHAR(500),
    "voidedAt"       TIMESTAMP(6),
    "voidedById"     UUID,
    "voidReason"     VARCHAR(500),
    "createdById"    UUID,
    "updatedById"    UUID,
    "createdAt"      TIMESTAMP(6)               NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(6)               NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rent_installments_pkey" PRIMARY KEY ("id"),

    CONSTRAINT "rent_installments_month_range_check"
        CHECK ("monthNumber" >= 1),
    CONSTRAINT "rent_installments_amount_positive_check"
        CHECK ("amountDue" > 0),
    -- A PAID month must be fully stamped: payment date, payer, receipt and
    -- method. This is what makes "total paid" trustworthy without joining the
    -- receipt table.
    CONSTRAINT "rent_installments_paid_requires_receipt_check"
        CHECK ("status" <> 'PAID'
            OR ("paidAt" IS NOT NULL AND "paidById" IS NOT NULL
                AND "receiptNumber" IS NOT NULL AND "paymentMethod" IS NOT NULL)),
    -- A non-PAID month must not keep a receipt: reopening a voided payment
    -- clears these, and a stale receipt on an unpaid month would make the
    -- "next due" badge lie.
    CONSTRAINT "rent_installments_unpaid_has_no_receipt_check"
        CHECK ("status" = 'PAID'
            OR ("paidAt" IS NULL AND "paidById" IS NULL AND "receiptNumber" IS NULL)),
    -- VOIDED is a deliberate, reason-bearing act - same policy as terminate.
    CONSTRAINT "rent_installments_voided_requires_reason_check"
        CHECK ("status" <> 'VOIDED'
            OR ("voidedAt" IS NOT NULL AND char_length(btrim(COALESCE("voidReason", ''))) > 0))
);

COMMENT ON TABLE "public"."rent_installments" IS
    'One month of rent for one renter. amountDue is a snapshot of the price at generation time; OVERDUE is derived, never stored.';

-- ---------------------------------------------------------------------------
-- Table: rent_payments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."rent_payments" (
    "id"              UUID                NOT NULL DEFAULT gen_random_uuid(),
    "organizationId"  UUID                NOT NULL,
    "renterId"        UUID                NOT NULL,
    "installmentId"   UUID                NOT NULL,
    "receiptNumber"   VARCHAR(40)         NOT NULL,
    "amount"          DECIMAL(12,2)       NOT NULL,
    "paidOn"          DATE                NOT NULL,
    "method"          "RentPaymentMethod" NOT NULL,
    "referenceNumber" VARCHAR(100),
    "note"            VARCHAR(500),
    "voidedAt"        TIMESTAMP(6),
    "voidedById"      UUID,
    "voidReason"      VARCHAR(500),
    "createdById"     UUID,
    "updatedById"     UUID,
    "createdAt"       TIMESTAMP(6)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(6)        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rent_payments_pkey" PRIMARY KEY ("id"),

    CONSTRAINT "rent_payments_amount_positive_check"
        CHECK ("amount" > 0),
    -- Receipt shape RENT-2026-000123. Enforced so a malformed receipt can never
    -- reach the treasury's records even via a direct write.
    CONSTRAINT "rent_payments_receipt_format_check"
        CHECK ("receiptNumber" ~ '^RENT-[0-9]{4}-[0-9]{6}$'),
    CONSTRAINT "rent_payments_voided_requires_reason_check"
        CHECK ("voidedAt" IS NULL
            OR (char_length(btrim(COALESCE("voidReason", ''))) > 0))
);

COMMENT ON TABLE "public"."rent_payments" IS
    'Append-only rent receipts. A void sets voidedAt/voidedById/voidReason and reverts the installment to UNPAID; the row is never deleted so receipt numbers are never re-issued.';

-- ---------------------------------------------------------------------------
-- Table: rent_receipt_sequences
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."rent_receipt_sequences" (
    "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID         NOT NULL,
    "year"           SMALLINT     NOT NULL,
    "lastValue"      INTEGER      NOT NULL DEFAULT 0,
    "createdAt"      TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rent_receipt_sequences_pkey" PRIMARY KEY ("id"),

    CONSTRAINT "rent_receipt_sequences_year_range_check"
        CHECK ("year" BETWEEN 2000 AND 9999),
    CONSTRAINT "rent_receipt_sequences_last_value_non_negative_check"
        CHECK ("lastValue" >= 0)
);

COMMENT ON TABLE "public"."rent_receipt_sequences" IS
    'Per-organization, per-year receipt counter. Allocated with INSERT .. ON CONFLICT DO UPDATE, which is concurrency-safe without table locks.';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "rent_renters_organizationId_deletedAt_idx"
    ON "public"."rent_renters"("organizationId", "deletedAt");
CREATE INDEX IF NOT EXISTS "rent_renters_organizationId_lastName_firstName_idx"
    ON "public"."rent_renters"("organizationId", "lastName", "firstName");
CREATE INDEX IF NOT EXISTS "rent_renters_organizationId_status_idx"
    ON "public"."rent_renters"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "rent_renters_organizationId_rentType_idx"
    ON "public"."rent_renters"("organizationId", "rentType");
CREATE INDEX IF NOT EXISTS "rent_renters_organizationId_gender_idx"
    ON "public"."rent_renters"("organizationId", "gender");
CREATE INDEX IF NOT EXISTS "rent_renters_organizationId_startDate_idx"
    ON "public"."rent_renters"("organizationId", "startDate");
CREATE INDEX IF NOT EXISTS "rent_renters_organizationId_nationalId_idx"
    ON "public"."rent_renters"("organizationId", "nationalId");

-- Debounced substring search across name / National ID.
CREATE INDEX IF NOT EXISTS "rent_renters_firstName_trgm_idx"
    ON "public"."rent_renters" USING gin ("firstName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "rent_renters_lastName_trgm_idx"
    ON "public"."rent_renters" USING gin ("lastName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "rent_renters_nationalId_trgm_idx"
    ON "public"."rent_renters" USING gin ("nationalId" gin_trgm_ops);

-- THE constraint: at most one LIVE renter per National ID per organization.
-- Archived rows (deletedAt IS NOT NULL) are excluded, so archiving a renter
-- frees their National ID for a new registration while the archived record
-- keeps its history. Prisma cannot express the WHERE clause, hence hand-written
-- (same pattern as house_requests_active_employee_key).
CREATE UNIQUE INDEX IF NOT EXISTS "rent_renters_active_national_id_key"
    ON "public"."rent_renters"("organizationId", "nationalId")
    WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "rent_renter_phones_organizationId_phone_idx"
    ON "public"."rent_renter_phones"("organizationId", "phone");
CREATE UNIQUE INDEX IF NOT EXISTS "rent_renter_phones_renterId_phone_key"
    ON "public"."rent_renter_phones"("renterId", "phone");

-- THE constraint: exactly one primary phone per renter. Same reasoning as the
-- National ID index - a partial unique is the only way to express it.
CREATE UNIQUE INDEX IF NOT EXISTS "rent_renter_phones_primary_key"
    ON "public"."rent_renter_phones"("renterId")
    WHERE "isPrimary";

-- Overdue scan and "next due" lookups.
CREATE INDEX IF NOT EXISTS "rent_installments_organizationId_status_dueDate_idx"
    ON "public"."rent_installments"("organizationId", "status", "dueDate");
-- Earliest-unpaid-month lookup that enforces chronological payment order.
CREATE INDEX IF NOT EXISTS "rent_installments_renterId_status_monthNumber_idx"
    ON "public"."rent_installments"("renterId", "status", "monthNumber");
CREATE INDEX IF NOT EXISTS "rent_installments_renterId_dueDate_idx"
    ON "public"."rent_installments"("renterId", "dueDate");
-- THE double-pay guard: a month can exist only once per renter.
CREATE UNIQUE INDEX IF NOT EXISTS "rent_installments_renterId_monthNumber_key"
    ON "public"."rent_installments"("renterId", "monthNumber");

CREATE INDEX IF NOT EXISTS "rent_payments_renterId_paidOn_idx"
    ON "public"."rent_payments"("renterId", "paidOn");
CREATE INDEX IF NOT EXISTS "rent_payments_installmentId_idx"
    ON "public"."rent_payments"("installmentId");
CREATE INDEX IF NOT EXISTS "rent_payments_organizationId_voidedAt_paidOn_idx"
    ON "public"."rent_payments"("organizationId", "voidedAt", "paidOn");
-- THE receipt-number guarantee, per organization.
CREATE UNIQUE INDEX IF NOT EXISTS "rent_payments_organizationId_receiptNumber_key"
    ON "public"."rent_payments"("organizationId", "receiptNumber");

-- A month may only be settled by ONE live payment. Voided payments are excluded
-- so the month can legitimately be re-paid after a void, while the voided
-- receipt keeps its number forever.
CREATE UNIQUE INDEX IF NOT EXISTS "rent_payments_active_installment_key"
    ON "public"."rent_payments"("installmentId")
    WHERE "voidedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "rent_receipt_sequences_organizationId_year_key"
    ON "public"."rent_receipt_sequences"("organizationId", "year");

-- ---------------------------------------------------------------------------
-- Foreign keys
--
-- Cascade from the organization (dropping a tenant drops its rent ledger),
-- RESTRICT everywhere inside the ledger so a financial record can never be
-- orphaned by deleting a renter or a month.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rent_renters_organizationId_fkey') THEN
        ALTER TABLE "public"."rent_renters"
            ADD CONSTRAINT "rent_renters_organizationId_fkey"
            FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rent_renter_phones_organizationId_fkey') THEN
        ALTER TABLE "public"."rent_renter_phones"
            ADD CONSTRAINT "rent_renter_phones_organizationId_fkey"
            FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rent_renter_phones_renterId_fkey') THEN
        ALTER TABLE "public"."rent_renter_phones"
            ADD CONSTRAINT "rent_renter_phones_renterId_fkey"
            FOREIGN KEY ("renterId") REFERENCES "public"."rent_renters"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rent_installments_organizationId_fkey') THEN
        ALTER TABLE "public"."rent_installments"
            ADD CONSTRAINT "rent_installments_organizationId_fkey"
            FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rent_installments_renterId_fkey') THEN
        ALTER TABLE "public"."rent_installments"
            ADD CONSTRAINT "rent_installments_renterId_fkey"
            FOREIGN KEY ("renterId") REFERENCES "public"."rent_renters"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rent_payments_organizationId_fkey') THEN
        ALTER TABLE "public"."rent_payments"
            ADD CONSTRAINT "rent_payments_organizationId_fkey"
            FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rent_payments_renterId_fkey') THEN
        ALTER TABLE "public"."rent_payments"
            ADD CONSTRAINT "rent_payments_renterId_fkey"
            FOREIGN KEY ("renterId") REFERENCES "public"."rent_renters"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rent_payments_installmentId_fkey') THEN
        ALTER TABLE "public"."rent_payments"
            ADD CONSTRAINT "rent_payments_installmentId_fkey"
            FOREIGN KEY ("installmentId") REFERENCES "public"."rent_installments"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rent_receipt_sequences_organizationId_fkey') THEN
        ALTER TABLE "public"."rent_receipt_sequences"
            ADD CONSTRAINT "rent_receipt_sequences_organizationId_fkey"
            FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
