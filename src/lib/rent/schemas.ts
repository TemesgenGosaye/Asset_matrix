/**
 * Zod schemas for the Pay Rent module.
 *
 * Mirrors the database CHECK constraints field for field (see
 * prisma/migrations/20261003000000_add_pay_rent_module/migration.sql) so a value
 * that the form accepts is always a value the database will store, and a value
 * the database rejects is always rejected with a field-level message instead of
 * a 500.
 *
 * The National ID and phone format rules are NOT repeated here - they live in
 * ./validators as data so there is exactly one definition of each.
 */

import { z } from "zod";
import {
  MONTHLY_PRICE_MAX,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  NOTE_MAX,
  REFERENCE_NUMBER_MAX,
  REASON_MAX,
  RENT_GENDER_VALUES,
  RENT_INSTALLMENT_STATUSES,
  RENT_LEASE_STATUSES,
  RENT_PAYMENT_METHODS,
  RENT_TYPES,
  RENT_TYPE_DETAIL_MAX,
  TERM_MONTHS_DEFAULT,
  TERM_MONTHS_MAX,
  TERM_MONTHS_MIN,
} from "./constants";
import { parseAmountInput } from "./money";
import { parseDateOnly, MIN_YEAR, MAX_YEAR } from "./schedule";
import { normalizePhoneList, validateNationalId } from "./validators";

/**
 * A `YYYY-MM-DD` calendar date that is a real day in the real calendar.
 *
 * Rejects `2026-02-31` (rather than rolling it into March) because a start date
 * that silently moves produces an entirely wrong rent schedule.
 */
export const dateOnlySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the YYYY-MM-DD date format")
  .refine(
    (value) => parseDateOnly(value) !== null,
    "Enter a real calendar date",
  );

/**
 * A date that is also storable in `rent_receipt_sequences`.
 *
 * `paidOn` picks the receipt counter's year, so a year outside the sequence
 * table's CHECK range would be a schema-valid request that PostgreSQL rejects
 * with an opaque `422 CONSTRAINT_VIOLATION`.
 */
export const storableDateOnlySchema = dateOnlySchema.refine((value) => {
  const year = Number(value.slice(0, 4));
  return year >= MIN_YEAR && year <= MAX_YEAR;
}, `Enter a date between ${MIN_YEAR} and ${MAX_YEAR}`);

/**
 * A money amount.
 *
 * Accepts a number or a numeric string (HTML forms and pasted values both occur)
 * and yields an exact `Prisma.Decimal` with at most two decimals. Never yields a
 * float, so `monthlyPrice` is never `0.30000000000000004`.
 */
const moneySchema = (max: number, label: string) =>
  z.union([z.number(), z.string()]).transform((value, ctx) => {
    const parsed = parseAmountInput(value);
    if (!parsed) {
      ctx.addIssue({
        code: "custom",
        message: `${label} must be a number with at most 2 decimal places`,
      });
      return z.NEVER;
    }
    if (parsed.lessThanOrEqualTo(0)) {
      ctx.addIssue({
        code: "custom",
        message: `${label} must be greater than 0`,
      });
      return z.NEVER;
    }
    if (parsed.greaterThan(max)) {
      ctx.addIssue({
        code: "custom",
        message: `${label} must not exceed ${max.toLocaleString("en-ET")}`,
      });
      return z.NEVER;
    }
    return parsed;
  });

export const monthlyPriceSchema = moneySchema(
  MONTHLY_PRICE_MAX,
  "Monthly price",
);

export const amountSchema = moneySchema(
  MONTHLY_PRICE_MAX * TERM_MONTHS_MAX,
  "Amount",
);

const nameSchema = (label: string) =>
  z
    .string()
    .trim()
    .min(
      NAME_MIN_LENGTH,
      `${label} must be at least ${NAME_MIN_LENGTH} characters`,
    )
    .max(
      NAME_MAX_LENGTH,
      `${label} must be at most ${NAME_MAX_LENGTH} characters`,
    );

/**
 * National ID, validated by the shared rule in ./validators.
 *
 * Emits the error on the `nationalId` path so the form can highlight the field
 * rather than showing a banner.
 */
const nationalIdSchema = z.string().transform((value, ctx) => {
  const result = validateNationalId(value);
  if (!result.ok) {
    ctx.addIssue({ code: "custom", message: result.message! });
    return z.NEVER;
  }
  return result.value!;
});

/** One submitted phone row: raw input plus the primary flag. */
const phoneEntrySchema = z.object({
  phone: z.string().trim().min(1, "Phone number is required"),
  isPrimary: z.boolean().default(false),
});

/**
 * The phone list, reduced to de-duplicated E.164 values plus the primary.
 *
 * All cross-field rules (count, format, duplicates, exactly-one-primary) live in
 * `normalizePhoneList` so the same code backs the API and any future import.
 */
