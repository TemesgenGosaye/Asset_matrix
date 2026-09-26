-- Migration: Drop the `scheduling` and `retentionPolicy` columns on
-- `engine_config_versions`.
--
-- The pure engine only consumes `weights`, `eligibilityBands` and
-- `recommendation` from the config payload; the scheduling + retention config
-- sections were fictional dead weight. These two columns were added by
-- 20260923000000_add_engine_config solely for that config payload.
-- Idempotent so it can be re-run safely.

ALTER TABLE "public"."engine_config_versions" DROP COLUMN IF EXISTS "scheduling";
ALTER TABLE "public"."engine_config_versions" DROP COLUMN IF EXISTS "retentionPolicy";