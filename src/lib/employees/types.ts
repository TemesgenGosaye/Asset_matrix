/**
 * Client-safe employee types.
 *
 * Kept separate from `queries.ts` so browser components can import these
 * without pulling the Prisma client into the client bundle.
 */

import type { EmploymentStatus, EmploymentType } from "./constants";
import type { EmployeeSortField } from "./schemas";

export type { EmployeeSortField };

export interface EmployeeDepartmentRef {
  id: string;
  name: string;
  code: string | null;
}

export interface EmployeeManagerRef {
  id: string;
  firstname: string;
  lastname: string;
}

export interface EmployeeUserRef {
  userid: string;
  firstname: string;
  lastname: string;
  email: string | null;
}

/** One row of the employee register, as delivered by the API. */
export interface EmployeeDto {
  id: string;
  employeeNumber: string;
  firstname: string;
  lastname: string;
  phone: string | null;
  dateOfBirth: string | null;
  gender: "male" | "female" | null;
  /** Unmasked when the caller has the sensitive permission, otherwise masked. */
  nationalId: string;
  /** True when `nationalId` was masked by the server. */
  nationalIdMasked: boolean;
  jobGrade: number | null;
  maritalStatus: "single" | "married" | null;
  disabilityStatus: boolean;
  jobTitle: string | null;
  employmentType: EmploymentType;
  employmentStatus: EmploymentStatus;
  familySize: number | null;
  hireDate: string | null;
  terminationDate: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  notes: string | null;
  departmentId: string | null;
  managerId: string | null;
  userid: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  department: EmployeeDepartmentRef | null;
  manager: EmployeeManagerRef | null;
  user: EmployeeUserRef | null;
  /** Display-only serial number computed by the server from the page position. */
  srNo: number;
}

/** Envelope returned by `GET /api/employees`. */
export interface EmployeeListResponse {
  data: EmployeeDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** False when National IDs in this payload are masked. */
  unmaskedNationalIds: boolean;
}

export interface EmployeeReferenceOption {
  id: string;
  name: string;
  code?: string | null;
}

export interface EmployeeManagerOption {
  id: string;
  name: string;
  employeeNumber: string;
}

export interface EmployeeUserOption {
  userid: string;
  name: string;
  email: string | null;
}

export interface EmployeeOptionsResponse {
  departments: EmployeeReferenceOption[];
  managers: EmployeeManagerOption[];
  users: EmployeeUserOption[];
}

export interface EmployeeCounts {
  total: number;
  active: number;
  onLeave: number;
  terminated: number;
  retired: number;
  disabled: number;
  unassigned: number;
  archived: number;
}

/** A row of the form, used by the create/edit form. */
export interface EmployeeFormValues {
  id?: string;
  employeeNumber: string;
  firstname: string;
  lastname: string;
  phone: string;
  dateOfBirth: string;
  gender: string;
  nationalId: string;
  maritalStatus: string;
  disabilityStatus: boolean;
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  jobTitle: string;
  employmentType: string;
  employmentStatus: string;
  jobGrade: string;
  familySize: string;
  hireDate: string;
  terminationDate: string;
  departmentId: string;
  managerId: string;
  userid: string;
  notes: string;
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface EmployeeImportRowError {
  code: string;
  message: string;
}

export interface EmployeeImportRowPlan {
  rowNumber: number;
  employeeNumber: string;
  fullName: string;
  /** Resolved department name, for display in the preview. Not a create field. */
  departmentName?: string;
  values: Record<string, unknown>;
  errors: EmployeeImportRowError[];
}

export interface EmployeeImportPreviewResponse {
  fileName: string;
  sheetName: string;
  recognisedColumns: string[];
  unmappedColumns: string[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  rows: EmployeeImportRowPlan[];
  notes: string[];
  knownDepartments: string[];
  sample: EmployeeImportRowPlan[];
}

export interface BulkFailure {
  index: number;
  employeeNumber?: string;
  message: string;
  code: string;
}

export interface BulkResponse {
  error?: string;
  operation?: string;
  succeeded?: number;
  imported?: number;
  failed: BulkFailure[];
}

// ---------------------------------------------------------------------------
// Query-string helpers
// ---------------------------------------------------------------------------

export const ALL = "all";

export interface EmployeeQueryState {
  page: number;
  pageSize: number;
  search: string;
  sortBy: EmployeeSortField;
  sortOrder: "asc" | "desc";
  departmentId: string;
  gender: string;
  maritalStatus: string;
  disabilityStatus: string;
  jobGradeFrom: string;
  jobGradeTo: string;
  onlyDeleted: boolean;
}

export const DEFAULT_EMPLOYEE_QUERY: EmployeeQueryState = {
  page: 1,
  pageSize: 25,
  search: "",
  sortBy: "lastname",
  sortOrder: "asc",
  departmentId: ALL,
  gender: ALL,
  maritalStatus: ALL,
  disabilityStatus: ALL,
  jobGradeFrom: "",
  jobGradeTo: "",
  onlyDeleted: false,
};

/** Fields that a changed filter must reset the page number for. */
export const FILTER_FIELDS = [
  "search",
  "departmentId",
  "gender",
  "maritalStatus",
  "disabilityStatus",
  "jobGradeFrom",
  "jobGradeTo",
  "onlyDeleted",
  "pageSize",
] as const satisfies readonly (keyof EmployeeQueryState)[];

/** Serialise query state into the API's search string. */
export function toSearchParams(query: EmployeeQueryState): URLSearchParams {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  if (query.search.trim()) params.set("search", query.search.trim());
  if (query.sortBy) params.set("sortBy", query.sortBy);
  params.set("sortOrder", query.sortOrder);
  if (query.departmentId !== ALL)
    params.set("departmentId", query.departmentId);
  if (query.jobGradeFrom.trim()) {
    params.set("jobGradeFrom", query.jobGradeFrom.trim());
  }
  if (query.jobGradeTo.trim()) {
    params.set("jobGradeTo", query.jobGradeTo.trim());
  }
  if (query.gender !== ALL) params.set("gender", query.gender);
  if (query.maritalStatus !== ALL)
    params.set("maritalStatus", query.maritalStatus);
  if (query.disabilityStatus !== ALL) {
    params.set("disabilityStatus", query.disabilityStatus);
  }
  if (query.onlyDeleted) params.set("onlyDeleted", "true");
  return params;
}
