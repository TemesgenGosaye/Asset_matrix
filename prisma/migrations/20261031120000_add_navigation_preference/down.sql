-- Reversal for 20261031120000_add_navigation_preference.
--
-- Drops the navigation preference table. Navigation falls back to the registry
-- defaults (every menu visible), which is the behaviour that existed before the
-- migration. No other table is touched.

DROP TABLE IF EXISTS public."navigation_preferences";
