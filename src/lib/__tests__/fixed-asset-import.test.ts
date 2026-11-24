import { beforeEach, describe, expect, it, vi } from "vitest";
import { mapMasterListRow } from "../fixed-asset-register";

vi.mock("@/lib/prisma", () => {
  const findMany = vi.fn(async () => []);
  return {
    default: {
      departmentAlias: { findMany },
      department: { findMany },
      statusType: { findMany },
      location: { findMany },
      assetCategoryType: { findMany },
      asset: { findMany },
    },
  };
});

import {
  buildFixedAssetImportPlan,
  normalizeDuplicatePolicy,
  normalizeErrorHandling,
} from "../fixed-asset-import";

function workbook(rows: ReturnType<typeof row>[], errorRows = 0) {
  return {
    sheets: ["Master List"],
    sheetName: "Master List",
    headers: ["Department", "Description", "Property No", "Condition (1st)"],
    rows,
    preview: rows.slice(0, 8),
    summary: {
      totalRows: rows.length,
      errorRows,
      warningRows: rows.filter((row) => row.parsed.warnings.length > 0).length,
      duplicatePropertyNumbers: rows.filter((row) =>
        row.parsed.warnings.includes("Duplicate Property No in file"),
      ).length,
    },
  } as Parameters<typeof buildFixedAssetImportPlan>[0];
}

function row(rowNumber: number, overrides: Record<string, string> = {}) {
  const raw = {
    Department: "Logestic",
    Description: "Printer",
    "Property No": "PROP-1",
    "Condition (1st)": "goood",
    ...overrides,
  };
  const parsed = mapMasterListRow(raw, rowNumber);
  return { rowNumber, parsed, raw };
}

describe("fixed asset import options", () => {
  it("defaults to skip errors and flag duplicates", () => {
    expect(normalizeErrorHandling(undefined)).toBe("skip");
    expect(normalizeErrorHandling("unknown")).toBe("skip");
    expect(normalizeDuplicatePolicy(undefined)).toBe("flag");
    expect(normalizeDuplicatePolicy("unknown")).toBe("flag");
  });

  it("flags duplicate property numbers instead of rejecting them", async () => {
    const first = row(2);
    const duplicate = row(3);
    duplicate.parsed.warnings.push("Duplicate Property No in file");
    const plan = await buildFixedAssetImportPlan(workbook([first, duplicate]), {
      organizationId: "org-1",
    });

    expect(plan.duplicate).toBe(1);
    expect(plan.flag).toBe(1);
    expect(plan.create).toBe(1);
    expect(plan.skip).toBe(0);
    expect(plan.importable).toBe(2);
  });

  it("skips duplicates when that policy is selected", async () => {
    const first = row(2);
    const duplicate = row(3);
    duplicate.parsed.warnings.push("Duplicate Property No in file");
    const plan = await buildFixedAssetImportPlan(workbook([first, duplicate]), {
      organizationId: "org-1",
      duplicatePolicy: "skip",
    });

    expect(plan.create).toBe(1);
    expect(plan.skip).toBe(1);
    expect(plan.flag).toBe(0);
  });

  it("reports errors before starting when abort mode is selected", async () => {
    const invalid = row(4, { Description: "" });
    const plan = await buildFixedAssetImportPlan(workbook([invalid], 1), {
      organizationId: "org-1",
      errorHandling: "abort",
    });

    expect(plan.failed).toBe(1);
    expect(plan.importable).toBe(0);
  });
});
