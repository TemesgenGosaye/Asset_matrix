-- Make handback inspection records permanent.
--
-- A completed HouseInspection is the evidence that a named house was inspected
-- on a named date by a named inspector, and that a specific 4-digit release code
-- gated its return to the available pool. Until now both house_inspections and
-- house_release_codes cascaded on their household/allocation foreign keys, so a
-- plain `DELETE /api/household` silently destroyed that evidence — including the
-- record that a code was consumed.
--
-- RESTRICT turns that silent data loss into a refused delete. The caller now gets
-- an error instead, and the inspection page keeps listing the record forever.
--
-- Organization deletion still cascades, deliberately: that is a tenant teardown,
-- not an edit, and leaving orphaned inspections behind would leak across tenants.

-- ── house_inspections ────────────────────────────────────────────────────────
ALTER TABLE "public"."house_inspections"
  DROP CONSTRAINT IF EXISTS "house_inspections_allocationId_fkey";

ALTER TABLE "public"."house_inspections"
  ADD CONSTRAINT "house_inspections_allocationId_fkey"
  FOREIGN KEY ("allocationId") REFERENCES "public"."house_allocations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."house_inspections"
  DROP CONSTRAINT IF EXISTS "house_inspections_householdId_fkey";

ALTER TABLE "public"."house_inspections"
  ADD CONSTRAINT "house_inspections_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "public"."households"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── house_release_codes ──────────────────────────────────────────────────────
ALTER TABLE "public"."house_release_codes"
  DROP CONSTRAINT IF EXISTS "house_release_codes_allocationId_fkey";

ALTER TABLE "public"."house_release_codes"
  ADD CONSTRAINT "house_release_codes_allocationId_fkey"
  FOREIGN KEY ("allocationId") REFERENCES "public"."house_allocations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."house_release_codes"
  DROP CONSTRAINT IF EXISTS "house_release_codes_householdId_fkey";

ALTER TABLE "public"."house_release_codes"
  ADD CONSTRAINT "house_release_codes_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "public"."households"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;