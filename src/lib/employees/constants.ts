/**
 * Employee domain constants and shared types.
 *
 * This module is the single source of truth for the employee module's
 * vocabulary. The database stores `Gender` as a native PostgreSQL enum with
 * lowercase values; marital status and disability are TEXT so the source
 * workbook's own vocabulary survives the import. Every label, option list and
 * type in the app derives from the arrays below so a value can never drift
 * between the API, the UI and the database.
 */

import type { Gender } from "@prisma/client";

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

/**
 * Marital status values, in the order they are offered in the UI.
 *
 * These are exactly the four states the House Queue MCDA policy table scores
 * (`MARITAL_STATUS_LEVELS` in `src/lib/house-queue/weights.ts`): single,
 * married, widowed and divorced. The column is TEXT rather than a native enum
 * so the source workbook's own vocabulary is preserved, and a CHECK constraint
 * mirrors this list in the database.
 */
export const MARITAL_STATUS_VALUES = [
  "single",
  "married",
  "widowed",
  "divorced",
] as const;

export type MaritalStatusValue = (typeof MARITAL_STATUS_VALUES)[number];

/**
 * Canonical employee business columns.
 *
 * The approved employee schema is exactly eight business columns. This table is
 * the one place that says which physical column backs each of them, so the
 * Employee List, the export, the import template and the import mapper cannot
 * drift apart.
 *
 * `canonical` is the business name from the approved schema; `column` is the
 * physical PostgreSQL column / Prisma field, which keeps this repository's
 * established naming convention rather than renaming every reference across
 * the House Queue and House Request modules.
 */
export const CANONICAL_EMPLOYEE_FIELDS = [
  {
    canonical: "emp_id",
    column: "employeeNumber",
    header: "Emp ID",
    required: true,
  },
  {
    canonical: "first_name",
    column: "firstname",
    header: "First Name",
    required: true,
  },
  {
    canonical: "last_name",
    column: "lastname",
    header: "Last Name",
    required: true,
  },
  {
    canonical: "gender",
    column: "gender",
    header: "Gender",
    required: false,
  },
  {
    canonical: "job_grade",
    column: "jobGrade",
    header: "Job Grade",
    required: false,
  },
  {
    canonical: "service_years",
    column: "serviceYears",
    header: "Service Years",
    required: false,
  },
  {
    canonical: "marital_status",
    column: "maritalStatus",
    header: "Marital Status",
    required: false,
  },
  {
    canonical: "disability",
    column: "disabilityStatus",
    header: "Disability",
    required: false,
  },
  {
    canonical: "score",
    column: "score",
    header: "Score",
    required: false,
  },
] as const satisfies readonly {
  canonical: string;
  column: string;
  header: string;
  required: boolean;
}[];

/** Physical columns of the canonical employee schema, in presentation order. */
export const CANONICAL_EMPLOYEE_COLUMNS = [
  "employeeNumber",
  "firstname",
  "lastname",
  "gender",
  "jobGrade",
  "serviceYears",
  "maritalStatus",
  "disabilityStatus",
  "score",
] as const;

export type CanonicalEmployeeColumn =
  (typeof CANONICAL_EMPLOYEE_COLUMNS)[number];

/** Canonical columns that must be present in an import workbook. */
export const REQUIRED_CANONICAL_EMPLOYEE_COLUMNS = [
  "employeeNumber",
] as const satisfies readonly CanonicalEmployeeColumn[];

/** Inclusive bounds for `jobGrade`, mirrored by a database CHECK constraint. */
export const JOB_GRADE_MIN = 1;
export const JOB_GRADE_MAX = 50;

/** Inclusive bounds for `familySize`. */
export const FAMILY_SIZE_MIN = 1;
export const FAMILY_SIZE_MAX = 30;

/** Inclusive bounds for `serviceYears`. Mirrors the database CHECK constraint. */
export const SERVICE_YEARS_MIN = 0;
export const SERVICE_YEARS_MAX = 60;

/** Longest accepted National ID. Mirrors the column's `varchar(64)`. */
export const NATIONAL_ID_MAX = 64;

/**
 * Longest accepted disability value. Mirrors the column's `varchar(100)`.
 *
 * Disability is free text because the source workbook carries its own
 * vocabulary ("Yes", "None", "Physical", "Visual", ...). Nothing is invented
 * on the way in: the value is stored exactly as the source stated it.
 */
export const DISABILITY_MAX = 100;

