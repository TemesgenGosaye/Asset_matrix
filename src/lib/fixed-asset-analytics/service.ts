import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { cached, invalidateCacheByPrefix } from "@/lib/cache";
import type { FixedAssetContext } from "@/lib/fixed-asset-api";
import {
  FIXED_ASSET_ANALYTICS_CACHE_PREFIX,
  filtersToAssetHref,
  normalizeCategory,
  normalizeCondition,
  normalizeDepartment,
  normalizeLocation,
  type ConditionDepartmentRow,
  type DataQualityRow,
  type DepartmentRow,
  type FixedAssetAnalyticsData,
  type FixedAssetAnalyticsFilters,
  type FixedAssetAnalyticsKpi,
  type FlowLink,
  type FlowNode,
  type HeatmapCell,
  type NamedValue,
  type OverdueAsset,
  type TimelinePoint,
} from "./contract";

const CACHE_TTL = 5 * 60 * 1000;

interface HeatmapRaw {
  department: string;
  category: string;
  value: number;
}

interface LocationRaw {
  name: string;
  value: number;
}

interface MoveRaw {
  fromName: string;
  toName: string;
  value: number;
}

interface AnalyticsMetricRow {
  total: number;
  reviewed12m: number;
  needsReview: number;
  missingProperty: number;
  ambiguous: number;
  missingCondition: number;
  missingSecondReview: number;
  duplicateKeys: string[];
  duplicatesAffected: number;
}

interface AnalyticsRawResult {
  metrics: AnalyticsMetricRow;
  departments: Array<{ name: string; value: number }>;
  categories: Array<{ name: string; value: number }>;
  conditions: Array<{ name: string; value: number }>;
  conditionPairs: Array<{
    condition1: string;
    condition2: string;
    value: number;
  }>;
  departmentConditions: Array<{
    department: string;
    condition: string;
    value: number;
  }>;
  departmentCategories: HeatmapRaw[];
  locations: LocationRaw[];
  moves: MoveRaw[];
  timeline: Array<{ month: string; reviewed: number; good: number }>;
  overdue: Array<{
    id: string;
    name: string;
    propertyNo: string;
    department: string;
    condition: string | null;
    reviewDate: string | null;
  }>;
}

function hash(parts: unknown[]): string {
  return createHash("sha1")
    .update(JSON.stringify(parts))
    .digest("hex")
    .slice(0, 16);
}

