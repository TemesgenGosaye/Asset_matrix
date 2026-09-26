-- Add isActive column to departments table
ALTER TABLE "public"."departments" 
ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS "departments_isActive_idx" ON "public"."departments"("isActive");
