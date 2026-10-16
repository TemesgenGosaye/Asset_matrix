-- Handback damage costs, and the termination-receipt snapshot.
--
-- 1. `house_inspections` learns a repair cost per damaged part, plus the total.
-- 2. `house_inspection_archives` learns the same, so an archived handback keeps
--    the money that its damage rows refer to.
-- 3. New `house_termination_receipts`: the frozen snapshot a signed handback
--    receipt prints from, so a reprint reproduces the original.
--
-- Additive only. No column is dropped or retyped, so every inspection recorded
-- before this migration keeps its checklist, its note and its resolution; the
-- new cost columns default to 0, which reads as "nothing priced" and is the
-- correct meaning for a checklist completed before costs were recorded.
--
-- Costs are Decimal(12,2), matching every other money column in this schema.

-- ── 1. house_inspections: per-part repair costs ─────────────────────────────
ALTER TABLE "public"."house_inspections"
    ADD COLUMN IF NOT EXISTS "costWindow"       DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "costDoor"         DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "costWaterPanel"   DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "costRoof"         DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "costWall"         DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "costElectricity"  DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "totalDamageCost"  DECIMAL(12,2) NOT NULL DEFAULT 0;

-- No backfill. Rows that already carry a damaged part predate cost recording, so
-- their cost is genuinely unknown; the DEFAULT 0 above is the honest reading of
-- "not recorded", and inventing a figure for a signed document would be worse
-- than leaving the gap visible. `totalDamageCost` therefore stays 0 for
-- pre-existing rows, which is consistent with their per-part costs.

-- ── 2. house_inspection_archives: same costs ────────────────────────────────
ALTER TABLE "public"."house_inspection_archives"
    ADD COLUMN IF NOT EXISTS "costWindow"       DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "costDoor"         DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "costWaterPanel"   DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "costRoof"         DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "costWall"         DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "costElectricity"  DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "totalDamageCost"  DECIMAL(12,2) NOT NULL DEFAULT 0;

-- ── 3. house_termination_receipts ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."house_termination_receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "inspectionId" UUID NOT NULL,
    "allocationId" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "receiptNo" VARCHAR(40) NOT NULL,
    "damageSnapshot" JSONB NOT NULL,
    "totalDamageCost" DECIMAL(12,2) NOT NULL,
    "conditionNote" VARCHAR(1000),
    "completedAt" TIMESTAMP(6) NOT NULL,
    "printedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "printedBy" UUID,
    "printCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "house_termination_receipts_pkey" PRIMARY KEY ("id")
);

-- One snapshot per inspection: the receipt is frozen on first print, so a second
-- print must read this row rather than mint a competing one.
CREATE UNIQUE INDEX IF NOT EXISTS "house_termination_receipts_inspectionId_key"
    ON "public"."house_termination_receipts"("inspectionId");
CREATE INDEX IF NOT EXISTS "house_termination_receipts_organizationId_idx"
    ON "public"."house_termination_receipts"("organizationId");
CREATE INDEX IF NOT EXISTS "house_termination_receipts_allocationId_idx"
    ON "public"."house_termination_receipts"("allocationId");
CREATE INDEX IF NOT EXISTS "house_termination_receipts_householdId_idx"
    ON "public"."house_termination_receipts"("householdId");
CREATE INDEX IF NOT EXISTS "house_termination_receipts_printedAt_idx"
    ON "public"."house_termination_receipts"("printedAt");

-- The foreign keys are RESTRICT for the same reason as the inspection's own:
-- a termination receipt is filed evidence. Deleting the house or the allocation
-- must fail loudly rather than silently destroy the record of what was owed.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'house_termination_receipts_organizationId_fkey'
    ) THEN
        ALTER TABLE "public"."house_termination_receipts" ADD CONSTRAINT "house_termination_receipts_organizationId_fkey"
            FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'house_termination_receipts_inspectionId_fkey'
    ) THEN
        ALTER TABLE "public"."house_termination_receipts" ADD CONSTRAINT "house_termination_receipts_inspectionId_fkey"
            FOREIGN KEY ("inspectionId") REFERENCES "public"."house_inspections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'house_termination_receipts_allocationId_fkey'
    ) THEN
        ALTER TABLE "public"."house_termination_receipts" ADD CONSTRAINT "house_termination_receipts_allocationId_fkey"
            FOREIGN KEY ("allocationId") REFERENCES "public"."house_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'house_termination_receipts_householdId_fkey'
    ) THEN
        ALTER TABLE "public"."house_termination_receipts" ADD CONSTRAINT "house_termination_receipts_householdId_fkey"
            FOREIGN KEY ("householdId") REFERENCES "public"."households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'house_termination_receipts_printedBy_fkey'
    ) THEN
        ALTER TABLE "public"."house_termination_receipts" ADD CONSTRAINT "house_termination_receipts_printedBy_fkey"
            FOREIGN KEY ("printedBy") REFERENCES "public"."user"("userid") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
