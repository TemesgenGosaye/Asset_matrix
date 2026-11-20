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
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { HouseAnalyticsResponse } from "@/lib/house-analytics/contract";

type MonthlyPoint = HouseAnalyticsResponse["monthly"][number];

const config = {
  allocations: { label: "Allocated", color: "hsl(var(--chart-1))" },
  requests: { label: "Requests", color: "var(--color-brass-500)" },
  releases: { label: "Released", color: "hsl(var(--chart-2))" },
  inspectionsCompleted: {
    label: "Inspections",
    color: "hsl(var(--chart-4))",
  },
} satisfies ChartConfig;

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
    <div className="h-full min-h-0 min-w-0">
      <ChartContainer config={config} className="h-full min-h-0 w-full">
        <ComposedChart
          data={[...data]}
          margin={{ left: -16, right: -18, top: 12, bottom: 0 }}
          barGap={2}
        >
          <defs>
            <linearGradient id="flowSurface" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="hsl(var(--chart-1))"
                stopOpacity={0.44}
              />
              <stop
                offset="88%"
                stopColor="hsl(var(--chart-1))"
                stopOpacity={0.02}
              />
            </linearGradient>
          </defs>
          <CartesianGrid
            vertical={false}
            stroke="hsl(var(--border))"
            strokeOpacity={0.7}
            strokeDasharray="2 4"
          />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={16}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
          />
          <YAxis
            yAxisId="left"
            allowDecimals={false}
            width={34}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            allowDecimals={false}
            width={30}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
          />
          <ChartTooltip
            cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.35 }}
            content={<ChartTooltipContent indicator="line" />}
          />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar
            yAxisId="left"
            dataKey="requests"
            barSize={7}
            radius={[3, 3, 0, 0]}
            fill="var(--color-requests)"
            fillOpacity={0.55}
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
            strokeDasharray="5 4"
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
  );
}
