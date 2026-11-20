"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle } from "lucide-react";
import ChartCard from "./ChartCard";
import KpiCard from "./KpiCard";
import AnalyticsToolbar from "./AnalyticsToolbar";
import ActivityFeed from "./ActivityFeed";
import TopQueueTable from "./TopQueueTable";
import InspectionPipeline from "./InspectionPipeline";
import AnalyticsSkeleton from "./AnalyticsSkeleton";
import QueueFunnel from "./charts/QueueFunnel";
import ReleaseReasons from "./charts/ReleaseReasons";
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
const SupplyDemandBar = dynamic(() => import("./charts/SupplyDemandBar"), {
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
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="bg-brass-500 h-1.5 w-1.5 rounded-full" />
            <p className="text-brass-600 dark:text-brass-400 text-[9px] font-semibold tracking-[0.16em] uppercase">
              Housing operations / command center
            </p>
          </div>
          <h2 className="mt-0.5 text-xl font-semibold tracking-tight xl:text-2xl">
            House Analytics
          </h2>
        </div>
        <div className="border-border/70 bg-card/60 flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="text-muted-foreground">Live</span>
          <span className="font-medium tabular-nums">
            {new Date(data.meta.generatedAt).toLocaleTimeString()}
          </span>
        </div>
      </div>

      <AnalyticsToolbar
        value={query}
        onChange={applyQuery}
        onRefresh={() => void load(query)}
        loading={loading}
      />

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
        <div className="grid shrink-0 grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4 xl:auto-rows-[68px] xl:grid-cols-6 2xl:auto-rows-[70px] 2xl:grid-cols-[repeat(11,minmax(0,1fr))]">
          {data.kpis.map((kpi) => (
            <KpiCard key={kpi.id} kpi={kpi} />
          ))}
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 xl:grid-cols-12 xl:grid-rows-[minmax(0,1.15fr)_minmax(0,0.95fr)_minmax(0,0.8fr)]">
          <ChartCard
            eyebrow="Surface / XY"
            title="Estate flow"
            description="Allocations, releases and requests by month"
            className="xl:col-span-8"
            surface
          >
            <FlowSurfaceChart data={data.monthly} />
          </ChartCard>

          <ChartCard
            eyebrow="Coverage"
            title="Occupancy & status"
            description="Current register position"
            className="xl:col-span-4"
            surface
          >
            <div className="grid h-full min-h-0 grid-cols-2 gap-1.5">
              <OccupancyGauge occupancy={data.occupancy} />
              <StatusDonut data={data.statusDistribution} />
            </div>
          </ChartCard>

          <ChartCard
            eyebrow="Inventory"
            title="House type"
            description="Register status by band"
            className="xl:col-span-4"
            surface
          >
            <HouseTypeBar data={data.housesByType} />
          </ChartCard>
          <ChartCard
            eyebrow="Demand"
            title="Supply vs demand"
            description="Eligible demand against free stock"
            className="xl:col-span-4"
            surface
          >
            <SupplyDemandBar data={data.supplyDemand} />
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
          <div className="min-h-0 xl:col-span-3">
            <InspectionPipeline inspection={data.inspections} />
          </div>
          <div className="min-h-0 xl:col-span-2">
            <ActivityFeed items={data.activity} />
          </div>
          <div className="min-h-0 xl:col-span-5">
            <TopQueueTable rows={data.topQueue} />
          </div>
        </div>
      </div>
    </section>
  );
}
