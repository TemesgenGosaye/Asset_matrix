/**
 * Employee export column definitions.
 *
 * The export is the exact inverse of the import: the same eight canonical
 * columns, in the same order, with the same headers. One definition drives
 * both CSV and XLSX so the two formats can never drift, and a register export
 * can be edited and imported again without losing a column.
 */

import type { ExportColumn } from "@/lib/export";
import { GENDER_LABELS, MARITAL_STATUS_LABELS, labelOrDash } from "./constants";
import type { EmployeeDto } from "./queries";

/**
 * Column order mirrors the canonical employee schema: Emp ID through
 * Disability. The technical columns (id, timestamps) are never exported.
 */
export const EMPLOYEE_EXPORT_COLUMNS: readonly ExportColumn[] = [
  { key: "employeeNumber", header: "Emp ID" },
  { key: "firstname", header: "First Name" },
  { key: "lastname", header: "Last Name" },
  { key: "gender", header: "Gender" },
  { key: "jobGrade", header: "Job Grade" },
  { key: "serviceYears", header: "Service Years" },
  { key: "maritalStatus", header: "Marital Status" },
  { key: "disabilityStatus", header: "Disability" },
] as const;

/** Convert a DTO into the flat record shape the export helpers expect. */
export function toExportRow(dto: EmployeeDto): Record<string, unknown> {
  return {
    employeeNumber: dto.employeeNumber,
    firstname: dto.firstname,
    lastname: dto.lastname,
    gender: labelOrDash(GENDER_LABELS, dto.gender),
    jobGrade: dto.jobGrade ?? "",
    serviceYears: dto.serviceYears ?? "",
    maritalStatus: labelOrDash(MARITAL_STATUS_LABELS, dto.maritalStatus),
    disabilityStatus: dto.disabilityStatus ?? "",
  };
}

/**
 * A blank, correctly-typed template for HR to fill before importing.
 *
 * It carries exactly the eight canonical columns and NO sample rows: a
 * template that ships with invented people invites those people into the
 * register, and the placeholders read as real records. The workbook has the
 * headers only, so a file filled in from this template imports without any
 * further mapping.
 */
export function buildEmployeeTemplateRows(): Record<string, unknown>[] {
  return [];
}

/** Columns offered by the download template, in order. */
export const EMPLOYEE_TEMPLATE_COLUMNS: ExportColumn[] = [
  { key: "Emp ID", header: "Emp ID" },
  { key: "First Name", header: "First Name" },
  { key: "Last Name", header: "Last Name" },
  { key: "Gender", header: "Gender" },
  { key: "Job Grade", header: "Job Grade" },
  { key: "Service Years", header: "Service Years" },
  { key: "Marital Status", header: "Marital Status" },
  { key: "Disability", header: "Disability" },
  { key: "Score", header: "Score" },
];
