"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Activity,
  AlertTriangle,
  Gauge,
  LayoutDashboard,
  ListChecks,
  Radio,
  Workflow,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  <div className="text-muted-foreground flex h-full min-h-16 items-center justify-center text-[10px]">
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

  const donutData = data.housesByType.map((row) => ({
    name: row.type,
    value: row.free + row.occupied + row.awaitingInspection + row.inactive,
    href: registerHref(row.type, data.meta.range),
  }));

  return (
    <section
      aria-label="House administration analytics"
      className="flex h-full min-h-0 flex-col gap-2"
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="border-brass-500/20 bg-brass-500/10 text-brass-600 dark:text-brass-300 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border">
            <LayoutDashboard className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-brass-600 dark:text-brass-400 truncate text-[9px] font-semibold tracking-[0.16em] uppercase">
              Housing operations / command center
            </p>
            <h2 className="text-sm leading-tight font-semibold tracking-tight sm:text-base">
              Dashboard Overview
            </h2>
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          <div className="border-border/70 bg-card/60 hidden max-w-[14rem] min-w-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] xl:flex">
            <Activity className="text-brass-500 h-3 w-3 shrink-0" />
            <span className="text-muted-foreground truncate">
              {data.activity[0]?.description ?? "No recent queue activity"}
            </span>
          </div>
          <div className="border-border/70 bg-card/60 hidden items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] sm:flex">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-muted-foreground hidden sm:inline">Live</span>
            <span className="font-medium tabular-nums">
              {new Date(data.meta.generatedAt).toLocaleTimeString()}
            </span>
          </div>
          <AnalyticsToolbar
            value={query}
            onChange={applyQuery}
            onRefresh={() => void load(query)}
            loading={loading}
          />
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-1 text-[11px]"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}

      {loading ? (
        <AnalyticsSkeleton />
      ) : (
        <>
          <div className="grid shrink-0 grid-cols-3 gap-1.5 sm:grid-cols-5">
            {data.kpis.map((kpi) => (
              <KpiCard key={kpi.id} kpi={kpi} />
            ))}
          </div>

          <div className="hidden min-h-0 flex-1 grid-cols-12 grid-rows-[minmax(0,1fr)_minmax(0,0.92fr)] gap-2 lg:grid 2xl:grid-rows-[minmax(0,1.05fr)_minmax(0,0.85fr)_minmax(0,0.75fr)]">
            <ChartCard
              eyebrow="Estate flow"
              title="Allocations, demand and releases"
              description="Monthly movement across the housing register"
              className="col-span-7"
              surface
            >
              <FlowSurfaceChart data={data.monthly} />
            </ChartCard>

            <ChartCard
              eyebrow="Coverage"
              title="Occupancy and register mix"
              description="Current position from the live register"
              className="col-span-5"
              surface
            >
              <div className="grid h-full min-h-0 grid-cols-2 gap-1.5">
                <OccupancyGauge occupancy={data.occupancy} />
                <StatusDonut data={donutData} />
              </div>
            </ChartCard>

            <ChartCard
              eyebrow="Supply / demand"
              title="Band pressure"
              description="Free stock against eligible demand by band"
              className="col-span-4"
              surface
            >
              <SupplyPressure data={data.supplyDemand} />
            </ChartCard>

            <ChartCard
              eyebrow="Allocation engine"
              title="Queue funnel"
              description="Live eligible, ready and blocked requesters"
              className="col-span-4"
              surface
            >
              <QueueFunnel funnel={data.funnel} />
            </ChartCard>

            <ChartCard
              eyebrow="Priority actions"
              title="Action queue"
              description="Generated from live pressure signals"
              className="col-span-4"
              surface
            >
              <WishlistPanel data={data} />
            </ChartCard>

            <ChartCard
              eyebrow="Inventory"
              title="House type stock"
              description="Occupancy and condition by house type"
              className="col-span-4 hidden 2xl:flex"
              surface
            >
              <HouseTypeBar data={data.housesByType} />
            </ChartCard>

            <ChartCard
              eyebrow="Handback"
              title="Release reasons"
              description="Terminations in the selected period"
              className="col-span-3 hidden 2xl:flex"
              surface
            >
              <ReleaseReasons data={data.releaseReasons} />
            </ChartCard>

            <div className="col-span-5 hidden min-h-0 2xl:block">
              <TopQueueTable rows={data.topQueue} />
            </div>
          </div>

          <Tabs
            defaultValue="flow"
            className="flex min-h-0 flex-1 flex-col lg:hidden"
          >
            <TabsList className="bg-muted/60 grid h-8 w-full grid-cols-4 gap-0.5 p-0.5">
              <TabsTrigger value="flow" className="gap-1 px-1 text-[10px]">
                <Workflow className="h-3 w-3" />
                Flow
              </TabsTrigger>
              <TabsTrigger value="coverage" className="gap-1 px-1 text-[10px]">
                <Gauge className="h-3 w-3" />
                Coverage
              </TabsTrigger>
              <TabsTrigger value="pipeline" className="gap-1 px-1 text-[10px]">
                <ListChecks className="h-3 w-3" />
                Pipeline
              </TabsTrigger>
              <TabsTrigger value="actions" className="gap-1 px-1 text-[10px]">
                <Radio className="h-3 w-3" />
                Actions
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value="flow"
              className="mt-1 min-h-0 flex-1 data-[state=inactive]:hidden"
            >
              <ChartCard
                eyebrow="Estate flow"
                title="Allocations, demand and releases"
                className="h-full"
                surface
              >
                <FlowSurfaceChart data={data.monthly} />
              </ChartCard>
            </TabsContent>

            <TabsContent
              value="coverage"
              className="mt-1 min-h-0 flex-1 data-[state=inactive]:hidden"
            >
              <div className="grid h-full min-h-0 grid-cols-2 gap-1.5">
                <ChartCard
                  eyebrow="Coverage"
                  title="Occupancy"
                  className="h-full"
                  surface
                >
                  <OccupancyGauge occupancy={data.occupancy} />
                </ChartCard>
                <ChartCard
                  eyebrow="Register"
                  title="House mix"
                  className="h-full"
                  surface
                >
                  <StatusDonut data={donutData} />
                </ChartCard>
              </div>
            </TabsContent>

            <TabsContent
              value="pipeline"
              className="mt-1 min-h-0 flex-1 data-[state=inactive]:hidden"
            >
              <div className="grid h-full min-h-0 grid-cols-2 gap-1.5">
                <ChartCard
                  eyebrow="Queue"
                  title="Allocation funnel"
                  className="h-full"
                  surface
                >
                  <QueueFunnel funnel={data.funnel} />
                </ChartCard>
                <div className="min-h-0">
                  <InspectionPipeline inspection={data.inspections} />
                </div>
              </div>
            </TabsContent>

            <TabsContent
              value="actions"
              className="mt-1 min-h-0 flex-1 data-[state=inactive]:hidden"
            >
              <div className="grid h-full min-h-0 grid-cols-2 grid-rows-2 gap-1.5">
                <ChartCard
                  eyebrow="Priority"
                  title="Action queue"
                  className="min-h-0"
                  surface
                >
                  <WishlistPanel data={data} />
                </ChartCard>
                <ChartCard
                  eyebrow="Handback"
                  title="Release reasons"
                  className="min-h-0"
                  surface
                >
                  <ReleaseReasons data={data.releaseReasons} />
                </ChartCard>
                <ChartCard
                  eyebrow="Supply / demand"
                  title="Band pressure"
                  className="min-h-0"
                  surface
                >
                  <SupplyPressure data={data.supplyDemand} />
                </ChartCard>
                <ChartCard
                  eyebrow="Inventory"
                  title="House stock"
                  className="min-h-0"
                  surface
                >
                  <HouseTypeBar data={data.housesByType} />
                </ChartCard>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </section>
  );
}
