import { describe, it, expect } from "vitest";
import {
  houseCategoryForJobGrade,
  isEligibleForHouse,
  houseCategoryLegend,
  jobGradeRangeLabel,
  JOB_GRADE_HOUSE_RULES,
} from "../eligibility";

describe("houseCategoryForJobGrade (central rule)", () => {
  it("maps >17 to Staff", () => {
    expect(houseCategoryForJobGrade(18)).toBe("Staff");
    expect(houseCategoryForJobGrade(50)).toBe("Staff");
  });

  it("maps 15–17 to A", () => {
    expect(houseCategoryForJobGrade(15)).toBe("A");
    expect(houseCategoryForJobGrade(17)).toBe("A");
  });

  it("maps 12–14 to B", () => {
    expect(houseCategoryForJobGrade(12)).toBe("B");
    expect(houseCategoryForJobGrade(14)).toBe("B");
  });

  it("maps 10–11 to C", () => {
    expect(houseCategoryForJobGrade(10)).toBe("C");
    expect(houseCategoryForJobGrade(11)).toBe("C");
  });

  it("maps 7–9 to D", () => {
    expect(houseCategoryForJobGrade(7)).toBe("D");
    expect(houseCategoryForJobGrade(9)).toBe("D");
  });

  it("maps 1–6 to E", () => {
    expect(houseCategoryForJobGrade(1)).toBe("E");
    expect(houseCategoryForJobGrade(6)).toBe("E");
  });

  it("returns null for unset, zero, negative and NaN grades", () => {
    expect(houseCategoryForJobGrade(null)).toBeNull();
    expect(houseCategoryForJobGrade(undefined)).toBeNull();
    expect(houseCategoryForJobGrade("")).toBeNull();
    expect(houseCategoryForJobGrade(0)).toBeNull();
    expect(houseCategoryForJobGrade(-3)).toBeNull();
    expect(houseCategoryForJobGrade(Number.NaN)).toBeNull();
  });

  it("accepts string grades", () => {
    expect(houseCategoryForJobGrade("12")).toBe("B");
  });

  it("has disjoint, fully-covered tiers", () => {
    const seen = new Set<number>();
    for (const rule of JOB_GRADE_HOUSE_RULES) {
      for (let g = rule.minGrade; g <= (rule.maxGrade ?? 60); g++) {
        expect(seen.has(g)).toBe(false);
        seen.add(g);
      }
    }
  });
});

describe("isEligibleForHouse", () => {
  it("is true only when the central rule returns a category", () => {
    expect(isEligibleForHouse(18)).toBe(true);
    expect(isEligibleForHouse(1)).toBe(true);
    expect(isEligibleForHouse(7)).toBe(true);
    expect(isEligibleForHouse(null)).toBe(false);
    expect(isEligibleForHouse(0)).toBe(false);
  });
});

describe("helper labels", () => {
  it("labels the unbounded Staff tier as > 17", () => {
    const staff = JOB_GRADE_HOUSE_RULES.find((r) => r.category === "Staff");
    expect(staff && jobGradeRangeLabel(staff)).toBe("> 17");
  });

  it("labels bounded tiers with en-dash ranges", () => {
    const b = JOB_GRADE_HOUSE_RULES.find((r) => r.category === "B");
    expect(b && jobGradeRangeLabel(b)).toBe("12 – 14");
  });

  it("builds a legend that contains every rule", () => {
    const legend = houseCategoryLegend();
    expect(legend).toContain("> 17 → Staff");
    expect(legend).toContain("1 – 6 → E");
    expect(JOB_GRADE_HOUSE_RULES.every((r) => legend.includes(r.category))).toBe(
      true,
    );
  });
});