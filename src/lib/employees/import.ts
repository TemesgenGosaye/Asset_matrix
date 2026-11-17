/**
 * Employee spreadsheet import.
 *
 * The approved employee schema is exactly eight business columns, and this
 * module is the only place that decides what a workbook may write:
 *
 *   1. `mapEmployeeHeaders` resolves the workbook's header row against those
 *      eight columns, case-insensitively and whitespace-tolerantly, and
 *      rejects ambiguous or missing headers;
 *   2. `previewEmployeeImport` validates every row without writing anything,
 *      including duplicate detection inside the workbook and against the
 *      records already in PostgreSQL;
 *   3. the commit step re-validates the approved rows and writes them inside a
 *      transaction, so a tampered preview cannot inject a row that was never
 *      shown.
 *
 * IMPORT POLICY (documented, because it is a business decision):
 *   * Only the eight canonical columns are read. Any other column in the
 *     workbook is ignored and reported as `unmappedColumns`; it is never
 *     written to the employee table.
 *   * Duplicate Emp IDs are REJECTED, never overwritten — inside the workbook
 *     and against the existing database records. An employee is only ever
 *     created by an import.
 *   * An empty cell in an optional column means "not recorded" (NULL). It is
 *     never interpreted as a confirmed "no" / "none".
 *   * A blank Job Grade is imported as "not recorded" (NULL) — never as 0. A
 *     source that spells "no grade" as 0 is read the same way, because 0 is
 *     not a grade. The register then asks the user to add the real grade.
 *   * Marital status and disability keep the source's own vocabulary. A value
 *     outside the documented marital-status vocabulary is a validation error,
 *     not a silent guess.
 */

import { MAX_REPORTED_ERRORS, normalizeRef } from "@/lib/excel-import";
import prisma from "@/lib/prisma";
import { houseCategoryForJobGrade } from "@/lib/house-queue/eligibility";
import {
  MCDA_WEIGHTS,
  maritalStatusLevel,
  disabilityLevel,
  genderLevel,
} from "@/lib/house-queue/weights";
import {
  CANONICAL_EMPLOYEE_COLUMNS,
  DISABILITY_MAX,
  EMPLOYEE_NUMBER_MAX,
  GENDER_VALUES,
  IMPORT_LOOKUP_CHUNK_SIZE,
  JOB_GRADE_MAX,
  JOB_GRADE_MIN,
  MARITAL_STATUS_VALUES,
  MAX_IMPORT_ROWS,
  SERVICE_YEARS_MAX,
  SERVICE_YEARS_MIN,
  REQUIRED_CANONICAL_EMPLOYEE_COLUMNS,
  hasDisabilityRecord,
  type CanonicalEmployeeColumn,
} from "./constants";
import type { EmployeeRowRecommendation } from "./types";

/** A canonical employee column, identified by its physical column name. */
export type EmployeeImportColumn = CanonicalEmployeeColumn;

/** All eight canonical columns, in presentation order. */
export const EMPLOYEE_IMPORT_COLUMNS = CANONICAL_EMPLOYEE_COLUMNS;

/**
 * Header spellings accepted for each canonical column.
 *
 * Matching is case-insensitive and tolerates whitespace and punctuation
 * differences, so "Emp ID", "emp_id", "EMP  ID" and "EmpId" all resolve to the
 * same column. The first entry of each list is the header the import template
 * uses.
 */
export const EMPLOYEE_IMPORT_HEADER_ALIASES: Record<
  EmployeeImportColumn,
  readonly string[]
> = {
  employeeNumber: [
    "Emp ID",
    "EmpId",
    "Employee ID",
    "Employee Number",
    "Staff ID",
    "Personnel ID",
    "ID",
  ],
  firstname: ["First Name", "Firstname", "Given Name", "FName"],
  lastname: ["Last Name", "Lastname", "Surname", "Family Name", "LName"],
  gender: ["Gender", "Sex"],
  jobGrade: ["Job Grade", "JobGrade", "Grade", "Salary Grade", "Level"],
  serviceYears: [
    "Service Years",
    "ServiceYears",
    "Years of Service",
    "Years Served",
    "Service",
    "Svc Years",
  ],
  maritalStatus: ["Marital Status", "MaritalStatus", "Marital"],
  disabilityStatus: [
    "Disability",
    "Disability Status",
    "DisabilityStatus",
    "Disabled",
  ],
  score: [
    "Score",
    "MCDA Score",
    "Priority Score",
    "Priority",
    "MCDA",
    "House Score",
    "Queue Score",
  ],
};

