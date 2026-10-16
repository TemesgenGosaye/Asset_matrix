/**
 * Employee spreadsheet import.
 *
 * The flow is deliberately two-phase:
 *   1. `previewEmployeeImport` parses the workbook, resolves references and
 *      validates every row without writing anything;
 *   2. `commitEmployeeImport` re-validates and writes the good rows.
 *
 * Between the two phases the file is not trusted â€” `commitEmployeeImport` always
 * re-reads the stored plan from the client's payload and re-validates it, so a
 * tampered preview cannot inject rows. Department and manager references are
 * always resolved server-side against the caller's organization; a value that
 * does not resolve is reported, never guessed.
 */

import {
  MAX_REPORTED_ERRORS,
  cellToText,
  parseBool,
  parseFlexibleDate,
} from "@/lib/excel-import";
import prisma from "@/lib/prisma";
import { normalizeRef } from "@/lib/excel-import";
import {
  EMPLOYMENT_STATUSES,
  EMPLOYMENT_TYPES,
  GENDER_LABELS,
  MARITAL_STATUS_LABELS,
  MAX_IMPORT_ROWS,
  NATIONAL_ID_MAX,
} from "./constants";
import { createEmployeeSchema, type CreateEmployeeInput } from "./schemas";

/** A single spreadsheet row keyed by the template's human-readable header. */
export type EmployeeSpreadsheetRow = Record<string, string>;

/** Why a row was rejected. */
export type EmployeeRowErrorCode =
  | "MISSING_EMPLOYEE_NUMBER"
  | "INVALID_EMPLOYEE_NUMBER"
  | "MISSING_NAME"
  | "INVALID_GENDER"
  | "INVALID_MARITAL_STATUS"
  | "INVALID_EMPLOYMENT_TYPE"
  | "INVALID_EMPLOYMENT_STATUS"
  | "INVALID_JOB_GRADE"
  | "INVALID_FAMILY_SIZE"
  | "INVALID_DATE"
  | "INVALID_NATIONAL_ID"
  | "INVALID_DISABILITY"
  | "UNKNOWN_DEPARTMENT"
  | "AMBIGUOUS_DEPARTMENT"
  | "UNKNOWN_MANAGER"
  | "DUPLICATE_IN_FILE";

/**
 * Marker stored in a lookup when a spreadsheet value matches more than one
 * candidate. A colliding reference is reported rather than resolved, so the
 * import can never silently pick the wrong department or manager.
 */
export const AMBIGUOUS_REFERENCE = "__ambiguous__";

/**
 * Build a reference lookup that detects ambiguity.
 *
 * Unlike the shared `buildReferenceLookup` (which keeps the first match), a key
 * seen twice is recorded as {@link AMBIGUOUS_REFERENCE} and no longer resolves
 * to an id.
 */
export function buildStrictReferenceLookup(
  records: { id: string; name: string; code?: string | null }[],
): Map<string, string> {
  const map = new Map<string, string>();
  const add = (key: string, id: string) => {
    if (!key) return;
    const existing = map.get(key);
    if (existing === undefined) map.set(key, id);
    else if (existing !== id) map.set(key, AMBIGUOUS_REFERENCE);
  };

  for (const r of records) {
    add(normalizeRef(r.name), r.id);
    if (r.code) add(normalizeRef(r.code), r.id);
  }
  return map;
}

export interface EmployeeRowError {
  code: EmployeeRowErrorCode;
  message: string;
}

export interface EmployeeRowPlan {
  /** 1-based spreadsheet row number, for display. */
  rowNumber: number;
  employeeNumber: string;
  fullName: string;
  /**
   * The department's name, resolved alongside its id.
   *
   * `values.departmentId` is a UUID, which tells an HR user reviewing the
   * preview nothing about whether their department resolved to the record they
   * meant. The name is display-only and is not part of `values`.
   */
  departmentName?: string;
  values: Partial<CreateEmployeeInput>;
  errors: EmployeeRowError[];
}

export interface EmployeeImportPreview {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  rows: EmployeeRowPlan[];
  /** Human-readable notes about the run as a whole. */
  notes: string[];
  /** Department names in this organization, offered as autocomplete values. */
  knownDepartments: string[];
}

