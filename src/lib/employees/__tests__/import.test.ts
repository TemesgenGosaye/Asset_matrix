import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  mapEmployeeHeaders,
  previewEmployeeImport,
  rowsFromSheet,
} from "../import";
import { MAX_IMPORT_ROWS } from "../constants";

/**
 * The employee import's validation layer.
 *
 * `previewEmployeeImport` is the piece that decides whether a spreadsheet row
 * becomes an employee or a reported error, so it is worth testing directly:
 * the wizard only presents what this function decided.
 *
 * The approved employee schema is exactly eight business columns — Emp ID,
 * First Name, Last Name, Gender, Job Grade, Service Years, Marital Status and
 * Disability — and these tests hold the importer to that contract.
 */

const mockPrisma = vi.hoisted(() => ({
  employee: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ default: mockPrisma }));

const ORG = "org-1234-uuid";

/** Seed the Emp IDs that already exist in the organization. */
function seedExistingEmployees(employeeNumbers: string[] = ["EMP-001"]) {
  mockPrisma.employee.findMany.mockResolvedValue(
    employeeNumbers.map((employeeNumber) => ({ employeeNumber })),
  );
}

const validRow = {
  employeeNumber: "EMP-100",
  firstname: "Aster",
  lastname: "Bekele",
  gender: "female",
  jobGrade: "12",
  serviceYears: "7",
  maritalStatus: "married",
  disabilityStatus: "No",
};

describe("mapEmployeeHeaders", () => {
  it("matches the canonical template headers exactly", () => {
    const { mapping } = mapEmployeeHeaders([
      "Emp ID",
      "First Name",
      "Last Name",
      "Gender",
      "Job Grade",
      "Service Years",
      "Marital Status",
      "Disability",
    ]);
    expect(mapping.employeeNumber).toBe(0);
    expect(mapping.firstname).toBe(1);
    expect(mapping.lastname).toBe(2);
    expect(mapping.gender).toBe(3);
    expect(mapping.jobGrade).toBe(4);
    expect(mapping.serviceYears).toBe(5);
    expect(mapping.maritalStatus).toBe(6);
    expect(mapping.disabilityStatus).toBe(7);
  });

  it("tolerates case, whitespace and punctuation differences", () => {
    const { mapping } = mapEmployeeHeaders([
      "emp id",
      "  FIRST   NAME  ",
      "last-name",
      "SERVICE_YEARS",
    ]);
    expect(mapping.employeeNumber).toBe(0);
    expect(mapping.firstname).toBe(1);
    expect(mapping.lastname).toBe(2);
    expect(mapping.serviceYears).toBe(3);
  });

  it("matches the common HR aliases for the same fields", () => {
    const { mapping } = mapEmployeeHeaders([
      "Employee ID",
      "Given Name",
      "Family Name",
      "Sex",
      "Salary Grade",
      "Years of Service",
      "Marital",
      "Disability Status",
    ]);
    expect(mapping.employeeNumber).toBe(0);
    expect(mapping.firstname).toBe(1);
    expect(mapping.lastname).toBe(2);
    expect(mapping.gender).toBe(3);
    expect(mapping.jobGrade).toBe(4);
    expect(mapping.serviceYears).toBe(5);
    expect(mapping.maritalStatus).toBe(6);
    expect(mapping.disabilityStatus).toBe(7);
  });

  it("lists an unmatched heading as unmapped rather than guessing", () => {
    const { mapping, unmapped } = mapEmployeeHeaders([
      "Widget Colour",
      "Emp ID",
    ]);
    expect(mapping.employeeNumber).toBe(1);
    expect(mapping.gender).toBeUndefined();
    expect(unmapped).toEqual(["Widget Colour"]);
  });

  it("reports the required columns a workbook is missing", () => {
    const { missing } = mapEmployeeHeaders(["Gender"]);
    expect(missing).toContain("employeeNumber");
  });

  it("flags two headers that claim the same canonical column", () => {
    const { ambiguous } = mapEmployeeHeaders([
      "Emp ID",
      "Employee Number",
      "First Name",
      "Last Name",
    ]);
    expect(ambiguous.length).toBeGreaterThan(0);
    expect(ambiguous[0].reason).toContain("employeeNumber");
  });
});

