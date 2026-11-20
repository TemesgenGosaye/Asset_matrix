"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, ArrowUpRight } from "lucide-react";
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
import { cn } from "@/lib/utils";

const chartLoading = () => (
  <div className="bg-muted/60 h-full min-h-16 w-full animate-pulse rounded-lg" />
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

const FEATURED_KPI_IDS = new Set([
  "total-houses",
  "free-houses",
  "occupied-houses",
  "queue-ready",
]);

function queryString(query: HouseAnalyticsQuery): string {
  const params = new URLSearchParams({
    range: query.range,
    houseType: query.houseType,
  });
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  return params.toString();
}

function formatRangeLabel(meta: HouseAnalyticsResponse["meta"]): string {
  const format = (value: string) =>
    new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  return `${format(meta.from)} – ${format(meta.to)}`;
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

  const featured = data.kpis.filter((kpi) => FEATURED_KPI_IDS.has(kpi.id));
  const compact = data.kpis.filter((kpi) => !FEATURED_KPI_IDS.has(kpi.id));

  return (
    <section
      aria-label="House administration analytics"
      className="flex min-h-0 min-w-0 flex-col gap-2 xl:h-full xl:overflow-hidden"
    >
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="bg-brass-500 h-1.5 w-1.5 rounded-full" />
            <p className="text-brass-600 dark:text-brass-400 text-[10px] leading-none font-semibold tracking-[0.16em] uppercase">
              Housing operations / Command center
            </p>
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-xl leading-none font-semibold tracking-tight xl:text-2xl">
              Estate overview
            </h1>
            <span className="text-muted-foreground text-[11px] font-medium tabular-nums">
              {formatRangeLabel(data.meta)}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
          <div className="border-border/70 bg-card/60 hidden max-w-[18rem] items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] 2xl:flex">
            <span className="text-brass-600 dark:text-brass-400 shrink-0 font-semibold tracking-[0.12em]">
              PULSE
            </span>
            <span className="text-muted-foreground truncate">
              {data.activity[0]?.description ?? "No recent queue activity"}
            </span>
          </div>
          <div className="border-border/70 bg-card/60 flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-[10px]">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            <span className="text-muted-foreground">Live</span>
            <span className="font-medium tabular-nums">
              {new Date(data.meta.generatedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          <AnalyticsToolbar
            value={query}
            onChange={applyQuery}
            onRefresh={() => void load(query)}
            loading={loading}
          />
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-xs"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      {loading ? <AnalyticsSkeleton /> : null}

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-2",
          loading && "hidden",
        )}
      >
        <div className="grid shrink-0 grid-cols-2 gap-2 md:grid-cols-4">
          {featured.map((kpi) => (
            <KpiCard key={kpi.id} kpi={kpi} />
          ))}
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          {compact.map((kpi) => (
            <KpiCard key={kpi.id} kpi={kpi} size="compact" />
          ))}
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-12 xl:grid-rows-[minmax(0,1.12fr)_minmax(0,0.96fr)_minmax(0,0.92fr)]">
          <ChartCard
            eyebrow="XY / surface"
            title="Estate flow"
            description="Allocations, demand, releases and inspections by month"
            className="min-h-[220px] md:col-span-2 xl:col-span-8 xl:min-h-0"
            accent="blue"
          >
            <FlowSurfaceChart data={data.monthly} />
          </ChartCard>

          <ChartCard
            eyebrow="Coverage"
            title="Estate mix"
            description="Occupancy and live register distribution"
            className="min-h-[220px] xl:col-span-4 xl:min-h-0"
          >
            <div className="grid h-full min-h-0 grid-cols-2 gap-2">
              <OccupancyGauge occupancy={data.occupancy} />
              <StatusDonut data={data.statusDistribution} />
            </div>
          </ChartCard>

          <ChartCard
            eyebrow="Inventory"
            title="House type stack"
            description="Stock condition by band"
            className="min-h-[190px] xl:col-span-3 xl:min-h-0"
            accent="blue"
          >
            <HouseTypeBar data={data.housesByType} />
          </ChartCard>

          <ChartCard
            eyebrow="Supply / demand"
            title="Band pressure"
            description="Free stock against eligible demand"
            className="min-h-[190px] xl:col-span-3 xl:min-h-0"
            accent="amber"
          >
            <SupplyPressure data={data.supplyDemand} />
          </ChartCard>

          <ChartCard
            eyebrow="Pipeline"
            title="Queue funnel"
            description="Active allocation engine"
            className="min-h-[190px] xl:col-span-3 xl:min-h-0"
            accent="green"
          >
            <QueueFunnel funnel={data.funnel} />
          </ChartCard>

          <ChartCard
            eyebrow="Handback"
            title="Reasons & assurance"
            description="Terminations and inspection stages"
            className="min-h-[190px] xl:col-span-3 xl:min-h-0"
            accent="red"
          >
            <div className="flex h-full min-h-0 flex-col gap-2">
              <div className="min-h-0 flex-1">
                <ReleaseReasons data={data.releaseReasons} />
              </div>
              <div className="border-border/60 min-h-0 flex-1 border-t pt-2">
                <InspectionPipeline inspection={data.inspections} />
              </div>
            </div>
          </ChartCard>

          <div className="min-h-[190px] md:col-span-1 xl:col-span-7 xl:min-h-0">
            <TopQueueTable rows={data.topQueue} />
          </div>
          <div className="min-h-[190px] md:col-span-1 xl:col-span-5 xl:min-h-0">
            <ChartCard
              eyebrow="Priority actions"
              title="Action queue"
              description="Generated from live pressure signals"
              className="h-full"
              accent="amber"
              action={
                <a
                  href="/house-queue"
                  className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  aria-label="Open the house queue"
                >
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                </a>
              }
            >
              <WishlistPanel data={data} />
            </ChartCard>
          </div>
        </div>
      </div>
    </section>
  );
}
