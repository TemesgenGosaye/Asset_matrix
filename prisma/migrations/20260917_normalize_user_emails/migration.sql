-- Normalize user emails to lowercase.
-- BetterAuth sign-in always lowercases the lookup email (sign-in.mjs), so emails
-- stored with mixed case (e.g. via Add User, import, SCIM, SSO, LDAP before the
-- creator routes were fixed) can never be signed into and return 401.
--
-- The app runs on the "public" schema (see prisma/schema.prisma @@schema("public"),
-- DB_SCHEMA=public). Creation routes (addUser, user update, import, SCIM,
-- OIDC/SAML, LDAP) now lowercase and trim emails at write time, so this only
-- fixes legacy rows.
UPDATE "public"."user"
SET "email" = LOWER(TRIM("email"))
WHERE "email" IS NOT NULL
  AND "email" <> LOWER(TRIM("email"));