const phoneListSchema = z.array(phoneEntrySchema).transform((entries, ctx) => {
  const result = normalizePhoneList(entries);
  for (const error of result.errors) {
    ctx.addIssue({
      code: "custom",
      path: [error.index, "phone"],
      message: error.message,
    });
  }
  if (result.errors.length > 0) return z.NEVER;
  return { values: result.values, primary: result.primary };
});

/** `Other` requires a description; a non-`Other` type must not carry one. */
const rentTypeField = z
  .object({
    rentType: z.enum(RENT_TYPES),
    rentTypeDetail: z
      .string()
      .trim()
      .max(RENT_TYPE_DETAIL_MAX, "Description is too long")
      .optional()
      .nullable()
      .transform((value) => {
        const trimmed = value?.trim() ?? "";
        return trimmed === "" ? null : trimmed;
      }),
  })
  .superRefine((data, ctx) => {
    if (data.rentType === "Other" && !data.rentTypeDetail) {
      ctx.addIssue({
        code: "custom",
        path: ["rentTypeDetail"],
        message: "Describe the rent type when 'Other' is selected",
      });
    }
  });

const phoneListShape = { phones: phoneListSchema };

const termSchema = z.union([z.number(), z.string()]).transform((value, ctx) => {
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) {
    ctx.addIssue({
      code: "custom",
      message: "Lease term must be a whole number of months",
    });
    return z.NEVER;
  }
  const months = Number(text);
  if (months < TERM_MONTHS_MIN || months > TERM_MONTHS_MAX) {
    ctx.addIssue({
      code: "custom",
      message: `Lease term must be between ${TERM_MONTHS_MIN} and ${TERM_MONTHS_MAX} months`,
    });
    return z.NEVER;
  }
  return months;
});

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export const createRenterSchema = z
  .object({
    firstName: nameSchema("First name"),
    lastName: nameSchema("Last name"),
    gender: z.enum(RENT_GENDER_VALUES, { error: "Select a gender" }),
    nationalId: nationalIdSchema,
    ...phoneListShape,
    monthlyPrice: monthlyPriceSchema,
    startDate: dateOnlySchema,
    termMonths: termSchema.optional().default(TERM_MONTHS_DEFAULT),
  })
  .and(rentTypeField);

export type CreateRenterInput = z.infer<typeof createRenterSchema>;

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/**
 * Update accepts a partial document.
 *
 * `startDate` / `termMonths` may only be sent together with a `reason` once the
 * lease has payments - the service enforces the elevated-permission rule; this
 * schema only makes sure a reason was supplied so the failure is a field error
 * rather than an opaque 409.
 *
 * The "Other requires a description" rule is re-stated here with a `superRefine`
 * rather than reusing `rentTypeField.partial()`, because Zod 4 refuses
 * `.partial()` on a schema that already carries a refinement.
 */
export const updateRenterSchema = z
  .object({
    firstName: nameSchema("First name").optional(),
    lastName: nameSchema("Last name").optional(),
    gender: z.enum(RENT_GENDER_VALUES).optional(),
    nationalId: nationalIdSchema.optional(),
    phones: phoneListSchema.optional(),
    rentType: z.enum(RENT_TYPES).optional(),
    rentTypeDetail: z
      .string()
      .trim()
      .max(RENT_TYPE_DETAIL_MAX, "Description is too long")
      .optional()
      .nullable()
      .transform((value) => {
        const trimmed = value?.trim() ?? "";
        return trimmed === "" ? null : trimmed;
      }),
    monthlyPrice: monthlyPriceSchema.optional(),
    startDate: dateOnlySchema.optional(),
    termMonths: termSchema.optional(),
    /** Mandatory justification for changing the schedule after payments exist. */
    reason: z
      .string()
      .trim()
      .min(1, "A reason is required for this change")
      .max(REASON_MAX, "Reason is too long")
      .optional(),
  })
  .superRefine((data, ctx) => {
    // Only when this request SETS the type to Other. The database CHECK (`Other`
    // implies a non-empty `rentTypeDetail`) also fires when an existing `Other`
    // lease has its description cleared, but that case cannot be detected here:
    // `rentTypeDetail`'s transform normalises an omitted field to `null`, so
    // "not sent" and "explicitly cleared" are indistinguishable at this layer.
    // `updateRenter` therefore re-checks against the STORED type and raises a
    // field-level 422 rather than letting the CHECK surface as an opaque error.
    if (data.rentType === "Other" && !data.rentTypeDetail) {
      ctx.addIssue({
        code: "custom",
        path: ["rentTypeDetail"],
        message: "Describe the rent type when 'Other' is selected",
      });
    }
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "No fields to update",
  });

export type UpdateRenterInput = z.infer<typeof updateRenterSchema>;

// ---------------------------------------------------------------------------
// Payment / void / terminate / archive
// ---------------------------------------------------------------------------

