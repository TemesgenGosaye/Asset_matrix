/**
 * Rent export row shaping.
 *
 * Reuses `buildExportResponse` from @/lib/export, which handles CSV formula
 * injection sanitisation, the ExcelJS workbook and the Content-Disposition
 * header. This module only decides WHICH columns are exported and how a renter
 * becomes a flat row.
 *
 * Personal data note: National ID is exported exactly as the API returned it, so
 * it is masked whenever the caller lacks `rent:sensitive_view`. A masked value
 * can never be exported in the clear.
 */

import type { ExportColumn } from "@/lib/export";
import { formatEtbNumber } from "./money";
import type { RenterDto } from "./queries";
import {
  RENT_DISPLAY_STATUS_LABELS,
  RENT_INSTALLMENT_STATUS_LABELS,
  RENT_PAYMENT_METHOD_LABELS,
  RENT_TYPE_LABELS,
  GENDER_LABELS,
} from "./constants";

export const RENT_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "srNo", header: "#" },
  { key: "fullName", header: "Full Name" },
  { key: "gender", header: "Gender" },
  { key: "nationalId", header: "National ID" },
  { key: "phones", header: "Phone(s)" },
  { key: "rentType", header: "Rent Type" },
  { key: "monthlyPrice", header: "Monthly Price (ETB)" },
  { key: "startDate", header: "Start Date" },
  { key: "endDate", header: "End Date" },
  { key: "termMonths", header: "Term (Months)" },
  { key: "monthsPaid", header: "Months Paid" },
  { key: "totalPaid", header: "Total Paid (ETB)" },
  { key: "totalContractValue", header: "Contract Value (ETB)" },
  { key: "outstanding", header: "Outstanding (ETB)" },
  { key: "nextDueDate", header: "Next Due" },
  { key: "overdueMonths", header: "Overdue Months" },
  { key: "status", header: "Lease Status" },
  { key: "archived", header: "Archived" },
];

/** Flatten a renter DTO into an export row. */
export function toRentExportRow(
  renter: RenterDto,
): Record<string, string | number> {
  return {
    srNo: renter.srNo,
    fullName: renter.fullName,
    gender: GENDER_LABELS[renter.gender] ?? renter.gender,
    nationalId: renter.nationalId,
    phones: renter.phones.map((p) => p.phone).join(" / ") || "—",
    rentType:
      renter.rentType === "Other" && renter.rentTypeDetail
        ? `Other - ${renter.rentTypeDetail}`
        : (RENT_TYPE_LABELS[renter.rentType] ?? renter.rentType),
    monthlyPrice: formatEtbNumber(renter.monthlyPrice),
    startDate: renter.startDate,
    endDate: renter.endDate,
    termMonths: renter.termMonths,
    monthsPaid: `${renter.totals.monthsPaid} / ${renter.totals.totalMonths}`,
    totalPaid: formatEtbNumber(renter.totals.totalPaid),
    totalContractValue: formatEtbNumber(renter.totals.totalContractValue),
    outstanding: formatEtbNumber(renter.totals.outstanding),
    nextDueDate: renter.totals.nextDueDate ?? "—",
    overdueMonths: renter.totals.overdueMonths,
    status:
      RENT_DISPLAY_STATUS_LABELS[renter.displayStatus] ?? renter.displayStatus,
    archived: renter.deletedAt ? "Yes" : "No",
  };
}

// ---------------------------------------------------------------------------
// Printable statement
// ---------------------------------------------------------------------------

export interface RentStatementRow {
  monthNumber: number;
  dueDate: string;
  amountDue: string;
  statusLabel: string;
  overdue: boolean;
  paidOn: string | null;
  receiptNumber: string | null;
  method: string | null;
}

export interface RentStatement {
  renter: RenterDto;
  rows: RentStatementRow[];
  totals: {
    monthsPaid: number;
    totalMonths: number;
    totalPaid: string;
    totalContractValue: string;
    outstanding: string;
  };
  generatedAt: string;
}

/**
 * Build the printable lease statement: one line per month, in chronological
 * order, starting at the rent start date.
 *
 * Pure shaping - the caller supplies already-authorised, already-scoped data, so
 * this function cannot leak across organizations.
 */
export function buildRentStatement(params: {
  renter: RenterDto;
  installments: {
    monthNumber: number;
    dueDate: string;
    amountDue: string;
    status: "UNPAID" | "PAID" | "VOIDED";
    overdue: boolean;
    paidAt: string | null;
    receiptNumber: string | null;
    paymentMethod: "Cash" | "BankTransfer" | "Other" | null;
  }[];
  generatedAt?: Date;
}): RentStatement {
  const { renter, installments, generatedAt = new Date() } = params;

  return {
    renter,
    rows: installments.map((i) => ({
      monthNumber: i.monthNumber,
      dueDate: i.dueDate,
      amountDue: i.amountDue,
      statusLabel: i.overdue
        ? "Overdue"
        : (RENT_INSTALLMENT_STATUS_LABELS[i.status] ?? i.status),
      overdue: i.overdue,
      paidOn: i.paidAt,
      receiptNumber: i.receiptNumber,
      method: i.paymentMethod
        ? (RENT_PAYMENT_METHOD_LABELS[i.paymentMethod] ?? i.paymentMethod)
        : null,
    })),
    totals: {
      monthsPaid: renter.totals.monthsPaid,
      totalMonths: renter.totals.totalMonths,
      totalPaid: renter.totals.totalPaid,
      totalContractValue: renter.totals.totalContractValue,
      outstanding: renter.totals.outstanding,
    },
    generatedAt: generatedAt.toISOString(),
  };
}

/** Filename stem shared by the CSV/XLSX export and the printed statement. */
export function rentFileStem(renter?: { fullName: string }): string {
  const stamp = new Date().toISOString().slice(0, 10);
  if (!renter) return `rent-register-${stamp}`;
  const slug = renter.fullName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `rent-statement-${slug || "renter"}-${stamp}`;
}
