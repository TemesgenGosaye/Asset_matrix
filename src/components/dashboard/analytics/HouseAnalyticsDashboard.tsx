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
  <div className="text-muted-foreground flex h-[220px] items-center justify-center text-sm">
    Loading chart…
  </div>
);

const TrendArea = dynamic(() => import("./charts/TrendArea"), {
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
    <section aria-label="House administration analytics" className="min-w-0">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="housing-serif text-xl font-semibold tracking-tight sm:text-2xl">
            House Administration Analytics
          </h2>
          <p className="text-muted-foreground mt-1 text-xs sm:text-sm">
            Estate stock, occupancy, queue pressure and handback performance
            from the live register and queue engine.
          </p>
        </div>
      </div>

      <AnalyticsToolbar
        value={query}
        onChange={applyQuery}
        onRefresh={() => void load(query)}
        loading={loading}
        generatedAt={data.meta.generatedAt}
      />

      {error && (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive mb-5 flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading && <AnalyticsSkeleton />}

      <div className={loading ? "hidden" : "space-y-5"}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {data.kpis.map((kpi) => (
            <KpiCard key={kpi.id} kpi={kpi} />
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ChartCard
            title="Occupancy"
            description="Physical occupancy across the selected estate"
          >
            <OccupancyGauge occupancy={data.occupancy} />
          </ChartCard>
          <ChartCard
            title="House status"
            description="Mutually exclusive categories — each house is counted once"
            className="lg:col-span-2"
          >
            <StatusDonut data={data.statusDistribution} />
          </ChartCard>
        </div>

        <ChartCard
          title="Allocation, release and request flow"
          description="Trailing 12 months ending in the selected period"
        >
          <TrendArea data={data.monthly} />
        </ChartCard>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard
            title="House-type breakdown"
            description="Register status by staff and A–E bands"
          >
            <HouseTypeBar data={data.housesByType} />
          </ChartCard>
          <ChartCard
            title="Supply vs demand"
            description="Eligible requesters against free houses by band"
          >
            <SupplyDemandBar data={data.supplyDemand} />
          </ChartCard>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ChartCard
            title="Queue funnel"
            description="Live allocation queue engine summary"
          >
            <QueueFunnel funnel={data.funnel} />
          </ChartCard>
          <ChartCard
            title="Release reasons"
            description="Terminations in the selected period"
          >
            <ReleaseReasons data={data.releaseReasons} />
          </ChartCard>
          <InspectionPipeline inspection={data.inspections} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TopQueueTable rows={data.topQueue} />
          <ActivityFeed items={data.activity} />
        </div>

        <p className="text-muted-foreground text-[11px] leading-relaxed">
          No historical house-snapshot table exists. Stock-card trends use the
          closest real flow — houses added, allocation/release ledgers and
          completed inspections — rather than snapshot deltas. Queue figures are
          produced by the active allocation configuration, not recalculated in
          the browser.
        </p>
      </div>
    </section>
  );
}
