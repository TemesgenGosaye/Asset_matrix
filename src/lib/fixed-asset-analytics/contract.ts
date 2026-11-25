import { z } from "zod";

export const FIXED_ASSET_ANALYTICS_ENTITY = "fixed_asset_analytics";
export const FIXED_ASSET_ANALYTICS_CACHE_PREFIX = "fixed_asset_analytics:v1:";

const text = z.string().trim().min(1).max(255);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const fixedAssetAnalyticsFiltersSchema = z
  .object({
    department: text.optional(),
    category: text.optional(),
    condition: text.optional(),
    from: date.optional(),
    to: date.optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "from must be on or before to",
  });

export type FixedAssetAnalyticsFilters = z.infer<
  typeof fixedAssetAnalyticsFiltersSchema
>;

export interface FixedAssetAnalyticsKpi {
  id: string;
  label: string;
  value: number;
  unit?: "percent";
  trend: number | null;
  sparkline: number[];
  href: string;
  hint: string;
  variant: "brass" | "navy" | "success" | "warning" | "destructive";
  positiveIsGood: boolean;
}

export interface NamedValue {
  name: string;
  value: number;
}

export interface DepartmentRow extends NamedValue {
  good: number;
  notFit: number;
  scrap: number;
  unclassified: number;
  share: number;
}

export interface HeatmapCell {
  department: string;
  category: string;
  value: number;
}

export interface ConditionDepartmentRow {
  department: string;
  good: number;
  notFit: number;
  scrap: number;
  unclassified: number;
}

export interface FlowNode {
  id: string;
  name: string;
  depth: number;
}

export interface FlowLink {
  source: string;
  target: string;
  value: number;
}

export interface TimelinePoint {
  month: string;
  reviewed: number;
  goodShare: number;
}

export interface OverdueAsset {
  id: string;
  name: string;
  propertyNo: string;
  department: string;
  condition: string;
  reviewDate: string | null;
}

export interface LocationMove {
  from: string;
  to: string;
  value: number;
}

export interface DataQualityRow {
  field: string;
  completeness: number;
  issues: number;
  total: number;
}

export interface FixedAssetAnalyticsData {
  generatedAt: string;
  filters: FixedAssetAnalyticsFilters;
  facets: {
    departments: string[];
    categories: string[];
    conditions: string[];
  };
  totals: {
    assets: number;
    departments: number;
    categories: number;
    locations: number;
    reviewed12m: number;
    goodShare: number;
    needsReview: number;
  };
  kpis: FixedAssetAnalyticsKpi[];
  departments: DepartmentRow[];
  departmentCategories: HeatmapCell[];
  conditionMix: NamedValue[];
  conditionByDepartment: ConditionDepartmentRow[];
  reviewFlow: { nodes: FlowNode[]; links: FlowLink[] };
  timeline: TimelinePoint[];
  overdue: OverdueAsset[];
  locations: NamedValue[];
  locationMoves: LocationMove[];
  dataQuality: DataQualityRow[];
  timings: Record<string, number>;
  drillThroughHref: string;
}

type FilterInput =
  | URLSearchParams
  | Record<string, string | string[] | undefined>
  | null
  | undefined;

function readValue(input: FilterInput, key: string): string | undefined {
  if (!input) return undefined;
  if (input instanceof URLSearchParams) return input.get(key) ?? undefined;
  const value = (input as Record<string, string | string[] | undefined>)[key];
  return Array.isArray(value) ? value[0] : value;
}

export function parseFixedAssetAnalyticsFilters(
  input: FilterInput,
): FixedAssetAnalyticsFilters {
  const raw = {
    department: readValue(input, "department"),
    category: readValue(input, "category"),
    condition: readValue(input, "condition"),
    from: readValue(input, "from"),
    to: readValue(input, "to"),
  };
  const result = fixedAssetAnalyticsFiltersSchema.safeParse(raw);
  return result.success ? result.data : {};
}

export function filtersToSearchParams(
  filters: FixedAssetAnalyticsFilters,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return params;
}

export function filtersToAssetHref(
  filters: FixedAssetAnalyticsFilters,
): string {
  const params = new URLSearchParams();
  if (filters.department) params.set("department", filters.department);
  if (filters.category) params.set("categoryCode", filters.category);
  if (filters.condition) params.set("condition", filters.condition);
  if (filters.from) params.set("reviewFrom", filters.from);
  if (filters.to) params.set("reviewTo", filters.to);
  const query = params.toString();
  return query ? `/assets?${query}` : "/assets";
}

export function normalizeCondition(value: string | null | undefined): string {
  const raw = (value ?? "").trim().toUpperCase();
  if (!raw || raw === "UNKNOWN" || raw === "N/A") return "Unclassified";
  if (raw === "G" || raw.startsWith("GO") || raw.includes("GOOD"))
    return "Good";
  if (raw.includes("SCRAP") || raw.includes("DEMOL") || raw.includes("DEMON")) {
    return "Scrap/Demolished";
  }
  if (raw === "N" || raw.includes("N/F") || raw.includes("N.F")) return "N/F";
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function normalizeDepartment(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  return raw || "Unassigned";
}

export function normalizeCategory(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  return raw || "Uncategorised";
}

export function normalizeLocation(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  return raw || "Unknown location";
}