/** Header aliases so an HR-authored file need not match the template exactly. */
const HEADER_ALIASES: Record<string, string[]> = {
  employeeNumber: [
    "empid",
    "empid",
    "employeeid",
    "employeeno",
    "employeenumber",
    "id",
  ],
  firstname: ["firstname", "first name", "given name", "fname"],
  lastname: ["lastname", "last name", "surname", "family name", "lname"],
  phone: ["phone", "phone number", "mobile", "telephone", "tel"],
  gender: ["gender", "sex"],
  nationalId: [
    "nationalid",
    "national id",
    "national identity",
    "idnumber",
    "fayda",
  ],
  maritalStatus: ["maritalstatus", "marital status", "marital"],
  disabilityStatus: [
    "disability",
    "disabilitystatus",
    "disability status",
    "disabled",
  ],
  jobGrade: ["jobgrade", "job grade", "grade"],
  department: ["department", "dept", "department name", "division"],
  jobTitle: ["jobtitle", "job title", "title", "position", "role"],
  employmentType: ["employmenttype", "employment type", "type"],
  employmentStatus: ["employmentstatus", "employment status", "status"],
  familySize: ["familysize", "family size", "family"],
  dateOfBirth: ["dateofbirth", "date of birth", "dob", "birthdate"],
  hireDate: ["hiredate", "hire date", "joining date", "start date"],
  terminationDate: [
    "terminationdate",
    "termination date",
    "exit date",
    "end date",
  ],
  managerNumber: [
    "manager",
    "managerid",
    "manager id",
    "reporting manager",
    "reports to",
  ],
  address: ["address", "street", "street address"],
  city: ["city", "town"],
  state: ["state", "region", "province"],
  country: ["country"],
  postalCode: ["postalcode", "postal code", "zip", "zipcode"],
  notes: ["notes", "note", "comment", "comments", "remarks"],
};

/** Normalise a header to its lookup key. */
function headerKey(raw: string): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Map spreadsheet headers to field ids.
 * Exact canonical name wins, then aliases, then a contains-match fallback.
 */
export function mapEmployeeHeaders(headers: string[]): Record<string, number> {
  const normalised = headers.map(headerKey);
  const mapping: Record<string, number> = {};

  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const aliasKeys = aliases.map(headerKey);

    let index = normalised.findIndex((h) => h === field);
    if (index === -1) {
      index = normalised.findIndex((h) => aliasKeys.includes(h));
    }
    if (index === -1) {
      // Last resort: a header that literally contains the field name.
      index = normalised.findIndex(
        (h) =>
          h.length > 3 &&
          (h.includes(field) || aliasKeys.some((a) => h.includes(a))),
      );
    }
    if (index !== -1) mapping[field] = index;
  }

  return mapping;
}

/** Coerce a cell to trimmed text. */
function cellText(row: EmployeeSpreadsheetRow, key: string): string {
  return (row[key] ?? "").trim();
}

/** Parse a bounded integer cell, returning an error message on failure. */
function parseBoundedInt(
  raw: string,
  min: number,
  max: number,
  label: string,
): { value: number } | { error: string } {
  if (raw === "") return { value: 0 };
  const n = Number(raw);
  if (!Number.isInteger(n))
    return { error: `${label} must be a whole number.` };
  if (n < min || n > max) {
    return { error: `${label} must be between ${min} and ${max}.` };
  }
  return { value: n };
}

/**
 * Case/space-insensitive lookup of an enum value from a spreadsheet cell.
 * Accepts the enum value, its display label, or a loose variant
 * ("Male", "M", "married", "Married").
 */
function matchEnum<T extends string>(
  raw: string,
  values: readonly T[],
  labels: Record<string, string> | undefined,
  fuzzy: Record<string, T>,
): T | null {
  if (raw === "") return null;
  const key = headerKey(raw);
  if ((values as readonly string[]).includes(key)) return key as T;
  if (labels) {
    for (const [value, label] of Object.entries(labels)) {
      if (headerKey(label) === key) return value as T;
    }
  }
  return fuzzy[key] ?? null;
}

const GENDER_FUZZY: Record<string, "male" | "female"> = {
  m: "male",
  male: "male",
  f: "female",
  female: "female",
};