/** Why a row was rejected. */
export type EmployeeRowErrorCode =
  | "MISSING_EMPLOYEE_NUMBER"
  | "INVALID_EMPLOYEE_NUMBER"
  | "MISSING_NAME"
  | "INVALID_GENDER"
  | "INVALID_MARITAL_STATUS"
  | "INVALID_JOB_GRADE"
  | "INVALID_SERVICE_YEARS"
  | "INVALID_DISABILITY"
  | "DUPLICATE_IN_FILE"
  | "DUPLICATE_EXISTING";

export interface EmployeeRowError {
  code: EmployeeRowErrorCode;
  /** The canonical column the error belongs to. */
  column: string;
  message: string;
}

export interface EmployeeRowPlan {
  /** 1-based spreadsheet row number, for display. */
  rowNumber: number;
  employeeNumber: string;
  fullName: string;
  /** The canonical values that would be written for this row. */
  values: Record<string, unknown>;
  errors: EmployeeRowError[];
  /** MCDA or file score in [0, 1] */
  score?: number | null;
  /** Smart next references recommendation (House Request, House Queue, MCDA) */
  recommendation?: EmployeeRowRecommendation;
  /** True when this row was ignored because Emp ID was empty */
  isIgnored?: boolean;
}

/**
 * Calculate an estimated MCDA score in [0, 1] based on weighted policy criteria:
 * - Service years: 40%
 * - Marital status: 25%
 * - Disability: 20%
 * - Gender: 15%
 */
export function calculateProjectedScore(values: {
  serviceYears?: number | null;
  maritalStatus?: string | null;
  disabilityStatus?: string | null;
  gender?: string | null;
}): number {
  const svNorm = Math.min(1, Math.max(0, (values.serviceYears ?? 0) / 30));
  const msNorm = maritalStatusLevel(values.maritalStatus) / 3;
  const dsNorm = disabilityLevel(values.disabilityStatus);
  const gnNorm = values.gender ? genderLevel(values.gender) : 0;

  const composite =
    svNorm * MCDA_WEIGHTS.serviceYears +
    msNorm * MCDA_WEIGHTS.maritalStatus +
    dsNorm * MCDA_WEIGHTS.disability +
    gnNorm * MCDA_WEIGHTS.gender;

  return Math.round(composite * 100) / 100;
}

/**
 * Generate intelligent recommendations for next references (House Request, House Queue, MCDA).
 */
export function generateRowRecommendation(values: {
  employeeNumber: string;
  firstname?: string | null;
  lastname?: string | null;
  jobGrade?: number | null;
  serviceYears?: number | null;
  maritalStatus?: string | null;
  disabilityStatus?: string | null;
  gender?: string | null;
}): EmployeeRowRecommendation {
  const tips: string[] = [];
  const band = houseCategoryForJobGrade(values.jobGrade);
  const houseQueueEligible = band !== null;

  // 1. House Queue Category Recommendation
  if (band) {
    tips.push(
      `House Queue: Eligible for House Category ${band} (Job Grade ${values.jobGrade}).`,
    );
  } else {
    tips.push(
      "House Queue: Missing or 0 Job Grade — not eligible for queue band allocation until grade (1–50) is set.",
    );
  }

  // 2. House Request Guidance
  const hasName =
    Boolean(
      values.firstname &&
      values.firstname.trim() !== "" &&
      values.firstname !== "-",
    ) &&
    Boolean(
      values.lastname &&
      values.lastname.trim() !== "" &&
      values.lastname !== "-",
    );
  if (!hasName) {
    tips.push(
      "House Request: Incomplete name — complete employee profile before filing a House Request.",
    );
  } else {
    tips.push(
      "House Request: Ready for house application & dossier verification.",
    );
  }

  // 3. MCDA Score Recommendations
  if (values.serviceYears === null || values.serviceYears === undefined) {
    tips.push(
      "MCDA Tenure: Service Years not recorded (defaults to 0 score in queue ranking).",
    );
  }
  if (!values.maritalStatus) {
    tips.push(
      "MCDA Household: Marital Status not recorded (defaults to single/base priority).",
    );
  }
  if (hasDisabilityRecord(values.disabilityStatus)) {
    tips.push(
      "MCDA Accessibility: Disability priority applied (+20% queue weighting).",
    );
  }

  const projectedScore = calculateProjectedScore(values);

  return {
    houseQueueBand: band,
    houseQueueEligible,
    projectedScore,
    tips,
  };
}