/**
 * Values that explicitly record the ABSENCE of a disability.
 *
 * The House Queue MCDA scores the disability criterion as 1 = a disability is
 * recorded, 0 = none is recorded. A blank cell means "not recorded", which is
 * the same score as "no", so these tokens are what the score treats as an
 * explicit "none" rather than as an unknown value.
 *
 * "Fine" belongs here because it is how the source register spells "no
 * disability" — it is the wording on the majority of the real employee rows,
 * and reading it as a disability would score almost the whole factory as
 * disabled.
 */
export const DISABILITY_NEGATIVE_VALUES = [
  "no",
  "none",
  "nil",
  "false",
  "0",
  "n/a",
  "na",
  "not applicable",
  "-",
  "fine",
  "healthy",
  "normal",
] as const;

/**
 * Normalise a disability value: trimmed text, or `null` when nothing was
 * recorded. The vocabulary itself is preserved verbatim.
 */
export function normalizeDisability(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * True when the stored disability value records a disability.
 *
 * An empty value, or one of {@link DISABILITY_NEGATIVE_VALUES}, means no
 * disability is recorded. Every other value counts as a recorded disability,
 * because the source is the authority on what the condition is.
 */
export function hasDisabilityRecord(value: string | null | undefined): boolean {
  const normalized = normalizeDisability(value);
  if (normalized === null) return false;
  const key = normalized.toLowerCase().replace(/\s+/g, " ");
  return !(DISABILITY_NEGATIVE_VALUES as readonly string[]).includes(key);
}

/** Label shown for an employee whose record states a disability. */
export const DISABILITY_LABEL_HAS = "Has (Has disability)";

/** Label shown for an employee whose record states no disability. */
export const DISABILITY_LABEL_FINE = "Fine (Has no disability)";

/**
 * The Disability column's display label.
 *
 * The stored value keeps the source's own wording, but the register shows one
 * of two labels so a reader never has to interpret free text: an employee
 * either has a disability or does not.
 */
export function disabilityDisplayLabel(
  value: string | null | undefined,
): string {
  return hasDisabilityRecord(value)
    ? DISABILITY_LABEL_HAS
    : DISABILITY_LABEL_FINE;
}

/**
 * The recommendation shown wherever an employee is opened without a job grade.
 *
 * A missing grade is not a cosmetic gap: the house eligibility bands and the
 * House Queue ranking are both derived from it, so an employee without a grade
 * cannot be placed. The same wording is used on the Employee Register, on the
 * employee profile and in the House Request flow so the instruction is the
 * same everywhere the user meets it.
 */
export const MISSING_JOB_GRADE_NOTICE =
  "Job grade not on file. Please add this employee's real job grade — house eligibility and House Queue ranking are calculated from it.";

/** Short form of {@link MISSING_JOB_GRADE_NOTICE}, for compact cells. */
export const MISSING_JOB_GRADE_LABEL = "Grade not set";

/** Longest accepted employee number. Mirrors the column's length. */
export const EMPLOYEE_NUMBER_MAX = 50;

/**
 * Maximum rows accepted in a single import workbook.
 *
 * The importer writes in chunks (see {@link IMPORT_WRITE_CHUNK_SIZE}) inside one
 * transaction, so a 4,000-row workbook costs a bounded number of statements
 * instead of one statement per row. The ceiling is therefore a product decision
 * about the largest register an administrator loads in one go, not a limit of
 * the parser (which reads up to 25,000 rows) or of the database.
 */
export const MAX_IMPORT_ROWS = 4000;

/**
 * Rows written per INSERT statement during a bulk import.
 *
 * Every row contributes a handful of bound parameters, so a chunk of 500 stays
 * far below PostgreSQL's 65,535 bind-parameter ceiling while keeping the number
 * of round trips — and therefore the wall-clock time — small. It also keeps each
 * statement well inside the connection's 30 second statement timeout.
 */
export const IMPORT_WRITE_CHUNK_SIZE = 500;

/**
 * Emp IDs looked up per query when a batch is checked against the register.
 *
 * Bounds the bind list of the duplicate check: a 4,000-row import asks about
 * thousands of Emp IDs, and one `IN` list that long is a heavy statement.
 */
export const IMPORT_LOOKUP_CHUNK_SIZE = 1000;

// ---------------------------------------------------------------------------
// Display labels
// ---------------------------------------------------------------------------

export const GENDER_LABELS: Record<Gender, string> = {
  male: "Male",
  female: "Female",
};

export const MARITAL_STATUS_LABELS: Record<string, string> = {
  single: "Single",
  married: "Married",
  widowed: "Widowed",
  divorced: "Divorced",
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
