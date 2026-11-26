ALTER TABLE "asset"
  ADD COLUMN IF NOT EXISTS "financeNo" VARCHAR(255);

UPDATE "asset"
SET "financeNo" = COALESCE(
  NULLIF(BTRIM("financeNo2"), ''),
  NULLIF(BTRIM("financeNo1"), '')
)
WHERE "financeNo" IS NULL;

CREATE INDEX IF NOT EXISTS "asset_financeNo_trgm_idx"
  ON "asset" USING gin ("financeNo" gin_trgm_ops);
