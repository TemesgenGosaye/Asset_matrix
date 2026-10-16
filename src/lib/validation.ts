import { z } from "zod";
import { NextResponse } from "next/server";
import {
  HOUSEHOLD_HID_REGEX,
  HOUSE_NUMBER_FAMILY_REGEX,
  getExpectedHouseNumberPrefix,
} from "./household-constants";
import { DAMAGE_ITEMS } from "./house-queue/damage";

// ---------------------------------------------------------------------------
// Validation helper
// ---------------------------------------------------------------------------

/**
 * Validate request body against a Zod schema.
 * Returns parsed data on success, or a NextResponse with 400 status and
 * field-level error messages on failure.
 *
 * The response carries `code: "VALIDATION_FAILED"` so a client can attach each
 * message to its field instead of rendering a bare "Validation failed" banner
 * that tells the user nothing about what to correct.
 *
 * Usage:
 *   const data = validateBody(schema, body);
 *   if (data instanceof NextResponse) return data;
 *   // data is now the parsed & typed result
 */
export function validateBody<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
): z.infer<T> | NextResponse {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  }

  const fieldErrors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join(".") || "_root";
    if (!fieldErrors[path]) fieldErrors[path] = [];
    fieldErrors[path].push(issue.message);
  }

  return NextResponse.json(
    {
      error: "Validation failed",
      code: "VALIDATION_FAILED",
      fields: fieldErrors,
    },
    { status: 400 },
  );
}

// ---------------------------------------------------------------------------
// Reusable field schemas
// ---------------------------------------------------------------------------

/**
 * Minimum password length shared across user-management schemas.
 * Keep in sync with the create/edit forms and the BetterAuth
 * `minPasswordLength` floor (8) — forms hide the details behind this constant.
 */
export const PASSWORD_MIN = 12;

const uuidField = z.string().uuid("Must be a valid UUID");
const optionalUuid = z
  .string()
  .uuid("Must be a valid UUID")
  .optional()
  .nullable();
const trimmedString = z.string().trim().min(1, "Required");
const optionalString = z.string().trim().optional().nullable();

/** Optional trimmed text with a maximum length. */
const optionalLimited = (max: number) =>
  z.string().trim().max(max).optional().nullable();

/** A `YYYY-MM-DD` date string, or absent/null. */
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format")
  .optional()
  .nullable();

/**
 * A repair-cost field from a form: a decimal string, or a JSON number.
 *
 * Not `z.coerce.number()` — that would turn `""` into 0 and `"abc"` into NaN, so a
 * damaged part with an empty or mistyped cost field would arrive as a real 0 and
 * be recorded as free. Accepting both shapes and validating the text is what
 * lets "left blank" stay distinguishable from "zero".
 */
const costInput = z.union([z.string(), z.number()]);

/**
 * Email field that tolerates a blank input while still validating format.
 * Blank/whitespace becomes null and values are lowercased to match BetterAuth's
 * own lowercase email lookup on sign-in.
 */
const emailField = z
  .string()
  .trim()
  .transform((v) => (v ? v.toLowerCase() : null))
  .pipe(z.string().email("Invalid email address").nullable());

// ---------------------------------------------------------------------------
// Authentication schemas
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username too long"),
  password: z.string().min(1, "Password is required"),
});

// ---------------------------------------------------------------------------
// User schemas
// ---------------------------------------------------------------------------

export const createUserSchema = z.object({
  username: z.string().min(3).max(50),
  email: emailField.nullish(),
  firstname: z.string().min(1).max(100),
  lastname: z.string().min(1).max(100),
  password: z
    .string()
    .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`)
    .max(128)
    .optional(),
  isadmin: z.boolean().default(false),
  canrequest: z.boolean().default(false),
  lan: z.string().max(50).nullable().optional(),
  passwordMode: z.enum(["generate", "manual", "invite"]).default("manual"),
  accessExpiresAt: z.string().datetime({ offset: true }).optional().nullable(),
});

export const updateUserSchema = z.object({
  username: z.string().min(3).max(50).optional(),
  email: emailField.nullish(),
  firstname: z.string().min(1).max(100).optional(),
  lastname: z.string().min(1).max(100).optional(),
  password: z
    .string()
    .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`)
    .max(128)
    .optional(),
  isadmin: z.boolean().optional(),
  canrequest: z.boolean().optional(),
  lan: z.string().max(50).optional().nullable(),
  departmentId: z.string().uuid().optional().nullable(),
  accessExpiresAt: z.string().datetime({ offset: true }).optional().nullable(),
});

