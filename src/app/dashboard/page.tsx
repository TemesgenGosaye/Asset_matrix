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
import QuickActions from "@/components/dashboard/QuickActions";

import { getOrganizationContext } from "@/lib/organization-context";
import { Suspense } from "react";
import AssetMapClient from "@/components/maps/AssetMapClient";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Asset Tracker - Dashboard",
};

// Defer the Recharts chunk so the dashboard's initial JS bundle stays small.
const AssetStatusChart = dynamic(
  () => import("@/components/charts/AssetStatusChart"),
  {
    ssr: true,
    loading: () => (
      <div className="bg-muted/50 text-muted-foreground flex aspect-square max-h-[250px] items-center justify-center rounded-lg text-sm">
        Loading chart...
      </div>
    ),
  },
);

function canAccessHouseLedger(
  ctx: NonNullable<Awaited<ReturnType<typeof getOrganizationContext>>>,
) {
  return (
    (ctx.isAdmin ?? false) ||
    ctx.permissions.has("house_queue:view") ||
    ctx.permissions.has("household:view") ||
    ctx.permissions.has("employee:view")
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
  const canRequestHouse = ctx.permissions.has("house_request:create");
  const canViewHouseLedger = canAccessHouseLedger(ctx);

  // The full permission set, flattened for the client widget grid. The grid uses
  // it to hide cards the caller could not add (the API enforces the same rules),
  // so a Standard User is not offered a Housing Summary that would 403.
  const permissionKeys = Array.from(ctx.permissions);

  if (!isAdmin && ctx?.userId) {
    return (
      <main>
        <Breadcrumb
          options={[{ label: "Dashboard", href: "/dashboard", current: true }]}
        />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              My Dashboard
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Your assets, requests, and tickets at a glance
            </p>
          </div>
          <QuickActions
            canRequestHouse={canRequestHouse}
            canViewHouseLedger={canViewHouseLedger}
          />
        </div>
        <div className="mt-6">
          <DashboardGrid isAdmin={false} permissions={permissionKeys} />
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {greeting}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Your house and assets at a glance
          </p>
        </div>
        <QuickActions
          canRequestHouse={canRequestHouse}
          canViewHouseLedger={canViewHouseLedger}
        />
      </div>
      <DismissibleHelpTip id="dashboard-welcome">
        Welcome to your dashboard! Here you can see a quick overview of your
        assets, accessories, and users. Use the sidebar to navigate to specific
        sections, or click the stat cards below to jump to detailed views.
      </DismissibleHelpTip>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:mt-8 sm:gap-6 lg:grid-cols-2">
        <AssetStatusChart data={chartData} title="Asset Status" />
        <AssetStatusChart data={accChartData} title="Vehicle Status" />
      </div>

      <div className="mt-6 sm:mt-8 md:mt-10">
        <DashboardGrid
          isAdmin={isAdmin}
          permissions={permissionKeys}
          serverStats={{
            assets: assetCount,
            accessories: accessoryCount,
            users: userCount,
          }}
        />
      </div>

      {/*
        The map is LAST, after the widgets rather than between the charts and the
        widgets.

        It was sitting in the middle, where a 420px panel of empty state pushed
        every widget below the fold — so on a deployment whose locations have no
        geocoded coordinates, the dashboard opened on a large "No locations with
        coordinates" box and the configurable content the officer had actually
        arranged sat underneath it. The map is contextual and geographic; it is
        the thing you scroll to when you want it, not the thing that greets you.

        It also now sits after the widgets it partly duplicates: the "Asset Map"
        widget in the grid below renders the same component, so keeping both
        adjacent would have meant the same map twice within one scroll.
      */}
      <div className="mt-6 sm:mt-8 md:mt-10">
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
    </main>
  );
}