const MARITAL_FUZZY: Record<string, "single" | "married"> = {
  single: "single",
  unmarried: "single",
  solo: "single",
  married: "married",
  spouse: "married",
};

/** Fuzzy aliases for employment type and status. */
const EMPLOYMENT_TYPE_FUZZY: Record<string, (typeof EMPLOYMENT_TYPES)[number]> =
  {
    fulltime: "full_time",
    permanent: "full_time",
    regular: "full_time",
    parttime: "part_time",
    contract: "contract",
    contractor: "contract",
    intern: "intern",
    internship: "intern",
    temporary: "temporary",
    temp: "temporary",
  };

const EMPLOYMENT_STATUS_FUZZY: Record<
  string,
  (typeof EMPLOYMENT_STATUSES)[number]
> = {
  active: "active",
  current: "active",
  employed: "active",
  onleave: "on_leave",
  leave: "on_leave",
  terminated: "terminated",
  resigned: "terminated",
  left: "terminated",
  ended: "terminated",
  retired: "retired",
  pension: "retired",
};

const DISABILITY_FUZZY: Record<string, boolean> = {
  yes: true,
  y: true,
  true: true,
  1: true,
  disabled: true,
  no: false,
  n: false,
  false: false,
  0: false,
  none: false,
};

/**
 * Read a date cell as `YYYY-MM-DD`, or report an error.
 *
 * `parseFlexibleDate` returns UTC midnight, so `toISOString()` reads back the
 * calendar day the user typed. The alternative — building at local midnight and
 * slicing — reads a day early east of UTC, which on UTC+3 means every hire date
 * and birthday in the file silently shifts to the day before.
 */
function parseDateCell(
  raw: string,
): { value: string } | { error: string } | null {
  if (raw === "") return null;
  const parsed = parseFlexibleDate(raw);
  if (!parsed) {
    return {
      error: `Unrecognised date "${raw}". Use YYYY-MM-DD (for example 2026-03-01).`,
    };
  }
  return { value: parsed.toISOString().slice(0, 10) };
}

/**
 * Validate a batch of spreadsheet rows and build an import plan.
 *
 * Does not write to the database. Reference resolution (department, manager)
 * happens against `lookups`, which the caller builds from the caller's own
 * organization only.
 */
