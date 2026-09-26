import React from "react";
import Breadcrumb from "@/components/Breadcrumb";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getOrganizationContext } from "@/lib/organization-context";
import {
  getHamsKpis,
  getHamsOccupancyByType,
  getHamsRecentActivity,
  getHamsCohortAlerts,
} from "@/lib/hams/queries";
import KpiRow from "@/components/hams/KpiRow";
import OccupancyChart from "@/components/hams/OccupancyChart";
import QuickActions from "@/components/hams/QuickActions";
import AlertsStrip from "@/components/hams/AlertsStrip";
import RecentActivity from "@/components/hams/RecentActivity";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "Asset Tracker - House Allocation Management System (HAMS)",
  description:
    "Central command console for residential housing allocations, queue tracking, and capacity analysis.",
};

export default async function HamsDashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const ctx = await getOrganizationContext();
  const orgId = ctx?.organization?.id;
  if (!orgId) {
    redirect("/login");
  }

  // Access Control: Gated to Asset Manager, HR, and Admin roles only
  const hasAccess =
    ctx.isAdmin ||
    ctx.permissions.has("house_queue:view") ||
    ctx.permissions.has("household:view") ||
    ctx.permissions.has("employee:view");

  if (!hasAccess) {
    redirect("/dashboard");
  }

  // Fetch all dashboard data concurrently
  const [kpis, occupancyData, recentActivities, alerts] = await Promise.all([
    getHamsKpis(orgId),
    getHamsOccupancyByType(orgId),
    getHamsRecentActivity(orgId, 10),
    getHamsCohortAlerts(orgId),
  ]);

  return (
    <div className="space-y-6">
      {/* ─── Breadcrumb Navigation ─── */}
      <Breadcrumb
        options={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Facility & House", href: "/dashboard/house-allocation" },
          { label: "HAMS Dashboard", href: "/dashboard/house-allocation", current: true },
        ]}
      />

      {/* ─── Page Header Matching Existing Portal Module Style ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            House Allocation Management (HAMS)
          </h1>
          <div className="mt-1 h-0.5 w-16 rounded bg-gradient-to-r from-brass-400 to-transparent" />
          <p className="mt-2 text-sm text-muted-foreground">
            Central executive command console for residential housing capacity, priority queue decisions, and occupancy.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="gap-1.5 py-1 px-2.5 font-medium border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/30"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live Queue Synced
          </Badge>
        </div>
      </div>

      {/* ─── 5. Alerts / Exceptions Strip ─── */}
      <AlertsStrip alerts={alerts} />

      {/* ─── 1. KPI Row (MetricCards) ─── */}
      <KpiRow data={kpis} />

      {/* ─── 2 & 4. Occupancy Visualization + Quick Actions Panel ─── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <OccupancyChart data={occupancyData} />
        </div>
        <div className="lg:col-span-1">
          <QuickActions
            pendingInspectionsCount={kpis.pendingInspectionCount}
            activeQueueCount={kpis.activeQueueSize}
          />
        </div>
      </div>

      {/* ─── 3. Recent Activity Feed ─── */}
      <RecentActivity activities={recentActivities} />
    </div>
  );
}

export const dynamic = "force-dynamic";
