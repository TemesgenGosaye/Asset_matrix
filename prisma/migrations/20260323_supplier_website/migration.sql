SET search_path TO "assettool";
ALTER TABLE "supplier" ADD COLUMN IF NOT EXISTS "website" VARCHAR(500);
