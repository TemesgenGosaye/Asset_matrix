-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."households" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "srNo" SERIAL NOT NULL,
    "hid" VARCHAR(50) NOT NULL,
    "houseType" VARCHAR(20) NOT NULL,
    "staffCategory" VARCHAR(10),
    "houseNumber" VARCHAR(50) NOT NULL,
    "rgType" VARCHAR(20) NOT NULL,
    "locationId" UUID,
    "locationName" VARCHAR(255),
    "status" VARCHAR(20) NOT NULL DEFAULT 'Active',
    "bedCount" INTEGER NOT NULL DEFAULT 0,
    "chairsCount" INTEGER NOT NULL DEFAULT 0,
    "lockerCount" INTEGER NOT NULL DEFAULT 0,
    "tablesCount" INTEGER NOT NULL DEFAULT 0,
    "damageWindow" BOOLEAN NOT NULL DEFAULT false,
    "damageDoor" BOOLEAN NOT NULL DEFAULT false,
    "damageWaterPanel" BOOLEAN NOT NULL DEFAULT false,
    "damageRoof" BOOLEAN NOT NULL DEFAULT false,
    "damageWall" BOOLEAN NOT NULL DEFAULT false,
    "damageElectricity" BOOLEAN NOT NULL DEFAULT false,
    "damageNotes" VARCHAR(1000),
    "organizationId" UUID NOT NULL,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "households_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "households_srNo_key" ON "public"."households"("srNo");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "households_organizationId_hid_key" ON "public"."households"("organizationId", "hid");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "households_organizationId_houseNumber_key" ON "public"."households"("organizationId", "houseNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "households_organizationId_idx" ON "public"."households"("organizationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "households_status_idx" ON "public"."households"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "households_houseType_idx" ON "public"."households"("houseType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "households_locationId_idx" ON "public"."households"("locationId");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'households_organizationId_fkey'
    ) THEN
        ALTER TABLE "public"."households" ADD CONSTRAINT "households_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'households_locationId_fkey'
    ) THEN
        ALTER TABLE "public"."households" ADD CONSTRAINT "households_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."location"("locationid") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
