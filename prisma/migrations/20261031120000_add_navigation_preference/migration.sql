-- Migration: per-user navigation visibility preferences.
--
-- WHY:
--   The sidebar exposes ~52 menu entries. A user who only ever touches House
--   Queue should not have to scroll past Procurement and TCO Analysis, but
--   until now there was no per-user way to reduce the menu: the nav was a
--   hardcoded array in `lib/nav-config.ts` and had no identity a preference
--   could point at. This adds the storage for that: one row per user holding
--   the list of menu KEYS the user has hidden.
--
--   Only HIDDEN keys are stored. A menu added in a future release therefore
--   appears by default, and no backfill is ever needed when the registry grows.
--
-- WHAT THIS MIGRATION DOES:
--   1. Creates `navigation_preferences` (one row per user).
--   2. Adds a unique index on `userId` and an index on `organizationId`.
--   3. Adds the two foreign keys, guarded so the script is re-runnable.
--
-- SAFETY:
--   * Additive only. No existing table, column, index or row is modified.
--   * Idempotent: every statement is guarded and can be re-run safely.
--   * Reversal script: ./down.sql.
--
-- ROLLBACK / DATA IMPACT SUMMARY:
--   * A rollback drops only this new table. Navigation falls back to the
--     registry defaults (everything visible), which is the current behaviour.

CREATE TABLE IF NOT EXISTS public."navigation_preferences" (
    "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
    "userId"         UUID         NOT NULL,
    "organizationId" UUID,
    "hiddenKeys"     TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt"      TIMESTAMP(6) NOT NULL DEFAULT now(),
    "updatedAt"      TIMESTAMP(6) NOT NULL DEFAULT now(),
    CONSTRAINT "navigation_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "navigation_preferences_userId_key"
    ON public."navigation_preferences" ("userId");

CREATE INDEX IF NOT EXISTS "navigation_preferences_organizationId_idx"
    ON public."navigation_preferences" ("organizationId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'navigation_preferences_userId_fkey'
          AND conrelid = 'public."navigation_preferences"'::regclass
    ) THEN
        ALTER TABLE public."navigation_preferences"
            ADD CONSTRAINT "navigation_preferences_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES public."user"("userid")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'navigation_preferences_organizationId_fkey'
          AND conrelid = 'public."navigation_preferences"'::regclass
    ) THEN
        ALTER TABLE public."navigation_preferences"
            ADD CONSTRAINT "navigation_preferences_organizationId_fkey"
            FOREIGN KEY ("organizationId") REFERENCES public."organizations"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END
$$;

COMMENT ON TABLE public."navigation_preferences" IS
    'Per-user hidden navigation menu keys (see src/lib/navigation/registry.ts). Only hidden keys are stored so newly added menus are visible by default.';
