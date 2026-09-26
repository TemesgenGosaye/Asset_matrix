-- Add organizationId column to shared tables for multi-tenant isolation
ALTER TABLE "assettool"."manufacturer" ADD COLUMN "organizationId" UUID;
ALTER TABLE "assettool"."supplier" ADD COLUMN "organizationId" UUID;
ALTER TABLE "assettool"."model" ADD COLUMN "organizationId" UUID;
ALTER TABLE "assettool"."location" ADD COLUMN "organizationId" UUID;
ALTER TABLE "assettool"."statusType" ADD COLUMN "organizationId" UUID;
ALTER TABLE "assettool"."assetCategoryType" ADD COLUMN "organizationId" UUID;
ALTER TABLE "assettool"."accessorieCategoryType" ADD COLUMN "organizationId" UUID;
ALTER TABLE "assettool"."consumableCategoryType" ADD COLUMN "organizationId" UUID;
ALTER TABLE "assettool"."licenceCategoryType" ADD COLUMN "organizationId" UUID;
ALTER TABLE "assettool"."component_categories" ADD COLUMN "organizationId" UUID;

-- Add suspendedAt to organizations for grace-period suspension
ALTER TABLE "assettool"."organizations" ADD COLUMN "suspendedAt" TIMESTAMP(6);

-- Backfill: assign all existing rows to the first organization
UPDATE "assettool"."manufacturer" SET "organizationId" = (SELECT id FROM "assettool"."organizations" LIMIT 1) WHERE "organizationId" IS NULL;
UPDATE "assettool"."supplier" SET "organizationId" = (SELECT id FROM "assettool"."organizations" LIMIT 1) WHERE "organizationId" IS NULL;
UPDATE "assettool"."model" SET "organizationId" = (SELECT id FROM "assettool"."organizations" LIMIT 1) WHERE "organizationId" IS NULL;
UPDATE "assettool"."location" SET "organizationId" = (SELECT id FROM "assettool"."organizations" LIMIT 1) WHERE "organizationId" IS NULL;
UPDATE "assettool"."statusType" SET "organizationId" = (SELECT id FROM "assettool"."organizations" LIMIT 1) WHERE "organizationId" IS NULL;
UPDATE "assettool"."assetCategoryType" SET "organizationId" = (SELECT id FROM "assettool"."organizations" LIMIT 1) WHERE "organizationId" IS NULL;
UPDATE "assettool"."accessorieCategoryType" SET "organizationId" = (SELECT id FROM "assettool"."organizations" LIMIT 1) WHERE "organizationId" IS NULL;
UPDATE "assettool"."consumableCategoryType" SET "organizationId" = (SELECT id FROM "assettool"."organizations" LIMIT 1) WHERE "organizationId" IS NULL;
UPDATE "assettool"."licenceCategoryType" SET "organizationId" = (SELECT id FROM "assettool"."organizations" LIMIT 1) WHERE "organizationId" IS NULL;
UPDATE "assettool"."component_categories" SET "organizationId" = (SELECT id FROM "assettool"."organizations" LIMIT 1) WHERE "organizationId" IS NULL;

-- Add FK constraints (CASCADE on org delete)
ALTER TABLE "assettool"."manufacturer" ADD CONSTRAINT "manufacturer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "assettool"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assettool"."supplier" ADD CONSTRAINT "supplier_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "assettool"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assettool"."model" ADD CONSTRAINT "model_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "assettool"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assettool"."location" ADD CONSTRAINT "location_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "assettool"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assettool"."statusType" ADD CONSTRAINT "statusType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "assettool"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assettool"."assetCategoryType" ADD CONSTRAINT "assetCategoryType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "assettool"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assettool"."accessorieCategoryType" ADD CONSTRAINT "accessorieCategoryType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "assettool"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assettool"."consumableCategoryType" ADD CONSTRAINT "consumableCategoryType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "assettool"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assettool"."licenceCategoryType" ADD CONSTRAINT "licenceCategoryType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "assettool"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assettool"."component_categories" ADD CONSTRAINT "component_categories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "assettool"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add indexes for query performance
CREATE INDEX "manufacturer_organizationId_idx" ON "assettool"."manufacturer"("organizationId");
CREATE INDEX "supplier_organizationId_idx" ON "assettool"."supplier"("organizationId");
CREATE INDEX "model_organizationId_idx" ON "assettool"."model"("organizationId");
CREATE INDEX "location_organizationId_idx" ON "assettool"."location"("organizationId");
CREATE INDEX "statusType_organizationId_idx" ON "assettool"."statusType"("organizationId");
CREATE INDEX "assetCategoryType_organizationId_idx" ON "assettool"."assetCategoryType"("organizationId");
CREATE INDEX "accessorieCategoryType_organizationId_idx" ON "assettool"."accessorieCategoryType"("organizationId");
CREATE INDEX "consumableCategoryType_organizationId_idx" ON "assettool"."consumableCategoryType"("organizationId");
CREATE INDEX "licenceCategoryType_organizationId_idx" ON "assettool"."licenceCategoryType"("organizationId");
CREATE INDEX "component_categories_organizationId_idx" ON "assettool"."component_categories"("organizationId");
