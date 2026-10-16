/**
 * Rent ("Pay Rent") domain constants and shared types.
 *
 * Single source of truth for the module's vocabulary: the database stores
 * `RentType`, `RentInstallmentStatus`, `RentPaymentMethod` and `RentLeaseStatus`
 * as native PostgreSQL enums, and every label, option list and badge variant in
 * the app derives from the arrays below so a value can never drift between the
 * API, the UI and the database.
 */

import type {
  Gender,
  RentInstallmentStatus,
  RentLeaseStatus,
  RentPaymentMethod,
  RentType,
} from "@prisma/client";

/** Currency every amount in this module is denominated in. */
export const RENT_CURRENCY = "ETB";

/** Rent types accepted by the renter form, in UI order. */
export const RENT_TYPES = [
  "Shop",
  "Grocery",
  "Other",
] as const satisfies readonly RentType[];
export type RentTypeValue = (typeof RENT_TYPES)[number];

/** Persisted month states. OVERDUE is derived and deliberately absent. */
export const RENT_INSTALLMENT_STATUSES = [
  "UNPAID",
  "PAID",
  "VOIDED",
] as const satisfies readonly RentInstallmentStatus[];

/** Persisted lease states. Overdue is a display state and deliberately absent. */
export const RENT_LEASE_STATUSES = [
  "Active",
  "Completed",
  "Terminated",
] as const satisfies readonly RentLeaseStatus[];

/** Display state computed from the persisted lease state + installment rows. */
export const RENT_DISPLAY_STATUSES = [
  "Active",
  "Overdue",
  "Completed",
  "Terminated",
] as const;
export type RentDisplayStatus = (typeof RENT_DISPLAY_STATUSES)[number];

/** Payment methods, in UI order. */
export const RENT_PAYMENT_METHODS = [
  "Cash",
  "BankTransfer",
  "Other",
] as const satisfies readonly RentPaymentMethod[];
export type RentPaymentMethodValue = (typeof RENT_PAYMENT_METHODS)[number];

/** Gender values reused from the Employee vocabulary so the MCDA stays consistent. */
export const RENT_GENDER_VALUES = [
  "male",
  "female",
] as const satisfies readonly Gender[];

// ---------------------------------------------------------------------------
// Bounds (mirrored by database CHECK constraints)
// ---------------------------------------------------------------------------

/** Inclusive minimum lease term in months. Mirrors `rent_renters_term_range_check`. */
export const TERM_MONTHS_MIN = 1;
/** Inclusive maximum lease term in months. Mirrors `rent_renters_term_range_check`. */
export const TERM_MONTHS_MAX = 120;
/** Term pre-filled in the create form. */
export const TERM_MONTHS_DEFAULT = 24;

/** Largest price a single month may cost, in whole ETB. */
export const MONTHLY_PRICE_MAX = 100_000_000;
/** Largest amount a schedule row may hold, in whole ETB. */
export const MONTHLY_AMOUNT_MAX = MONTHLY_PRICE_MAX * TERM_MONTHS_MAX;

/** Shortest / longest accepted name, in characters. Mirrors the DB CHECK. */
export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 50;

/** Phone entry bounds. */
export const PHONE_MIN = 1;
export const PHONE_MAX = 3;

/** Longest accepted free-text field lengths (mirror the column widths). */
export const REFERENCE_NUMBER_MAX = 100;
export const NOTE_MAX = 500;
export const REASON_MAX = 500;
export const RENT_TYPE_DETAIL_MAX = 200;

// ---------------------------------------------------------------------------
// Display labels
// ---------------------------------------------------------------------------

export const RENT_TYPE_LABELS: Record<RentType, string> = {
  Shop: "Shop",
  Grocery: "Grocery",
  Other: "Other",
};

export const RENT_PAYMENT_METHOD_LABELS: Record<RentPaymentMethod, string> = {
  Cash: "Cash",
  BankTransfer: "Bank Transfer",
  Other: "Other",
};

export const RENT_INSTALLMENT_STATUS_LABELS: Record<
  RentInstallmentStatus,
  string
> = {
  UNPAID: "Unpaid",
  PAID: "Paid",
  VOIDED: "Voided",
};

export const RENT_LEASE_STATUS_LABELS: Record<RentLeaseStatus, string> = {
  Active: "Active",
  Completed: "Completed",
  Terminated: "Terminated",
};

export const RENT_DISPLAY_STATUS_LABELS: Record<RentDisplayStatus, string> = {
  Active: "Active",
  Overdue: "Overdue",
  Completed: "Completed",
  Terminated: "Terminated",
};

export const GENDER_LABELS: Record<Gender, string> = {
  male: "Male",
  female: "Female",
};

/**
 * Badge variants for each *display* status. Colour is never the only signal: the
 * badge always renders the label text from `RENT_DISPLAY_STATUS_LABELS`.
 */
export const RENT_DISPLAY_STATUS_BADGE_VARIANT: Record<
  RentDisplayStatus,
  "success" | "warning" | "info" | "destructive"
> = {
  Active: "success",
  Overdue: "warning",
  Completed: "info",
  Terminated: "destructive",
};

export const RENT_INSTALLMENT_STATUS_BADGE_VARIANT: Record<
  RentInstallmentStatus,
  "secondary" | "success" | "muted"
> = {
  UNPAID: "secondary",
  PAID: "success",
  VOIDED: "muted",
};

/** Label for a derived overdue month, which is not a persisted status. */
export const RENT_OVERDUE_LABEL = "Overdue";

/** Option lists shaped for the portal's `<Select>` components. */
export const RENT_TYPE_OPTIONS = RENT_TYPES.map((value) => ({
  value,
  label: RENT_TYPE_LABELS[value],
}));

export const RENT_PAYMENT_METHOD_OPTIONS = RENT_PAYMENT_METHODS.map(
  (value) => ({
    value,
    label: RENT_PAYMENT_METHOD_LABELS[value],
  }),
);

export const RENT_GENDER_OPTIONS = RENT_GENDER_VALUES.map((value) => ({
  value,
  label: GENDER_LABELS[value],
}));

export const RENT_DISPLAY_STATUS_OPTIONS = RENT_DISPLAY_STATUSES.map(
  (value) => ({
    value,
    label: RENT_DISPLAY_STATUS_LABELS[value],
  }),
);

/** Human-readable label for an optional enum, or an em dash when unset. */
export function labelOrDash(
  labels: Record<string, string>,
  value: string | null | undefined,
): string {
  if (!value) return "—";
  return labels[value] ?? value;
}

/**
 * Resolve the status shown in the UI for a lease.
 *
 * `Overdue` is derived: an Active lease that has at least one past-due unpaid
 * month. Never persisted, so it can never be stale.
 */
export function resolveDisplayStatus(params: {
  status: RentLeaseStatus;
  overdueMonths: number;
}): RentDisplayStatus {
  if (params.status === "Terminated") return "Terminated";
  if (params.status === "Completed") return "Completed";
  return params.overdueMonths > 0 ? "Overdue" : "Active";
}
