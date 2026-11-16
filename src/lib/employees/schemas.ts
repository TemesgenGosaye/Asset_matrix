/**
 * Zod schemas for the employee module.
 *
 * These live in their own module because the employee contract is now larger
 * than a couple of objects (create / update / bulk / import / list query) and
 * `src/lib/validation.ts` is already a large shared file. The pre-existing
 * `createEmployeeSchema` / `updateEmployeeSchema` exports are re-exported from
 * `validation.ts` for backwards compatibility.
 *
 * Two field groups are defined here and they are deliberately separate:
 *
 *  * the CANONICAL fields — the eight approved business columns. These are what
 *    the Employee List shows and what an Excel import is allowed to write;
 *  * the RETAINED fields — relational metadata (department, manager, linked
 *    login) and domain data other modules still depend on (employment status,
 *    family size, hire date, job title, National ID). They are not part of the
 *    approved eight, but removing them would break House Request eligibility,
 *    the House Queue ranking and the employee-to-login tie-in, so they stay.
 *
 * Both create and update schemas are STRICT: an unknown key is rejected rather
 * than silently dropped, which is what stops a removed employee field from
 * being accepted and persisted through mass assignment.
 */

import { z } from "zod";
import {
  DISABILITY_MAX,
  EMPLOYMENT_STATUSES,
  EMPLOYMENT_TYPES,
  EMPLOYEE_NUMBER_MAX,
  FAMILY_SIZE_MAX,
  FAMILY_SIZE_MIN,
  GENDER_VALUES,
  JOB_GRADE_MAX,
  JOB_GRADE_MIN,
  MARITAL_STATUS_VALUES,
  NATIONAL_ID_MAX,
  SERVICE_YEARS_MAX,
  SERVICE_YEARS_MIN,
} from "./constants";

/** `YYYY-MM-DD`, or null/absent. */
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format")
  .optional()
  .nullable();

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().nullable();

/** Empty strings from HTML forms mean "not provided". */
const optionalUuid = z
  .string()
  .trim()
  .uuid()
  .optional()
  .nullable()
  .or(z.literal("").transform(() => null))
  .nullable();

export const genderSchema = z
  .enum(GENDER_VALUES)
  .optional()
  .nullable()
  // Preserve `undefined` (the caller omitted the key) so a partial update
  // never resets a field that was not sent. An explicit `null` still clears.
  .transform((v) => (v === undefined ? undefined : v));

/**
 * Marital status.
 *
 * Stored as TEXT so the source workbook's own vocabulary survives the import,
 * but constrained to the four states the House Queue MCDA policy already
 * scores (single / married / widowed / divorced). Casing and whitespace are
 * normalised; anything else is a validation error rather than a silent guess.
 */
export const maritalStatusSchema = z
  .string()
  .nullable()
  .optional()
  .transform((v) => {
    // Keep `undefined` distinct from `null`: omitted means "leave untouched",
    // `null`/blank means "clear the column".
    if (v === undefined) return undefined;
    if (v === null) return null;
    const normalized = v.trim().toLowerCase().replace(/\s+/g, " ");
    return normalized.length === 0 ? null : normalized;
  })
  .refine(
    (v) =>
      v === undefined ||
      v === null ||
      (MARITAL_STATUS_VALUES as readonly string[]).includes(v),
    {
      message: `Marital status must be one of: ${MARITAL_STATUS_VALUES.join(", ")}`,
    },
  );

/**
 * Disability.
 *
 * Free text, because the source carries its own vocabulary ("Yes", "None",
 * "Physical", "Visual", ...). The value is stored exactly as the source stated
 * it — nothing is invented — and an empty value means "not recorded".
 */
export const disabilityStatusSchema = z
  .string()
  .trim()
  .max(DISABILITY_MAX, `Disability must be ${DISABILITY_MAX} characters or fewer`)
  .nullable()
  .optional()
  .transform((v) => {
    // `undefined` = key omitted (leave untouched); `null`/blank = clear.
    if (v === undefined) return undefined;
    if (v === null || v.length === 0) return null;
    return v;
  });

/**
 * National ID is optional, but an empty string from a form is normalised to
 * `null` so clearing the field actually clears the column.
 */
