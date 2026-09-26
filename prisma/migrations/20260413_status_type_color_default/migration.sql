-- Add color and isDefault columns to statusType
ALTER TABLE "assettool"."statusType" ADD COLUMN "color" VARCHAR(7);
ALTER TABLE "assettool"."statusType" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;
