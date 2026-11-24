import { describe, expect, it } from "vitest";
import {
  buildFixedAssetWhere,
  mapMasterListRow,
  normalizeCondition,
  normalizeDepartmentAlias,
  parseExcelDate,
  normalizePropertyKey,
} from "../fixed-asset-register";

describe("fixed asset register normalization", () => {
  it("normalizes condition values and flags unknown values", () => {
    expect(normalizeCondition("good").value).toBe("Good");
    expect(normalizeCondition(" n/f ").value).toBe("N/F");
    expect(normalizeCondition("demonshed").value).toBe("Demolished");
    expect(normalizeCondition("battery damaged").warning).toContain(
      "Unrecognized",
    );
  });

  it("parses day-first dates, Excel serials and ambiguous values", () => {
    expect(parseExcelDate("20/8/2024").date?.toISOString()).toBe(
      "2024-08-20T00:00:00.000Z",
    );
    expect(parseExcelDate("3/8/2024").ambiguous).toBe(true);
    expect(parseExcelDate(45292).date?.getUTCFullYear()).toBe(2024);
    expect(parseExcelDate("not a date").date).toBeNull();
  });

  it("preserves raw values and generates a placeholder for missing Property No", () => {
    const parsed = mapMasterListRow(
      {
        Department: "Logestic",
        Description: "  Printer  ",
        "Property No": "",
        "Condition (1st)": "nf",
        "Hidden in Source": "Yes",
      },
      42,
    );
    expect(parsed.assetname).toBe("Printer");
    expect(parsed.propertyNo).toBe("UNKNOWN-LOGESTIC-42");
    expect(parsed.condition1).toBe("N/F");
    expect(parsed.hiddenInSource).toBe(true);
    expect(parsed.warnings.join(" ")).toContain("Property No is missing");
  });

  it("normalizes department aliases and property keys for matching", () => {
    expect(normalizeDepartmentAlias("Office & Factory Bulding")).toBe(
      "officefactorybulding",
    );
    expect(normalizePropertyKey(" prop - 12 / 3 ")).toBe("PROP-12/3");
  });
});

describe("buildFixedAssetWhere", () => {
  it("scopes by organization and applies filters without losing data constraints", () => {
    const where = buildFixedAssetWhere(
      {
        departments: ["Logestic"],
        conditions: ["Good"],
        hidden: true,
        missingProperty: true,
        needsReview: true,
      },
      "org-1",
      true,
    );
    expect(where.organizationId).toBe("org-1");
    expect(where.AND).toHaveLength(5);
  });

  it("restricts non-admin users to assigned or available assets", () => {
    const where = buildFixedAssetWhere(
      {},
      "org-1",
      false,
      ["asset-1"],
      ["status-1"],
    );
    expect(where.OR).toEqual([
      { assetid: { in: ["asset-1"] } },
      { statustypeid: { in: ["status-1"] } },
    ]);
  });
});
