import { describe, expect, it } from "vitest";
import {
  buildMonthlySeries,
  classifyHouseStatus,
  percentChange,
  previousMonthKeys,
  resolveRange,
  sparkFor,
  sumMonth,
  trailingMonths,
} from "../aggregate";
import { houseAnalyticsQuerySchema } from "../contract";

describe("house analytics month boundaries", () => {
  const now = new Date("2026-11-20T10:30:00.000Z");

  it("uses the whole current UTC month for month range", () => {
    const range = resolveRange("month", now);
    expect(range.fromKey).toBe("2026-11");
    expect(range.toKey).toBe("2026-11");
    expect(range.from.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(range.months).toEqual(["2026-11"]);
  });

  it("rolls back correctly over a year boundary", () => {
    expect(
      resolveRange("last_month", new Date("2026-01-15T00:00:00Z")),
    ).toMatchObject({
      fromKey: "2025-12",
      toKey: "2025-12",
    });
    expect(
      resolveRange("year", new Date("2026-02-02T00:00:00Z")).months,
    ).toEqual([
      "2025-03",
      "2025-04",
      "2025-05",
      "2025-06",
      "2025-07",
      "2025-08",
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  it("honours custom month keys", () => {
    const range = resolveRange("custom", now, {
      from: "2026-08-17",
      to: "2026-10-02",
    });
    expect(range.months).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(previousMonthKeys(range.months)).toEqual([
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
  });

  it("builds twelve trailing months", () => {
    const months = trailingMonths(now);
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2025-12");
    expect(months[11]).toBe("2026-11");
  });
});

describe("house status classification", () => {
  const live = new Set(["live-house"]);
  const awaiting = new Set(["inspection-house"]);

  const base = {
    status: "Active",
    occupancyStatus: "Vacant",
    damaged: false,
  };

  it("treats an active vacant house with no live allocation as free", () => {
    expect(
      classifyHouseStatus({ ...base, id: "free-house" }, live, awaiting),
    ).toBe("free");
  });

  it("does not double-count a house that is live-allocated", () => {
    expect(
      classifyHouseStatus({ ...base, id: "live-house" }, live, awaiting),
    ).toBe("inactive");
  });

  it("prioritises physical occupancy over stock status", () => {
    expect(
      classifyHouseStatus(
        { ...base, id: "occupied-house", occupancyStatus: "Occupied" },
        live,
        awaiting,
      ),
    ).toBe("occupied");
  });

  it("prioritises unresolved inspections over vacancy", () => {
    expect(
      classifyHouseStatus({ ...base, id: "inspection-house" }, live, awaiting),
    ).toBe("awaitingInspection");
  });

  it("counts damaged and inactive houses once", () => {
    expect(
      classifyHouseStatus(
        { ...base, id: "damaged-house", damaged: true },
        live,
        awaiting,
      ),
    ).toBe("inactive");
  });
});

describe("monthly aggregation", () => {
  it("fills missing months with zeros", () => {
    const series = buildMonthlySeries(
      [{ month: "2026-10", kind: "requests", count: 3 }],
      ["2026-09", "2026-10", "2026-11"],
    );
    expect(series.map((point) => point.requests)).toEqual([0, 3, 0]);
    expect(sumMonth(series, ["2026-09", "2026-10"], "requests")).toBe(3);
    expect(sparkFor(series, "requests")).toEqual([0, 3, 0]);
  });

  it("returns an empty zeroed series for an empty database", () => {
    const series = buildMonthlySeries([], ["2026-10", "2026-11"]);
    expect(series).toHaveLength(2);
    expect(sumMonth(series, ["2026-10", "2026-11"], "allocations")).toBe(0);
    expect(sparkFor(series, "releases")).toEqual([0, 0]);
  });

  it("computes direction-aware percentage change", () => {
    expect(percentChange(12, 10)).toBe(20);
    expect(percentChange(8, 10)).toBe(-20);
    expect(percentChange(0, 0)).toBe(0);
    expect(percentChange(5, 0)).toBe(100);
  });
});

describe("analytics query validation", () => {
  it("requires dates for a custom range", () => {
    expect(
      houseAnalyticsQuerySchema.safeParse({ range: "custom" }).success,
    ).toBe(false);
    expect(
      houseAnalyticsQuerySchema.safeParse({
        range: "custom",
        from: "2026-01-01",
        to: "2026-03-01",
      }).success,
    ).toBe(true);
  });

  it("accepts only canonical house types", () => {
    expect(
      houseAnalyticsQuerySchema.safeParse({ houseType: "Z" }).success,
    ).toBe(false);
    expect(
      houseAnalyticsQuerySchema.safeParse({ houseType: "Staff" }).success,
    ).toBe(true);
  });
});