// ---------------------------------------------------------------------------
// Header mapping
// ---------------------------------------------------------------------------

/** Lower-cased, whitespace-collapsed header key. */
function headerKey(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Header key with every non-alphanumeric character removed. */
function compactHeaderKey(raw: string): string {
  return headerKey(raw).replace(/[^a-z0-9]/g, "");
}

/** True when a header matches an alias, ignoring case, spacing and punctuation. */
function headerMatchesAlias(header: string, alias: string): boolean {
  const h = headerKey(header);
  const a = headerKey(alias);
  if (h === a) return true;
  const hc = compactHeaderKey(header);
  const ac = compactHeaderKey(alias);
  return hc.length > 0 && hc === ac;
}

export interface EmployeeHeaderMapping {
  /** Canonical column -> zero-based index of the worksheet column. */
  mapping: Record<string, number>;
  /** Header names that map to no canonical column. */
  unmapped: string[];
  /** Required canonical columns the workbook does not provide. */
  missing: string[];
  /**
   * Headers that could not be resolved to exactly one canonical column, or
   * that more than one header claimed. The file is rejected when this is not
   * empty.
   */
  ambiguous: { header: string; reason: string }[];
}

/**
 * Resolve a header row against the eight canonical columns.
 *
 * A header that matches two canonical columns is ambiguous. Two headers that
 * claim the same canonical column are ambiguous too (usually a duplicated
 * column). Neither is guessed: the caller rejects the file and tells the user
 * exactly which header is the problem.
 */
export function mapEmployeeHeaders(headers: string[]): EmployeeHeaderMapping {
  const mapping: Record<string, number> = {};
  const unmapped: string[] = [];
  const ambiguous: { header: string; reason: string }[] = [];
  /** column -> the header names that claimed it. */
  const claimants = new Map<string, string[]>();

  headers.forEach((header, index) => {
    const label = String(header ?? "").trim();
    if (label.length === 0) return;

    const matches = EMPLOYEE_IMPORT_COLUMNS.filter((column) =>
      EMPLOYEE_IMPORT_HEADER_ALIASES[column].some((alias) =>
        headerMatchesAlias(label, alias),
      ),
    );

    if (matches.length === 0) {
      unmapped.push(label);
      return;
    }
    if (matches.length > 1) {
      ambiguous.push({
        header: label,
        reason: `"${label}" matches more than one employee column (${matches.join(", ")}). Rename it so it identifies exactly one column.`,
      });
      return;
    }

    const column = matches[0];
    const existing = claimants.get(column) ?? [];
    existing.push(label);
    claimants.set(column, existing);
  });

  for (const [column, labels] of claimants) {
    if (labels.length > 1) {
      ambiguous.push({
        header: labels.join(", "),
        reason: `The employee column "${column}" is provided by more than one header (${labels.join(", ")}). Keep exactly one of them.`,
      });
      continue;
    }
    const index = headers.findIndex((h) =>
      headerMatchesAlias(String(h ?? "").trim(), labels[0]),
    );
    if (index >= 0) mapping[column] = index;
  }

  const missing = REQUIRED_CANONICAL_EMPLOYEE_COLUMNS.filter(
    (column) => mapping[column] === undefined,
  );

  return { mapping, unmapped, missing, ambiguous };
}

// ---------------------------------------------------------------------------
// Value parsing
// ---------------------------------------------------------------------------

/** Coerce a cell to trimmed text. */
function cellText(row: EmployeeSpreadsheetRow, key: string): string {
  return (row[key] ?? "").trim();
}

/**
 * Parse a bounded integer cell.
 *
 * An empty cell means "not recorded" and yields `null` — it is never read as
 * zero, because zero is a real value for Service Years.
 */
function parseBoundedInt(
  raw: string,
  min: number,
  max: number,
  label: string,
): { value: number | null } | { error: string } {
  if (raw === "") return { value: null };
  if (!/^\d+$/.test(raw)) {
    return { error: `${label} must be a whole number.` };
  }
  const n = Number(raw);
  if (!Number.isInteger(n)) {
    return { error: `${label} must be a whole number.` };
  }
  if (n < min || n > max) {
    return { error: `${label} must be between ${min} and ${max}.` };
  }
  return { value: n };
}

/**
 * Parse a Job Grade cell.
 *
 * An EMPTY cell is "not recorded": the grade stays NULL. It is never stored as
 * 0, because 0 is not a grade — it is the value the House Queue treats as
 * "not eligible", and writing it would look like a real grade on the register
 * and in the export.
 *
 * A source that spells "no grade" as 0 is read the same way: 0 is not a valid
 * grade (the valid range is 1–50), so it means the same thing as a blank cell
 * and is accepted as "not recorded" rather than rejected. The register then
 * asks the user to add the employee's real grade.
 */
function parseJobGrade(
  raw: string,
): { value: number | null } | { error: string } {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "0") return { value: null };
  return parseBoundedInt(trimmed, JOB_GRADE_MIN, JOB_GRADE_MAX, "Job Grade");
}

