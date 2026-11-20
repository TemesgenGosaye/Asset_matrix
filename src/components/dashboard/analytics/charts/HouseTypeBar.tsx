"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { ChartConfig } from "@/components/ui/chart";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { HouseAnalyticsResponse } from "@/lib/house-analytics/contract";

type Row = HouseAnalyticsResponse["housesByType"][number];

const config = {
  free: { label: "Free", color: "hsl(var(--success))" },
  occupied: { label: "Occupied", color: "hsl(var(--primary))" },
  awaitingInspection: { label: "Inspection", color: "hsl(var(--warning))" },
  inactive: { label: "Inactive", color: "hsl(var(--destructive))" },
} satisfies ChartConfig;

const legend = [
  { label: "Free", color: "hsl(var(--success))" },
  { label: "Occupied", color: "hsl(var(--primary))" },
  { label: "Inspection", color: "hsl(var(--warning))" },
  { label: "Inactive", color: "hsl(var(--destructive))" },
];

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
      <p className="text-muted-foreground flex h-full min-h-24 items-center justify-center text-center text-[10px]">
        No houses recorded for this filter.
      </p>
    );
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="text-muted-foreground mb-1 flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[9px]">
        {legend.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-[2px]"
              style={{ backgroundColor: item.color }}
            />
            {item.label}
          </span>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        <ChartContainer config={config} className="h-full min-h-0 w-full">
          <BarChart
            data={[...data]}
            layout="vertical"
            margin={{ left: 0, right: 10, top: 2, bottom: 0 }}
            barCategoryGap={6}
          >
            <CartesianGrid
              horizontal={false}
              stroke="hsl(var(--border))"
              strokeOpacity={0.6}
              strokeDasharray="3 3"
            />
            <XAxis
              type="number"
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
            />
            <YAxis
              type="category"
              dataKey="type"
              width={48}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="free" stackId="stock" fill="var(--color-free)" />
            <Bar
              dataKey="occupied"
              stackId="stock"
              fill="var(--color-occupied)"
            />
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
      </div>
    </div>
  );
}