describe("rowsFromSheet", () => {
  it("skips the header row and blank rows", () => {
    const matrix = [
      ["Emp ID", "First Name", "Last Name"],
      ["EMP-1", "Aster", "Bekele"],
      ["", "", ""],
      ["EMP-2", "Dawit", "Girma"],
    ];
    const { rows, rowNumbers } = rowsFromSheet(
      ["Emp ID", "First Name", "Last Name"],
      matrix,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].employeeNumber).toBe("EMP-1");
    expect(rows[1].employeeNumber).toBe("EMP-2");
    expect(rowNumbers).toEqual([2, 4]);
  });

  it("starts after the given header row index", () => {
    const matrix = [
      ["Employee register export"],
      ["Emp ID", "First Name", "Last Name"],
      ["EMP-1", "Aster", "Bekele"],
    ];
    const { rows } = rowsFromSheet(
      ["Emp ID", "First Name", "Last Name"],
      matrix,
      1,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].employeeNumber).toBe("EMP-1");
  });

  it("keeps leading zeros by preferring the displayed cell text", () => {
    const headers = ["Emp ID", "First Name", "Last Name"];
    // The raw cell value of a zero-padded ID reads back as a number; the
    // displayed text is what the sheet actually shows.
    const matrix = [headers, ["123", "Aster", "Bekele"]];
    const displayRows = [headers, ["00123", "Aster", "Bekele"]];
    const { rows } = rowsFromSheet(headers, matrix, 0, displayRows);
    expect(rows[0].employeeNumber).toBe("00123");
  });
});

