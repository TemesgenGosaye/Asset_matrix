"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  Sankey,
  Treemap,
  XAxis,
  YAxis,
} from "recharts";
import { RefreshCw, TriangleAlert } from "lucide-react";
import ChartCard from "@/components/dashboard/analytics/ChartCard";
import SavedFilters from "@/components/SavedFilters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import {
  FIXED_ASSET_ANALYTICS_ENTITY,
  filtersToAssetHref,
  filtersToSearchParams,
  parseFixedAssetAnalyticsFilters,
  type FixedAssetAnalyticsData,
  type FixedAssetAnalyticsFilters,
} from "@/lib/fixed-asset-analytics/contract";
import ChartExportButtons from "./ChartExportButtons";
import FixedAssetAnalyticsSkeleton from "./FixedAssetAnalyticsSkeleton";
import FixedAssetKpiCard from "./FixedAssetKpiCard";

type CsvValue = string | number | boolean | null | undefined;
type CsvRow = Record<string, CsvValue>;

function toCsvRows<T extends object>(rows: readonly T[]): CsvRow[] {
  return rows as unknown as CsvRow[];
}

const chartConfig = {
  assets: { label: "Assets", color: "hsl(var(--chart-1))" },
  reviewed: { label: "Reviewed", color: "hsl(var(--chart-1))" },
  good: { label: "Good", color: "hsl(var(--chart-2))" },
  notFit: { label: "N/F", color: "hsl(var(--chart-3))" },
  scrap: { label: "Scrap/Demolished", color: "hsl(var(--chart-4))" },
  unclassified: { label: "Unclassified", color: "hsl(var(--chart-5))" },
  movement: { label: "Moved assets", color: "hsl(var(--chart-4))" },
  link: { label: "Condition flow", color: "hsl(var(--chart-2))" },
} satisfies ChartConfig;

const conditionColors: Record<string, string> = {
  Good: "var(--color-good)",
  "N/F": "var(--color-notFit)",
  "Scrap/Demolished": "var(--color-scrap)",
  Unclassified: "var(--color-unclassified)",
};

function compact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="text-muted-foreground flex h-full min-h-24 items-center justify-center px-3 text-center text-xs">
      {label}
    </div>
  );
}

