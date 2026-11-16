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

/**
 * One row of the employee register, as delivered by the API.
 *
 * The eight canonical business columns come first, in the approved order:
 * Emp ID, First Name, Last Name, Gender, Job Grade, Service Years, Marital
 * Status, Disability. The remaining fields are the retained relational and
 * domain fields other modules depend on, plus technical metadata.
 */
export interface EmployeeDto {
  id: string;
  /** Canonical `emp_id`. Stored as text so leading zeros survive. */
  employeeNumber: string;
  firstname: string;
  lastname: string;
  gender: "male" | "female" | null;
  jobGrade: number | null;
  /** Service years: whole-number count of years the employee has served. */
  serviceYears: number | null;
  /** Free text from the source, normalised to the known vocabulary. */
  maritalStatus: string | null;
  /** Free text from the source. `null` means "not recorded". */
  disabilityStatus: string | null;
  /**
   * MCDA priority score in [0, 1], set for an employee whose record states a
   * disability. `null` for every other employee.
   */
  mcdaScore: number | null;
  /** 1-based position of the employee inside their house-band cohort. */
  mcdaRank: number | null;
  /** How many employees compete in the same band. */
  mcdaCohortSize: number | null;
  /** Unmasked when the caller has the sensitive permission, otherwise masked. */
  nationalId: string;
  /** True when `nationalId` was masked by the server. */
  nationalIdMasked: boolean;
  jobTitle: string | null;
  employmentType: EmploymentType;
  employmentStatus: EmploymentStatus;
  familySize: number | null;
  hireDate: string | null;
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
  gender: string;
  jobGrade: string;
  serviceYears: string;
  maritalStatus: string;
  disabilityStatus: string;
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface EmployeeImportRowError {
  code: string;
  /** Canonical column the error belongs to, when it is column-specific. */
  column?: string;
  message: string;
}

export interface EmployeeRowRecommendation {
  houseQueueBand: string | null;
  houseQueueEligible: boolean;
  projectedScore: number;
  tips: string[];
}

export interface EmployeeImportRowPlan {
  rowNumber: number;
  employeeNumber: string;
  fullName: string;
  /** The canonical values that would be written for this row. */
  values: Record<string, unknown>;
  errors: EmployeeImportRowError[];
  /** MCDA or file score in [0, 1] */
  score?: number | null;
  /** Smart next references recommendation (House Request, House Queue, MCDA) */
  recommendation?: EmployeeRowRecommendation;
  /** True when this row was ignored because Emp ID was empty */
  isIgnored?: boolean;
}

export interface EmployeeImportPreviewResponse {
  fileName: string;
  sheetName: string;
  /** Canonical columns the workbook provided, in canonical order. */
  recognisedColumns: string[];
  /** Header names in the workbook that map to no canonical column. */
  unmappedColumns: string[];
  /** Required canonical columns the workbook did not provide. */
  missingColumns: string[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  /** Rows rejected because their Emp ID already exists (in the file or in the DB). */
  duplicateRows: number;
  /** Rows ignored because their Emp ID was empty */
  ignoredRows: number;
  rows: EmployeeImportRowPlan[];
  notes: string[];
  sample: EmployeeImportRowPlan[];
}

/** Result of a committed import. */
export interface EmployeeImportResult {
  jobId: string;
  imported: number;
  /** Rows that were not attempted because the user excluded invalid rows. */
  skipped: number;
  /** Rows rejected because their Emp ID already exists. */
  duplicates: number;
  failed: BulkFailure[];
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
  /** `recorded` | `none` | `all`. */
  disability: string;
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
  disability: ALL,
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
  "disability",
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
  if (query.disability !== ALL) {
    params.set("disability", query.disability);
  }
  if (query.onlyDeleted) params.set("onlyDeleted", "true");
  return params;
}