export async function previewEmployeeImport(params: {
  organizationId: string;
  rows: EmployeeSpreadsheetRow[];
  /** Row numbers (1-based, including the header) from the parser. */
  rowNumbers?: number[];
}): Promise<EmployeeImportPreview> {
  const { organizationId, rows, rowNumbers } = params;

  const capped = rows.slice(0, MAX_IMPORT_ROWS);

  const [departments, managers] = await Promise.all([
    prisma.department.findMany({
      where: { organizationId },
      select: { id: true, name: true, code: true },
    }),
    prisma.employee.findMany({
      where: { organizationId, deletedAt: null },
      select: {
        id: true,
        firstname: true,
        lastname: true,
        employeeNumber: true,
      },
    }),
  ]);

  const departmentLookup = buildStrictReferenceLookup(
    departments.map((d) => ({ id: d.id, name: d.name, code: d.code })),
  );

  /** id → name, so the preview can show what a department reference resolved to. */
  const departmentNames = new Map(departments.map((d) => [d.id, d.name]));

  // Managers may be referenced by employee number, or by "First Last".
  const managerLookup = buildStrictReferenceLookup(
    managers.map((m) => ({
      id: m.id,
      name: `${m.firstname} ${m.lastname}`.trim(),
      code: m.employeeNumber,
    })),
  );

  const seenEmployeeNumbers = new Set<string>();
  const plans: EmployeeRowPlan[] = [];
  let validRows = 0;
  let invalidRows = 0;
  const notes: string[] = [];

  if (rows.length > MAX_IMPORT_ROWS) {
    notes.push(
      `Only the first ${MAX_IMPORT_ROWS.toLocaleString()} rows were read; ` +
        `${(rows.length - MAX_IMPORT_ROWS).toLocaleString()} were ignored.`,
    );
  }

  capped.forEach((row, i) => {
    const rowNumber = rowNumbers?.[i] ?? i + 2; // +2: 1-based, skip header
    const errors: EmployeeRowError[] = [];
    const values: Partial<CreateEmployeeInput> = {};

    const employeeNumber = cellText(row, "employeeNumber");
    const firstname = cellText(row, "firstname");
    const lastname = cellText(row, "lastname");

    if (!employeeNumber) {
      errors.push({
        code: "MISSING_EMPLOYEE_NUMBER",
        message: "Emp ID is required.",
      });
    } else if (employeeNumber.length > 50) {
      errors.push({
        code: "INVALID_EMPLOYEE_NUMBER",
        message: "Emp ID is longer than 50 characters.",
      });
    }

    if (!firstname || !lastname) {
      errors.push({
        code: "MISSING_NAME",
        message: "First and last name are required.",
      });
    }

    // Duplicate detection inside the file itself.
    if (employeeNumber) {
      const key = normalizeRef(employeeNumber);
      if (seenEmployeeNumbers.has(key)) {
        errors.push({
          code: "DUPLICATE_IN_FILE",
          message: `Emp ID "${employeeNumber}" appears more than once in this file.`,
        });
      }
      seenEmployeeNumbers.add(key);
    }

    // Enum columns
    const genderRaw = cellText(row, "gender");
    if (genderRaw !== "") {
      const gender = matchEnum(
        genderRaw,
        ["male", "female"],
        GENDER_LABELS,
        GENDER_FUZZY,
      );
      if (!gender) {
        errors.push({
          code: "INVALID_GENDER",
          message: `Gender "${genderRaw}" is not recognised. Use Male or Female.`,
        });
      } else {
        values.gender = gender;
      }
    }

    const maritalRaw = cellText(row, "maritalStatus");
    if (maritalRaw !== "") {
      const marital = matchEnum(
        maritalRaw,
        ["single", "married"],
        MARITAL_STATUS_LABELS,
        MARITAL_FUZZY,
      );
      if (!marital) {
        errors.push({
          code: "INVALID_MARITAL_STATUS",
          message: `Marital status "${maritalRaw}" is not recognised. Use Single or Married.`,
        });
      } else {
        values.maritalStatus = marital;
      }
    }

    const typeRaw = cellText(row, "employmentType");
    if (typeRaw !== "") {
      const type = matchEnum(
        typeRaw,
        EMPLOYMENT_TYPES,
        undefined,
        EMPLOYMENT_TYPE_FUZZY,
      );
      if (!type) {
        errors.push({
          code: "INVALID_EMPLOYMENT_TYPE",
          message: `Employment type "${typeRaw}" is not recognised.`,
        });
      } else {
        values.employmentType = type;
      }
    }

    const statusRaw = cellText(row, "employmentStatus");
    if (statusRaw !== "") {
      const status = matchEnum(
        statusRaw,
        EMPLOYMENT_STATUSES,
        undefined,
        EMPLOYMENT_STATUS_FUZZY,
      );
      if (!status) {
        errors.push({
          code: "INVALID_EMPLOYMENT_STATUS",
          message: `Employment status "${statusRaw}" is not recognised.`,
        });
      } else {
        values.employmentStatus = status;
      }
    }

    // Disability â€” accept a real boolean or the usual yes/no spellings.
    const disabilityRaw = cellText(row, "disabilityStatus");
    if (disabilityRaw !== "") {
      const parsed =
        parseBool(disabilityRaw) ??
        DISABILITY_FUZZY[headerKey(disabilityRaw)] ??
        null;
      if (parsed === null) {
        errors.push({
          code: "INVALID_DISABILITY",
          message: `Disability "${disabilityRaw}" is not recognised. Use Yes or No.`,
        });
      } else {
        values.disabilityStatus = parsed;
      }
    }

    // National ID
    const nationalIdRaw = cellText(row, "nationalId");
    if (nationalIdRaw.length > NATIONAL_ID_MAX) {
      errors.push({
        code: "INVALID_NATIONAL_ID",
        message: `National ID is longer than ${NATIONAL_ID_MAX} characters.`,
      });
    } else if (nationalIdRaw !== "") {
      values.nationalId = nationalIdRaw;
    }

    // Numerics
    const gradeRaw = cellText(row, "jobGrade");
    if (gradeRaw !== "") {
      const grade = parseBoundedInt(gradeRaw, 1, 50, "Job Grade");
      if ("error" in grade) {
        errors.push({ code: "INVALID_JOB_GRADE", message: grade.error });
      } else {
        values.jobGrade = grade.value;
      }
    }

    const familyRaw = cellText(row, "familySize");
    if (familyRaw !== "") {
      const family = parseBoundedInt(familyRaw, 1, 30, "Family Size");
      if ("error" in family) {
        errors.push({ code: "INVALID_FAMILY_SIZE", message: family.error });
      } else {
        values.familySize = family.value;
      }
    }

    // Dates
    for (const [field, label] of [
      ["dateOfBirth", "Date of Birth"],
      ["hireDate", "Hire Date"],
      ["terminationDate", "Termination Date"],
    ] as const) {
      const raw = cellText(row, field);
      const parsed = parseDateCell(raw);
      if (parsed && "error" in parsed) {
        errors.push({
          code: "INVALID_DATE",
          message: `${label}: ${parsed.error}`,
        });
      } else if (parsed && "value" in parsed) {
        (values as Record<string, unknown>)[field] = parsed.value;
      }
    }

    // Department
    let departmentName: string | undefined;
    const departmentRaw = cellText(row, "department");
    if (departmentRaw !== "") {
      const match = departmentLookup.get(normalizeRef(departmentRaw));
      if (!match) {
        errors.push({
          code: "UNKNOWN_DEPARTMENT",
          message: `Department "${departmentRaw}" does not exist in your organization.`,
        });
      } else if (match === AMBIGUOUS_REFERENCE) {
        errors.push({
          code: "AMBIGUOUS_DEPARTMENT",
          message: `Department "${departmentRaw}" matches more than one department.`,
        });
      } else {
        values.departmentId = match;
        departmentName = departmentNames.get(match);
      }
    }

    // Reporting manager
    const managerRaw = cellText(row, "managerNumber");
    if (managerRaw !== "") {
      const match = managerLookup.get(normalizeRef(managerRaw));
      if (!match) {
        errors.push({
          code: "UNKNOWN_MANAGER",
          message: `Reporting manager "${managerRaw}" was not found.`,
        });
      } else if (match === AMBIGUOUS_REFERENCE) {
        errors.push({
          code: "UNKNOWN_MANAGER",
          message: `Reporting manager "${managerRaw}" is ambiguous. Use their Emp ID.`,
        });
      } else {
        values.managerId = match;
      }
    }

    // Plain text passthrough
    for (const field of [
      "phone",
      "jobTitle",
      "address",
      "city",
      "state",
      "country",
      "postalCode",
      "notes",
    ] as const) {
      const raw = cellText(row, field);
      if (raw !== "") (values as Record<string, unknown>)[field] = raw;
    }

    const plan: EmployeeRowPlan = {
      rowNumber,
      employeeNumber,
      fullName: `${firstname} ${lastname}`.trim(),
      departmentName,
      values: {
        ...values,
        employeeNumber,
        firstname,
        lastname,
      } as Partial<CreateEmployeeInput>,
      errors: errors.slice(0, MAX_REPORTED_ERRORS),
    };

    if (errors.length === 0) validRows++;
    else invalidRows++;
    plans.push(plan);
  });

  return {
    totalRows: plans.length,
    validRows,
    invalidRows,
    rows: plans,
    notes,
    knownDepartments: departments.map((d) => d.name).sort(),
  };
}

/** Convert a workbook sheet into canonical row objects using a header map. */
export function rowsFromSheet(
  headers: string[],
  matrix: (string | number | boolean | null | undefined)[][],
  startIndex = 1,
): { rows: EmployeeSpreadsheetRow[]; mapping: Record<string, number> } {
  const mapping = mapEmployeeHeaders(headers);
  const rows: EmployeeSpreadsheetRow[] = [];

  for (let i = startIndex; i < matrix.length; i++) {
    const line = matrix[i];
    if (!line || line.every((cell) => cellToText(cell).trim() === "")) continue;

    const row: EmployeeSpreadsheetRow = {};
    for (const [field, index] of Object.entries(mapping)) {
      row[field] = cellToText(line[index]).trim();
    }
    rows.push(row);
  }

  return { rows, mapping };
}
