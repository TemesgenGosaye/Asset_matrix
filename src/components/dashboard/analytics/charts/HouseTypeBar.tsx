"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { ChartConfig } from "@/components/ui/chart";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { HouseAnalyticsResponse } from "@/lib/house-analytics/contract";

type Row = HouseAnalyticsResponse["housesByType"][number];

const config = {
  free: { label: "Free", color: "hsl(var(--chart-2))" },
  occupied: { label: "Occupied", color: "hsl(var(--chart-1))" },
  awaitingInspection: {
    label: "Awaiting inspection",
    color: "hsl(var(--chart-4))",
  },
  inactive: { label: "Inactive / damaged", color: "hsl(var(--chart-5))" },
} satisfies ChartConfig;

interface HouseTypeBarProps {
  data: readonly Row[];
}

export default function HouseTypeBar({ data }: HouseTypeBarProps) {
  const hasHouses = data.some(
    (row) =>
      row.free + row.occupied + row.awaitingInspection + row.inactive > 0,
  );

  if (!hasHouses) {
    return (
      <p className="text-muted-foreground flex h-full min-h-32 items-center justify-center text-xs">
        No houses recorded for this filter.
      </p>
    );
  }

  return (
    <ChartContainer config={config} className="h-full min-h-0 w-full">
      <BarChart
        data={[...data]}
        layout="vertical"
        margin={{ left: 0, right: 12, top: 4, bottom: 0 }}
      >
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis
          type="number"
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="type"
          width={56}
          tickLine={false}
          axisLine={false}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="free" stackId="stock" fill="var(--color-free)" />
        <Bar dataKey="occupied" stackId="stock" fill="var(--color-occupied)" />
        <Bar
          dataKey="awaitingInspection"
          stackId="stock"
          fill="var(--color-awaitingInspection)"
        />
        <Bar
          dataKey="inactive"
          stackId="stock"
          fill="var(--color-inactive)"
          radius={[0, 4, 4, 0]}
        />
      </BarChart>
    </ChartContainer>
  );
}