export const createReportScheduleSchema = z.object({
  reportType: z.enum(["summary", "depreciation", "warranty", "tco"]),
  frequency: z.enum(["daily", "weekly", "monthly"]),
  format: z.enum(["csv", "xlsx"]),
});

// ---------------------------------------------------------------------------
// Asset schemas
// ---------------------------------------------------------------------------

export const createAssetSchema = z.object({
  assetname: trimmedString.max(255),
  assettag: trimmedString.max(50),
  serialnumber: trimmedString.max(100),
  modelid: optionalUuid,
  specs: optionalString,
  notes: optionalString,
  purchaseprice: z.coerce
    .number()
    .nonnegative("Must be >= 0")
    .optional()
    .nullable(),
  purchasedate: z
    .string()
    .datetime({ offset: true })
    .optional()
    .nullable()
    .or(
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .nullable(),
    ),
  mobile: z.boolean().optional().nullable(),
  requestable: z.boolean().optional().nullable(),
  assetcategorytypeid: optionalUuid,
  statustypeid: optionalUuid,
  supplierid: optionalUuid,
  locationid: optionalUuid,
  manufacturerid: optionalUuid,
  departmentId: optionalUuid,
  departmentCode: optionalString,
  warrantyMonths: z.coerce.number().int().nonnegative().optional().nullable(),
  warrantyExpires: z.string().optional().nullable(),
  reviewsDate: z.string().optional().nullable(),
  remark: optionalString,
});

export const updateAssetSchema = z.object({
  assetid: uuidField,
  assetname: trimmedString.max(255).optional(),
  assettag: trimmedString.max(50).optional(),
  serialnumber: trimmedString.max(100).optional(),
  modelid: optionalUuid,
  specs: optionalString,
  notes: optionalString,
  purchaseprice: z.coerce.number().nonnegative().optional().nullable(),
  purchasedate: z.string().optional().nullable(),
  mobile: z.boolean().optional().nullable(),
  requestable: z.boolean().optional().nullable(),
  assetcategorytypeid: optionalUuid,
  statustypeid: optionalUuid,
  supplierid: optionalUuid,
  locationid: optionalUuid,
  manufacturerid: optionalUuid,
  departmentId: optionalUuid,
  departmentCode: optionalString,
  warrantyMonths: z.coerce.number().int().nonnegative().optional().nullable(),
  warrantyExpires: z.string().optional().nullable(),
  reviewsDate: z.string().optional().nullable(),
  remark: optionalString,
});

// ---------------------------------------------------------------------------
// Accessory schemas
// ---------------------------------------------------------------------------

export const createAccessorySchema = z.object({
  accessoriename: z.string().min(1).max(255),
  accessorietag: z.string().min(1).max(50),
  purchaseprice: z.coerce.number().nonnegative().nullable().optional(),
  purchasedate: z.string().nullable().optional(),
  requestable: z.boolean().nullable().optional(),
  manufacturerid: z.string().uuid(),
  statustypeid: z.string().uuid(),
  accessoriecategorytypeid: z.string().uuid(),
  locationid: z.string().uuid(),
  supplierid: z.string().uuid(),
  modelid: z.string().uuid(),
});

export const updateAccessorySchema = createAccessorySchema.partial();

// ---------------------------------------------------------------------------
// License schemas
// ---------------------------------------------------------------------------

