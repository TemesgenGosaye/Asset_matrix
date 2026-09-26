-- Add department reference to asset table (department master book)
-- departmentId: FK to departments.id (stable UUID)
-- departmentCode: denormalized snapshot of the department code (e.g. "15.3")
--   used for PID / asset tag generation without a join on every read.

ALTER TABLE "public"."asset"
ADD COLUMN IF NOT EXISTS "departmentId" UUID,
ADD COLUMN IF NOT EXISTS "departmentCode" VARCHAR(20);

-- Create foreign key (ON DELETE SET NULL keeps assets when a department is removed)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'asset_departmentId_fkey' AND conrelid = 'public.asset'::regclass
    ) THEN
        ALTER TABLE "public"."asset"
        ADD CONSTRAINT "asset_departmentId_fkey"
        FOREIGN KEY ("departmentId") REFERENCES "public"."departments"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- Index for department-scoped lookups
CREATE INDEX IF NOT EXISTS "asset_departmentId_idx" ON "public"."asset"("departmentId");

-- Departments: preserve the official master-book display order within a parent.
ALTER TABLE "public"."departments"
ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;