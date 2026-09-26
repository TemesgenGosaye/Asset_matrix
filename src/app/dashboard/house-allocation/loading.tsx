import React from "react";

export default function HamsDashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Breadcrumb & Header skeleton */}
      <div className="space-y-3">
        <div className="h-4 w-48 rounded bg-white/10" />
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="h-8 w-64 rounded-md bg-white/15" />
            <div className="mt-1 h-0.5 w-20 rounded bg-brass-400/40" />
            <div className="mt-2 h-4 w-96 rounded bg-white/10" />
          </div>
          <div className="h-9 w-32 rounded-lg bg-white/10" />
        </div>
      </div>

      {/* Alerts strip skeleton */}
      <div className="h-16 w-full rounded-xl border border-white/10 bg-[#0a1f33]/80" />

      {/* 6 KPI Cards skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="flex flex-col justify-between rounded-xl border border-white/10 bg-[#0a1f33] p-5 h-36"
          >
            <div className="flex items-center justify-between">
              <div className="h-3.5 w-24 rounded bg-white/10" />
              <div className="h-8 w-8 rounded-lg bg-white/10" />
            </div>
            <div className="my-2 h-7 w-16 rounded bg-white/20" />
            <div className="h-3 w-32 rounded bg-white/10" />
          </div>
        ))}
      </div>

      {/* Occupancy Chart & Quick Actions skeleton */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 h-96 rounded-xl border border-white/10 bg-[#0a1f33] p-5" />
        <div className="h-96 rounded-xl border border-white/10 bg-[#0a1f33] p-5" />
      </div>

      {/* Recent Activity feed skeleton */}
      <div className="h-80 rounded-xl border border-white/10 bg-[#0a1f33] p-5" />
    </div>
  );
}