export const createLicenseSchema = z.object({
  licencekey: z.string().max(255).nullable().optional(),
  licenceduserid: z.string().uuid().nullable().optional(),
  licensedtoemail: z.string().email().nullable().optional(),
  purchaseprice: z.coerce.number().nonnegative().nullable().optional(),
  purchasedate: z.string().nullable().optional(),
  expirationdate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  requestable: z.boolean().nullable().optional(),
  licencecategorytypeid: z.string().uuid(),
  manufacturerid: z.string().uuid(),
  supplierid: z.string().uuid(),
});

export const updateLicenseSchema = createLicenseSchema.partial();

// ---------------------------------------------------------------------------
// Consumable schemas
// ---------------------------------------------------------------------------

export const createConsumableSchema = z.object({
  consumablename: z.string().min(1).max(255),
  consumablecategorytypeid: z.string().uuid(),
  manufacturerid: z.string().uuid(),
  supplierid: z.string().uuid(),
  purchaseprice: z.coerce.number().nonnegative().nullable().optional(),
  purchasedate: z.string().nullable().optional(),
  minQuantity: z.number().int().nonnegative().nullable().optional(),
  quantity: z.number().int().nonnegative().nullable().optional(),
});

export const updateConsumableSchema = createConsumableSchema.partial();

// ---------------------------------------------------------------------------
// Consumable checkout schema
// ---------------------------------------------------------------------------

export const consumableCheckoutSchema = z.object({
  consumableId: uuidField,
  userId: uuidField,
  quantity: z.number().int().positive("Must be a positive integer").default(1),
  notes: optionalString,
});

// ---------------------------------------------------------------------------
// Manufacturer schemas
// ---------------------------------------------------------------------------

export const createManufacturerSchema = z.object({
  manufacturername: z.string().min(1).max(255),
});

export const updateManufacturerSchema = createManufacturerSchema.partial();

// ---------------------------------------------------------------------------
// Supplier schemas
// ---------------------------------------------------------------------------

export const createSupplierSchema = z.object({
  suppliername: z.string().min(1).max(255),
  lastname: z.string().max(255).nullable().optional(),
  firstname: z.string().max(255).nullable().optional(),
  salutation: z.string().max(50).nullable().optional(),
  email: z.string().email().nullable().optional(),
  phonenumber: z.string().max(50).nullable().optional(),
  website: z.string().url().max(500).nullable().optional(),
});

export const updateSupplierSchema = createSupplierSchema.partial();

// ---------------------------------------------------------------------------
// Location schemas
// ---------------------------------------------------------------------------

export const createLocationSchema = z.object({
  locationname: z.string().min(1).max(255),
  street: z.string().max(255).nullable().optional(),
  housenumber: z.string().max(50).nullable().optional(),
  city: z.string().max(255).nullable().optional(),
  country: z.string().max(255).nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
});

export const updateLocationSchema = createLocationSchema.partial();

// ---------------------------------------------------------------------------
// Category Type schemas
// ---------------------------------------------------------------------------

export const createAssetCategoryTypeSchema = z.object({
  assetcategorytypename: z.string().min(1).max(255),
});

export const updateAssetCategoryTypeSchema =
  createAssetCategoryTypeSchema.partial();

export const createAccessoryCategoryTypeSchema = z.object({
  accessoriecategorytypename: z.string().min(1).max(255),
});

export const updateAccessoryCategoryTypeSchema =
  createAccessoryCategoryTypeSchema.partial();

export const createConsumableCategoryTypeSchema = z.object({
  consumablecategorytypename: z.string().min(1).max(255),
});

export const updateConsumableCategoryTypeSchema =
  createConsumableCategoryTypeSchema.partial();

export const createLicenceCategoryTypeSchema = z.object({
  licencecategorytypename: z.string().min(1).max(255),
});

export const updateLicenceCategoryTypeSchema =
  createLicenceCategoryTypeSchema.partial();

// ---------------------------------------------------------------------------
// Model schemas
// ---------------------------------------------------------------------------

export const createModelSchema = z.object({
  modelname: z.string().min(1).max(255),
  modelnumber: z.string().max(255).nullable().optional(),
});

