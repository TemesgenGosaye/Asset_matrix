-- House Queue decision ledger / state machine.
-- Persists ONLY allocation decisions and engine snapshots. The priority
-- engine (Engine A) and house recommendation (Engine B) are recomputed live
-- on read; this table stores the resulting allocated / skipped / deferred /
-- released decisions so they survive recomputation and stay auditable.
-- One current thread per (organizationId, employeeId).

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."house_allocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "householdId" UUID,
    "status" VARCHAR(30) NOT NULL DEFAULT 'ready_for_allocation',
    "recommendedHouseId" UUID,
    "mcdScore" DOUBLE PRECISION,
    "priorityRank" INTEGER,
    "reason" VARCHAR(500),
    "decidedBy" UUID,
    "decidedAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "house_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "house_allocations_organizationId_employeeId_key" ON "public"."house_allocations"("organizationId", "employeeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "house_allocations_organizationId_idx" ON "public"."house_allocations"("organizationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "house_allocations_employeeId_idx" ON "public"."house_allocations"("employeeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "house_allocations_householdId_idx" ON "public"."house_allocations"("householdId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "house_allocations_status_idx" ON "public"."house_allocations"("status");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'house_allocations_organizationId_fkey'
    ) THEN
        ALTER TABLE "public"."house_allocations" ADD CONSTRAINT "house_allocations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'house_allocations_employeeId_fkey'
    ) THEN
        ALTER TABLE "public"."house_allocations" ADD CONSTRAINT "house_allocations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "public"."employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'house_allocations_householdId_fkey'
    ) THEN
        ALTER TABLE "public"."house_allocations" ADD CONSTRAINT "house_allocations_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."households"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;