-- Migration: per-user "recommended system pop-up" preference.
--
-- WHY:
--   System announcements and recommended content are surfaced as a pop-up. Users
--   need a single switch to turn that off without muting ordinary notifications,
--   so the choice is stored per user rather than globally. It defaults to ON:
--   the pop-up is how the product communicates new or recommended features, and
--   a user who does not want it can opt out in Settings → Navigation.
--
-- WHAT THIS MIGRATION DOES:
--   1. Adds `user_preferences.showRecommendedPopup`, NOT NULL, default TRUE.
--
-- SAFETY:
--   * Additive only. No existing column, index or row is modified beyond the
--     one new column receiving its default.
--   * Idempotent: the statement is guarded and can be re-run safely.
--
-- ROLLBACK / DATA IMPACT SUMMARY:
--   * Rolling back drops the column; every user falls back to the default
--     behaviour (pop-up enabled).

ALTER TABLE public."user_preferences"
    ADD COLUMN IF NOT EXISTS "showRecommendedPopup" BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public."user_preferences"."showRecommendedPopup" IS
    'Whether the recommended/announcement system pop-up is shown to this user. Defaults to true.';
