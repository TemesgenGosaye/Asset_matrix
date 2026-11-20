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
} satisfies ChartConfig;

interface FlowSurfaceChartProps {
  data: readonly MonthlyPoint[];
}

export default function FlowSurfaceChart({ data }: FlowSurfaceChartProps) {
  const hasFlow = data.some(
    (point) =>
      point.allocations > 0 || point.releases > 0 || point.requests > 0,
  );

  if (!hasFlow) {
    return (
      <p className="text-muted-foreground flex h-full min-h-32 items-center justify-center text-xs">
        No allocation, release or request activity in the last 12 months.
      </p>
    );
  }

  return (
    <div className="h-full min-h-0 min-w-0">
      <ChartContainer config={config} className="h-full min-h-0 w-full">
        <ComposedChart
          data={[...data]}
          margin={{ left: -12, right: 8, top: 16, bottom: 0 }}
          barGap={2}
        >
          <defs>
            <linearGradient id="flowSurface" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="hsl(var(--chart-1))"
                stopOpacity={0.42}
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
            tickMargin={10}
            minTickGap={18}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
          />
          <YAxis
            allowDecimals={false}
            width={38}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
          />
          <ChartTooltip
            cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.35 }}
            content={<ChartTooltipContent indicator="line" />}
          />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar
            dataKey="requests"
            barSize={7}
            radius={[3, 3, 0, 0]}
            fill="var(--color-requests)"
            fillOpacity={0.55}
          />
          <Area
            dataKey="allocations"
            type="monotone"
            stroke="var(--color-allocations)"
            fill="url(#flowSurface)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
          <Line
            dataKey="releases"
            type="monotone"
            stroke="var(--color-releases)"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        </ComposedChart>
      </ChartContainer>
    </div>
  );
}
