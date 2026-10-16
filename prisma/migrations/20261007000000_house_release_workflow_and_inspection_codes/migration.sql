-- Migration: House Release Workflow with Inspection and Release-Code Verification
--
-- 1. Extend `house_inspections` with lifecycle status, reason, and inside items checklist.
-- 2. Create `house_release_codes` table to securely store active and consumed release codes.

-- ── 1. Extend house_inspections ─────────────────────────────────────────────
ALTER TABLE "public"."house_inspections"
    ADD COLUMN IF NOT EXISTS "status" VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED',
    ADD COLUMN IF NOT EXISTS "reason" "HouseTerminationReason",
    ADD COLUMN IF NOT EXISTS "checklistBedCount" INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "checklistChairsCount" INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "checklistLockerCount" INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "checklistTablesCount" INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "checklistInsideItemsOk" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS "house_inspections_status_idx" ON "public"."house_inspections"("status");

-- ── 2. CreateTable house_release_codes ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."house_release_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "inspectionId" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "allocationId" UUID NOT NULL,
    "code" VARCHAR(4) NOT NULL,
    "activeCode" VARCHAR(4),
    "isConsumed" BOOLEAN NOT NULL DEFAULT false,
    "consumedAt" TIMESTAMP(6),
    "consumedBy" UUID,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" TIMESTAMP(6),
    "expiresAt" TIMESTAMP(6) NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "house_release_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "house_release_codes_inspectionId_key" ON "public"."house_release_codes"("inspectionId");
CREATE UNIQUE INDEX IF NOT EXISTS "house_release_codes_activeCode_key" ON "public"."house_release_codes"("activeCode");
CREATE INDEX IF NOT EXISTS "house_release_codes_organizationId_idx" ON "public"."house_release_codes"("organizationId");
CREATE INDEX IF NOT EXISTS "house_release_codes_householdId_idx" ON "public"."house_release_codes"("householdId");
CREATE INDEX IF NOT EXISTS "house_release_codes_allocationId_idx" ON "public"."house_release_codes"("allocationId");
CREATE INDEX IF NOT EXISTS "house_release_codes_code_idx" ON "public"."house_release_codes"("code");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'house_release_codes_organizationId_fkey'
    ) THEN
        ALTER TABLE "public"."house_release_codes" ADD CONSTRAINT "house_release_codes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'house_release_codes_inspectionId_fkey'
    ) THEN
        ALTER TABLE "public"."house_release_codes" ADD CONSTRAINT "house_release_codes_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "public"."house_inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'house_release_codes_householdId_fkey'
    ) THEN
        ALTER TABLE "public"."house_release_codes" ADD CONSTRAINT "house_release_codes_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'house_release_codes_allocationId_fkey'
    ) THEN
        ALTER TABLE "public"."house_release_codes" ADD CONSTRAINT "house_release_codes_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "public"."house_allocations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'house_release_codes_consumedBy_fkey'
    ) THEN
        ALTER TABLE "public"."house_release_codes" ADD CONSTRAINT "house_release_codes_consumedBy_fkey" FOREIGN KEY ("consumedBy") REFERENCES "public"."user"("userid") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