export const nationalIdSchema = z
  .string()
  .trim()
  .max(NATIONAL_ID_MAX, "National ID is too long")
  .optional()
  .nullable()
  .transform((v) => {
    if (v === undefined) return undefined;
    const trimmed = v?.trim() ?? "";
    return trimmed.length === 0 ? null : trimmed;
  });

/**
 * Employee number is required and unique per organization. It is stored
 * verbatim apart from surrounding whitespace, so leading zeros survive.
 */
const employeeNumberSchema = z
  .string()
  .trim()
  .min(1, "Employee number is required")
  .max(EMPLOYEE_NUMBER_MAX, "Employee number is too long");

const firstNameSchema = z
  .string()
  .trim()
  .max(100, "First name is too long")
  .optional()
  .nullable()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : "-"));

const lastNameSchema = z
  .string()
  .trim()
  .max(100, "Last name is too long")
  .optional()
  .nullable()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : "-"));

export const employmentTypeSchema = z
  .enum(EMPLOYMENT_TYPES)
  .optional()
  .default("full_time");

export const employmentStatusSchema = z
  .enum(EMPLOYMENT_STATUSES)
  .optional()
  .default("active");

export const jobGradeSchema = z
  .union([
    z.number().int("Job Grade must be a whole number"),
    z.string().trim().regex(/^\d+$/, "Job Grade must be a whole number"),
  ])
  .transform((v) => Number(v))
  .refine(
    (n) => n >= JOB_GRADE_MIN && n <= JOB_GRADE_MAX,
    `Job Grade must be between ${JOB_GRADE_MIN} and ${JOB_GRADE_MAX}`,
  )
  .optional()
  .nullable();

export const familySizeSchema = z
  .union([
    z.number().int("Family Size must be a whole number"),
    z.string().trim().regex(/^\d+$/, "Family Size must be a whole number"),
  ])
  .transform((v) => Number(v))
  .refine(
    (n) => n >= FAMILY_SIZE_MIN && n <= FAMILY_SIZE_MAX,
    `Family Size must be between ${FAMILY_SIZE_MIN} and ${FAMILY_SIZE_MAX}`,
  )
  .optional()
  .nullable();

/**
 * Service years: whole-number count of years the employee has served.
 * Part of the canonical eight-column employee schema. Bounds match the
 * database CHECK constraint (0-60 inclusive). Optional and nullable.
 */
export const serviceYearsSchema = z
  .union([
    z.number().int("Service Years must be a whole number"),
    z.string().trim().regex(/^\d+$/, "Service Years must be a whole number"),
  ])
  .transform((v) => Number(v))
  .refine(
    (n) => n >= SERVICE_YEARS_MIN && n <= SERVICE_YEARS_MAX,
    `Service Years must be between ${SERVICE_YEARS_MIN} and ${SERVICE_YEARS_MAX}`,
  )
  .optional()
  .nullable();

/**
 * The eight approved business columns of the canonical employee schema.
 *
 * `employeeNumber` is the physical column behind `emp_id`, `firstname` behind
 * `first_name`, and so on; see `CANONICAL_EMPLOYEE_FIELDS` in
 * `./constants` for the full mapping.
 */
export const canonicalEmployeeFields = {
  employeeNumber: employeeNumberSchema,
  firstname: firstNameSchema,
  lastname: lastNameSchema,
  gender: genderSchema,
  jobGrade: jobGradeSchema,
  serviceYears: serviceYearsSchema,
  maritalStatus: maritalStatusSchema,
  disabilityStatus: disabilityStatusSchema,
};

/**
 * Fields outside the approved eight that other modules still depend on.
 *
 * They are deliberately excluded from the Excel import (an import writes only
 * the canonical columns) but remain editable through the employee form so the
 * House Request eligibility gate, the House Queue ranking and the
 * employee-to-login tie-in keep working.
 */
export const retainedEmployeeFields = {
  /** Link to the master department register. */
  departmentId: optionalUuid,
  /** Reporting manager (self-reference on Employee). */
  managerId: optionalUuid,
  /** Link to the BetterAuth login account. */
  userid: optionalUuid,
  /** Identity document used by the House Request verification step. */
  nationalId: nationalIdSchema,
  /** House Request eligibility gate: only `active` employees may request. */
  employmentStatus: employmentStatusSchema,
  employmentType: employmentTypeSchema,
  /** Household size used as a queue tiebreaker. */
  familySize: familySizeSchema,
  /** Tenure reference; `serviceYears` is the canonical recorded value. */
  hireDate: dateString,
  jobTitle: optionalText(100),
};

