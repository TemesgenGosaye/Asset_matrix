-- AlterTable: add `issuer` column to accounts for BetterAuth 1.7+ credential matching
ALTER TABLE "public"."accounts" ADD COLUMN "issuer" TEXT;

-- Backfill: credential accounts use the synthetic local issuer
UPDATE "public"."accounts"
SET "issuer" = 'local:credential'
WHERE "providerId" = 'credential'
  AND "issuer" IS NULL;
