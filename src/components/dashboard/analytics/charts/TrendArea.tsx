"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { ChartConfig } from "@/components/ui/chart";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { HouseAnalyticsResponse } from "@/lib/house-analytics/contract";

type MonthlyPoint = HouseAnalyticsResponse["monthly"][number];

const config = {
  allocations: { label: "Allocated", color: "hsl(var(--chart-1))" },
  releases: { label: "Released", color: "hsl(var(--chart-2))" },
  requests: { label: "Requests", color: "var(--color-brass-500)" },
} satisfies ChartConfig;

interface TrendAreaProps {
  data: readonly MonthlyPoint[];
}

export default function TrendArea({ data }: TrendAreaProps) {
  const hasFlow = data.some(
    (point) =>
      point.allocations > 0 || point.releases > 0 || point.requests > 0,
  );

  if (!hasFlow) {
    return (
      <p className="text-muted-foreground flex h-[240px] items-center justify-center text-sm">
        No allocation, release or request activity in the last 12 months.
      </p>
    );
  }

  return (
    <ChartContainer config={config} className="h-[240px] w-full">
      <AreaChart
        data={[...data]}
        margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
      >
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={20}
        />
        <YAxis
          allowDecimals={false}
          width={30}
          tickLine={false}
          axisLine={false}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Area
          dataKey="requests"
          type="monotone"
          stroke="var(--color-requests)"
          fill="var(--color-requests)"
          fillOpacity={0.1}
          strokeWidth={2}
          dot={false}
        />
        <Area
          dataKey="releases"
          type="monotone"
          stroke="var(--color-releases)"
          fill="var(--color-releases)"
          fillOpacity={0.1}
          strokeWidth={2}
          dot={false}
        />
        <Area
          dataKey="allocations"
          type="monotone"
          stroke="var(--color-allocations)"
          fill="var(--color-allocations)"
          fillOpacity={0.12}
          strokeWidth={2}
          dot={false}
        />
      </AreaChart>
    </ChartContainer>
  );
}
