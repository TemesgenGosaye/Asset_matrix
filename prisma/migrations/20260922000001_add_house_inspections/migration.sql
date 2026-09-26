-- Migration: Release Workflow - historied allocation ledger + house inspections
--
-- The House Queue decision ledger becomes historied (append-only with
-- updates): at most ONE row per (organizationId, employeeId) may have
-- status 'allocated' at a time, while any number of terminated rows survive
-- for the Terminated Houses archive. A transfer is folded into the ledger as
-- terminate-old + create-new within a single transaction.
--
--  1. Drop the old composite unique index on (organizationId, employeeId).
--  2. Replace it with a PARTIAL unique index covering only status='allocated'.
--  3. Create the `house_inspections` table, raised 1:1 with the terminated
--     release row the moment a house is vacated through the Release Workflow.
--
-- Idempotent so it can be re-run safely.

-- ── 1. Drop the old composite unique index ────────────────────────────────
DROP INDEX IF EXISTS "public"."house_allocations_organizationId_employeeId_key";

-- ── 2. Partial unique index: one LIVE allocation per employee per org ───────
CREATE UNIQUE INDEX IF NOT EXISTS "house_allocations_org_employee_live_key"
    ON "public"."house_allocations"("organizationId", "employeeId")
    WHERE "status" = 'allocated';

-- ── 3. CreateTable house_inspections ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."house_inspections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "allocationId" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "inspectorId" UUID,
    "scheduledDate" DATE,
    "checklistWindow" BOOLEAN NOT NULL DEFAULT false,
    "checklistDoor" BOOLEAN NOT NULL DEFAULT false,
    "checklistWaterPanel" BOOLEAN NOT NULL DEFAULT false,
    "checklistRoof" BOOLEAN NOT NULL DEFAULT false,
    "checklistWall" BOOLEAN NOT NULL DEFAULT false,
    "checklistElectricity" BOOLEAN NOT NULL DEFAULT false,
    "conditionNote" VARCHAR(1000),
    "photoUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "resolvedTo" VARCHAR(20),
    "completedAt" TIMESTAMP(6),
    "completedBy" UUID,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "house_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "house_inspections_allocationId_key" ON "public"."house_inspections"("allocationId");
CREATE INDEX IF NOT EXISTS "house_inspections_organizationId_idx" ON "public"."house_inspections"("organizationId");
CREATE INDEX IF NOT EXISTS "house_inspections_householdId_idx" ON "public"."house_inspections"("householdId");
CREATE INDEX IF NOT EXISTS "house_inspections_inspectorId_idx" ON "public"."house_inspections"("inspectorId");
CREATE INDEX IF NOT EXISTS "house_inspections_resolvedTo_idx" ON "public"."house_inspections"("resolvedTo");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'house_inspections_organizationId_fkey'
    ) THEN
        ALTER TABLE "public"."house_inspections" ADD CONSTRAINT "house_inspections_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'house_inspections_allocationId_fkey'
    ) THEN
        ALTER TABLE "public"."house_inspections" ADD CONSTRAINT "house_inspections_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "public"."house_allocations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'house_inspections_householdId_fkey'
    ) THEN
        ALTER TABLE "public"."house_inspections" ADD CONSTRAINT "house_inspections_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;