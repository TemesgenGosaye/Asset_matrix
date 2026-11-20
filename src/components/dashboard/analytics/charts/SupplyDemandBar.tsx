"use client";

import Link from "next/link";
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

type Segment = HouseAnalyticsResponse["supplyDemand"][number];

const config = {
  demand: { label: "Eligible demand", color: "hsl(var(--chart-1))" },
  supply: { label: "Free supply", color: "var(--color-brass-500)" },
} satisfies ChartConfig;

interface SupplyDemandBarProps {
  data: readonly Segment[];
}

export default function SupplyDemandBar({ data }: SupplyDemandBarProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ChartContainer config={config} className="min-h-0 w-full flex-1">
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
            dataKey="band"
            width={56}
            tickLine={false}
            axisLine={false}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar
            dataKey="demand"
            fill="var(--color-demand)"
            radius={[0, 4, 4, 0]}
          />
          <Bar
            dataKey="supply"
            fill="var(--color-supply)"
            radius={[0, 4, 4, 0]}
          />
        </BarChart>
      </ChartContainer>
      <div className="hidden max-h-7 flex-wrap gap-1.5 overflow-hidden 2xl:flex">
        {data
          .filter((segment) => segment.shortage > 0)
          .map((segment) => (
            <Link
              key={segment.band}
              href={segment.href}
              className="bg-destructive/10 text-destructive hover:bg-destructive/20 inline-flex min-h-8 items-center rounded-full px-2.5 text-[11px] font-medium transition-colors"
            >
              {segment.band} short by {segment.shortage}
            </Link>
          ))}
      </div>
    </div>
  );
}
