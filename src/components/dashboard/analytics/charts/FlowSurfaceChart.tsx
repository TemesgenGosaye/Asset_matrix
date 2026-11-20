"use client";

import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartConfig } from "@/components/ui/chart";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { HouseAnalyticsResponse } from "@/lib/house-analytics/contract";

type MonthlyPoint = HouseAnalyticsResponse["monthly"][number];

const config = {
  requests: { label: "Requests", color: "var(--color-brass-500)" },
  allocations: { label: "Allocated", color: "hsl(var(--primary))" },
  releases: { label: "Released", color: "hsl(var(--warning))" },
  inspectionsCompleted: {
    label: "Inspections",
    color: "hsl(var(--success))",
  },
} satisfies ChartConfig;

const legend = [
  { label: "Requests", color: "var(--color-brass-500)" },
  { label: "Allocated", color: "hsl(var(--primary))" },
  { label: "Released", color: "hsl(var(--warning))" },
  { label: "Inspections", color: "hsl(var(--success))" },
];

interface FlowSurfaceChartProps {
  data: readonly MonthlyPoint[];
}

export default function FlowSurfaceChart({ data }: FlowSurfaceChartProps) {
  const hasFlow = data.some(
    (point) =>
      point.allocations > 0 ||
      point.releases > 0 ||
      point.requests > 0 ||
      point.inspectionsCompleted > 0,
  );

  if (!hasFlow) {
    return (
      <p className="text-muted-foreground flex h-full min-h-32 items-center justify-center text-xs">
        No allocation, release, inspection or request activity in this range.
      </p>
    );
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="text-muted-foreground mb-1 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[9px]">
        {legend.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            {item.label}
          </span>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        <ChartContainer config={config} className="h-full min-h-0 w-full">
          <ComposedChart
            data={[...data]}
            margin={{ left: -18, right: -16, top: 6, bottom: 0 }}
            barGap={2}
          >
            <defs>
              <linearGradient id="flowSurface" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="hsl(var(--primary))"
                  stopOpacity={0.36}
                />
                <stop
                  offset="92%"
                  stopColor="hsl(var(--primary))"
                  stopOpacity={0.01}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              stroke="hsl(var(--border))"
              strokeOpacity={0.65}
              strokeDasharray="2 4"
            />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              minTickGap={16}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
            />
            <YAxis
              yAxisId="left"
              allowDecimals={false}
              width={28}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              allowDecimals={false}
              width={24}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
            />
            <ChartTooltip
              cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.35 }}
              content={<ChartTooltipContent indicator="line" />}
            />
            <Bar
              yAxisId="left"
              dataKey="requests"
              barSize={6}
              radius={[3, 3, 0, 0]}
              fill="var(--color-requests)"
              fillOpacity={0.5}
            />
            <Area
              yAxisId="left"
              dataKey="allocations"
              type="monotone"
              stroke="var(--color-allocations)"
              fill="url(#flowSurface)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
            <Line
              yAxisId="left"
              dataKey="releases"
              type="monotone"
              stroke="var(--color-releases)"
              strokeWidth={2}
              strokeDasharray="4 3"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
            <Line
              yAxisId="right"
              dataKey="inspectionsCompleted"
              type="stepAfter"
              stroke="var(--color-inspectionsCompleted)"
              strokeWidth={1.8}
              dot={{ r: 2, strokeWidth: 0 }}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </ComposedChart>
        </ChartContainer>
      </div>
    </div>
  );
}
