"use client";

import React from "react";
import MetricCard from "@/components/MetricCard";
import type { HamsKpiData } from "@/lib/hams/queries";
import {
  Home,
  Users,
  ListOrdered,
  ClipboardCheck,
  CalendarDays,
  AlertTriangle,
} from "lucide-react";

interface KpiRowProps {
  data: HamsKpiData;
}

export default function KpiRow({ data }: KpiRowProps) {
  const typeCategories = ["Staff", "A", "B", "C", "D", "E"];
  const typeBreakdown = typeCategories.map((type) => ({
    label: type,
    value: data.housesByType[type] ?? 0,
  }));

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {/* 1. Total Houses by type */}
      <MetricCard
        title="Total Houses"
        value={data.totalHouses}
        variant="brass"
        icon={Home}
        subtitle="Staff quarters and tiers A–E"
        breakdown={typeBreakdown}
        href="/household/register"
      />

      {/* 2. Occupied vs Vacant Count & % */}
      <MetricCard
        title="Occupancy"
        value={`${data.occupancyRate}%`}
        variant="navy"
        icon={Users}
        badge={data.occupancyRate > 80 ? "High Demand" : "Healthy"}
        subtitle={
          <span>
            <strong>{data.occupiedCount}</strong> occupied ·{" "}
            <strong>{data.vacantCount}</strong> vacant
          </span>
        }
        href="/houses/allocated"
      />

      {/* 3. Active Queue Size */}
      <MetricCard
        title="Active Queue"
        value={data.activeQueueSize}
        variant="brass"
        icon={ListOrdered}
        badge="Ready for Decision"
        subtitle="Eligible candidates in queue"
        href="/house-queue"
      />

      {/* 4. Pending House-Inspection Holds */}
      <MetricCard
        title="Pending Inspections"
        value={data.pendingInspectionCount}
        variant={data.pendingInspectionCount > 0 ? "warning" : "default"}
        icon={ClipboardCheck}
        badge={data.pendingInspectionCount > 0 ? "Holds Active" : "Clear"}
        subtitle={
          data.pendingInspectionCount > 0
            ? "Vacated units awaiting inspection"
            : "No houses blocked by inspection"
        }
        href="/houses/inspections"
      />

      {/* 5. Allocations Made This Month vs Last Month */}
      <MetricCard
        title="Allocations (Mo)"
        value={data.thisMonthAllocations}
        variant="navy"
        icon={CalendarDays}
        trend={{
          value: data.allocationDelta,
          label: "vs last month",
          positiveIsGood: true,
        }}
        subtitle={
          <span>
            Last month: <strong>{data.lastMonthAllocations}</strong>
          </span>
        }
        href="/houses/allocated"
      />

      {/* 6. Inactive / Damaged Houses */}
      <MetricCard
        title="Inactive / Damaged"
        value={data.inactiveDamagedCount}
        variant={data.inactiveDamagedCount > 0 ? "destructive" : "default"}
        icon={AlertTriangle}
        badge={data.inactiveDamagedCount > 0 ? "Needs Action" : "All Sound"}
        subtitle={
          data.inactiveDamagedCount > 0
            ? "Flagged for maintenance/repairs"
            : "Zero reported structural damage"
        }
        href="/household/register"
      />
    </div>
  );
}