function ChartTable({
  caption,
  rows,
}: {
  caption: string;
  rows: ReadonlyArray<CsvRow>;
}) {
  if (!rows.length) return null;
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            {columns.map((column) => (
              <td key={column}>{String(row[column] ?? "")}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface ChartFrameProps {
  title: string;
  description?: string;
  eyebrow?: string;
  filename: string;
  rows: ReadonlyArray<CsvRow>;
  caption: string;
  children: ReactNode;
  className?: string;
  empty?: boolean;
}

function ChartFrame({
  title,
  description,
  eyebrow,
  filename,
  rows,
  caption,
  children,
  className,
  empty = false,
}: ChartFrameProps) {
  const targetRef = useRef<HTMLDivElement>(null);
  return (
    <ChartCard
      title={title}
      description={description}
      eyebrow={eyebrow}
      className={className}
      action={
        <ChartExportButtons
          targetRef={targetRef}
          csvData={rows}
          filename={filename}
        />
      }
    >
      <div ref={targetRef} className="h-full min-h-0 w-full">
        {empty ? (
          <EmptyState label="No data for the active filters" />
        ) : (
          children
        )}
      </div>
      <ChartTable caption={caption} rows={rows} />
    </ChartCard>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="min-w-0">
      <span className="text-muted-foreground mb-1 block text-[10px] font-semibold tracking-[0.12em] uppercase">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border-input bg-background h-8 w-full min-w-0 rounded-lg border px-2 text-xs"
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

interface FixedAssetAnalyticsDashboardProps {
  initialData?: FixedAssetAnalyticsData;
  initialFilters?: FixedAssetAnalyticsFilters;
  embedded?: boolean;
}

export default function FixedAssetAnalyticsDashboard({
  initialData,
  initialFilters = {},
  embedded = false,
}: FixedAssetAnalyticsDashboardProps) {
  const router = useRouter();
  const [data, setData] = useState<FixedAssetAnalyticsData | null>(
    initialData ?? null,
  );
  const [filters, setFilters] = useState<FixedAssetAnalyticsFilters>(
    initialData?.filters ?? initialFilters,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const skipInitialFetch = useRef(Boolean(initialData));

  useEffect(() => {
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false;
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(
      async () => {
        setLoading(true);
        setError(null);
        try {
          const query = filtersToSearchParams(filters).toString();
          const response = await fetch(
            `/api/dashboard/fixed-asset-analytics${query ? `?${query}` : ""}`,
            { signal: controller.signal },
          );
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(
              payload.error || "Failed to load fixed asset analytics",
            );
          }
          setData(payload as FixedAssetAnalyticsData);
          window.history.replaceState(
            null,
            "",
            `/dashboard${query ? `?${query}` : ""}`,
          );
        } catch (caught) {
          if ((caught as Error).name !== "AbortError") {
            setError(
              (caught as Error).message ||
                "Failed to load fixed asset analytics",
            );
          }
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      },
      initialData ? 250 : 0,
    );

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [filters, initialData, reloadKey]);

  const setFilter = (key: keyof FixedAssetAnalyticsFilters, value: string) => {
    setFilters((current) => ({
      ...current,
      [key]: value || undefined,
    }));
  };

  const drill = (override: FixedAssetAnalyticsFilters = {}) => {
    router.push(filtersToAssetHref({ ...filters, ...override }));
  };

  const departmentRows = useMemo(
    () =>
      data?.departments.slice(0, 10).map((row) => ({
        name: row.name,
        assets: row.value,
      })) ?? [],
    [data?.departments],
  );
  const conditionStackRows = useMemo(
    () =>
      data?.conditionByDepartment.map((row) => ({
        department: row.department,
        good: row.good,
        notFit: row.notFit,
        scrap: row.scrap,
        unclassified: row.unclassified,
      })) ?? [],
    [data?.conditionByDepartment],
  );
  const locationRows = useMemo(
    () =>
      data?.locations.map((row) => ({ name: row.name, assets: row.value })) ??
      [],
    [data?.locations],
  );
  const movementRows = useMemo(
    () =>
      data?.locationMoves.map((row) => ({
        route: `${row.from} → ${row.to}`,
        assets: row.value,
      })) ?? [],
    [data?.locationMoves],
  );
  const heatMax = useMemo(
    () =>
      Math.max(
        1,
        ...(data?.departmentCategories.map((cell) => cell.value) ?? []),
      ),
    [data?.departmentCategories],
  );
  const heatDepartments = useMemo(
    () =>
      Array.from(
        new Set(
          data?.departmentCategories.map((cell) => cell.department) ?? [],
        ),
      ),
    [data?.departmentCategories],
  );
  const heatCategories = useMemo(
    () =>
      Array.from(
        new Set(data?.departmentCategories.map((cell) => cell.category) ?? []),
      ),
    [data?.departmentCategories],
  );

  if (!data) {
    return (
      <div className={cn("flex min-h-0 flex-col", embedded && "h-full")}>
        {error ? (
          <div className="border-destructive/30 bg-destructive/5 flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border p-6 text-center">
            <TriangleAlert className="text-destructive h-5 w-5" />
            <p className="max-w-md text-sm font-medium">{error}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setReloadKey((value) => value + 1)}
            >
              Retry
            </Button>
          </div>
        ) : (
          <FixedAssetAnalyticsSkeleton />
        )}
      </div>
    );
  }

  const onDepartmentClick = (entry: unknown) => {
    const payload = entry as { payload?: { name?: string } };
    if (payload.payload?.name) drill({ department: payload.payload.name });
  };

  return (
    <div
      className={cn("flex min-h-0 flex-col gap-2", embedded && "h-full")}
      aria-busy={loading}
    >
      <div className="border-border/70 bg-card/60 flex shrink-0 flex-wrap items-end gap-2 rounded-xl border p-2.5">
        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <FilterSelect
            label="Department"
            value={filters.department ?? ""}
            options={data.facets.departments}
            onChange={(value) => setFilter("department", value)}
          />
          <FilterSelect
            label="Category"
            value={filters.category ?? ""}
            options={data.facets.categories}
            onChange={(value) => setFilter("category", value)}
          />
          <FilterSelect
            label="Condition"
            value={filters.condition ?? ""}
            options={data.facets.conditions}
            onChange={(value) => setFilter("condition", value)}
          />
          <label className="min-w-0">
            <span className="text-muted-foreground mb-1 block text-[10px] font-semibold tracking-[0.12em] uppercase">
              Reviewed from
            </span>
            <Input
              type="date"
              value={filters.from ?? ""}
              onChange={(event) => setFilter("from", event.target.value)}
              className="h-8 text-xs"
            />
          </label>
          <label className="min-w-0">
            <span className="text-muted-foreground mb-1 block text-[10px] font-semibold tracking-[0.12em] uppercase">
              Reviewed to
            </span>
            <Input
              type="date"
              value={filters.to ?? ""}
              onChange={(event) => setFilter("to", event.target.value)}
              className="h-8 text-xs"
            />
          </label>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <SavedFilters
            entity={FIXED_ASSET_ANALYTICS_ENTITY}
            currentFilters={filters}
            onApplyFilter={(next) =>
              setFilters(
                parseFixedAssetAnalyticsFilters(
                  next as Record<string, string | string[] | undefined>,
                ),
              )
            }
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFilters({})}
            className="h-8"
          >
            Reset
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setReloadKey((value) => value + 1)}
            aria-label="Refresh analytics"
            title="Refresh analytics"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {error ? (
        <div className="border-destructive/40 bg-destructive/10 text-destructive flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs">
          <TriangleAlert className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">{error}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setReloadKey((value) => value + 1)}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {data.totals.assets === 0 ? (
        <div className="border-border/70 bg-card/60 shrink-0 rounded-xl border px-4 py-8 text-center">
          <p className="text-sm font-semibold">
            No fixed assets match these filters
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            Reset the filters or import the fixed asset register to populate
            analytics.
          </p>
        </div>
      ) : null}

      <div
        className={cn(
          "grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5",
        )}
      >
        {data.kpis.map((kpi) => (
          <FixedAssetKpiCard key={kpi.id} kpi={kpi} />
        ))}
      </div>

      <div
        className={cn(
          "grid min-h-0 grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-3",
          embedded && "flex-1 overflow-y-auto pr-1",
        )}
      >
        <ChartFrame
          title="Department ranking"
          eyebrow="Department analytics"
          description="Assets by source department"
          filename="fixed-assets-by-department"
          rows={departmentRows}
          caption="Fixed assets by department"
          empty={!departmentRows.length}
        >
          <ChartContainer config={chartConfig} className="h-64 w-full">
            <BarChart
              data={departmentRows}
              layout="vertical"
              margin={{ top: 4, right: 18, bottom: 4, left: 4 }}
            >
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" tickFormatter={compact} fontSize={10} />
              <YAxis
                type="category"
                dataKey="name"
                width={96}
                tick={{ fontSize: 10 }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                dataKey="assets"
                fill="var(--color-assets)"
                radius={[0, 4, 4, 0]}
                onClick={onDepartmentClick}
              />
            </BarChart>
          </ChartContainer>
        </ChartFrame>

        <ChartFrame
          title="Department footprint"
          eyebrow="Department analytics"
          description="Proportional view of the largest departments"
          filename="fixed-assets-department-treemap"
          rows={departmentRows}
          caption="Department treemap data"
          empty={!departmentRows.length}
        >
          <ChartContainer config={chartConfig} className="h-64 w-full">
            <Treemap
              data={departmentRows}
              dataKey="assets"
              nameKey="name"
              stroke="var(--border)"
              fill="var(--color-assets)"
              onClick={onDepartmentClick}
            >
              <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
            </Treemap>
          </ChartContainer>
        </ChartFrame>

        <ChartFrame
          title="Condition by department"
          eyebrow="Department analytics"
          description="First-review condition mix for the largest departments"
          filename="fixed-assets-condition-by-department"
          rows={conditionStackRows}
          caption="Condition mix by department"
          empty={!conditionStackRows.length}
        >
          <ChartContainer config={chartConfig} className="h-64 w-full">
            <BarChart
              data={conditionStackRows}
              layout="vertical"
              margin={{ top: 4, right: 18, bottom: 4, left: 4 }}
            >
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" tickFormatter={compact} fontSize={10} />
              <YAxis
                type="category"
                dataKey="department"
                width={96}
                tick={{ fontSize: 10 }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar
                dataKey="good"
                stackId="condition"
                fill="var(--color-good)"
              />
              <Bar
                dataKey="notFit"
                stackId="condition"
                fill="var(--color-notFit)"
              />
              <Bar
                dataKey="scrap"
                stackId="condition"
                fill="var(--color-scrap)"
              />
              <Bar
                dataKey="unclassified"
                stackId="condition"
                fill="var(--color-unclassified)"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ChartContainer>
        </ChartFrame>

        <ChartFrame
          title="Department × category heatmap"
          eyebrow="Department analytics"
          description="Concentration across the largest category codes"
          filename="fixed-assets-department-category-heatmap"
          rows={toCsvRows(data.departmentCategories)}
          caption="Asset counts by department and category code"
          className="lg:col-span-2"
        >
          <div className="h-64 w-full overflow-auto">
            <table className="w-full border-separate border-spacing-1 text-[10px]">
              <thead>
                <tr>
                  <th className="text-muted-foreground bg-card sticky left-0 z-10 px-1 text-left font-medium">
                    Dept
                  </th>
                  {heatCategories.map((category) => (
                    <th
                      key={category}
                      className="text-muted-foreground max-w-20 truncate px-1 text-left font-medium"
                      title={category}
                    >
                      {category}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatDepartments.map((department) => (
                  <tr key={department}>
                    <th className="bg-card sticky left-0 z-10 px-1 text-left font-medium">
                      <span
                        className="block max-w-28 truncate"
                        title={department}
                      >
                        {department}
                      </span>
                    </th>
                    {heatCategories.map((category) => {
                      const value =
                        data.departmentCategories.find(
                          (cell) =>
                            cell.department === department &&
                            cell.category === category,
                        )?.value ?? 0;
                      const ratio = value / heatMax;
                      return (
                        <td
                          key={category}
                          title={`${department} / ${category}: ${value}`}
                          className={cn(
                            "h-7 rounded text-center tabular-nums",
                            ratio > 0.66
                              ? "bg-emerald-500/80 text-white"
                              : ratio > 0.33
                                ? "bg-amber-500/70 text-amber-950"
                                : ratio > 0
                                  ? "text-foreground bg-sky-500/30"
                                  : "bg-muted/40 text-muted-foreground",
                          )}
                        >
                          {value ? compact(value) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartFrame>

        <ChartFrame
          title="Condition mix"
          eyebrow="Condition & lifecycle"
          description="First-review condition distribution"
          filename="fixed-assets-condition-mix"
          rows={toCsvRows(data.conditionMix)}
          caption="Fixed assets by condition"
          empty={!data.conditionMix.length}
        >
          <ChartContainer config={chartConfig} className="h-64 w-full">
            <PieChart>
              <Pie
                data={data.conditionMix}
                dataKey="value"
                nameKey="name"
                innerRadius={48}
                outerRadius={78}
                paddingAngle={2}
                onClick={(entry) => {
                  const payload = entry as { name?: string };
                  if (payload.name) drill({ condition: payload.name });
                }}
              >
                {data.conditionMix.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={conditionColors[entry.name] ?? "var(--color-assets)"}
                  />
                ))}
              </Pie>
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent nameKey="name" />} />
            </PieChart>
          </ChartContainer>
        </ChartFrame>

        <ChartFrame
          title="Review timeline"
          eyebrow="Condition & lifecycle"
          description="Monthly review activity and good-condition share"
          filename="fixed-assets-review-timeline"
          rows={toCsvRows(data.timeline)}
          caption="Monthly review activity"
          className="lg:col-span-3"
          empty={!data.timeline.length}
        >
          <ChartContainer config={chartConfig} className="h-56 w-full">
            <ComposedChart
              data={data.timeline.slice(-36)}
              margin={{ top: 8, right: 12, bottom: 4, left: 4 }}
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="month"
                tickFormatter={(value: string) => value.slice(2)}
                fontSize={10}
              />
              <YAxis yAxisId="count" tickFormatter={compact} fontSize={10} />
              <YAxis
                yAxisId="share"
                orientation="right"
                domain={[0, 100]}
                tickFormatter={(value: number) => `${value}%`}
                fontSize={10}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Area
                yAxisId="count"
                type="monotone"
                dataKey="reviewed"
                fill="var(--color-reviewed)"
                fillOpacity={0.22}
                stroke="var(--color-reviewed)"
              />
              <Line
                yAxisId="share"
                type="monotone"
                dataKey="goodShare"
                stroke="var(--color-good)"
                dot={false}
              />
            </ComposedChart>
          </ChartContainer>
        </ChartFrame>

        <ChartFrame
          title="Overdue reviews"
          eyebrow="Condition & lifecycle"
          description="Oldest or ambiguous review records"
          filename="fixed-assets-overdue-reviews"
          rows={toCsvRows(data.overdue)}
          caption="Assets overdue for review"
          className="lg:col-span-2"
          empty={!data.overdue.length}
        >
          <div className="h-64 overflow-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="text-muted-foreground bg-card sticky top-0 uppercase">
                <tr>
                  <th className="py-1.5 pr-2 font-medium">Asset</th>
                  <th className="py-1.5 pr-2 font-medium">Department</th>
                  <th className="py-1.5 pr-2 font-medium">Condition</th>
                  <th className="py-1.5 font-medium">Reviewed</th>
                </tr>
              </thead>
              <tbody>
                {data.overdue.map((row) => (
                  <tr key={row.id} className="border-border/60 border-t">
                    <td className="py-1.5 pr-2">
                      <Link
                        href={`/assets/${row.id}`}
                        className="hover:text-primary block max-w-48 truncate font-medium"
                        title={row.name}
                      >
                        {row.name}
                      </Link>
                      <span className="text-muted-foreground text-[10px]">
                        {row.propertyNo}
                      </span>
                    </td>
                    <td className="py-1.5 pr-2">{row.department}</td>
                    <td className="py-1.5 pr-2">{row.condition}</td>
                    <td className="text-muted-foreground py-1.5 tabular-nums">
                      {row.reviewDate ?? "Ambiguous"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartFrame>

        <ChartFrame
          title="Top locations"
          eyebrow="Location intelligence"
          description="Highest-volume registered locations"
          filename="fixed-assets-top-locations"
          rows={locationRows}
          caption="Assets by location"
          empty={!locationRows.length}
        >
          <ChartContainer config={chartConfig} className="h-64 w-full">
            <BarChart
              data={locationRows}
              layout="vertical"
              margin={{ top: 4, right: 18, bottom: 4, left: 4 }}
            >
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" tickFormatter={compact} fontSize={10} />
              <YAxis
                type="category"
                dataKey="name"
                width={100}
                tick={{ fontSize: 10 }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                dataKey="assets"
                fill="var(--color-assets)"
                radius={[0, 4, 4, 0]}
                onClick={(entry) => {
                  const payload = entry as { payload?: { name?: string } };
                  if (payload.payload?.name) {
                    router.push(
                      `/assets?search=${encodeURIComponent(payload.payload.name)}`,
                    );
                  }
                }}
              />
            </BarChart>
          </ChartContainer>
        </ChartFrame>

        <ChartFrame
          title="Moved between reviews"
          eyebrow="Location intelligence"
          description="First-review to second-review location changes"
          filename="fixed-assets-location-moves"
          rows={movementRows}
          caption="Location movements between reviews"
          empty={!movementRows.length}
        >
          <ChartContainer config={chartConfig} className="h-64 w-full">
            <BarChart
              data={movementRows}
              layout="vertical"
              margin={{ top: 4, right: 18, bottom: 4, left: 4 }}
            >
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" tickFormatter={compact} fontSize={10} />
              <YAxis
                type="category"
                dataKey="route"
                width={132}
                tick={{ fontSize: 9 }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                dataKey="assets"
                fill="var(--color-movement)"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ChartContainer>
        </ChartFrame>

        <ChartFrame
          title="Data quality scorecard"
          eyebrow="Location intelligence"
          description="Completeness of register-critical fields"
          filename="fixed-assets-data-quality"
          rows={toCsvRows(data.dataQuality)}
          caption="Fixed asset data quality"
          className="lg:col-span-2"
        >
          <div className="flex h-64 flex-col justify-center gap-3 px-1">
            {data.dataQuality.map((row) => (
              <div key={row.field} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="truncate font-medium">{row.field}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {row.completeness}% · {compact(row.issues)} issues
                  </span>
                </div>
                <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      row.completeness >= 90
                        ? "bg-emerald-500"
                        : row.completeness >= 60
                          ? "bg-amber-500"
                          : "bg-destructive",
                    )}
                    style={{ width: `${row.completeness}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </ChartFrame>

        <ChartFrame
          title="First → second review flow"
          eyebrow="Condition & lifecycle"
          description="Where condition changed between reviews"
          filename="fixed-assets-review-flow"
          rows={toCsvRows(data.reviewFlow.links)}
          caption="Condition transitions between first and second review"
          className="lg:col-span-3"
          empty={!data.reviewFlow.links.length}
        >
          <ChartContainer config={chartConfig} className="h-64 w-full">
            <Sankey
              data={data.reviewFlow as never}
              nodeWidth={10}
              nodePadding={24}
              margin={{ top: 10, right: 96, bottom: 10, left: 12 }}
              link={{ stroke: "var(--color-link)", strokeOpacity: 0.35 }}
              node={{ fill: "var(--color-assets)" }}
            >
              <ChartTooltip content={<ChartTooltipContent />} />
            </Sankey>
          </ChartContainer>
          <div className="text-muted-foreground mt-2 flex flex-col gap-1 text-[11px]">
            {data.reviewFlow.links.slice(0, 6).map((link) => (
              <span key={`${link.source}-${link.target}`}>
                {link.source} → {link.target}: {compact(link.value)}
              </span>
            ))}
          </div>
        </ChartFrame>
      </div>

      <div className="text-muted-foreground shrink-0 px-1 text-[10px]">
        Generated {new Date(data.generatedAt).toLocaleString("en-US")} · Query{" "}
        {data.timings.queryMs ?? 0} ms · Total {data.timings.totalMs ?? 0} ms
      </div>
    </div>
  );
}
