import type { HouseAnalyticsRange } from "./contract";

export type HouseStatusBucket =
  "free" | "occupied" | "awaitingInspection" | "inactive";

export interface ResolvedRange {
  from: Date;
  to: Date;
  fromKey: string;
  toKey: string;
  months: string[];
}

export interface HouseStatusInput {
  id: string;
  status: string;
  occupancyStatus: string;
  damaged: boolean;
}

export type MonthlyFlow =
  | "allocations"
  | "releases"
  | "requests"
  | "housesAdded"
  | "inspectionsCompleted";

export interface MonthlyCountRow {
  month: string;
  kind: MonthlyFlow;
  count: number;
}

export interface MonthlyPoint {
  month: string;
  label: string;
  allocations: number;
  releases: number;
  requests: number;
  housesAdded: number;
  inspectionsCompleted: number;
}

export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function addUtcMonths(date: Date, amount: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1),
  );
}

export function monthLabel(key: string): string {
  const [year, month] = key.split("-");
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

export function resolveRange(
  range: HouseAnalyticsRange,
  now: Date,
  custom?: { from?: string; to?: string },
): ResolvedRange {
  const current = startOfUtcMonth(now);
  let from: Date;
  let to: Date;

  if (range === "custom" && custom?.from && custom.to) {
    from = startOfUtcMonth(new Date(`${custom.from}T00:00:00.000Z`));
    to = startOfUtcMonth(new Date(`${custom.to}T00:00:00.000Z`));
  } else if (range === "last_month") {
    from = addUtcMonths(current, -1);
    to = from;
  } else if (range === "quarter") {
    from = addUtcMonths(current, -2);
    to = current;
  } else if (range === "year") {
    from = addUtcMonths(current, -11);
    to = current;
  } else {
    from = current;
    to = current;
  }

  const months: string[] = [];
  for (let cursor = from; cursor <= to; cursor = addUtcMonths(cursor, 1)) {
    months.push(monthKey(cursor));
  }

  return {
    from,
    to: addUtcMonths(to, 1),
    fromKey: monthKey(from),
    toKey: monthKey(to),
    months,
  };
}

export function trailingMonths(now: Date, count = 12): string[] {
  const current = startOfUtcMonth(now);
  return Array.from({ length: count }, (_, index) =>
    monthKey(addUtcMonths(current, index - (count - 1))),
  );
}

export function previousMonthKeys(months: readonly string[]): string[] {
  return months.map((month) =>
    monthKey(addUtcMonths(new Date(`${month}-01T00:00:00.000Z`), -1)),
  );
}

export function percentChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

export function classifyHouseStatus(
  house: HouseStatusInput,
  liveHouseIds: ReadonlySet<string>,
  awaitingInspectionIds: ReadonlySet<string>,
): HouseStatusBucket {
  if (house.occupancyStatus === "Occupied") return "occupied";
  if (
    house.status === "PendingInspection" ||
    house.status === "UnderMaintenance" ||
    awaitingInspectionIds.has(house.id)
  ) {
    return "awaitingInspection";
  }
  if (house.status === "Inactive" || house.damaged) return "inactive";
  if (
    house.status === "Active" &&
    house.occupancyStatus === "Vacant" &&
    !liveHouseIds.has(house.id)
  ) {
    return "free";
  }
  return "inactive";
}

export function buildMonthlySeries(
  rows: readonly MonthlyCountRow[],
  months: readonly string[],
): MonthlyPoint[] {
  const lookup = new Map<string, MonthlyPoint>();
  for (const month of months) {
    lookup.set(month, {
      month,
      label: monthLabel(month),
      allocations: 0,
      releases: 0,
      requests: 0,
      housesAdded: 0,
      inspectionsCompleted: 0,
    });
  }
  for (const row of rows) {
    const point = lookup.get(row.month);
    if (point) point[row.kind] = row.count;
  }
  return months.map((month) => lookup.get(month)!);
}

export function sumMonth(
  series: readonly MonthlyPoint[],
  keys: readonly string[],
  kind: MonthlyFlow,
): number {
  const selected = new Set(keys);
  return series
    .filter((point) => selected.has(point.month))
    .reduce((total, point) => total + point[kind], 0);
}

export function sparkFor(
  series: readonly MonthlyPoint[],
  kind: MonthlyFlow,
): number[] {
  return series.map((point) => point[kind]);
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
