"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Activity, AlertTriangle, LayoutDashboard } from "lucide-react";
import ChartCard from "./ChartCard";
import KpiCard from "./KpiCard";
import AnalyticsToolbar from "./AnalyticsToolbar";
import TopQueueTable from "./TopQueueTable";
import InspectionPipeline from "./InspectionPipeline";
import AnalyticsSkeleton from "./AnalyticsSkeleton";
import WishlistPanel from "./WishlistPanel";
import QueueFunnel from "./charts/QueueFunnel";
import ReleaseReasons from "./charts/ReleaseReasons";
import SupplyPressure from "./charts/SupplyPressure";
import {
  houseAnalyticsResponseSchema,
  type HouseAnalyticsQuery,
  type HouseAnalyticsResponse,
} from "@/lib/house-analytics/contract";

const chartLoading = () => (
  <div className="text-muted-foreground flex h-24 items-center justify-center text-xs">
    Loading chart…
  </div>
);

const FlowSurfaceChart = dynamic(() => import("./charts/FlowSurfaceChart"), {
  ssr: false,
  loading: chartLoading,
});
const StatusDonut = dynamic(() => import("./charts/StatusDonut"), {
  ssr: false,
  loading: chartLoading,
});
const HouseTypeBar = dynamic(() => import("./charts/HouseTypeBar"), {
  ssr: false,
  loading: chartLoading,
});
const OccupancyGauge = dynamic(() => import("./charts/OccupancyGauge"), {
  ssr: false,
  loading: chartLoading,
});

function queryString(query: HouseAnalyticsQuery): string {
  const params = new URLSearchParams({
    range: query.range,
    houseType: query.houseType,
  });
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  return params.toString();
}

function registerHref(type: string, range: string): string {
  const params = new URLSearchParams({ type, range });
  return `/household/register?${params.toString()}`;
}

interface HouseAnalyticsDashboardProps {
  initialData: HouseAnalyticsResponse;
  initialQuery: HouseAnalyticsQuery;
}