export const updateModelSchema = createModelSchema.partial();

// ---------------------------------------------------------------------------
// Status Type schemas
// ---------------------------------------------------------------------------

export const createStatusTypeSchema = z.object({
  statustypename: z.string().min(1).max(255),
});

export const updateStatusTypeSchema = createStatusTypeSchema.partial();

// ---------------------------------------------------------------------------
// Generic UUID validation
// ---------------------------------------------------------------------------

export const uuidSchema = z.string().uuid();

// ---------------------------------------------------------------------------
// Pagination schemas
// ---------------------------------------------------------------------------

export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
});

// ---------------------------------------------------------------------------
// Approval schemas
// ---------------------------------------------------------------------------

export const createApprovalSchema = z.object({
  entityType: z.enum(["reservation", "asset_request", "transfer"], {
    message: "Must be reservation, asset_request, or transfer",
  }),
  entityId: uuidField,
  notes: optionalString,
});

export const resolveApprovalSchema = z.object({
  action: z.enum(["approve", "reject"], {
    message: "Must be approve or reject",
  }),
  notes: optionalString,
});

// ---------------------------------------------------------------------------
// Transfer schema
// ---------------------------------------------------------------------------

export const createTransferSchema = z.object({
  assetId: uuidField,
  transferType: z.enum(["user", "location", "organization"], {
    message: "Must be user, location, or organization",
  }),
  fromUserId: optionalUuid,
  toUserId: optionalUuid,
  fromLocationId: optionalUuid,
  toLocationId: optionalUuid,
  fromOrgId: optionalUuid,
  toOrgId: optionalUuid,
  reason: optionalString,
});

// ---------------------------------------------------------------------------
// Automation rule schema
// ---------------------------------------------------------------------------

