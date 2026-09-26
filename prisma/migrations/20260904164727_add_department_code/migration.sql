-- Add code column to departments table for department master book reference
ALTER TABLE "public"."departments" 
ADD COLUMN IF NOT EXISTS "code" VARCHAR(20);

-- Create unique constraint on code and organizationId
ALTER TABLE "public"."departments" 
ADD CONSTRAINT "departments_code_organizationId_key" UNIQUE ("code", "organizationId");

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS "departments_code_idx" ON "public"."departments"("code");