export default function HouseAnalyticsDashboard({
  initialData,
  initialQuery,
}: HouseAnalyticsDashboardProps) {
  const [query, setQuery] = useState<HouseAnalyticsQuery>(initialQuery);
  const [data, setData] = useState<HouseAnalyticsResponse>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  async function load(next: HouseAnalyticsQuery) {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/dashboard/house-analytics?${queryString(next)}`,
        { cache: "no-store" },
      );
      const body: unknown = await response.json();
      if (!response.ok) {
        const message =
          body && typeof body === "object" && "error" in body
            ? String((body as { error: unknown }).error)
            : "Unable to load analytics";
        throw new Error(message);
      }
      const parsed = houseAnalyticsResponseSchema.parse(body);
      if (id === requestId.current) setData(parsed);
    } catch (caught) {
      if (id === requestId.current) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load house analytics",
        );
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  function applyQuery(next: HouseAnalyticsQuery) {
    setQuery(next);
    if (next.range === "custom" && (!next.from || !next.to)) {
      setError("Choose both a from and a to date for a custom range.");
      return;
    }
    void load(next);
  }

  return (
    <section
      aria-label="House administration analytics"
      className="min-w-0 space-y-2 xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:overflow-hidden"
    >
      <div className="border-border/70 bg-card text-card-foreground shrink-0 rounded-xl border p-4 shadow-[var(--shadow-sm)] xl:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="border-brass-400/30 bg-brass-400/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border">
              <LayoutDashboard className="text-brass-600 dark:text-brass-300 h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-brass-600 dark:text-brass-400 text-[10px] font-semibold tracking-[0.16em] uppercase">
                Housing operations / command center
              </p>
              <h2 className="text-foreground text-lg font-semibold tracking-tight xl:text-2xl">
                Dashboard Overview
              </h2>
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            <div className="border-border/70 bg-background/60 hidden max-w-[22rem] min-w-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-[10px] xl:flex">
              <Activity className="text-brass-600 dark:text-brass-300 h-3.5 w-3.5 shrink-0" />
              <span className="text-foreground shrink-0 font-semibold tracking-[0.12em] uppercase">
                PULSE
              </span>
              <span className="text-muted-foreground truncate">
                {data.activity[0]?.description ?? "No recent queue activity"}
              </span>
            </div>
            <div className="border-border/70 bg-background/60 flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[10px]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span className="text-muted-foreground">Live</span>
              <span className="text-foreground font-medium tabular-nums">
                {new Date(data.meta.generatedAt).toLocaleTimeString()}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-3">
          <AnalyticsToolbar
            value={query}
            onChange={applyQuery}
            onRefresh={() => void load(query)}
            loading={loading}
          />
        </div>

        <div className="mt-4 mb-2 flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.14em] uppercase">
            Key metrics
          </p>
          <p className="text-muted-foreground text-[11px]">
            Live estate position
          </p>
        </div>
        <div
          aria-label="Key metrics"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:auto-rows-[96px] 2xl:auto-rows-[104px]"
        >
          {data.kpis.map((kpi) => (
            <KpiCard key={kpi.id} kpi={kpi} />
          ))}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-xs"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading && <AnalyticsSkeleton />}

      <div
        className={
          loading
            ? "hidden"
            : "flex min-h-0 flex-1 flex-col gap-2 overflow-hidden"
        }
      >
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 xl:grid-cols-12 xl:grid-rows-[minmax(0,1.1fr)_minmax(0,0.95fr)_minmax(0,0.85fr)]">
          <ChartCard
            eyebrow="XY / Surface"
            title="Estate flow matrix"
            description="Allocations, demand, releases and inspections by month"
            className="xl:col-span-8"
            surface
          >
            <FlowSurfaceChart data={data.monthly} />
          </ChartCard>

          <ChartCard
            eyebrow="Coverage"
            title="Occupancy & register mix"
            description="Current position from the live register"
            className="xl:col-span-4"
            surface
          >
            <div className="grid h-full min-h-0 grid-cols-2 gap-1.5">
              <OccupancyGauge occupancy={data.occupancy} />
              <StatusDonut
                data={data.housesByType.map((row) => ({
                  name: row.type,
                  value:
                    row.free +
                    row.occupied +
                    row.awaitingInspection +
                    row.inactive,
                  href: registerHref(row.type, data.meta.range),
                }))}
              />
            </div>
          </ChartCard>

          <ChartCard
            eyebrow="Inventory"
            title="House type stack"
            description="Stock condition by band"
            className="xl:col-span-4"
            surface
          >
            <HouseTypeBar data={data.housesByType} />
          </ChartCard>
          <ChartCard
            eyebrow="Supply / Demand"
            title="Band pressure matrix"
            description="Free stock against eligible demand"
            className="xl:col-span-4"
            surface
          >
            <SupplyPressure data={data.supplyDemand} />
          </ChartCard>
          <ChartCard
            eyebrow="Pipeline"
            title="Queue funnel"
            description="Active allocation engine"
            className="xl:col-span-4"
            surface
          >
            <QueueFunnel funnel={data.funnel} />
          </ChartCard>

          <ChartCard
            eyebrow="Handback"
            title="Release reasons"
            description="Terminations in the selected period"
            className="xl:col-span-2"
            surface
          >
            <ReleaseReasons data={data.releaseReasons} />
          </ChartCard>
          <div className="min-h-0 xl:col-span-2">
            <InspectionPipeline inspection={data.inspections} />
          </div>
          <ChartCard
            eyebrow="Priority wishlist"
            title="Action queue"
            description="Generated from live pressure signals"
            className="xl:col-span-3"
            surface
          >
            <WishlistPanel data={data} />
          </ChartCard>
          <div className="min-h-0 xl:col-span-5">
            <TopQueueTable rows={data.topQueue} />
          </div>
        </div>
      </div>
    </section>
  );
}
