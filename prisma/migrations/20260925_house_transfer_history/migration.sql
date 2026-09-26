-- Transfer / relocation history for house_allocations: freezes the vacated
-- house (former) plus the last relocation timestamp and move count so
-- house-move prints and audits can show "from former house → to new house".

ALTER TABLE "public"."house_allocations"
    ADD COLUMN "previousHouseholdId" UUID,
    ADD COLUMN "movedAt" TIMESTAMP(6),
    ADD COLUMN "moveCount" INTEGER NOT NULL DEFAULT 0;

-- index + FK constraint mirroring Prisma conventions
CREATE INDEX IF NOT EXISTS "house_allocations_previousHouseholdId_idx"
    ON "public"."house_allocations"("previousHouseholdId");

ALTER TABLE "public"."house_allocations"
    ADD CONSTRAINT "house_allocations_previousHouseholdId_fkey"
    FOREIGN KEY ("previousHouseholdId")
    REFERENCES "public"."households"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;