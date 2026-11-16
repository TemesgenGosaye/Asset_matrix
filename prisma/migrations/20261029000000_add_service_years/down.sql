-- Rollback for 20261029000000_add_service_years
-- Removes the serviceYears column and its associated constraint and index.
-- Safe: the column was purely additive; no other column or table depends on it.

DROP INDEX IF EXISTS public."Employee_organizationId_serviceYears_idx";

ALTER TABLE public."Employee"
    DROP CONSTRAINT IF EXISTS "Employee_serviceYears_range_check";

ALTER TABLE public."Employee"
    DROP COLUMN IF EXISTS "serviceYears";