function percent(value: number, total: number): number {
  if (!total) return 0;
  return Math.round((value / total) * 1000) / 10;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function delta(current: number, previous: number): number | null {
  if (!previous) return current ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function withParam(href: string, key: string, value: string): string {
  const url = new URL(href, "http://analytics.local");
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

function column(alias: string, name: string): Prisma.Sql {
  return Prisma.sql`${Prisma.raw(alias)}.${Prisma.raw(`"${name}"`)}`;
}

export function rawAnalyticsWhere(
  filters: FixedAssetAnalyticsFilters,
  context: FixedAssetContext,
  alias = "a",
): Prisma.Sql {
  const c = (name: string) => column(alias, name);
  const conditions: Prisma.Sql[] = [
    Prisma.sql`${c("organizationId")} = ${context.organizationId}::uuid`,
  ];

  if (!context.isAdmin) {
    const assigned = context.assignedAssetIds.length
      ? Prisma.sql`${c("assetid")} IN (${Prisma.join(
          context.assignedAssetIds.map((id) => Prisma.sql`${id}::uuid`),
        )})`
      : Prisma.sql`false`;
    const statuses = context.availableStatusIds.length
      ? Prisma.sql`${c("statustypeid")} IN (${Prisma.join(
          context.availableStatusIds.map((id) => Prisma.sql`${id}::uuid`),
        )})`
      : Prisma.sql`false`;
    conditions.push(Prisma.sql`(${assigned} OR ${statuses})`);
  }

  if (filters.department) {
    const departmentConditions: Prisma.Sql[] = [
      Prisma.sql`COALESCE(NULLIF(BTRIM(${c("sourceDepartment")}), ''), 'Unassigned') = ${filters.department}`,
      Prisma.sql`${c("departmentCode")} = ${filters.department}`,
    ];
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        filters.department,
      )
    ) {
      departmentConditions.push(
        Prisma.sql`${c("departmentId")} = ${filters.department}::uuid`,
      );
    }
    conditions.push(Prisma.sql`(${Prisma.join(departmentConditions, " OR ")})`);
  }
  if (filters.category) {
    conditions.push(Prisma.sql`${c("categoryCode")} = ${filters.category}`);
  }
  if (filters.condition) {
    const statusAlias = Prisma.raw(`${alias}_status`);
    conditions.push(Prisma.sql`(
      ${c("condition1")} = ${filters.condition}
      OR ${c("condition1Raw")} = ${filters.condition}
      OR ${c("condition2Raw")} = ${filters.condition}
      OR EXISTS (
        SELECT 1
        FROM "statusType" ${statusAlias}
        WHERE ${statusAlias}."statustypeid" = ${c("statustypeid")}
          AND ${statusAlias}."statustypename" = ${filters.condition}
      )
    )`);
  }
  if (filters.from) {
    conditions.push(Prisma.sql`(
      ${c("reviewDate1")} >= ${filters.from}::date
      OR ${c("reviewsDate")} >= ${filters.from}::date
    )`);
  }
  if (filters.to) {
    conditions.push(Prisma.sql`(
      ${c("reviewDate1")} <= ${filters.to}::date
      OR ${c("reviewsDate")} <= ${filters.to}::date
    )`);
  }

  return Prisma.sql`${Prisma.join(conditions, " AND ")}`;
}

function buildAnalyticsQuery(
  filters: FixedAssetAnalyticsFilters,
  context: FixedAssetContext,
): Prisma.Sql {
  const where = rawAnalyticsWhere(filters, context, "a");
  return Prisma.sql`
    WITH filtered AS (
      SELECT a.*
      FROM "asset" a
      WHERE ${where}
    ),
    duplicate_keys AS (
      SELECT "propertyKey", COUNT(*)::int AS value
      FROM filtered
      WHERE "propertyKey" IS NOT NULL
      GROUP BY 1
      HAVING COUNT(*) > 1
    ),
    metrics AS (
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (
          WHERE "reviewDate1" >= CURRENT_DATE - INTERVAL '12 months'
             OR "reviewsDate" >= CURRENT_DATE - INTERVAL '12 months'
        )::int AS "reviewed12m",
        COUNT(*) FILTER (
          WHERE "serialnumber" = ''
             OR "propertyKey" IS NULL
             OR "propertyKey" IN (SELECT "propertyKey" FROM duplicate_keys)
             OR "reviewDate1Ambiguous" = true
             OR "reviewDate2Ambiguous" = true
             OR "condition1" IS NULL
        )::int AS "needsReview",
        COUNT(*) FILTER (
          WHERE "serialnumber" = '' OR "propertyKey" IS NULL
        )::int AS "missingProperty",
        COUNT(*) FILTER (
          WHERE "reviewDate1Ambiguous" = true OR "reviewDate2Ambiguous" = true
        )::int AS ambiguous,
        COUNT(*) FILTER (
          WHERE "condition1" IS NULL OR BTRIM("condition1") = ''
        )::int AS "missingCondition",
        COUNT(*) FILTER (
          WHERE "condition2Raw" IS NULL OR BTRIM("condition2Raw") = ''
        )::int AS "missingSecondReview",
        (SELECT COALESCE(json_agg("propertyKey"), '[]'::json) FROM duplicate_keys) AS "duplicateKeys",
        (SELECT COALESCE(SUM(value), 0)::int FROM duplicate_keys) AS "duplicatesAffected"
      FROM filtered
    ),
    departments AS (
      SELECT COALESCE(NULLIF(BTRIM("sourceDepartment"), ''), 'Unassigned') AS name,
             COUNT(*)::int AS value
      FROM filtered
      GROUP BY 1
    ),
    categories AS (
      SELECT COALESCE(NULLIF(BTRIM("categoryCode"), ''), 'Uncategorised') AS name,
             COUNT(*)::int AS value
      FROM filtered
      GROUP BY 1
    ),
    conditions AS (
      SELECT COALESCE(NULLIF(BTRIM("condition1"), ''), 'Unclassified') AS name,
             COUNT(*)::int AS value
      FROM filtered
      GROUP BY 1
    ),
    condition_pairs AS (
      SELECT COALESCE(NULLIF(BTRIM("condition1"), ''), 'Unclassified') AS first_condition,
             COALESCE(NULLIF(BTRIM("condition2Raw"), ''), 'Unclassified') AS second_condition,
             COUNT(*)::int AS value
      FROM filtered
      GROUP BY 1, 2
    ),
    department_conditions AS (
      SELECT COALESCE(NULLIF(BTRIM("sourceDepartment"), ''), 'Unassigned') AS department,
             COALESCE(NULLIF(BTRIM("condition1"), ''), 'Unclassified') AS condition,
             COUNT(*)::int AS value
      FROM filtered
      GROUP BY 1, 2
    ),
    top_depts AS (
      SELECT name FROM departments ORDER BY value DESC LIMIT 8
    ),
    top_cats AS (
      SELECT name FROM categories ORDER BY value DESC LIMIT 8
    ),
    department_categories AS (
      SELECT
        COALESCE(NULLIF(BTRIM(f."sourceDepartment"), ''), 'Unassigned') AS department,
        COALESCE(NULLIF(BTRIM(f."categoryCode"), ''), 'Uncategorised') AS category,
        COUNT(*)::int AS value
      FROM filtered f
      INNER JOIN top_depts d ON d.name = COALESCE(NULLIF(BTRIM(f."sourceDepartment"), ''), 'Unassigned')
      INNER JOIN top_cats c ON c.name = COALESCE(NULLIF(BTRIM(f."categoryCode"), ''), 'Uncategorised')
      GROUP BY 1, 2
    ),
    locations AS (
      SELECT COALESCE(NULLIF(BTRIM("location1"), ''), 'Unknown location') AS name,
             COUNT(*)::int AS value
      FROM filtered
      GROUP BY 1
    ),
    moves AS (
      SELECT COALESCE(NULLIF(BTRIM("location1"), ''), 'Unknown location') AS "fromName",
             COALESCE(NULLIF(BTRIM("location2Raw"), ''), 'Unknown location') AS "toName",
             COUNT(*)::int AS value
      FROM filtered
      WHERE NULLIF(BTRIM("location2Raw"), '') IS NOT NULL
        AND COALESCE(BTRIM("location1"), '') IS DISTINCT FROM COALESCE(BTRIM("location2Raw"), '')
      GROUP BY 1, 2
      ORDER BY value DESC
      LIMIT 8
    ),
    review_timeline AS (
      SELECT TO_CHAR("reviewDate1", 'YYYY-MM') AS month,
             COUNT(*)::int AS reviewed,
             COUNT(*) FILTER (WHERE UPPER("condition1") LIKE 'G%')::int AS good
      FROM filtered
      WHERE "reviewDate1" IS NOT NULL
      GROUP BY 1
    ),
    overdue_rows AS (
      SELECT
        "assetid" AS id,
        "assetname" AS name,
        COALESCE(NULLIF("propertyKey", ''), NULLIF("serialnumber", ''), NULLIF("financeNo1", ''), '—') AS "propertyNo",
        COALESCE(NULLIF(BTRIM("sourceDepartment"), ''), 'Unassigned') AS department,
        "condition1" AS condition,
        TO_CHAR("reviewDate1", 'YYYY-MM-DD') AS "reviewDate"
      FROM filtered
      WHERE "reviewDate1" < CURRENT_DATE - INTERVAL '12 months'
         OR "reviewDate1" IS NULL
         OR "reviewDate1Ambiguous" = true
      ORDER BY "reviewDate1" ASC NULLS FIRST, "assetname" ASC
      LIMIT 8
    )
    SELECT
      row_to_json(m) AS metrics,
      COALESCE(departments_json.departments, '[]'::json) AS departments,
      COALESCE(categories_json.categories, '[]'::json) AS categories,
      COALESCE(conditions_json.conditions, '[]'::json) AS conditions,
      COALESCE(pairs_json.pairs, '[]'::json) AS "conditionPairs",
      COALESCE(department_conditions_json.items, '[]'::json) AS "departmentConditions",
      COALESCE(department_categories_json.cells, '[]'::json) AS "departmentCategories",
      COALESCE(locations_json.locations, '[]'::json) AS locations,
      COALESCE(moves_json.moves, '[]'::json) AS moves,
      COALESCE(timeline_json.timeline, '[]'::json) AS timeline,
      COALESCE(overdue_json.overdue, '[]'::json) AS overdue
    FROM metrics m
    CROSS JOIN (
      SELECT json_agg(json_build_object('name', name, 'value', value) ORDER BY value DESC) AS departments
      FROM departments
    ) departments_json
    CROSS JOIN (
      SELECT json_agg(json_build_object('name', name, 'value', value) ORDER BY value DESC) AS categories
      FROM categories
    ) categories_json
    CROSS JOIN (
      SELECT json_agg(json_build_object('name', name, 'value', value) ORDER BY value DESC) AS conditions
      FROM conditions
    ) conditions_json
    CROSS JOIN (
      SELECT json_agg(json_build_object(
        'condition1', first_condition,
        'condition2', second_condition,
        'value', value
      ) ORDER BY value DESC) AS pairs
      FROM condition_pairs
    ) pairs_json
    CROSS JOIN (
      SELECT json_agg(json_build_object(
        'department', department,
        'condition', condition,
        'value', value
      ) ORDER BY value DESC) AS items
      FROM department_conditions
    ) department_conditions_json
    CROSS JOIN (
      SELECT json_agg(json_build_object(
        'department', department,
        'category', category,
        'value', value
      )) AS cells
      FROM department_categories
    ) department_categories_json
    CROSS JOIN (
      SELECT json_agg(json_build_object('name', name, 'value', value) ORDER BY value DESC) AS locations
      FROM locations
    ) locations_json
    CROSS JOIN (
      SELECT json_agg(json_build_object(
        'fromName', "fromName",
        'toName', "toName",
        'value', value
      ) ORDER BY value DESC) AS moves
      FROM moves
    ) moves_json
    CROSS JOIN (
      SELECT json_agg(json_build_object(
        'month', month,
        'reviewed', reviewed,
        'good', good
      ) ORDER BY month ASC) AS timeline
      FROM review_timeline
    ) timeline_json
    CROSS JOIN (
      SELECT json_agg(json_build_object(
        'id', id,
        'name', name,
        'propertyNo', "propertyNo",
        'department', department,
        'condition', condition,
        'reviewDate', "reviewDate"
      )) AS overdue
      FROM overdue_rows
    ) overdue_json
  `;
}

function buildKpis(
  data: FixedAssetAnalyticsData,
  drillThroughHref: string,
): FixedAssetAnalyticsKpi[] {
  const timeline = data.timeline.length
    ? data.timeline
    : [{ month: "—", reviewed: 0, goodShare: 0 }];
  const recent = timeline.slice(-12);
  const prior = timeline.slice(-24, -12);
  const reviewedTrend = recent.map((point) => point.reviewed);
  const reviewedDelta = delta(
    sum(recent.map((p) => p.reviewed)),
    sum(prior.map((p) => p.reviewed)),
  );
  const recentShare = recent.length
    ? sum(recent.map((p) => p.goodShare)) / recent.length
    : 0;
  const priorShare = prior.length
    ? sum(prior.map((p) => p.goodShare)) / prior.length
    : 0;
  const shareDelta =
    prior.length && priorShare > 0
      ? Math.round(recentShare - priorShare)
      : null;

  return [
    {
      id: "total-assets",
      label: "Total assets",
      value: data.totals.assets,
      trend: reviewedDelta,
      sparkline: reviewedTrend,
      href: drillThroughHref,
      hint: "All fixed assets matching the active filters",
      variant: "brass",
      positiveIsGood: true,
    },
    {
      id: "department-coverage",
      label: "Departments",
      value: data.totals.departments,
      trend: reviewedDelta,
      sparkline: reviewedTrend.map((value) =>
        data.totals.departments ? value / data.totals.departments : 0,
      ),
      href: withParam(drillThroughHref, "groupBy", "department"),
      hint: "Departments represented in the filtered register",
      variant: "navy",
      positiveIsGood: true,
    },
    {
      id: "reviewed-12m",
      label: "Reviewed (12m)",
      value: data.totals.reviewed12m,
      trend: reviewedDelta,
      sparkline: reviewedTrend,
      href: withParam(drillThroughHref, "needsReview", "true"),
      hint: "Assets with a first or second review date in the last 12 months",
      variant: "success",
      positiveIsGood: true,
    },
    {
      id: "good-condition",
      label: "Good condition",
      value: data.totals.goodShare,
      unit: "percent",
      trend: shareDelta,
      sparkline: recent.map((point) => point.goodShare),
      href: withParam(drillThroughHref, "conditions", "Good"),
      hint: "Share of first-review condition recorded as Good",
      variant: "success",
      positiveIsGood: true,
    },
    {
      id: "needs-review",
      label: "Needs attention",
      value: data.totals.needsReview,
      trend: reviewedDelta,
      sparkline: reviewedTrend.map((value, index) =>
        recent.length - index <= 3 ? value : value / 2,
      ),
      href: withParam(drillThroughHref, "needsReview", "true"),
      hint: "Missing property numbers, ambiguous reviews, duplicates, or no condition",
      variant: "warning",
      positiveIsGood: false,
    },
  ];
}

export async function computeFixedAssetAnalytics(
  filters: FixedAssetAnalyticsFilters,
  context: FixedAssetContext,
): Promise<FixedAssetAnalyticsData> {
  const startedAt = Date.now();
  const queryStartedAt = Date.now();
  const [raw] = await prisma.$queryRaw<AnalyticsRawResult[]>(
    buildAnalyticsQuery(filters, context),
  );
  const queryMs = Date.now() - queryStartedAt;
  if (!raw) throw new Error("Fixed asset analytics query returned no data");

  const {
    metrics,
    departments: departmentRowsRaw,
    categories: categoryRowsRaw,
    conditions: conditionRowsRaw,
    conditionPairs,
    departmentConditions,
    departmentCategories: heatmapRaw,
    locations: locationRowsRaw,
    moves: moveRowsRaw,
    timeline: timelineRaw,
    overdue: overdueRaw,
  } = raw;
  const total = metrics.total;

  const departmentsMap = new Map<string, DepartmentRow>();
  for (const group of departmentRowsRaw) {
    const name = normalizeDepartment(group.name);
    departmentsMap.set(name, {
      name,
      value: group.value,
      good: 0,
      notFit: 0,
      scrap: 0,
      unclassified: 0,
      share: percent(group.value, total),
    });
  }
  for (const group of departmentConditions) {
    const row = departmentsMap.get(normalizeDepartment(group.department));
    if (!row) continue;
    const condition = normalizeCondition(group.condition);
    if (condition === "Good") row.good += group.value;
    else if (condition === "N/F") row.notFit += group.value;
    else if (condition === "Scrap/Demolished") row.scrap += group.value;
    else row.unclassified += group.value;
  }
  const departments = [...departmentsMap.values()].sort(
    (a, b) => b.value - a.value,
  );

  const conditionsMap = new Map<string, number>();
  let goodCount = 0;
  for (const group of conditionRowsRaw) {
    const name = normalizeCondition(group.name);
    conditionsMap.set(name, (conditionsMap.get(name) ?? 0) + group.value);
    if (name === "Good") goodCount += group.value;
  }
  const conditionMix: NamedValue[] = [...conditionsMap.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const flowMap = new Map<string, number>();
  for (const group of conditionPairs) {
    const source = normalizeCondition(group.condition1);
    const target = normalizeCondition(group.condition2);
    if (source === target) continue;
    const key = `${source}→${target}`;
    flowMap.set(key, (flowMap.get(key) ?? 0) + group.value);
  }
  const links: FlowLink[] = [...flowMap.entries()]
    .map(([key, value]) => {
      const [source, target] = key.split("→");
      return { source, target, value };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);
  const activeNodes = new Set<string>();
  for (const link of links) {
    activeNodes.add(link.source);
    activeNodes.add(link.target);
  }
  const nodes: FlowNode[] = [...activeNodes].map((name, index) => ({
    id: name,
    name,
    depth: index % 2,
  }));

  const conditionByDepartment: ConditionDepartmentRow[] = departments
    .slice(0, 10)
    .map((department) => ({
      department: department.name,
      good: department.good,
      notFit: department.notFit,
      scrap: department.scrap,
      unclassified: department.unclassified,
    }));

  const categoryTotals = new Map<string, number>();
  for (const group of categoryRowsRaw) {
    const name = normalizeCategory(group.name);
    categoryTotals.set(name, (categoryTotals.get(name) ?? 0) + group.value);
  }
  const heatValues = new Map<string, number>();
  for (const group of heatmapRaw) {
    heatValues.set(`${group.department}|${group.category}`, group.value);
  }
  const departmentCategories: HeatmapCell[] = departmentRowsRaw
    .slice(0, 8)
    .flatMap((department) =>
      categoryRowsRaw.slice(0, 8).map((category) => ({
        department: normalizeDepartment(department.name),
        category: normalizeCategory(category.name),
        value:
          heatValues.get(
            `${normalizeDepartment(department.name)}|${normalizeCategory(category.name)}`,
          ) ?? 0,
      })),
    );

  const locationTotals = new Map<string, number>();
  for (const group of locationRowsRaw) {
    locationTotals.set(normalizeLocation(group.name), group.value);
  }
  const locations: NamedValue[] = [...locationTotals.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const locationMoves = moveRowsRaw.map((move) => ({
    from: normalizeLocation(move.fromName),
    to: normalizeLocation(move.toName),
    value: move.value,
  }));

  const timeline: TimelinePoint[] = timelineRaw.map((point) => ({
    month: point.month,
    reviewed: point.reviewed,
    goodShare: percent(point.good, point.reviewed),
  }));

  const overdue: OverdueAsset[] = overdueRaw.map((row) => ({
    id: row.id,
    name: row.name,
    propertyNo: row.propertyNo,
    department: normalizeDepartment(row.department),
    condition: normalizeCondition(row.condition),
    reviewDate: row.reviewDate,
  }));

  const dataQuality: DataQualityRow[] = [
    {
      field: "Property number",
      completeness: percent(total - metrics.missingProperty, total),
      issues: metrics.missingProperty,
      total,
    },
    {
      field: "Condition",
      completeness: percent(total - metrics.missingCondition, total),
      issues: metrics.missingCondition,
      total,
    },
    {
      field: "Review date",
      completeness: percent(total - metrics.ambiguous, total),
      issues: metrics.ambiguous,
      total,
    },
    {
      field: "Unique property number",
      completeness: percent(total - metrics.duplicatesAffected, total),
      issues: metrics.duplicatesAffected,
      total,
    },
    {
      field: "Second review",
      completeness: percent(total - metrics.missingSecondReview, total),
      issues: metrics.missingSecondReview,
      total,
    },
  ];

  const drillThroughHref = filtersToAssetHref(filters);
  const data: FixedAssetAnalyticsData = {
    generatedAt: new Date().toISOString(),
    filters,
    facets: {
      departments: departmentRowsRaw.map((row) =>
        normalizeDepartment(row.name),
      ),
      categories: [...categoryTotals.keys()].sort((a, b) => a.localeCompare(b)),
      conditions: [...conditionsMap.keys()].sort((a, b) => a.localeCompare(b)),
    },
    totals: {
      assets: total,
      departments: departments.length,
      categories: categoryTotals.size,
      locations: locationTotals.size,
      reviewed12m: metrics.reviewed12m,
      goodShare: percent(goodCount, total),
      needsReview: metrics.needsReview,
    },
    kpis: [],
    departments: departments.slice(0, 20),
    departmentCategories,
    conditionMix,
    conditionByDepartment,
    reviewFlow: { nodes, links },
    timeline,
    overdue,
    locations,
    locationMoves,
    dataQuality,
    timings: {
      queryMs,
      totalMs: Date.now() - startedAt,
    },
    drillThroughHref,
  };
  data.kpis = buildKpis(data, drillThroughHref);
  return data;
}

export async function loadFixedAssetAnalytics(
  filters: FixedAssetAnalyticsFilters,
  context: FixedAssetContext,
): Promise<FixedAssetAnalyticsData> {
  const key = `${FIXED_ASSET_ANALYTICS_CACHE_PREFIX}${hash([
    context.organizationId,
    context.isAdmin,
    context.assignedAssetIds,
    context.availableStatusIds,
    filters,
  ])}`;
  return cached(
    key,
    () => computeFixedAssetAnalytics(filters, context),
    CACHE_TTL,
  );
}

export async function invalidateFixedAssetAnalytics(): Promise<void> {
  await invalidateCacheByPrefix(FIXED_ASSET_ANALYTICS_CACHE_PREFIX);
}
