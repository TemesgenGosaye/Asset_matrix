import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ queryRaw: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  default: { $queryRaw: mocks.queryRaw },
}));

vi.mock("@/lib/cache", () => ({
  cached: vi.fn(),
  invalidateCacheByPrefix: vi.fn(),
}));

import {
  filtersToAssetHref,
  filtersToSearchParams,
  normalizeCondition,
  parseFixedAssetAnalyticsFilters,
} from "../contract";
import { computeFixedAssetAnalytics, rawAnalyticsWhere } from "../service";

const adminContext = {
  organizationId: "org-1",
  isAdmin: true,
  assignedAssetIds: [],
  availableStatusIds: [],
};

const raw = {
  metrics: {
    total: 10,
    reviewed12m: 4,
    needsReview: 1,
    missingProperty: 0,
    ambiguous: 1,
    missingCondition: 0,
    missingSecondReview: 3,
    duplicateKeys: [],
    duplicatesAffected: 0,
  },
  departments: [
    { name: "Production", value: 8 },
    { name: "Survey", value: 2 },
  ],
  categories: [
    { name: "IT", value: 6 },
    { name: "Furniture", value: 4 },
  ],
  conditions: [
    { name: "good", value: 2 },
    { name: "God", value: 6 },
    { name: "n/f", value: 2 },
  ],
  conditionPairs: [
    { condition1: "good", condition2: "God", value: 2 },
    { condition1: "n/f", condition2: "good", value: 3 },
    { condition1: "God", condition2: "God", value: 5 },
  ],
  departmentConditions: [
    { department: "Production", condition: "God", value: 6 },
    { department: "Production", condition: "n/f", value: 2 },
    { department: "Survey", condition: "good", value: 2 },
  ],
  departmentCategories: [
    { department: "Production", category: "IT", value: 6 },
    { department: "Production", category: "Furniture", value: 2 },
  ],
  locations: [
    { name: "Store A", value: 7 },
    { name: "Store B", value: 3 },
  ],
  moves: [{ fromName: "Store A", toName: "Store B", value: 2 }],
  timeline: [{ month: "2026-11", reviewed: 4, good: 3 }],
  overdue: [
    {
      id: "asset-1",
      name: "Laptop",
      propertyNo: "PROP-1",
      department: "Survey",
      condition: "God",
      reviewDate: null,
    },
  ],
};

beforeEach(() => {
  mocks.queryRaw.mockReset();
});

describe("fixed asset analytics contracts", () => {
  it("parses filters from URL and object inputs and rejects invalid ranges", () => {
    expect(
      parseFixedAssetAnalyticsFilters(
        new URLSearchParams("department=Survey&category=IT&condition=Good"),
      ),
    ).toEqual({ department: "Survey", category: "IT", condition: "Good" });
    expect(
      parseFixedAssetAnalyticsFilters({ from: ["2026-01-01", "2026-02-01"] }),
    ).toEqual({ from: "2026-01-01" });
    expect(
      parseFixedAssetAnalyticsFilters({ from: "2026-02-01", to: "2026-01-01" }),
    ).toEqual({});
  });

  it("serializes filters for the analytics API and register drill-through", () => {
    const params = filtersToSearchParams({
      department: "Survey",
      category: "IT",
      condition: "Good",
      from: "2026-01-01",
      to: "2026-01-31",
    });
    expect(params.get("category")).toBe("IT");
    expect(
      filtersToAssetHref({
        department: "Survey",
        category: "IT",
        condition: "Good",
        from: "2026-01-01",
        to: "2026-01-31",
      }),
    ).toBe(
      "/assets?department=Survey&categoryCode=IT&condition=Good&reviewFrom=2026-01-01&reviewTo=2026-01-31",
    );
  });

  it("normalizes common condition variants", () => {
    expect(normalizeCondition("God")).toBe("Good");
    expect(normalizeCondition("god")).toBe("Good");
    expect(normalizeCondition(" n/f ")).toBe("N/F");
    expect(normalizeCondition("")).toBe("Unclassified");
  });
});

describe("rawAnalyticsWhere", () => {
  it("applies organization, RBAC, department, category, condition and date scopes", () => {
    const where = rawAnalyticsWhere(
      {
        department: "Survey",
        category: "IT",
        condition: "God",
        from: "2026-01-01",
        to: "2026-01-31",
      },
      {
        organizationId: "org-1",
        isAdmin: false,
        assignedAssetIds: ["asset-1"],
        availableStatusIds: ["status-1"],
      },
    );
    const sql = where.sql;
    expect(sql).toContain('"organizationId"');
    expect(sql).toContain('"assetid"');
    expect(sql).toContain('"statustypeid"');
    expect(sql).toContain('"sourceDepartment"');
    expect(sql).toContain('"categoryCode"');
    expect(sql).toContain('"condition2Raw"');
    expect(sql).toContain('"reviewDate1"');
    expect(sql).toContain('"reviewsDate"');
  });
});

describe("computeFixedAssetAnalytics", () => {
  it("maps raw aggregate data into the dashboard contract", async () => {
    mocks.queryRaw.mockResolvedValue([raw]);

    const data = await computeFixedAssetAnalytics({}, adminContext);

    expect(data.totals).toMatchObject({
      assets: 10,
      departments: 2,
      categories: 2,
      locations: 2,
      reviewed12m: 4,
      goodShare: 80,
      needsReview: 1,
    });
    expect(data.facets.departments).toContain("Survey");
    expect(data.departments.map((department) => department.name)).toEqual([
      "Production",
      "Survey",
    ]);
    expect(data.conditionMix).toEqual([
      { name: "Good", value: 8 },
      { name: "N/F", value: 2 },
    ]);
    expect(data.reviewFlow.links).toEqual([
      { source: "N/F", target: "Good", value: 3 },
    ]);
    expect(data.timeline[0]).toEqual({
      month: "2026-11",
      reviewed: 4,
      goodShare: 75,
    });
    expect(data.overdue[0].condition).toBe("Good");
    expect(data.drillThroughHref).toBe("/assets");
    expect(data.timings.queryMs).toBeTypeOf("number");
  });
});
