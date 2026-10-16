/**
 * Employee domain constants and shared types.
 *
 * This module is the single source of truth for the employee module's
 * vocabulary. The database stores `Gender` and `MaritalStatus` as native
 * PostgreSQL enums with lowercase values; every label, option list and type in
 * the app derives from the arrays below so a value can never drift between the
 * API, the UI and the database.
 */

import type { Gender, MaritalStatus } from "@prisma/client";

/** Employment types accepted by the employee schema. */
export const EMPLOYMENT_TYPES = [
  "full_time",
  "part_time",
  "contract",
  "intern",
  "temporary",
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

/** Employment statuses accepted by the employee schema. */
export const EMPLOYMENT_STATUSES = [
  "active",
  "on_leave",
  "terminated",
  "retired",
] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

/** Gender enum values, in the order they are offered in the UI. */
export const GENDER_VALUES = [
  "male",
  "female",
] as const satisfies readonly Gender[];

/** Marital status enum values, in the order they are offered in the UI. */
export const MARITAL_STATUS_VALUES = [
  "single",
  "married",
] as const satisfies readonly MaritalStatus[];

/** Inclusive bounds for `jobGrade`, mirrored by a database CHECK constraint. */
export const JOB_GRADE_MIN = 1;
export const JOB_GRADE_MAX = 50;

/** Inclusive bounds for `familySize`. */
export const FAMILY_SIZE_MIN = 1;
export const FAMILY_SIZE_MAX = 30;

/** Longest accepted National ID. Mirrors the column's `varchar(64)`. */
export const NATIONAL_ID_MAX = 64;

/** Longest accepted employee number. Mirrors the column's length. */
export const EMPLOYEE_NUMBER_MAX = 50;

/**
 * Maximum rows accepted in a single import workbook.
 *
 * Deliberately far below the shared `MAX_IMPORT_ROWS` (25,000) that asset
 * imports allow. Every employee row performs reference lookups and several
 * writes inside one transaction that is given 60 seconds, so the ceiling is set
 * by what that transaction can finish reliably rather than by what the file
 * parser can read.
 */
export const MAX_IMPORT_ROWS = 500;

// ---------------------------------------------------------------------------
// Display labels
// ---------------------------------------------------------------------------

export const GENDER_LABELS: Record<Gender, string> = {
  male: "Male",
  female: "Female",
};

export const MARITAL_STATUS_LABELS: Record<MaritalStatus, string> = {
  single: "Single",
  married: "Married",
};

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  intern: "Intern",
  temporary: "Temporary",
};

export const EMPLOYMENT_STATUS_LABELS: Record<EmploymentStatus, string> = {
  active: "Active",
  on_leave: "On Leave",
  terminated: "Terminated",
  retired: "Retired",
};

/** Badge variants used by the employee table for each employment status. */
export const EMPLOYMENT_STATUS_BADGE_VARIANT: Record<
  EmploymentStatus,
  "success" | "warning" | "destructive" | "secondary"
> = {
  active: "success",
  on_leave: "warning",
  terminated: "destructive",
  retired: "secondary",
};

/** Option lists shaped for `<Select>` components. */
export const GENDER_OPTIONS = GENDER_VALUES.map((value) => ({
  value,
  label: GENDER_LABELS[value],
}));

export const MARITAL_STATUS_OPTIONS = MARITAL_STATUS_VALUES.map((value) => ({
  value,
  label: MARITAL_STATUS_LABELS[value],
}));

export const EMPLOYMENT_TYPE_OPTIONS = EMPLOYMENT_TYPES.map((value) => ({
  value,
  label: EMPLOYMENT_TYPE_LABELS[value],
}));

export const EMPLOYMENT_STATUS_OPTIONS = EMPLOYMENT_STATUSES.map((value) => ({
  value,
  label: EMPLOYMENT_STATUS_LABELS[value],
}));

/** Human-readable label for an optional enum, or an em dash when unset. */
export function labelOrDash(
  labels: Record<string, string>,
  value: string | null | undefined,
): string {
  if (!value) return "—";
  return labels[value] ?? value;
}

// ---------------------------------------------------------------------------
// National ID masking
// ---------------------------------------------------------------------------

/** Number of trailing characters left visible by {@link maskNationalId}. */
export const NATIONAL_ID_VISIBLE_SUFFIX = 4;

/**
 * Mask a National ID, keeping only the last
 * {@link NATIONAL_ID_VISIBLE_SUFFIX} characters.
 *
 * The mask is applied on the server, in the query layer, so an unmasked value
 * never leaves the API for a caller without the sensitive-data permission.
 *
 * ```
 * "AB-123456" -> "*****3456"
 * "123"       -> "***"
 * "" / null   -> ""
 * ```
 */
export function maskNationalId(value: string | null | undefined): string {
  if (!value) return "";
  const suffix = value.slice(-NATIONAL_ID_VISIBLE_SUFFIX);
  const hiddenLength = Math.max(value.length - NATIONAL_ID_VISIBLE_SUFFIX, 0);
  return "*".repeat(hiddenLength) + suffix;
}

/** True when {@link maskNationalId} would actually obscure something. */
export function isNationalIdMasked(value: string | null | undefined): boolean {
  return Boolean(value) && value!.length > NATIONAL_ID_VISIBLE_SUFFIX;
}
