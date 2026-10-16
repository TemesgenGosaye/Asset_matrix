import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  AMBIGUOUS_REFERENCE,
  buildStrictReferenceLookup,
  mapEmployeeHeaders,
  previewEmployeeImport,
  rowsFromSheet,
} from "../import";

/**
 * The employee import's validation layer.
 *
 * `previewEmployeeImport` is the piece that decides whether a spreadsheet row
 * becomes an employee or a reported error, so it is worth testing directly:
 * the wizard only presents what this function decided.
 */

const mockPrisma = vi.hoisted(() => ({
  department: { findMany: vi.fn() },
  employee: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ default: mockPrisma }));

const ORG = "org-1234-uuid";

/** Two departments, one of them ambiguous by name on purpose in some tests. */
function seedLookups(
  departments: { id: string; name: string; code?: string | null }[] = [
    { id: "dept-1", name: "Agronomy", code: "AGR" },
    { id: "dept-2", name: "Maintenance", code: "MNT" },
  ],
  employees: {
    id: string;
    firstname: string;
    lastname: string;
    employeeNumber: string;
  }[] = [
    {
      id: "emp-1",
      firstname: "Sara",
      lastname: "Derso",
      employeeNumber: "EMP-001",
    },
  ],
) {
  mockPrisma.department.findMany.mockResolvedValue(departments);
  mockPrisma.employee.findMany.mockResolvedValue(employees);
}

const validRow = {
  employeeNumber: "EMP-100",
  firstname: "Aster",
  lastname: "Bekele",
  department: "Agronomy",
};

describe("buildStrictReferenceLookup", () => {
  it("resolves by name and by code to the same id", () => {
    const map = buildStrictReferenceLookup([
      { id: "d1", name: "Agronomy", code: "AGR" },
    ]);
    expect(map.get("agronomy")).toBe("d1");
    expect(map.get("agr")).toBe("d1");
  });

  it("marks a key that matches two records as ambiguous instead of picking one", () => {
    const map = buildStrictReferenceLookup([
      { id: "d1", name: "Agronomy", code: "AGR" },
      { id: "d2", name: "AGR", code: null },
    ]);
    expect(map.get("agr")).toBe(AMBIGUOUS_REFERENCE);
    // The unambiguous key still resolves.
    expect(map.get("agronomy")).toBe("d1");
  });

  it("ignores blank keys rather than mapping them to a record", () => {
    const map = buildStrictReferenceLookup([{ id: "d1", name: "", code: "" }]);
    expect(map.size).toBe(0);
  });
});

describe("mapEmployeeHeaders", () => {
  it("matches the canonical template headers exactly", () => {
    const mapping = mapEmployeeHeaders(["Emp ID", "First Name", "Last Name"]);
    expect(mapping.employeeNumber).toBe(0);
    expect(mapping.firstname).toBe(1);
    expect(mapping.lastname).toBe(2);
  });

  it("matches the common HR aliases for the same fields", () => {
    const mapping = mapEmployeeHeaders([
      "EmployeeID",
      "Given Name",
      "Family Name",
      "Telephone",
    ]);
    expect(mapping.employeeNumber).toBe(0);
    expect(mapping.firstname).toBe(1);
    expect(mapping.lastname).toBe(2);
    expect(mapping.phone).toBe(3);
  });

  /**
   * An "Email" column in a legacy HR export is ignored, not rejected.
   *
   * The column no longer exists, so a file that still carries one should import
   * cleanly with that heading listed as unmapped — not fail the whole batch.
   */
  it("ignores an Email heading rather than failing on it", () => {
    const mapping = mapEmployeeHeaders(["Emp ID", "Email", "Job Title"]);
    expect(mapping.employeeNumber).toBe(0);
    expect(mapping.jobTitle).toBe(2);
    expect(Object.values(mapping)).not.toContain(1);
  });

  it("leaves unmatched headers unmapped rather than guessing", () => {
    const mapping = mapEmployeeHeaders(["Widget Colour", "Emp ID"]);
    expect(mapping.employeeNumber).toBe(1);
    expect(mapping.gender).toBeUndefined();
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
    const { rows } = rowsFromSheet(
      ["Emp ID", "First Name", "Last Name"],
      matrix,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].employeeNumber).toBe("EMP-1");
    expect(rows[1].employeeNumber).toBe("EMP-2");
  });
});

