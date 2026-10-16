/**
 * Employee export column definitions.
 *
 * One definition drives both CSV and XLSX so the two formats can never drift,
 * and the National ID column is emitted masked when the caller lacks the
 * sensitive-data permission.
 */

import type { ExportColumn } from "@/lib/export";
import {
  EMPLOYMENT_STATUS_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  GENDER_LABELS,
  MARITAL_STATUS_LABELS,
  labelOrDash,
} from "./constants";
import type { EmployeeDto } from "./queries";

/** Column order mirrors the register: SrNo through Disability. */
export const EMPLOYEE_EXPORT_COLUMNS: readonly ExportColumn[] = [
  { key: "srNo", header: "Sr.No" },
  { key: "employeeNumber", header: "Emp ID" },
  { key: "fullName", header: "Employee Name" },
  { key: "gender", header: "Gender" },
  { key: "jobGrade", header: "Job Grade" },
  { key: "departmentName", header: "Department" },
  { key: "maritalStatus", header: "Marital Status" },
  { key: "nationalId", header: "National ID" },
  { key: "disabilityStatus", header: "Disability" },
  { key: "jobTitle", header: "Job Title" },
  { key: "employmentType", header: "Employment Type" },
  { key: "employmentStatus", header: "Employment Status" },
  { key: "managerName", header: "Reporting Manager" },
  { key: "phone", header: "Phone" },
  { key: "hireDate", header: "Hire Date" },
  { key: "terminationDate", header: "Termination Date" },
  { key: "address", header: "Address" },
  { key: "city", header: "City" },
  { key: "state", header: "State" },
  { key: "country", header: "Country" },
  { key: "postalCode", header: "Postal Code" },
  { key: "notes", header: "Notes" },
] as const;

/** Convert a DTO into the flat record shape the export helpers expect. */
export function toExportRow(dto: EmployeeDto): Record<string, unknown> {
  return {
    srNo: dto.srNo,
    employeeNumber: dto.employeeNumber,
    fullName: `${dto.firstname} ${dto.lastname}`.trim(),
    gender: labelOrDash(GENDER_LABELS, dto.gender),
    jobGrade: dto.jobGrade ?? "",
    departmentName: dto.department?.name ?? "",
    maritalStatus: labelOrDash(MARITAL_STATUS_LABELS, dto.maritalStatus),
    nationalId: dto.nationalId,
    disabilityStatus: dto.disabilityStatus ? "Yes" : "No",
    jobTitle: dto.jobTitle ?? "",
    employmentType:
      EMPLOYMENT_TYPE_LABELS[
        dto.employmentType as keyof typeof EMPLOYMENT_TYPE_LABELS
      ] ?? dto.employmentType,
    employmentStatus:
      EMPLOYMENT_STATUS_LABELS[
        dto.employmentStatus as keyof typeof EMPLOYMENT_STATUS_LABELS
      ] ?? dto.employmentStatus,
    managerName: dto.manager
      ? `${dto.manager.firstname} ${dto.manager.lastname}`.trim()
      : "",
    phone: dto.phone ?? "",
    hireDate: dto.hireDate ? String(dto.hireDate).slice(0, 10) : "",
    terminationDate: dto.terminationDate
      ? String(dto.terminationDate).slice(0, 10)
      : "",
    address: dto.address ?? "",
    city: dto.city ?? "",
    state: dto.state ?? "",
    country: dto.country ?? "",
    postalCode: dto.postalCode ?? "",
    notes: dto.notes ?? "",
  };
}

/** A blank, correctly-typed template for HR to fill before importing. */
export function buildEmployeeTemplateRows(
  sampleDepartments: { name: string }[],
): Record<string, unknown>[] {
  const [deptA = { name: "" }, deptB = { name: "" }] = sampleDepartments;
  return [
    {
      "Emp ID": "EMP-001",
      "First Name": "Alemayehu",
      "Last Name": "Kebede",
      "Job Grade": 12,
      Gender: "female",
      "Marital Status": "married",
      "National ID": "AB-1234567",
      Disability: "No",
      Department: deptA.name,
      "Job Title": "Senior Analyst",
      "Employment Type": "full_time",
      "Employment Status": "active",
      "Family Size": 3,
      Phone: "+251900000001",
      "Hire Date": "2024-01-15",
      "Reporting Manager": "",
      Address: "",
      City: "Addis Ababa",
      State: "",
      Country: "Ethiopia",
      "Postal Code": "",
      Notes: "Sample row — delete before importing.",
    },
    {
      "Emp ID": "EMP-002",
      "First Name": "Dawit",
      "Last Name": "Girma",
      "Job Grade": 8,
      Gender: "male",
      "Marital Status": "single",
      "National ID": "",
      Disability: "No",
      Department: deptB.name,
      "Job Title": "Officer",
      "Employment Type": "full_time",
      "Employment Status": "active",
      "Family Size": 1,
      Phone: "",
      "Hire Date": "2024-06-01",
      "Reporting Manager": "EMP-001",
      Address: "",
      City: "Addis Ababa",
      State: "",
      Country: "Ethiopia",
      "Postal Code": "",
      Notes: "",
    },
  ];
}

/** Columns offered by the download template, in order. */
export const EMPLOYEE_TEMPLATE_COLUMNS: ExportColumn[] = [
  { key: "Emp ID", header: "Emp ID" },
  { key: "First Name", header: "First Name" },
  { key: "Last Name", header: "Last Name" },
  { key: "Job Grade", header: "Job Grade" },
  { key: "Gender", header: "Gender" },
  { key: "Marital Status", header: "Marital Status" },
  { key: "National ID", header: "National ID" },
  { key: "Disability", header: "Disability" },
  { key: "Department", header: "Department" },
  { key: "Job Title", header: "Job Title" },
  { key: "Employment Type", header: "Employment Type" },
  { key: "Employment Status", header: "Employment Status" },
  { key: "Family Size", header: "Family Size" },
  { key: "Phone", header: "Phone" },
  { key: "Hire Date", header: "Hire Date" },
  { key: "Reporting Manager", header: "Reporting Manager" },
  { key: "Address", header: "Address" },
  { key: "City", header: "City" },
  { key: "State", header: "State" },
  { key: "Country", header: "Country" },
  { key: "Postal Code", header: "Postal Code" },
  { key: "Notes", header: "Notes" },
];
