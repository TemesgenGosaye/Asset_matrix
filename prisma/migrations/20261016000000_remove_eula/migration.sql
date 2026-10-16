-- Migration: remove the EULA template feature
--
-- WHY
--   The EULA feature was an admin-only CRUD screen over two tables, and nothing
--   else in the application ever used either of them. Verified before removal:
--
--     * `EulaAcceptance` was never written to outside the two `/api/eula` route
--       handlers that owned it. No login, register, checkout, onboarding,
--       marketing or mobile surface ever asked anyone to accept anything — the
--       template management screen described a flow that was never built.
--     * The `eula.accepted` webhook event was declared in `WEBHOOK_EVENTS` and
--       had a Slack formatter, but no code path ever emitted it.
--     * `getEulaTemplates` / `getEulaTemplateById` in `src/lib/data.ts` had no
--       importers.
--
--   So this drops two tables that only ever held rows the feature itself wrote.
--   The templates authored through the admin tab are the only data lost, and they
--   are documents rather than records: there is no acceptance history to preserve,
--   because no acceptance was ever captured.
--
-- WHAT
--   1. Drop the `eulaTemplateId` column from the shared `assetCategoryType`
--      table. This is the only part of the removal that touches a table other
--      modules depend on, and it is why the FK is dropped explicitly rather than
--      relying on cascade.
--   2. Drop `eula_acceptances` before `eula_templates` (it references the latter).
--   3. Strip the now-invalid `eula:view` / `eula:manage` strings out of
--      `Role.permissions` and `ApiKey.scopes`. These are validated against the
--      `PERMISSIONS` map at runtime, so leaving them behind would make the Roles
--      admin screen reject a role it had previously accepted, and would grant a
--      scope that resolves to nothing.
--   4. Strip `eula.accepted` out of `Webhook.events`, for the same reason: the
--      event no longer exists, so a subscription naming it can never fire again.
--
--   Audit rows with `entity = 'eula_template'` are deliberately LEFT IN PLACE.
--   An audit log is a historical record of what happened; rewriting history to
--   make a table look like it never existed would be the wrong repair, and the
--   audit viewer renders an unknown entity gracefully.
--
-- Idempotent, and safe to re-run.

-- "?" 1. The shared-table coupling.
--
-- `assetCategoryType` is a core table: `asset[]`, `depreciation_settings` and
-- every asset-category API and UI read it. Only the two EULA columns are removed,
-- and the FK is dropped by its own statement so that a failure here names the
-- constraint rather than surfacing as an opaque DROP COLUMN error.
ALTER TABLE "public"."assetCategoryType"
  DROP CONSTRAINT IF EXISTS "assetCategoryType_eulaTemplateId_fkey";

ALTER TABLE "public"."assetCategoryType"
  DROP COLUMN IF EXISTS "eulaTemplateId";

-- "?" 2. The EULA tables, children first.
--
-- `eula_acceptances` holds a FK to `eula_templates` and to `asset_checkouts`, so
-- it goes first. `CASCADE` covers any index the constraint carried with it.
DROP TABLE IF EXISTS "public"."eula_acceptances";
DROP TABLE IF EXISTS "public"."eula_templates";

-- "?" 3. Remove the orphaned permission strings.
--
-- `Role.permissions` and `ApiKey.scopes` are Postgres `String[]`, so they can
-- hold any string the app ever declared. `rbac.ts` filters a non-admin's granted
-- set through `if (perm in PERMISSIONS)`, so a stale entry is silently dropped at
-- read time rather than throwing — but `POST /api/roles` validates against
-- `Object.keys(PERMISSIONS)` and would then reject an unchanged role payload.
-- Cleaning the rows keeps stored data consistent with what the app can honour.
--
-- Table names are the mapped ones: `Role` → "roles", `ApiKey` → "api_keys".
UPDATE "public"."roles"
   SET "permissions" = ARRAY(
         SELECT unnest("permissions")
         EXCEPT SELECT unnest(ARRAY['eula:view', 'eula:manage'])
       ),
       "updatedAt" = NOW()
 WHERE "permissions" && ARRAY['eula:view', 'eula:manage'];

UPDATE "public"."api_keys"
   SET "scopes" = ARRAY(
         SELECT unnest("scopes")
         EXCEPT SELECT unnest(ARRAY['eula:view', 'eula:manage'])
       ),
       "updatedAt" = NOW()
 WHERE "scopes" && ARRAY['eula:view', 'eula:manage'];

-- "?" 4. Remove the orphaned webhook subscription.
--
-- Same reasoning: `WebhookEvent` is a TypeScript union derived from
-- `WEBHOOK_EVENTS`, and that key is gone. An active subscription naming it would
-- sit in the list matching nothing and would silently never fire again. Rows
-- whose ONLY event was EULA keep an empty array rather than being deleted — the
-- endpoint is still configured and the operator may want to re-point it.
UPDATE "public"."webhooks"
   SET "events" = ARRAY(
         SELECT unnest("events")
         EXCEPT SELECT unnest(ARRAY['eula.accepted'])
       ),
       "updatedAt" = NOW()
 WHERE "events" && ARRAY['eula.accepted'];