export const createAutomationRuleSchema = z.object({
  name: trimmedString,
  description: optionalString,
  trigger: z.enum([
    "warranty_expiring",
    "maintenance_due",
    "asset_status_change",
    "license_expiring",
    "stock_low",
  ]),
  conditions: z
    .union([z.string(), z.record(z.string(), z.unknown())])
    .optional(),
  actions: z
    .union([
      z.string(),
      z.array(z.unknown()),
      z.record(z.string(), z.unknown()),
    ])
    .optional(),
  isActive: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Component schemas
// ---------------------------------------------------------------------------

export const createComponentSchema = z.object({
  name: trimmedString,
  serialNumber: optionalString,
  categoryId: uuidField,
  totalQuantity: z.number().int().nonnegative("Must be >= 0").default(0),
  purchasePrice: z.coerce
    .number()
    .nonnegative("Must be >= 0")
    .optional()
    .nullable(),
  purchaseDate: z.string().optional().nullable(),
  minQuantity: z.number().int().nonnegative().default(0),
  manufacturerId: optionalUuid,
  supplierId: optionalUuid,
  locationId: optionalUuid,
});

export const updateComponentSchema = createComponentSchema.partial();

export const componentCheckoutSchema = z.object({
  componentId: uuidField,
  assetId: uuidField,
  quantity: z.number().int().positive("Must be a positive integer").default(1),
  notes: optionalString,
});

export const componentCheckinSchema = z.object({
  checkoutId: uuidField,
  quantity: z.number().int().positive("Must be a positive integer").optional(),
  notes: optionalString,
});

export const createComponentCategorySchema = z.object({
  name: trimmedString,
});

export const updateComponentCategorySchema =
  createComponentCategorySchema.partial();

// ---------------------------------------------------------------------------
// Asset checkout schemas
// ---------------------------------------------------------------------------

export const assetCheckoutSchema = z
  .object({
    assetId: uuidField,
    checkedOutToType: z
      .enum(["user", "location", "asset"], {
        message: "Must be user, location, or asset",
      })
      .default("user"),
    checkedOutTo: optionalUuid,
    checkedOutToLocationId: optionalUuid,
    checkedOutToAssetId: optionalUuid,
    expectedReturn: z.string().optional().nullable(),
    notes: optionalString,
  })
  .refine(
    (data) => {
      if (data.checkedOutToType === "user") return !!data.checkedOutTo;
      if (data.checkedOutToType === "location")
        return !!data.checkedOutToLocationId;
      if (data.checkedOutToType === "asset") return !!data.checkedOutToAssetId;
      return false;
    },
    { message: "Target ID is required for the selected checkout type" },
  );

export const assetCheckinSchema = z.object({
  checkoutId: uuidField,
  notes: optionalString,
});

// ---------------------------------------------------------------------------
// Licence seat schemas
// ---------------------------------------------------------------------------

export const assignLicenceSeatSchema = z.object({
  licenceId: uuidField,
  userId: uuidField,
  notes: optionalString,
});

export const unassignLicenceSeatSchema = z.object({
  assignmentId: uuidField,
});

// ---------------------------------------------------------------------------
// Bulk Checkout
// ---------------------------------------------------------------------------

export const bulkCheckoutSchema = z
  .object({
    assetIds: z.array(uuidField).min(1, "At least one asset is required"),
    checkedOutToType: z.enum(["user", "location", "asset"]).default("user"),
    checkedOutTo: optionalUuid,
    checkedOutToLocationId: optionalUuid,
    checkedOutToAssetId: optionalUuid,
    expectedReturn: z.string().optional().nullable(),
    notes: optionalString,
  })
  .refine(
    (data) => {
      if (data.checkedOutToType === "user") return !!data.checkedOutTo;
      if (data.checkedOutToType === "location")
        return !!data.checkedOutToLocationId;
      if (data.checkedOutToType === "asset") return !!data.checkedOutToAssetId;
      return false;
    },
    { message: "Target ID is required for the selected checkout type" },
  );

// ---------------------------------------------------------------------------
// Predefined Kits
// ---------------------------------------------------------------------------

export const createKitSchema = z.object({
  name: trimmedString,
  description: optionalString,
  isActive: z.boolean().optional(),
  items: z
    .array(
      z.object({
        entityType: z.enum([
          "asset_category",
          "accessory",
          "licence",
          "component",
        ]),
        entityId: uuidField,
        quantity: z.number().int().positive().default(1),
        isRequired: z.boolean().default(true),
        notes: optionalString,
      }),
    )
    .optional(),
});

export const updateKitSchema = createKitSchema.partial();

export const kitCheckoutSchema = z.object({
  kitId: uuidField,
  userId: uuidField,
  notes: optionalString,
});

// ---------------------------------------------------------------------------
// Audit Campaigns
// ---------------------------------------------------------------------------

export const createAuditCampaignSchema = z.object({
  name: trimmedString,
  description: optionalString,
  dueDate: z.string().optional().nullable(),
  scopeType: z.enum(["all", "location", "category"]).default("all"),
  scopeId: optionalUuid,
  auditorIds: z.array(uuidField).optional(),
});

export const updateAuditCampaignSchema = createAuditCampaignSchema.partial();

export const auditScanSchema = z.object({
  assetId: uuidField,
  locationId: optionalUuid,
  status: z.enum(["found", "missing", "moved"]).default("found"),
  notes: optionalString,
});

// ---------------------------------------------------------------------------
// Employee schemas
//
// The employee contract now lives in `src/lib/employees/schemas.ts` (it covers
// create, update, bulk, import and the list query). These re-exports keep the
// long-standing `@/lib/validation` import path working.
// ---------------------------------------------------------------------------

export {
  createEmployeeSchema,
  updateEmployeeSchema,
  bulkEmployeeRequestSchema,
  bulkEmployeeOperationSchema,
  employeeListQuerySchema,
  EMPLOYEE_SORT_FIELDS,
} from "./employees/schemas";

export type {
  CreateEmployeeInput,
  UpdateEmployeeInput,
  BulkEmployeeRequest,
  EmployeeListQuery,
  EmployeeSortField,
} from "./employees/schemas";

// ---------------------------------------------------------------------------
// Household schemas
// ---------------------------------------------------------------------------

export const HOUSE_TYPES = ["Staff", "A", "B", "C", "D", "E"] as const;
export const STAFF_CATEGORIES = ["A", "B", "C", "D", "E"] as const;
export const RG_TYPES = ["Regular", "Guest"] as const;
export const HOUSEHOLD_STATUSES = ["Active", "Inactive"] as const;

/**
 * Acceptable manual House ID format. Allows the generated-style `106-90-001`
 * as well as legacy values such as `HID-0001`. Must start with an
 * alphanumeric character and may continue with letters, numbers, dashes,
 * dots and underscores.
 *
 * @see HOUSEHOLD_HID_REGEX in ./household-constants (client-safe module)
 */

export const createHouseholdBaseSchema = z.object({
  hid: trimmedString
    .max(50, "HID must be at most 50 characters")
    .regex(
      HOUSEHOLD_HID_REGEX,
      "HID must follow the canonical format 106-90-000",
    )
    .optional(),
  houseType: z.enum(HOUSE_TYPES),
  staffCategory: z.enum(STAFF_CATEGORIES).optional().nullable(),
  houseNumber: trimmedString
    .max(50, "House number must be at most 50 characters")
    .regex(
      HOUSE_NUMBER_FAMILY_REGEX,
      "House number must use a valid family: Staff SA1-SE999 or categories A1-E999 (e.g. SA1, SE12, A1, E5)",
    ),
  rgType: z.enum(RG_TYPES),
  locationId: optionalUuid,
  locationName: optionalLimited(255),
  status: z.enum(HOUSEHOLD_STATUSES).default("Active"),
  bedCount: z.coerce
    .number()
    .int()
    .min(0, "Bed count must be non-negative")
    .default(0),
  chairsCount: z.coerce
    .number()
    .int()
    .min(0, "Chairs count must be non-negative")
    .default(0),
  lockerCount: z.coerce
    .number()
    .int()
    .min(0, "Locker count must be non-negative")
    .default(0),
  tablesCount: z.coerce
    .number()
    .int()
    .min(0, "Tables count must be non-negative")
    .default(0),
  damageWindow: z.boolean().default(false),
  damageDoor: z.boolean().default(false),
  damageWaterPanel: z.boolean().default(false),
  damageRoof: z.boolean().default(false),
  damageWall: z.boolean().default(false),
  damageElectricity: z.boolean().default(false),
  damageNotes: optionalLimited(1000),
});

export const createHouseholdSchema = createHouseholdBaseSchema
  .refine(
    (data) => {
      if (data.houseType === "Staff") {
        return !!data.staffCategory;
      }
      return true;
    },
    {
      message: "Staff category is required when House Type is Staff",
      path: ["staffCategory"],
    },
  )
  .refine(
    (data) =>
      data.houseNumber
        .trim()
        .toUpperCase()
        .startsWith(
          getExpectedHouseNumberPrefix(data.houseType, data.staffCategory) ||
            "",
        ),
    {
      message:
        "House number family must match the house type: Staff houses use SA-SE prefixes, categories A-E use their matching letter",
      path: ["houseNumber"],
    },
  )
  .refine(
    (data) => {
      if (data.status === "Inactive") {
        return (
          data.damageWindow ||
          data.damageDoor ||
          data.damageWaterPanel ||
          data.damageRoof ||
          data.damageWall ||
          data.damageElectricity
        );
      }
      return true;
    },
    {
      message:
        "Damage checklist is required when Status is Inactive. Identify at least one damaged component.",
      path: ["damageWindow"],
    },
  );

export const updateHouseholdSchema = createHouseholdBaseSchema
  .partial()
  .extend({
    id: uuidField,
  })
  .refine(
    (data) => {
      if (data.houseType === "Staff") {
        return !!data.staffCategory;
      }
      return true;
    },
    {
      message: "Staff category is required when House Type is Staff",
      path: ["staffCategory"],
    },
  )
  .refine(
    (data) => {
      if (!data.houseNumber || !data.houseType) return true;
      const expected = getExpectedHouseNumberPrefix(
        data.houseType,
        data.houseType === "Staff" ? data.staffCategory : null,
      );
      return data.houseNumber
        .trim()
        .toUpperCase()
        .startsWith(expected || "");
    },
    {
      message:
        "House number family must match the house type: Staff houses use SA-SE prefixes, categories A-E use their matching letter",
      path: ["houseNumber"],
    },
  )
  .refine(
    (data) => {
      if (data.status === "Inactive") {
        return (
          data.damageWindow ||
          data.damageDoor ||
          data.damageWaterPanel ||
          data.damageRoof ||
          data.damageWall ||
          data.damageElectricity
        );
      }
      return true;
    },
    {
      message:
        "Damage checklist is required when Status is Inactive. Identify at least one damaged component.",
      path: ["damageWindow"],
    },
  );

export const toggleHouseholdStatusSchema = z
  .object({
    id: uuidField,
    status: z.enum(HOUSEHOLD_STATUSES),
    damageWindow: z.boolean().default(false),
    damageDoor: z.boolean().default(false),
    damageWaterPanel: z.boolean().default(false),
    damageRoof: z.boolean().default(false),
    damageWall: z.boolean().default(false),
    damageElectricity: z.boolean().default(false),
    damageNotes: optionalLimited(1000),
  })
  .refine(
    (data) => {
      if (data.status === "Inactive") {
        return (
          data.damageWindow ||
          data.damageDoor ||
          data.damageWaterPanel ||
          data.damageRoof ||
          data.damageWall ||
          data.damageElectricity
        );
      }
      return true;
    },
    {
      message:
        "Damage checklist is required when deactivating a house. Select at least one damaged component.",
      path: ["damageWindow"],
    },
  );

// ---------------------------------------------------------------------------
// General Asset schemas
// ---------------------------------------------------------------------------

export const createGeneralAssetSchema = z.object({
  itemType: trimmedString.max(100),
  pid: trimmedString.max(50),
  category: trimmedString.max(100),
  locationId: optionalUuid,
  locationName: optionalLimited(255),
  condition: trimmedString.max(50),
  brand: optionalLimited(100),
  reviewsDate: dateString,
  remark: optionalLimited(1000),
});

export const updateGeneralAssetSchema = z.object({
  id: uuidField,
  itemType: trimmedString.max(100).optional(),
  pid: trimmedString.max(50).optional(),
  category: trimmedString.max(100).optional(),
  locationId: optionalUuid,
  locationName: optionalLimited(255),
  condition: trimmedString.max(50).optional(),
  brand: optionalLimited(100),
  reviewsDate: dateString,
  remark: optionalLimited(1000),
});

// ---------------------------------------------------------------------------
// House Queue schemas
// ---------------------------------------------------------------------------

/** Approve / reassign an employee to a specific house. */
export const houseQueueApproveSchema = z.object({
  employeeId: uuidField,
  householdId: uuidField,
});

/** Skip (exclude) or defer (postpone) an employee from the queue. */
export const houseQueueSkipDeferSchema = z.object({
  employeeId: uuidField,
  mode: z.enum(["skip", "defer"]),
  reason: optionalLimited(500),
});

/** Reason codes for terminating (releasing) a live house allocation. */
export const houseTerminationReasons = [
  "TRANSFER",
  "EMPLOYEE_LEAVE",
  "RETIREMENT",
] as const;

/**
 * Exit reasons that require a handback inspection before the house re-enters
 * the pool.
 */
export const houseInspectionReasons = [
  "TRANSFER",
  "EMPLOYEE_LEAVE",
  "RETIREMENT",
] as const;

/**
 * Release Workflow - Step 1 (initiate). Records which exit branch was chosen
 * (Transfer, employee leave or retirement) with an optional note.
 */
export const houseQueueReleaseInitiateSchema = z.object({
  employeeId: uuidField,
  branch: z.enum(houseInspectionReasons),
  reason: optionalLimited(500),
});

/**
 * Release Workflow - Step 2 (execute).
 * For TRANSFER: requires `targetHouseholdId` (the replacement house chosen from Engine B free houses).
 * In one transaction: allocates employee to new house, vacates old house to PendingInspection,
 * marks old allocation release_pending, and auto-schedules inspection.
 * For EMPLOYEE_LEAVE / RETIREMENT: moves allocation to release_pending, house to PendingInspection,
 * and auto-schedules inspection.
 */
export const houseQueueReleaseExecuteSchema = z.object({
  employeeId: uuidField,
  branch: z.enum(houseInspectionReasons),
  reason: optionalLimited(500),
  targetHouseholdId: uuidField.optional().nullable(),
});

/** Release Workflow - Step 3 (schedule or update the handback inspection). */
export const houseQueueInspectionScheduleSchema = z.object({
  inspectorId: uuidField.optional().nullable(),
  scheduledDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format"),
});

/**
 * Release Workflow - Step 4 (complete the handback inspection). Resolves the
 * house checklist (registry comparison: doors, windows, water, roof, wall, electricity, inside items).
 * Completing it finalises the release: the allocation is archived with a
 * `terminatedAt` and the house returns to stock, in one transaction.
 *
 * A repair cost accompanies every part that is marked Damaged. The per-field
 * rules here are deliberately permissive — any value that *could* be a cost is
 * accepted here — because the "is this part damaged, and is its cost therefore
 * required?" question spans six fields and cannot be asked field-by-field. That
 * cross-field judgement belongs to `validateDamage` in `./house-queue/damage`,
 * which is also what the client form uses, so the two can never disagree about
 * whether a submission is valid.
 *
 * The one thing rejected here outright is a cost with three or more decimals: no
 * rounding is performed anywhere, because a silently rounded figure on a signed
 * receipt is worse than a refused submission.
 */
export const houseQueueInspectionCompleteSchema = z
  .object({
    checklistWindow: z.boolean().default(false),
    checklistDoor: z.boolean().default(false),
    checklistWaterPanel: z.boolean().default(false),
    checklistRoof: z.boolean().default(false),
    checklistWall: z.boolean().default(false),
    checklistElectricity: z.boolean().default(false),
    checklistBedCount: z.coerce.number().int().min(0).optional().default(0),
    checklistChairsCount: z.coerce.number().int().min(0).optional().default(0),
    checklistLockerCount: z.coerce.number().int().min(0).optional().default(0),
    checklistTablesCount: z.coerce.number().int().min(0).optional().default(0),
    // Accepts a form field's string or a JSON number. Blank/omitted means "no
    // cost recorded", which is legal for an OK part and rejected for a damaged
    // one by `validateDamage`.
    costWindow: costInput.optional(),
    costDoor: costInput.optional(),
    costWaterPanel: costInput.optional(),
    costRoof: costInput.optional(),
    costWall: costInput.optional(),
    costElectricity: costInput.optional(),
    conditionNote: optionalLimited(1000),
  })
  .superRefine((value, ctx) => {
    for (const item of DAMAGE_ITEMS) {
      const raw = value[item.costKey];
      if (raw === undefined || raw === null || raw === "") continue;
      if (!/^\d+(\.\d{1,2})?$/.test(String(raw).trim())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [item.costKey],
          message: `${item.label} cost must be a positive amount in ETB with at most 2 decimals.`,
        });
      }
    }
  });

/**
 * Termination receipt — the only input is which inspection to print from.
 *
 * There is deliberately nothing here for the damage, the costs or the note: a
 * receipt is populated from the completed inspection, never from the request, so
 * a caller cannot hand-print a receipt showing a different assessment than the
 * one the inspector recorded.
 */
export const houseQueueReceiptSchema = z.object({
  inspectionId: uuidField,
});

/** Recalculate the queue, optionally for a single grade. */
export const houseQueueRecalculateSchema = z.object({
  grade: z.coerce.number().int().min(1).optional().nullable(),
});