describe("previewEmployeeImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedLookups();
  });

  it("accepts a well-formed row and resolves its department", async () => {
    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows: [validRow],
    });

    expect(preview.validRows).toBe(1);
    expect(preview.invalidRows).toBe(0);
    expect(preview.rows[0].values.departmentId).toBe("dept-1");
    // The name is surfaced for display so the reviewer sees what it resolved to.
    expect(preview.rows[0].departmentName).toBe("Agronomy");
    expect(preview.knownDepartments).toEqual(["Agronomy", "Maintenance"]);
  });

  it("requires an employee number, a first name and a last name", async () => {
    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows: [{ employeeNumber: "", firstname: "", lastname: "" }],
    });

    expect(preview.invalidRows).toBe(1);
    const codes = preview.rows[0].errors.map((e) => e.code);
    expect(codes).toContain("MISSING_EMPLOYEE_NUMBER");
    expect(codes).toContain("MISSING_NAME");
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
  });

  it("rejects a department that does not exist rather than guessing", async () => {
    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows: [{ ...validRow, department: "Nonexistent Dept" }],
    });

    expect(preview.invalidRows).toBe(1);
    expect(preview.rows[0].errors.map((e) => e.code)).toContain(
      "UNKNOWN_DEPARTMENT",
    );
  });

  it("rejects an ambiguous department reference", async () => {
    seedLookups([
      { id: "dept-1", name: "Agronomy", code: "AGR" },
      { id: "dept-2", name: "Agronomy", code: null },
    ]);

    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows: [validRow],
    });

    expect(preview.invalidRows).toBe(1);
    expect(preview.rows[0].errors.map((e) => e.code)).toContain(
      "AMBIGUOUS_DEPARTMENT",
    );
    expect(preview.rows[0].departmentName).toBeUndefined();
  });

  it("resolves a reporting manager by employee number", async () => {
    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows: [{ ...validRow, managerNumber: "EMP-001" }],
    });
    expect(preview.validRows).toBe(1);
    expect(preview.rows[0].values.managerId).toBe("emp-1");
  });

  it("accepts a manager named as 'First Last'", async () => {
    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows: [{ ...validRow, managerNumber: "Sara Derso" }],
    });
    expect(preview.rows[0].values.managerId).toBe("emp-1");
  });

  it("reports an unknown reporting manager", async () => {
    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows: [{ ...validRow, managerNumber: "EMP-999" }],
    });
    expect(preview.invalidRows).toBe(1);
    expect(preview.rows[0].errors.map((e) => e.code)).toContain(
      "UNKNOWN_MANAGER",
    );
  });

  it("accepts the loose spellings HR actually types for enums", async () => {
    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows: [
        {
          ...validRow,
          gender: "M",
          maritalStatus: "Married",
          employmentType: "Permanent",
          employmentStatus: "Current",
          disabilityStatus: "Y",
        },
      ],
    });

    expect(preview.validRows).toBe(1);
    const v = preview.rows[0].values;
    expect(v.gender).toBe("male");
    expect(v.maritalStatus).toBe("married");
    expect(v.employmentType).toBe("full_time");
    expect(v.employmentStatus).toBe("active");
    expect(v.disabilityStatus).toBe(true);
  });

  it("rejects an unrecognised enum value with the accepted options named", async () => {
    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows: [{ ...validRow, gender: "other" }],
    });

    expect(preview.invalidRows).toBe(1);
    const err = preview.rows[0].errors.find((e) => e.code === "INVALID_GENDER");
    expect(err?.message).toContain("Male");
  });

  it("accepts several date spellings and normalises to YYYY-MM-DD", async () => {
    // Day-first, month-first, ISO and a spelled month must all land on the day
    // the user actually typed. On UTC+3 a local-midnight parse would return the
    // day before for every one of them.
    for (const [raw, expected] of [
      ["2024-01-15", "2024-01-15"],
      ["15/01/2024", "2024-01-15"],
      ["01/15/2024", "2024-01-15"],
      ["15 Jan 2024", "2024-01-15"],
      ["January 15, 2024", "2024-01-15"],
      ["2026-03-01", "2026-03-01"],
    ] as const) {
      const preview = await previewEmployeeImport({
        organizationId: ORG,
        rows: [{ ...validRow, hireDate: raw }],
      });
      expect(preview.rows[0].values.hireDate, raw).toBe(expected);
    }
  });

  it("reports an out-of-range date instead of rolling it into another month", async () => {
    // `new Date(2026, 2, 31)` would quietly become 2026-04-02.
    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows: [{ ...validRow, hireDate: "2026-02-31" }],
    });
    expect(preview.rows[0].errors.map((e) => e.code)).toContain("INVALID_DATE");
  });

  it("reports an unparseable date", async () => {
    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows: [{ ...validRow, hireDate: "sometime in March" }],
    });
    expect(preview.rows[0].errors.map((e) => e.code)).toContain("INVALID_DATE");
  });

  it("bounds job grade and family size", async () => {
    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows: [{ ...validRow, jobGrade: "99", familySize: "0" }],
    });
    const codes = preview.rows[0].errors.map((e) => e.code);
    expect(codes).toContain("INVALID_JOB_GRADE");
    expect(codes).toContain("INVALID_FAMILY_SIZE");
  });

  /**
   * A row with no address is a complete row.
   *
   * It used to preview a generated placeholder and be counted valid only
   * because the address existed. Now the absence of one is simply not a
   * problem, and nothing is invented.
   */
  it("accepts a row that carries no address at all", async () => {
    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows: [validRow],
    });

    expect(preview.validRows).toBe(1);
    expect(preview.rows[0].errors).toEqual([]);
    expect(preview.rows[0]).not.toHaveProperty("generatedEmail");
    expect(JSON.stringify(preview.rows[0])).not.toContain(
      "placeholder.invalid",
    );
  });

  it("ignores an address supplied by a legacy file instead of persisting it", async () => {
    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows: [{ ...validRow, email: "legacy.address@example.com" }],
    });

    expect(preview.validRows).toBe(1);
    expect(preview.rows[0].values).not.toHaveProperty("email");
  });

  it("reports every failing reason on a row, not just the first", async () => {
    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows: [
        {
          employeeNumber: "",
          firstname: "",
          lastname: "",
          gender: "nope",
          department: "Ghost Dept",
        },
      ],
    });
    expect(preview.rows[0].errors.length).toBeGreaterThanOrEqual(4);
  });

  it("caps the batch and says so in a note rather than silently truncating", async () => {
    const many = Array.from({ length: 505 }, (_, i) => ({
      ...validRow,
      employeeNumber: `EMP-${i}`,
    }));

    const preview = await previewEmployeeImport({
      organizationId: ORG,
      rows: many,
    });

    expect(preview.totalRows).toBe(500);
    expect(preview.notes.join(" ")).toContain("500");
    expect(preview.notes.join(" ")).toContain("5");
  });
});
