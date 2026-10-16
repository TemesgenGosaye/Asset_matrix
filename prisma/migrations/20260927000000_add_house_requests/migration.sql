-- Migration: House Request — the employee's own application for a house.
--
-- WHY: the House Queue must only ever score, rank and list employees who have
-- actually submitted a request. Previously the engine loaded every active
-- employee, so the queue was a staff directory wearing a ranking table. This
-- migration introduces the ticket that gates queue entry.
--
-- DATA-PRESERVATION: pure addition. No existing table is altered and no existing
-- row is touched, so the House Queue simply starts empty until employees file
-- their first request. That is the intended policy, not a data loss event.
--
-- SAFETY PROPERTIES:
--   * CREATE TABLE / CREATE INDEX IF NOT EXISTS — re-running is a no-op.
--   * The partial unique index is the authoritative one-active-request
--     guarantee. Prisma cannot express `WHERE status = 'submitted'`, so it is
--     hand-written here exactly like the existing `house_allocations` live-row
--     index. A concurrent double submit loses on the index instead of creating
--     two live requests; the service layer translates that into a 409.
--   * Foreign keys are added inside guarded DO blocks so the migration is safe
--     to replay against a database where they already exist.
--
-- ROLLBACK / DATA IMPACT:
--   DROP TABLE public.house_requests;  -- destroys all submitted requests.
--                                        The House Queue would revert to its
--                                        previous "all active employees"
--                                        behaviour only if engine.ts were also
--                                        reverted; the gate is code, not schema.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."house_requests" (
    "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID         NOT NULL,
    "employeeId"     UUID         NOT NULL,
    "remarks"        VARCHAR(1000) NOT NULL,
    "status"         VARCHAR(20)  NOT NULL DEFAULT 'submitted',
    "submittedBy"    UUID,
    "decidedAt"      TIMESTAMP(6),
    "decidedBy"      UUID,
    "createdAt"      TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "house_requests_pkey" PRIMARY KEY ("id"),
    -- Remarks are the applicant's justification for the whole request, so a
    -- blank one is rejected at the storage layer too (the Zod schema and the
    -- service enforce the 10..1000 length range).
    CONSTRAINT "house_requests_remarks_length_check"
        CHECK (char_length(btrim("remarks")) BETWEEN 10 AND 1000),
    CONSTRAINT "house_requests_status_check"
        CHECK ("status" IN ('submitted', 'cancelled'))
);

COMMENT ON TABLE "public"."house_requests" IS
    'Employee-submitted applications for a house. Only status=''submitted'' rows are active and place an employee in the House Queue.';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Covers the engine's queue gate: WHERE organizationId = ? AND status = 'submitted'.
CREATE INDEX IF NOT EXISTS "house_requests_organizationId_status_employeeId_idx"
    ON "public"."house_requests"("organizationId", "status", "employeeId");

CREATE INDEX IF NOT EXISTS "house_requests_employeeId_idx"
    ON "public"."house_requests"("employeeId");

CREATE INDEX IF NOT EXISTS "house_requests_organizationId_createdAt_idx"
    ON "public"."house_requests"("organizationId", "createdAt");

CREATE INDEX IF NOT EXISTS "house_requests_submittedBy_idx"
    ON "public"."house_requests"("submittedBy");

-- THE constraint the task asks for: at most one ACTIVE request per employee.
-- Only `submitted` rows are covered, so a fulfilled or cancelled request never
-- blocks the employee from filing again.
CREATE UNIQUE INDEX IF NOT EXISTS "house_requests_active_employee_key"
    ON "public"."house_requests"("organizationId", "employeeId")
    WHERE "status" = 'submitted';

-- ---------------------------------------------------------------------------
-- Foreign keys
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'house_requests_organizationId_fkey'
    ) THEN
        ALTER TABLE "public"."house_requests"
            ADD CONSTRAINT "house_requests_organizationId_fkey"
            FOREIGN KEY ("organizationId")
            REFERENCES "public"."organizations"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'house_requests_employeeId_fkey'
    ) THEN
        ALTER TABLE "public"."house_requests"
            ADD CONSTRAINT "house_requests_employeeId_fkey"
            FOREIGN KEY ("employeeId")
            REFERENCES "public"."Employee"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'house_requests_submittedBy_fkey'
    ) THEN
        ALTER TABLE "public"."house_requests"
            ADD CONSTRAINT "house_requests_submittedBy_fkey"
            FOREIGN KEY ("submittedBy")
            REFERENCES "public"."user"("userid")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'house_requests_decidedBy_fkey'
    ) THEN
        ALTER TABLE "public"."house_requests"
            ADD CONSTRAINT "house_requests_decidedBy_fkey"
            FOREIGN KEY ("decidedBy")
            REFERENCES "public"."user"("userid")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
