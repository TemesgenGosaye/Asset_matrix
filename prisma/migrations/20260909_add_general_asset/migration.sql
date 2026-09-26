-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."general_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "srNo" SERIAL NOT NULL,
    "itemType" VARCHAR(100) NOT NULL,
    "pid" VARCHAR(50) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "locationId" UUID,
    "locationName" VARCHAR(255),
    "condition" VARCHAR(50) NOT NULL,
    "brand" VARCHAR(100),
    "reviewsDate" DATE,
    "remark" VARCHAR(1000),
    "organizationId" UUID NOT NULL,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "general_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "general_assets_srNo_key" ON "public"."general_assets"("srNo");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "general_assets_organizationId_pid_key" ON "public"."general_assets"("organizationId", "pid");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "general_assets_organizationId_idx" ON "public"."general_assets"("organizationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "general_assets_itemType_idx" ON "public"."general_assets"("itemType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "general_assets_category_idx" ON "public"."general_assets"("category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "general_assets_condition_idx" ON "public"."general_assets"("condition");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "general_assets_locationId_idx" ON "public"."general_assets"("locationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "general_assets_reviewsDate_idx" ON "public"."general_assets"("reviewsDate");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'general_assets_organizationId_fkey'
    ) THEN
        ALTER TABLE "public"."general_assets" ADD CONSTRAINT "general_assets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'general_assets_locationId_fkey'
    ) THEN
        ALTER TABLE "public"."general_assets" ADD CONSTRAINT "general_assets_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."location"("locationid") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;