/**
 * Normalise a gender cell.
 *
 * The database stores gender in the `Gender` enum (male | female), which is
 * the documented, source-compatible validation policy. "M" / "F" are accepted
 * as the obvious abbreviations; anything else is rejected rather than guessed.
 */
function parseGender(
  raw: string,
): { value: string } | { error: string } | null {
  if (raw === "") return null;
  const key = headerKey(raw);
  if ((GENDER_VALUES as readonly string[]).includes(key)) {
    return { value: key };
  }
  if (key === "m") return { value: "male" };
  if (key === "f") return { value: "female" };
  return {
    error: `Gender "${raw}" is not recognised. Use ${GENDER_VALUES.join(" or ")}.`,
  };
}

/**
 * Normalise a marital-status cell.
 *
 * The vocabulary is exactly the four states the House Queue policy scores. A
 * value outside it is rejected: the source's own wording is preserved, but a
 * status the business does not define is not invented into one.
 */
function parseMaritalStatus(
  raw: string,
): { value: string } | { error: string } | null {
  if (raw === "") return null;
  const key = headerKey(raw);
  if ((MARITAL_STATUS_VALUES as readonly string[]).includes(key)) {
    return { value: key };
  }
  if (key === "unmarried") return { value: "single" };
  return {
    error: `Marital status "${raw}" is not recognised. Use ${MARITAL_STATUS_VALUES.join(", ")}.`,
  };
}

/**
 * A disability cell is stored exactly as the source stated it.
 *
 * Only the length is constrained. The vocabulary belongs to the source file,
 * so it is preserved verbatim rather than mapped onto a yes/no flag.
 */
function parseDisability(
  raw: string,
): { value: string | null } | { error: string } {
  if (raw === "") return { value: null };
  if (raw.length > DISABILITY_MAX) {
    return {
      error: `Disability must be ${DISABILITY_MAX} characters or fewer.`,
    };
  }
  return { value: raw };
}

/** A spreadsheet row keyed by canonical column name. */
export type EmployeeSpreadsheetRow = Record<string, string>;

// ---------------------------------------------------------------------------
// Row extraction
// ---------------------------------------------------------------------------

export interface EmployeeSheetRows {
  rows: EmployeeSpreadsheetRow[];
  /** 1-based worksheet row number for each extracted row. */
  rowNumbers: number[];
  mapping: Record<string, number>;
}

/**
 * Convert a workbook sheet into canonical row objects.
 *
 * `headerRowIndex` is the zero-based index of the header row inside `matrix`;
 * data starts on the next row. Fully empty rows are skipped (they are
 * formatting, not employees).
 *
 * `displayRows` is the DISPLAYED text of each cell. When supplied it is used
 * for the Emp ID column so a text-formatted cell keeps its leading zeros.
 */