export const recordPaymentSchema = z
  .object({
    /** Which month is being settled. Either the installment id or the month number. */
    installmentId: z.string().uuid("Select a month to settle").optional(),
    monthNumber: z.number().int().min(1).optional(),
    /** Defaults to today; may be backdated for a payment collected earlier. */
    paidOn: storableDateOnlySchema.optional(),
    method: z.enum(RENT_PAYMENT_METHODS, { error: "Select a payment method" }),
    /**
     * Must equal the month's invoiced amount. Recorded here so an API caller can
     * state the figure explicitly; the service rejects anything else, because a
     * short payment would be reported as fully collected and never re-collectable.
     */
    amount: amountSchema.optional(),
    referenceNumber: z
      .string()
      .trim()
      .max(REFERENCE_NUMBER_MAX, "Reference number is too long")
      .optional()
      .nullable()
      .transform((value) => {
        const trimmed = value?.trim() ?? "";
        return trimmed === "" ? null : trimmed;
      }),
    note: z
      .string()
      .trim()
      .max(NOTE_MAX, "Note is too long")
      .optional()
      .nullable()
      .transform((value) => {
        const trimmed = value?.trim() ?? "";
        return trimmed === "" ? null : trimmed;
      }),
  })
  .refine(
    (data) => Boolean(data.installmentId) || data.monthNumber !== undefined,
    { message: "Select a month to settle", path: ["installmentId"] },
  );

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

export const voidPaymentSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "A reason is required to void a payment")
    .max(REASON_MAX, "Reason is too long"),
});

export type VoidPaymentInput = z.infer<typeof voidPaymentSchema>;

export const terminateLeaseSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "A termination reason is required")
    .max(REASON_MAX, "Reason is too long"),
  /** Day the lease stops. Months still unpaid on/after it are VOIDED. */
  effectiveDate: dateOnlySchema.optional(),
});

export type TerminateLeaseInput = z.infer<typeof terminateLeaseSchema>;

export const archiveRenterSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(REASON_MAX, "Reason is too long")
    .optional()
    .nullable()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed === "" ? null : trimmed;
    }),
});

export type ArchiveRenterInput = z.infer<typeof archiveRenterSchema>;

export const restoreRenterSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(REASON_MAX, "Reason is too long")
    .optional()
    .nullable()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed === "" ? null : trimmed;
    }),
});

// ---------------------------------------------------------------------------
// List query
// ---------------------------------------------------------------------------

/** Columns the renter table may be sorted by. Mirrored by RENT_SORT_FIELDS. */
export const RENT_SORT_FIELDS = [
  "firstName",
  "lastName",
  "nationalId",
  "rentType",
  "monthlyPrice",
  "startDate",
  "termMonths",
  "status",
  "createdAt",
] as const;
export type RentSortField = (typeof RENT_SORT_FIELDS)[number];

/**
 * Filter fields, kept as a plain shape so both the list and the export query can
 * be built from it.
 *
 * Zod 4 refuses `.omit()` / `.partial()` on an object schema that already
 * carries a refinement, so the refinement-free fields live here and the
 * cross-field check is applied once per concrete schema.
 */
const rentFilterFields = {
  search: z.string().trim().max(120).optional(),
  sortBy: z.enum(RENT_SORT_FIELDS).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional().default("asc"),
  rentType: z.enum(RENT_TYPES).optional(),
  /** Lease status filter. `Overdue` is derived and handled server-side. */
  status: z.enum([...RENT_LEASE_STATUSES, "Overdue"]).optional(),
  gender: z.enum(RENT_GENDER_VALUES).optional(),
  /** Narrow to leases with at least one past-due unpaid month. */
  overdueOnly: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional()
    .default(false),
  startDateFrom: dateOnlySchema.optional(),
  startDateTo: dateOnlySchema.optional(),
  /** `true` lists archived renters instead of live ones. */
  onlyArchived: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional()
    .default(false),
} as const;

/** An inverted start-date range is a user error, not an empty result set. */
function assertDateRange(
  data: { startDateFrom?: string; startDateTo?: string },
  ctx: z.RefinementCtx,
): void {
  if (
    data.startDateFrom &&
    data.startDateTo &&
    data.startDateFrom > data.startDateTo
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["startDateFrom"],
      message: "Start-date range is inverted",
    });
  }
}

export const rentListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional().default(25),
    ...rentFilterFields,
  })
  .superRefine(assertDateRange);

export type RentListQuery = z.infer<typeof rentListQuerySchema>;

export const rentExportQuerySchema = z
  .object({
    ...rentFilterFields,
    format: z.enum(["csv", "xlsx"]).optional().default("csv"),
  })
  .superRefine(assertDateRange);

export type RentExportQuery = z.infer<typeof rentExportQuerySchema>;

/** Installment status values, exposed for the detail view's row filter. */
export const RENT_INSTALLMENT_STATUS_VALUES = RENT_INSTALLMENT_STATUSES;
