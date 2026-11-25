-- Dropdown master relations and metadata migration
-- Additive, nullable, and non-destructive

-- 1. AlterTable location
ALTER TABLE "location" ADD COLUMN IF NOT EXISTS "normalizedName" VARCHAR(500);
ALTER TABLE "location" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "location" ADD COLUMN IF NOT EXISTS "usageCount" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "location_organizationId_normalizedName_idx" ON "location"("organizationId", "normalizedName");

-- 2. AlterTable statusType
ALTER TABLE "statusType" ADD COLUMN IF NOT EXISTS "normalizedName" VARCHAR(100);
ALTER TABLE "statusType" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "statusType" ADD COLUMN IF NOT EXISTS "usageCount" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "statusType_organizationId_normalizedName_idx" ON "statusType"("organizationId", "normalizedName");

-- 3. AlterTable assetCategoryType
ALTER TABLE "assetCategoryType" ADD COLUMN IF NOT EXISTS "normalizedName" VARCHAR(100);
ALTER TABLE "assetCategoryType" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "assetCategoryType" ADD COLUMN IF NOT EXISTS "usageCount" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "assetCategoryType_organizationId_normalizedName_idx" ON "assetCategoryType"("organizationId", "normalizedName");

-- 4. AlterTable asset (nullable relations for Location 1st and Condition 1st)
ALTER TABLE "asset" ADD COLUMN IF NOT EXISTS "location1Id" UUID;
ALTER TABLE "asset" ADD COLUMN IF NOT EXISTS "condition1StatusId" UUID;

-- 5. Foreign keys on asset
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_asset_location1_c_location1id'
  ) THEN
    ALTER TABLE "asset" ADD CONSTRAINT "fk_asset_location1_c_location1id"
      FOREIGN KEY ("location1Id") REFERENCES "location"("locationid") ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_asset_condition1_status_c_statusid'
  ) THEN
    ALTER TABLE "asset" ADD CONSTRAINT "fk_asset_condition1_status_c_statusid"
      FOREIGN KEY ("condition1StatusId") REFERENCES "statusType"("statustypeid") ON DELETE SET NULL;
  END IF;
END $$;

-- 6. Indexes on asset
CREATE INDEX IF NOT EXISTS "asset_location1Id_idx" ON "asset"("location1Id");
CREATE INDEX IF NOT EXISTS "asset_condition1StatusId_idx" ON "asset"("condition1StatusId");
CREATE INDEX IF NOT EXISTS "asset_organizationId_location1Id_idx" ON "asset"("organizationId", "location1Id");
