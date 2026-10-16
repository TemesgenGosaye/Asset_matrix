/**
 * Client-safe rent types.
 *
 * Kept separate from ./queries so browser components can import these without
 * pulling the Prisma client into the client bundle.
 *
 * Money is a decimal STRING everywhere in this file (see ./money.ts): amounts
 * cross the API boundary as exact text and are only ever formatted, never
 * arithmetically combined, on the client.
 */

import type { RentSortField } from "./schemas";
import type { MoneyString } from "./money";
import type { RentDisplayStatus } from "./constants";

export type { RentSortField, MoneyString };

export interface RentPhoneDto {
  id: string;
  phone: string;
  isPrimary: boolean;
}

/** A payment as shown in the detail view's payment history. */
export interface RentPaymentDto {
  id: string;
  installmentId: string;
  monthNumber: number;
  receiptNumber: string;
  amount: MoneyString;
  paidOn: string;
  method: "Cash" | "BankTransfer" | "Other";
  referenceNumber: string | null;
  note: string | null;
  voidedAt: string | null;
  voidReason: string | null;
}

/** One month of the schedule. */
export interface RentInstallmentDto {
  id: string;
  monthNumber: number;
  dueDate: string;
  amountDue: MoneyString;
  status: "UNPAID" | "PAID" | "VOIDED";
  /** DERIVED - true when dueDate < today and status is UNPAID. Never stored. */
  overdue: boolean;
  /** Whole days past due; 0 when not overdue. */
  daysOverdue: number;
  paidAt: string | null;
  receiptNumber: string | null;
  paymentMethod: "Cash" | "BankTransfer" | "Other" | null;
  referenceNumber: string | null;
  note: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  payments: RentPaymentDto[];
}

/**
 * Aggregates for a lease. Every field is computed by the database on read - none
 * of it is denormalised onto the renter row, so it cannot drift.
 */
export interface RentTotals {
  /** Scheduled months, i.e. `termMonths`. */
  totalMonths: number;
  monthsPaid: number;
  /** Months currently past due and unpaid (derived). */
  overdueMonths: number;
  /** Months voided by a termination. */
  voidedMonths: number;
  /** Sum of settled months. */
  totalPaid: MoneyString;
  /** `monthlyPrice * termMonths`. */
  totalContractValue: MoneyString;
  /** Sum of months still payable (excludes VOIDED). */
  outstanding: MoneyString;
  /** Earliest unpaid due date, or null when nothing is outstanding. */
  nextDueDate: string | null;
}

/** A row of the renter register, as delivered by the API. */
export interface RentRenterDto {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  gender: "male" | "female";
  /** Unmasked when the caller has the sensitive permission, otherwise masked. */
  nationalId: string;
  nationalIdMasked: boolean;
  rentType: "Shop" | "Grocery" | "Other";
  rentTypeDetail: string | null;
  monthlyPrice: MoneyString;
  startDate: string;
  endDate: string;
  termMonths: number;
  /** Persisted lease state. The badge uses `displayStatus` instead. */
  status: "Active" | "Completed" | "Terminated";
  displayStatus: RentDisplayStatus;
  terminatedAt: string | null;
  terminationReason: string | null;
  archivedReason: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  phones: RentPhoneDto[];
  totals: RentTotals;
  /** Display-only serial number computed by the server from the page position. */
  srNo: number;
}

/** Envelope returned by `GET /api/rent`. */
export interface RentRenterListResponse {
  data: RentRenterDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** False when National IDs in this payload are masked. */
  unmaskedNationalIds: boolean;
}

/** Envelope returned by `GET /api/rent/[id]`. */
export interface RentRenterDetailResponse {
  renter: RentRenterDto;
  installments: RentInstallmentDto[];
  payments: RentPaymentDto[];
}

/** Summary cards, computed by aggregate query. */
export interface RentSummary {
  totalRenters: number;
  activeLeases: number;
  completedLeases: number;
  terminatedLeases: number;
  archivedRenters: number;
  totalCollected: MoneyString;
  totalOutstanding: MoneyString;
  totalContractValue: MoneyString;
  overdueRenters: number;
  overdueMonths: number;
}

export interface RentPaymentResult {
  payment: RentPaymentDto;
  installment: RentInstallmentDto;
  receiptNumber: string;
  renter: RentRenterDto;
}

export interface RentFormValues {
  firstName: string;
  lastName: string;
  gender: string;
  nationalId: string;
  phones: { phone: string; isPrimary: boolean }[];
  rentType: string;
  rentTypeDetail: string;
  monthlyPrice: string;
  startDate: string;
  termMonths: string;
}

// ---------------------------------------------------------------------------
// Query-string helpers
// ---------------------------------------------------------------------------

export const ALL = "all";

export interface RentQueryState {
  page: number;
  pageSize: number;
  search: string;
  sortBy: RentSortField;
  sortOrder: "asc" | "desc";
  rentType: string;
  status: string;
  gender: string;
  overdueOnly: boolean;
  startDateFrom: string;
  startDateTo: string;
  onlyArchived: boolean;
}

export const DEFAULT_RENT_QUERY: RentQueryState = {
  page: 1,
  pageSize: 25,
  search: "",
  sortBy: "lastName",
  sortOrder: "asc",
  rentType: ALL,
  status: ALL,
  gender: ALL,
  overdueOnly: false,
  startDateFrom: "",
  startDateTo: "",
  onlyArchived: false,
};

/** Fields that a changed filter must reset the page number for. */
export const FILTER_FIELDS = [
  "search",
  "rentType",
  "status",
  "gender",
  "overdueOnly",
  "startDateFrom",
  "startDateTo",
  "onlyArchived",
  "pageSize",
] as const satisfies readonly (keyof RentQueryState)[];

/** Serialise query state into the API's search string. */
export function toSearchParams(query: RentQueryState): URLSearchParams {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  if (query.search.trim()) params.set("search", query.search.trim());
  if (query.sortBy) params.set("sortBy", query.sortBy);
  params.set("sortOrder", query.sortOrder);
  if (query.rentType !== ALL) params.set("rentType", query.rentType);
  if (query.status !== ALL) params.set("status", query.status);
  if (query.gender !== ALL) params.set("gender", query.gender);
  if (query.overdueOnly) params.set("overdueOnly", "true");
  if (query.startDateFrom.trim()) {
    params.set("startDateFrom", query.startDateFrom.trim());
  }
  if (query.startDateTo.trim())
    params.set("startDateTo", query.startDateTo.trim());
  if (query.onlyArchived) params.set("onlyArchived", "true");
  return params;
}

/** `today` as `YYYY-MM-DD` in UTC - the default value of the start-date field. */
export function todayDateOnly(now: Date = new Date()): string {
  const year = String(now.getUTCFullYear()).padStart(4, "0");
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