export function rowsFromSheet(
  headers: string[],
  matrix: string[][],
  headerRowIndex = 0,
  displayRows?: string[][],
): EmployeeSheetRows {
  const { mapping } = mapEmployeeHeaders(headers);
  const rows: EmployeeSpreadsheetRow[] = [];
  const rowNumbers: number[] = [];

  for (let i = headerRowIndex + 1; i < matrix.length; i++) {
    const line = matrix[i];
    if (!line || line.every((cell) => (cell ?? "").trim() === "")) continue;

    const row: EmployeeSpreadsheetRow = {};
    for (const [field, index] of Object.entries(mapping)) {
      if (field === "employeeNumber") {
        const display = displayRows?.[i]?.[index];
        row[field] = (display ?? line[index] ?? "").trim();
      } else {
        row[field] = (line[index] ?? "").trim();
      }
    }
    rows.push(row);
    rowNumbers.push(i + 1);
  }

  return { rows, rowNumbers, mapping };
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

function parseScore(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const num = Number(trimmed);
  if (isNaN(num)) return null;
  if (num > 1 && num <= 100) return Math.round((num / 100) * 100) / 100;
  if (num >= 0 && num <= 1) return Math.round(num * 100) / 100;
  return null;
}

export interface EmployeeImportPreview {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  ignoredRows: number;
  rows: EmployeeRowPlan[];
  /** Human-readable notes about the run as a whole. */
  notes: string[];
}

/**
 * Look up the Emp IDs that already exist in the organization.
 *
 * Comparison is case-insensitive because the House Request module already
 * resolves employees by `employeeNumber` with `mode: "insensitive"`, so
 * "EMP001" and "emp001" are the same person everywhere in the product.
 *
 * The lookup is chunked: a 4,000-row import asks about thousands of Emp IDs,
 * and one `IN` list that long is both a heavy statement and a long bind list.
 */
export async function findExistingEmployeeNumbers(
  organizationId: string,
  employeeNumbers: string[],
): Promise<Set<string>> {
  const wanted = new Set<string>();
  for (const raw of employeeNumbers) {
    const value = raw.trim();
    if (value.length === 0) continue;
    wanted.add(value.toLowerCase());
  }
  if (wanted.size === 0) return new Set();

  const found = new Set<string>();
  const values = [...wanted];

  for (
    let offset = 0;
    offset < values.length;
    offset += IMPORT_LOOKUP_CHUNK_SIZE
  ) {
    const slice = values.slice(offset, offset + IMPORT_LOOKUP_CHUNK_SIZE);
    const rows = await prisma.employee.findMany({
      where: {
        organizationId,
        // The unique index is exact-match, so the comparison is made
        // case-insensitively here: "EMP001" and "emp001" are the same person
        // everywhere else in the product, including here.
        employeeNumber: { in: slice, mode: "insensitive" },
      },
      select: { employeeNumber: true },
    });
    for (const row of rows) found.add(row.employeeNumber.toLowerCase());
  }

  return found;
}

/**
 * Validate a batch of spreadsheet rows and build an import plan.
 *
 * Does not write to the database.
 */
export async function previewEmployeeImport(params: {
  organizationId: string;
  rows: EmployeeSpreadsheetRow[];
  /** 1-based worksheet row numbers, parallel to `rows`. */
  rowNumbers?: number[];
}): Promise<EmployeeImportPreview> {
  const { organizationId, rows, rowNumbers } = params;

  const capped = rows.slice(0, MAX_IMPORT_ROWS);
  const notes: string[] = [];

  if (rows.length > MAX_IMPORT_ROWS) {
    notes.push(
      `Only the first ${MAX_IMPORT_ROWS.toLocaleString()} rows were read; ` +
        `${(rows.length - MAX_IMPORT_ROWS).toLocaleString()} were ignored.`,
    );
  }

  const seenInFile = new Set<string>();
  const existingNumbers = await findExistingEmployeeNumbers(
    organizationId,
    capped.map((row) => row.employeeNumber ?? ""),
  );

  const plans: EmployeeRowPlan[] = [];
  let validRows = 0;
  let invalidRows = 0;
  let duplicateRows = 0;
  let ignoredRows = 0;

  capped.forEach((row, i) => {
    const rowNumber = rowNumbers?.[i] ?? i + 2;
    const errors: EmployeeRowError[] = [];
    const values: Record<string, unknown> = {};

    const employeeNumber = cellText(row, "employeeNumber");
    const firstname = cellText(row, "firstname");
    const lastname = cellText(row, "lastname");

    // Gracefully handle empty Emp ID rows: ignore them as requested
    if (!employeeNumber) {
      ignoredRows++;
      plans.push({
        rowNumber,
        employeeNumber: "",
        fullName: "—",
        values: {},
        errors: [],
        score: null,
        isIgnored: true,
        recommendation: {
          houseQueueBand: null,
          houseQueueEligible: false,
          projectedScore: 0,
          tips: ["Ignored row: Empty Emp ID row skipped during import."],
        },
      });
      return;
    }

    if (employeeNumber.length > EMPLOYEE_NUMBER_MAX) {
      errors.push({
        code: "INVALID_EMPLOYEE_NUMBER",
        column: "employeeNumber",
        message: `Emp ID is longer than ${EMPLOYEE_NUMBER_MAX} characters.`,
      });
    }

    // Accept other 7 columns even if empty: default missing names to "-"
    const resolvedFirstname = firstname || "-";
    const resolvedLastname = lastname || "-";
    values.firstname = resolvedFirstname;
    values.lastname = resolvedLastname;

    // Duplicate detection inside the workbook itself.
    const key = normalizeRef(employeeNumber);
    if (seenInFile.has(key)) {
      errors.push({
        code: "DUPLICATE_IN_FILE",
        column: "employeeNumber",
        message: `Emp ID "${employeeNumber}" appears more than once in this file.`,
      });
    }
    seenInFile.add(key);

    // Duplicate detection against the records already in PostgreSQL.
    if (existingNumbers.has(employeeNumber.toLowerCase())) {
      errors.push({
        code: "DUPLICATE_EXISTING",
        column: "employeeNumber",
        message: `Emp ID "${employeeNumber}" already exists in the register. Existing records are never overwritten by an import.`,
      });
    }

    const gender = parseGender(cellText(row, "gender"));
    if (gender && "error" in gender) {
      errors.push({
        code: "INVALID_GENDER",
        column: "gender",
        message: gender.error,
      });
    } else if (gender && "value" in gender) {
      values.gender = gender.value;
    }

    const maritalStatus = parseMaritalStatus(cellText(row, "maritalStatus"));
    if (maritalStatus && "error" in maritalStatus) {
      errors.push({
        code: "INVALID_MARITAL_STATUS",
        column: "maritalStatus",
        message: maritalStatus.error,
      });
    } else if (maritalStatus && "value" in maritalStatus) {
      values.maritalStatus = maritalStatus.value;
    }

    const jobGrade = parseJobGrade(cellText(row, "jobGrade"));
    if ("error" in jobGrade) {
      errors.push({
        code: "INVALID_JOB_GRADE",
        column: "jobGrade",
        message: jobGrade.error,
      });
    } else if (jobGrade.value !== null) {
      values.jobGrade = jobGrade.value;
    }

    const serviceYears = parseBoundedInt(
      cellText(row, "serviceYears"),
      SERVICE_YEARS_MIN,
      SERVICE_YEARS_MAX,
      "Service Years",
    );
    if ("error" in serviceYears) {
      errors.push({
        code: "INVALID_SERVICE_YEARS",
        column: "serviceYears",
        message: serviceYears.error,
      });
    } else if (serviceYears.value !== null) {
      values.serviceYears = serviceYears.value;
    }

    const disability = parseDisability(cellText(row, "disabilityStatus"));
    if ("error" in disability) {
      errors.push({
        code: "INVALID_DISABILITY",
        column: "disabilityStatus",
        message: disability.error,
      });
    } else if (disability.value !== null) {
      values.disabilityStatus = disability.value;
    }

    // Score column: parse if present in file or calculate projected MCDA score
    const parsedScore = parseScore(cellText(row, "score"));
    const recommendation = generateRowRecommendation({
      employeeNumber,
      firstname: firstname || null,
      lastname: lastname || null,
      jobGrade: values.jobGrade as number | null | undefined,
      serviceYears: values.serviceYears as number | null | undefined,
      maritalStatus: values.maritalStatus as string | null | undefined,
      disabilityStatus: values.disabilityStatus as string | null | undefined,
      gender: values.gender as string | null | undefined,
    });

    const finalScore =
      parsedScore !== null ? parsedScore : recommendation.projectedScore;
    values.score = finalScore;

    const plan: EmployeeRowPlan = {
      rowNumber,
      employeeNumber,
      fullName: firstname || lastname ? `${firstname} ${lastname}`.trim() : "—",
      values: {
        ...values,
        employeeNumber,
      },
      errors: errors.slice(0, MAX_REPORTED_ERRORS),
      score: finalScore,
      recommendation,
      isIgnored: false,
    };

    if (errors.length === 0) validRows++;
    else invalidRows++;
    if (
      plan.errors.some(
        (error) =>
          error.code === "DUPLICATE_IN_FILE" ||
          error.code === "DUPLICATE_EXISTING",
      )
    ) {
      duplicateRows++;
    }
    plans.push(plan);
  });

  if (ignoredRows > 0) {
    notes.push(
      `Ignored ${ignoredRows.toLocaleString()} row(s) with empty Emp ID.`,
    );
  }

  return {
    totalRows: plans.length,
    validRows,
    invalidRows,
    duplicateRows,
    ignoredRows,
    rows: plans,
    notes,
  };
}
