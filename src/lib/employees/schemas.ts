/**
 * Zod schemas for the employee module.
 *
 * These live in their own module because the employee contract is now larger
 * than a couple of objects (create / update / bulk / import / list query) and
 * `src/lib/validation.ts` is already a large shared file. The pre-existing
 * `createEmployeeSchema` / `updateEmployeeSchema` exports are re-exported from
 * `validation.ts` for backwards compatibility.
 */

import { z } from "zod";
import {
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
  .transform((v) => v ?? null);

export const maritalStatusSchema = z
  .enum(MARITAL_STATUS_VALUES)
  .optional()
  .nullable()
  .transform((v) => v ?? null);

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
 * verbatim apart from surrounding whitespace.
 */
const employeeNumberSchema = z
  .string()
  .trim()
  .min(1, "Employee number is required")
  .max(EMPLOYEE_NUMBER_MAX, "Employee number is too long");

const firstNameSchema = z
  .string()
  .trim()
  .min(1, "First name is required")
  .max(100, "First name is too long");

const lastNameSchema = z
  .string()
  .trim()
  .min(1, "Last name is required")
  .max(100, "Last name is too long");

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

/** Disability stays a plain boolean; it deliberately has no enum. */
export const disabilityStatusSchema = z.boolean().optional().default(false);

/** Fields shared by create, update and import. */
const employeeFields = {
  employeeNumber: employeeNumberSchema,
  firstname: firstNameSchema,
  lastname: lastNameSchema,
  phone: optionalText(25),
  dateOfBirth: dateString,
  gender: genderSchema,
  nationalId: nationalIdSchema,
  maritalStatus: maritalStatusSchema,
  disabilityStatus: disabilityStatusSchema,
  address: optionalText(255),
  city: optionalText(100),
  state: optionalText(100),
  country: optionalText(100),
  postalCode: optionalText(20),
  jobTitle: optionalText(100),
  employmentType: employmentTypeSchema,
  employmentStatus: employmentStatusSchema,
  jobGrade: jobGradeSchema,
  familySize: familySizeSchema,
  hireDate: dateString,
  terminationDate: dateString,
  departmentId: optionalUuid,
  managerId: optionalUuid,
  userid: optionalUuid,
  notes: optionalText(1000),
};

export const createEmployeeSchema = z.object(employeeFields);

/**
 * Update accepts a partial document. `employeeNumber` may not be blanked
 * because the column is NOT NULL; every other field may be cleared by sending
 * an explicit `null`.
 *
 * The three fields that carry a `.default(...)` in {@link employeeFields} are
 * overridden with plain-optional variants. Without this, Zod would materialise
 * the default for any key the client omitted, so a partial update would silently
 * reset employment type, status and disability instead of leaving them alone.
 */
export const updateEmployeeSchema = z
  .object({
    ...employeeFields,
    employeeNumber: employeeNumberSchema.optional(),
    firstname: firstNameSchema.optional(),
    lastname: lastNameSchema.optional(),
    gender: z.enum(GENDER_VALUES).optional().nullable(),
    maritalStatus: z.enum(MARITAL_STATUS_VALUES).optional().nullable(),
    employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
    employmentStatus: z.enum(EMPLOYMENT_STATUSES).optional(),
    disabilityStatus: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "No fields to update",
  });

/** Single row of a bulk request. `create` ignores `id`; `update`/`delete` need it. */
export const bulkEmployeeRowSchema = z.object({
  id: z.string().uuid().optional(),
  ...employeeFields,
  employeeNumber: employeeNumberSchema.optional(),
  firstname: firstNameSchema.optional(),
  lastname: lastNameSchema.optional(),
});

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

/** Columns the table may be sorted by. Mirrored by `EMPLOYEE_SORT_FIELDS`. */
export const EMPLOYEE_SORT_FIELDS = [
  "employeeNumber",
  "firstname",
  "lastname",
  "jobGrade",
  "jobTitle",
  "department",
  "employmentStatus",
  "employmentType",
  "hireDate",
  "createdAt",
] as const;

export type EmployeeSortField = (typeof EMPLOYEE_SORT_FIELDS)[number];

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
  disabilityStatus: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
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
