-- Remove billing/suspension columns from organizations and rate-limit infrastructure
SET search_path TO "assettool";

-- 1. Organization billing & suspension columns
--    (dependent unique indexes on stripeCustomerId/stripeSubscriptionId are dropped automatically)
ALTER TABLE "organizations"
  DROP COLUMN IF EXISTS "plan",
  DROP COLUMN IF EXISTS "stripeCustomerId",
  DROP COLUMN IF EXISTS "stripeSubscriptionId",
  DROP COLUMN IF EXISTS "trialEndsAt",
  DROP COLUMN IF EXISTS "maxAssets",
  DROP COLUMN IF EXISTS "maxUsers",
  DROP COLUMN IF EXISTS "suspendedAt";

-- 2. Rate limiting table (created by 20260310_pg_infrastructure / 20260320_perf_optimizations)
DROP TABLE IF EXISTS "rate_limits";