/** Fields shared by create, update and import. */
export const employeeFields = {
  ...canonicalEmployeeFields,
  ...retainedEmployeeFields,
};

export const createEmployeeSchema = z.object(employeeFields).strict();

/**
 * Update accepts a partial document. `employeeNumber` may not be blanked
 * because the column is NOT NULL; every other field may be cleared by sending
 * an explicit `null`.
 *
 * The three fields that carry a `.default(...)` in {@link employeeFields} are
 * overridden with plain-optional variants. Without this, Zod would materialise
 * the default for any key the client omitted, so a partial update would silently
 * reset employment type and status instead of leaving them alone.
 */
export const updateEmployeeSchema = z
  .object({
    ...employeeFields,
    employeeNumber: employeeNumberSchema.optional(),
    firstname: firstNameSchema.optional(),
    lastname: lastNameSchema.optional(),
    gender: z.enum(GENDER_VALUES).optional().nullable(),
    employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
    employmentStatus: z.enum(EMPLOYMENT_STATUSES).optional(),
  })
  .strict()
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "No fields to update",
  });

/** Single row of a bulk request. `create` ignores `id`; `update`/`delete` need it. */
export const bulkEmployeeRowSchema = z
  .object({
    id: z.string().uuid().optional(),
    ...employeeFields,
    employeeNumber: employeeNumberSchema.optional(),
    firstname: firstNameSchema.optional(),
    lastname: lastNameSchema.optional(),
  })
  .strict();

export const bulkEmployeeOperationSchema = z.enum([
  "create",
  "update",
  "delete",
  "restore",
]);

export const bulkEmployeeRequestSchema = z
  .object({
    operation: bulkEmployeeOperationSchema,
    rows: z.array(bulkEmployeeRowSchema).min(1).max(500),
  })
  .superRefine((data, ctx) => {
    if (data.operation !== "create") {
      data.rows.forEach((row, i) => {
        if (!row.id) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["rows", i, "id"],
            message: `Row ${i + 1}: id is required for "${data.operation}"`,
          });
        }
      });
    }
  });

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type BulkEmployeeRequest = z.infer<typeof bulkEmployeeRequestSchema>;
export type BulkEmployeeOperation = z.infer<typeof bulkEmployeeOperationSchema>;

// ---------------------------------------------------------------------------
// List query
// ---------------------------------------------------------------------------

/**
 * Columns the table may be sorted by.
 *
 * Every entry is either one of the canonical eight columns or technical
 * metadata; the columns that left the Employee List are no longer sortable.
 */
export const EMPLOYEE_SORT_FIELDS = [
  "employeeNumber",
  "firstname",
  "lastname",
  "gender",
  "jobGrade",
  "serviceYears",
  "maritalStatus",
  "createdAt",
] as const;

export type EmployeeSortField = (typeof EMPLOYEE_SORT_FIELDS)[number];

/**
 * How the disability filter is expressed on the wire.
 *
 * `recorded` matches employees whose record states a disability; `none` matches
 * employees whose record states none (or records nothing at all).
 */
export const DISABILITY_FILTER_VALUES = ["recorded", "none"] as const;

export type DisabilityFilter = (typeof DISABILITY_FILTER_VALUES)[number];

export const employeeListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(25),
  search: z.string().trim().max(120).optional(),
  sortBy: z.enum(EMPLOYEE_SORT_FIELDS).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional().default("asc"),
  departmentId: z.string().uuid().optional(),
  employmentStatus: z.enum(EMPLOYMENT_STATUSES).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  gender: z.enum(GENDER_VALUES).optional(),
  maritalStatus: z.enum(MARITAL_STATUS_VALUES).optional(),
  /** `recorded` = a disability is on record; `none` = none is recorded. */
  disability: z.enum(DISABILITY_FILTER_VALUES).optional(),
  jobGradeFrom: z.coerce.number().int().min(JOB_GRADE_MIN).optional(),
  jobGradeTo: z.coerce.number().int().max(JOB_GRADE_MAX).optional(),
  /** `true` lists soft-deleted employees instead of live ones. */
  includeDeleted: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional()
    .default(false),
  /** `onlyDeleted` restricts the list to archived employees. */
  onlyDeleted: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional()
    .default(false),
});

export type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>;
