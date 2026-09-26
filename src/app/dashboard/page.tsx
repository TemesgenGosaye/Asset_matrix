import {
  getAssetCount,
  getUserCount,
  getAccessoryCount,
  getAssetStatusDistribution,
  getAccessoryStatusDistribution,
  getStatus,
  getMapLocations,
} from "@/lib/data";
import Breadcrumb from "@/components/Breadcrumb";
import dynamic from "next/dynamic";
import DismissibleHelpTip from "@/components/DismissibleHelpTip";
import DashboardGrid from "@/components/dashboard/DashboardGrid";

import { getOrganizationContext } from "@/lib/organization-context";
import { Suspense } from "react";
import AssetMapClient from "@/components/maps/AssetMapClient";
import { redirect } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, ArrowRight } from "lucide-react";

export const metadata = {
  title: "Asset Tracker - Dashboard",
};

// Defer the Recharts chunk so the dashboard's initial JS bundle stays small.
const AssetStatusChart = dynamic(
  () => import("@/components/charts/AssetStatusChart"),
  {
    ssr: true,
    loading: () => (
      <div className="bg-muted/50 flex aspect-square max-h-[250px] items-center justify-center rounded-lg text-sm text-muted-foreground">
        Loading chart...
      </div>
    ),
  },
);

function HamsRedirectBanner({ className }: { className?: string }) {
  return (
    <Link
      href="/dashboard/house-allocation"
      className={`group flex items-center justify-between rounded-xl border border-border bg-card px-5 py-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${className ?? ""}`}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brass-500/10 text-brass-500">
          <LayoutDashboard className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">
            House Allocation Dashboard
          </p>
          <p className="text-xs text-muted-foreground">
            Queue rankings, occupancy, cohort alerts &amp; recent activity
          </p>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
    </Link>
  );
}

export default async function DashboardPage() {
  let ctx: Awaited<ReturnType<typeof getOrganizationContext>> = null;
  try {
    ctx = await getOrganizationContext();
  } catch {
    redirect("/login");
  }
  if (!ctx?.userId) {
    redirect("/login");
  }
  const isAdmin = ctx.isAdmin ?? false;

  if (!isAdmin && ctx?.userId) {
    return (
      <main>
        <Breadcrumb
          options={[{ label: "Dashboard", href: "/dashboard", current: true }]}
        />
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          My Dashboard
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Your assets, requests, and tickets at a glance
        </p>
        <HamsRedirectBanner className="mt-4" />
        <div className="mt-6">
          <DashboardGrid isAdmin={false} />
        </div>
      </main>
    );
  }

  const [
    userCount,
    assetCount,
    accessoryCount,
    statusDistribution,
    accessoryStatusDistribution,
    statuses,
    mapLocations,
  ] = await Promise.all([
    getUserCount(),
    getAssetCount(),
    getAccessoryCount(),
    getAssetStatusDistribution(),
    getAccessoryStatusDistribution(),
    getStatus(),
    getMapLocations(),
  ]);

  const statusCounts = new Map<string, number>();
  let totalCounted = 0;

  statusDistribution.forEach((entry) => {
    const key = entry.statustypeid ?? "__unassigned";
    statusCounts.set(key, entry.count);
    totalCounted += entry.count;
  });

  const chartData = [];

  statuses.forEach((status) => {
    const count = statusCounts.get(status.statustypeid) ?? 0;
    chartData.push({ name: status.statustypename ?? "Unknown", value: count });
  });

  const unassignedCount = statusCounts.get("__unassigned");
  if (unassignedCount) {
    chartData.push({ name: "Unassigned", value: unassignedCount });
  }

  // Build accessory status chart data
  const accStatusCounts = new Map<string, number>();
  accessoryStatusDistribution.forEach((entry) => {
    const key = entry.statustypeid ?? "__unassigned";
    accStatusCounts.set(key, entry.count);
  });

  const accChartData: Array<{ name: string; value: number }> = [];
  statuses.forEach((status) => {
    const count = accStatusCounts.get(status.statustypeid) ?? 0;
    accChartData.push({
      name: status.statustypename ?? "Unknown",
      value: count,
    });
  });

  // Time-based greeting
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = ctx?.name ?? null;

  return (
    <main>
      <Breadcrumb
        options={[
          { label: "Home", href: "/" },
          { label: "Dashboard", href: "/dashboard" },
        ]}
      />
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {greeting}
        {firstName ? `, ${firstName}` : ""}
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Overview of your asset management system
      </p>
      <HamsRedirectBanner className="mt-4" />
      <DismissibleHelpTip id="dashboard-welcome">
        Welcome to your dashboard! Here you can see a quick overview of your
        assets, accessories, and users. Use the sidebar to navigate to specific
        sections, or click the stat cards below to jump to detailed views.
      </DismissibleHelpTip>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:mt-8 sm:gap-6 lg:grid-cols-2">
        <AssetStatusChart data={chartData} title="Asset Status" />
        <AssetStatusChart data={accChartData} title="Vehicle Status" />
      </div>
      <div className="mt-4 sm:mt-6">
        <Suspense
          fallback={
            <div className="text-muted-foreground flex h-[420px] items-center justify-center rounded-lg border text-sm">
              Loading map...
            </div>
          }
        >
          <AssetMapClient
            locations={mapLocations}
            totalAssets={assetCount}
            totalLocations={mapLocations.length}
          />
        </Suspense>
      </div>
      <div className="mt-6 sm:mt-8 md:mt-10">
        <DashboardGrid
          serverStats={{
            assets: assetCount,
            accessories: accessoryCount,
            users: userCount,
          }}
        />
      </div>
    </main>
  );
}
