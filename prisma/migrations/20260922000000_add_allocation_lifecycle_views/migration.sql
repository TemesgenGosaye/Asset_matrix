-- Migration: Add allocation lifecycle views (occupancy + termination)
--
-- Adds:
--  1. `HouseOccupancyStatus` enum (Vacant | Occupied | Maintenance) and the
--     `households."occupancyStatus"` column (default Vacant, back-filled from
--     the current register state and the allocation ledger).
--  2. `HouseTerminationReason` enum (TRANSFER | EMPLOYEE_LEAVE | RETIREMENT)
--     and the `house_allocations` termination columns
--     ("terminationReason", "terminatedAt", "terminatedBy").
--
-- Idempotent so it can be re-run safely. The House Queue service is the only
-- writer of the termination fields; the register's activate/deactivate path
-- and the queue's approve/release path own `occupancyStatus`.

-- ── Enums ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'HouseOccupancyStatus') THEN
        CREATE TYPE "HouseOccupancyStatus" AS ENUM ('Vacant', 'Occupied', 'Maintenance');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'HouseTerminationReason') THEN
        CREATE TYPE "HouseTerminationReason" AS ENUM ('TRANSFER', 'EMPLOYEE_LEAVE', 'RETIREMENT');
    END IF;
END $$;

-- ── households.occupancyStatus ─────────────────────────────────────────────
ALTER TABLE "public"."households"
    ADD COLUMN IF NOT EXISTS "occupancyStatus" "HouseOccupancyStatus" NOT NULL DEFAULT 'Vacant';

-- Back-fill: physically inactive (damage checklist) houses are under maintenance.
UPDATE "public"."households"
SET "occupancyStatus" = 'Maintenance'
WHERE "status" = 'Inactive'
  AND "occupancyStatus" = 'Vacant';

-- Back-fill: houses with a live allocation in the decision ledger are occupied.
UPDATE "public"."households" h
SET "occupancyStatus" = 'Occupied'
WHERE "occupancyStatus" = 'Vacant'
  AND EXISTS (
    SELECT 1
    FROM "public"."house_allocations" a
    WHERE a."householdId" = h.id
      AND a.status = 'allocated'
  );

-- ── house_allocations termination columns ─────────────────────────────────
ALTER TABLE "public"."house_allocations"
    ADD COLUMN IF NOT EXISTS "terminationReason" "HouseTerminationReason",
    ADD COLUMN IF NOT EXISTS "terminatedAt" TIMESTAMP(6),
    ADD COLUMN IF NOT EXISTS "terminatedBy" UUID;