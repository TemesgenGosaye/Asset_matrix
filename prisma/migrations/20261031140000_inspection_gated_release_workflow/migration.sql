-- Migration: Inspection-gated house release workflow
--
-- Adds:
--  - `effectiveDate` and `transferHouseholdId` to `house_allocations`
--  - Alters default of `house_inspections.status` to 'PENDING'
--  - Ensures no release code tables or columns exist

ALTER TABLE "public"."house_allocations"
  ADD COLUMN IF NOT EXISTS "effectiveDate" DATE,
  ADD COLUMN IF NOT EXISTS "transferHouseholdId" UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'house_allocations_transferHouseholdId_fkey'
          AND conrelid = 'public."house_allocations"'::regclass
    ) THEN
        ALTER TABLE "public"."house_allocations"
          ADD CONSTRAINT "house_allocations_transferHouseholdId_fkey"
          FOREIGN KEY ("transferHouseholdId")
          REFERENCES "public"."households"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "house_allocations_transferHouseholdId_idx"
  ON "public"."house_allocations" ("transferHouseholdId");

ALTER TABLE "public"."house_inspections"
  ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- Drop any lingering release code artifacts
DROP TABLE IF EXISTS "public"."house_release_codes";
ALTER TABLE "public"."house_inspections" DROP COLUMN IF EXISTS "releaseCode";
ALTER TABLE "public"."house_allocations" DROP COLUMN IF EXISTS "releaseCode";