describe("previewEmployeeImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedExistingEmployees();
  });

  it("accepts a well-formed eight-column row and echoes its values", async () => {
    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows: [validRow],
    });

    expect(preview.validRows).toBe(1);
    expect(preview.invalidRows).toBe(0);
    expect(preview.rows[0].values).toMatchObject({
      employeeNumber: "EMP-100",
      firstname: "Aster",
      lastname: "Bekele",
      gender: "female",
      jobGrade: 12,
      serviceYears: 7,
      maritalStatus: "married",
      disabilityStatus: "No",
    });
    expect(preview.rows[0].fullName).toBe("Aster Bekele");
  });

  it("ignores empty rows without an employee number", async () => {
    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows: [{ employeeNumber: "", firstname: "", lastname: "" }],
    });

    expect(preview.ignoredRows).toBe(1);
    expect(preview.validRows).toBe(0);
    expect(preview.rows[0].isIgnored).toBe(true);
  });

  it("accepts an employee row even if first and last names are missing", async () => {
    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows: [{ employeeNumber: "EMP-200", firstname: "", lastname: "" }],
    });

    expect(preview.validRows).toBe(1);
    expect(preview.invalidRows).toBe(0);
    expect(preview.rows[0].values.firstname).toBe("-");
    expect(preview.rows[0].values.lastname).toBe("-");
    expect(preview.rows[0].recommendation).toBeDefined();
    expect(preview.rows[0].score).toBeDefined();
  });

  it("leaves optional blank cells unset rather than inventing a value", async () => {
    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows: [
        { employeeNumber: "EMP-200", firstname: "Sara", lastname: "Derso" },
      ],
    });

    expect(preview.validRows).toBe(1);
    expect(preview.rows[0].values).not.toHaveProperty("gender");
    expect(preview.rows[0].values).not.toHaveProperty("jobGrade");
    expect(preview.rows[0].values).not.toHaveProperty("serviceYears");
    expect(preview.rows[0].values).not.toHaveProperty("maritalStatus");
    expect(preview.rows[0].values).not.toHaveProperty("disabilityStatus");
  });

  it("imports a blank job grade as not recorded, never as zero", async () => {
    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows: [
        {
          employeeNumber: "EMP-201",
          firstname: "Sara",
          lastname: "Derso",
          jobGrade: "",
        },
      ],
    });

    expect(preview.invalidRows).toBe(0);
    expect(preview.rows[0].values).not.toHaveProperty("jobGrade");
    expect(preview.rows[0].values.jobGrade ?? null).toBeNull();
  });

  it("reads a zero job grade as not recorded rather than rejecting the row", async () => {
    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows: [
        {
          employeeNumber: "EMP-202",
          firstname: "Sara",
          lastname: "Derso",
          jobGrade: "0",
        },
      ],
    });

    expect(preview.invalidRows).toBe(0);
    expect(preview.rows[0].values).not.toHaveProperty("jobGrade");
  });

  it("rejects an unrecognised gender with the accepted options named", async () => {
    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows: [{ ...validRow, gender: "other" }],
    });

    expect(preview.invalidRows).toBe(1);
    const err = preview.rows[0].errors.find((e) => e.code === "INVALID_GENDER");
    expect(err?.message).toContain("male");
  });

  it("accepts the loose gender spellings HR actually types", async () => {
    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows: [
        { ...validRow, gender: "M" },
        { ...validRow, employeeNumber: "EMP-101", gender: "F" },
      ],
    });

    expect(preview.rows[0].values.gender).toBe("male");
    expect(preview.rows[1].values.gender).toBe("female");
  });

  it("rejects an unrecognised marital status", async () => {
    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows: [{ ...validRow, maritalStatus: "complicated" }],
    });

    expect(preview.rows[0].errors.map((e) => e.code)).toContain(
      "INVALID_MARITAL_STATUS",
    );
  });

  it("bounds the job grade", async () => {
    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows: [{ ...validRow, jobGrade: "99" }],
    });

    expect(preview.rows[0].errors.map((e) => e.code)).toContain(
      "INVALID_JOB_GRADE",
    );
  });

  it("bounds service years and rejects a non-numeric value", async () => {
    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows: [
        { ...validRow, serviceYears: "99" },
        { ...validRow, employeeNumber: "EMP-102", serviceYears: "many" },
      ],
    });

    expect(preview.rows[0].errors.map((e) => e.code)).toContain(
      "INVALID_SERVICE_YEARS",
    );
    expect(preview.rows[1].errors.map((e) => e.code)).toContain(
      "INVALID_SERVICE_YEARS",
    );
  });

  it("preserves the source's own disability vocabulary verbatim", async () => {
    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows: [{ ...validRow, disabilityStatus: "Physical" }],
    });

    expect(preview.rows[0].values.disabilityStatus).toBe("Physical");
  });

  it("rejects an over-long disability value", async () => {
    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows: [{ ...validRow, disabilityStatus: "x".repeat(101) }],
    });

    expect(preview.rows[0].errors.map((e) => e.code)).toContain(
      "INVALID_DISABILITY",
    );
  });

  it("reports a duplicate employee number inside the file itself", async () => {
    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows: [validRow, { ...validRow, firstname: "Bekele" }],
    });

    expect(preview.validRows).toBe(1);
    expect(preview.invalidRows).toBe(1);
    expect(preview.rows[1].errors.map((e) => e.code)).toContain(
      "DUPLICATE_IN_FILE",
    );
  });

  it("treats a duplicate employee number case-insensitively", async () => {
    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows: [validRow, { ...validRow, employeeNumber: "emp-100" }],
    });
    expect(preview.invalidRows).toBe(1);
    expect(preview.rows[1].errors.map((e) => e.code)).toContain(
      "DUPLICATE_IN_FILE",
    );
  });

  it("rejects an Emp ID that already exists in the register", async () => {
    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows: [{ ...validRow, employeeNumber: "EMP-001" }],
    });

    expect(preview.invalidRows).toBe(1);
    expect(preview.duplicateRows).toBe(1);
    expect(preview.rows[0].errors.map((e) => e.code)).toContain(
      "DUPLICATE_EXISTING",
    );
  });

  it("reports every failing reason on a row, not just the first", async () => {
    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows: [
        {
          employeeNumber: "x".repeat(60),
          gender: "nope",
          maritalStatus: "complicated",
          jobGrade: "99",
        },
      ],
    });
    expect(preview.rows[0].errors.length).toBeGreaterThanOrEqual(4);
  });

  it("caps the batch and says so in a note rather than silently truncating", async () => {
    const many = Array.from({ length: MAX_IMPORT_ROWS + 5 }, (_, i) => ({
      ...validRow,
      employeeNumber: `EMP-${i}`,
    }));

    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows: many,
    });

    expect(preview.totalRows).toBe(MAX_IMPORT_ROWS);
    expect(preview.notes.join(" ")).toContain(MAX_IMPORT_ROWS.toLocaleString());
    expect(preview.notes.join(" ")).toContain("5");
  });

  /**
   * A full 4,000-row workbook is the documented ceiling, so every row has to be
   * validated and every one of them has to be reported back. A truncated batch
   * that looked complete would be the worst possible outcome: the user would
   * believe the whole register was loaded.
   */
  it("validates every row of a full 4,000-row workbook", async () => {
    const rows = Array.from({ length: 4000 }, (_, i) => ({
      ...validRow,
      employeeNumber: `EMP-${i}`,
      firstname: `First${i}`,
      lastname: `Last${i}`,
    }));

    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows,
    });

    expect(preview.totalRows).toBe(4000);
    expect(preview.validRows).toBe(4000);
    expect(preview.invalidRows).toBe(0);
    expect(preview.rows).toHaveLength(4000);
    expect(preview.notes).toHaveLength(0);
    expect(preview.rows[0].values.employeeNumber).toBe("EMP-0");
    expect(preview.rows[3999].values.employeeNumber).toBe("EMP-3999");
  });

  it("reports a duplicate inside a 4,000-row workbook instead of dropping it", async () => {
    const rows = Array.from({ length: 4000 }, (_, i) => ({
      ...validRow,
      employeeNumber: `EMP-${i}`,
    }));
    // The last row repeats an Emp ID that already appears in the file.
    rows[3999] = { ...validRow, employeeNumber: "EMP-0" };

    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows,
    });

    expect(preview.totalRows).toBe(4000);
    expect(preview.validRows).toBe(3999);
    expect(preview.invalidRows).toBe(1);
    expect(preview.duplicateRows).toBe(1);
    expect(preview.rows[3999].errors.map((e) => e.code)).toContain(
      "DUPLICATE_IN_FILE",
    );
  });

  it("reports an Emp ID that already exists in the register among 4,000 rows", async () => {
    const rows = Array.from({ length: 4000 }, (_, i) => ({
      ...validRow,
      employeeNumber: `EMP-${i}`,
    }));
    rows[2500] = { ...validRow, employeeNumber: "EMP-001" };

    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows,
    });

    expect(preview.totalRows).toBe(4000);
    expect(preview.validRows).toBe(3999);
    expect(preview.invalidRows).toBe(1);
    expect(preview.rows[2500].errors.map((e) => e.code)).toContain(
      "DUPLICATE_EXISTING",
    );
  });

  it("calculates projected MCDA score and house category recommendation", async () => {
    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows: [
        {
          ...validRow,
          employeeNumber: "EMP-SCORE-1",
          jobGrade: "14",
          serviceYears: "15",
          maritalStatus: "married",
          disabilityStatus: "Physical",
          gender: "female",
        },
      ],
    });

    expect(preview.validRows).toBe(1);
    const rowPlan = preview.rows[0];
    expect(rowPlan.score).toBeGreaterThan(0.5);
    expect(rowPlan.recommendation?.houseQueueBand).toBe("B");
    expect(rowPlan.recommendation?.houseQueueEligible).toBe(true);
    expect(rowPlan.recommendation?.tips.length).toBeGreaterThan(0);
  });

  it("recognizes score header and uses explicit score when supplied", async () => {
    const { mapping } = mapEmployeeHeaders(["Emp ID", "Score"]);
    expect(mapping.score).toBe(1);

    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows: [
        {
          employeeNumber: "EMP-SCORE-2",
          score: "0.85",
        },
      ],
    });

    expect(preview.validRows).toBe(1);
    expect(preview.rows[0].score).toBe(0.85);
  });
});
