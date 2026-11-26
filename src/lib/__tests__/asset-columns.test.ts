import { describe, expect, it } from "vitest";
import {
  CANONICAL_ASSET_HEADERS,
  getCanonicalAssetValue,
  resolveFinanceNo,
} from "../asset-columns";

describe("canonical asset columns", () => {
  it("uses the exact canonical header order", () => {
    expect([...CANONICAL_ASSET_HEADERS]).toEqual([
      "S/N0",
      "Description",
      "Property No",
      "Dept",
      "Finance No",
      "Condition (1st)",
      "Location (1st)",
      "Review Date (1st)",
      "Condition (2nd)",
      "Location (2nd)",
      "Review Date (2nd)",
    ]);
  });

  it("resolves one Finance No from canonical, second, then first values", () => {
    expect(
      resolveFinanceNo({
        financeNo: " canonical ",
        financeNo2: "second",
        financeNo1: "first",
      }),
    ).toBe(" canonical ");
    expect(
      resolveFinanceNo({
        financeNo: "   ",
        financeNo2: "second",
        financeNo1: "first",
      }),
    ).toBe("second");
    expect(
      resolveFinanceNo({
        financeNo: null,
        financeNo2: " ",
        financeNo1: "first",
      }),
    ).toBe("first");
    expect(
      resolveFinanceNo({
        financeNo: null,
        financeNo2: null,
        financeNo1: null,
      }),
    ).toBeNull();
  });

  it("reads canonical display values from legacy-backed fields", () => {
    expect(
      getCanonicalAssetValue(
        {
          sourceDepartment: "Warehouse",
          department: { name: "Store" },
          financeNo2: "second",
          financeNo1: "first",
          condition1Status: { statustypename: "Good" },
          statusType: { statustypename: "N/F" },
        },
        "department",
      ),
    ).toBe("Warehouse");
    expect(
      getCanonicalAssetValue(
        {
          financeNo2: "second",
          financeNo1: "first",
        },
        "financeNo",
      ),
    ).toBe("second");
    expect(
      getCanonicalAssetValue(
        {
          condition1Status: { statustypename: "Good" },
          condition1: "Legacy",
        },
        "condition1",
      ),
    ).toBe("Good");
  });
});
