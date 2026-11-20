"use client";

import Link from "next/link";
import { Label, Pie, PieChart } from "recharts";
import type { ChartConfig } from "@/components/ui/chart";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { HouseAnalyticsResponse } from "@/lib/house-analytics/contract";

type Segment = HouseAnalyticsResponse["statusDistribution"][number];

const houseTypeColors: Record<string, string> = {
  Staff: "var(--color-brass-500)",
  A: "hsl(var(--chart-1))",
  B: "hsl(var(--chart-2))",
  C: "hsl(var(--chart-3))",
  D: "hsl(var(--chart-4))",
  E: "hsl(var(--chart-5))",
};

const fallbackColors = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "var(--color-brass-500)",
];

function colorFor(name: string, index: number): string {
  return houseTypeColors[name] ?? fallbackColors[index % fallbackColors.length];
}

function toKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

interface StatusDonutProps {
  data: readonly Segment[];
}

export default function StatusDonut({ data }: StatusDonutProps) {
  const active = data.filter((segment) => segment.value > 0);
  const total = active.reduce((sum, segment) => sum + segment.value, 0);

  if (total === 0) {
    return (
      <p className="text-muted-foreground flex h-full min-h-32 items-center justify-center text-xs">
        No houses recorded for this filter.
      </p>
    );
  }

  const config: ChartConfig = { value: { label: "Houses" } };
  const chartData = active.map((segment, index) => {
    const key = toKey(segment.name);
    config[key] = { label: segment.name, color: colorFor(segment.name, index) };
    return { key, value: segment.value, fill: `var(--color-${key})` };
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ChartContainer config={config} className="min-h-0 w-full flex-1">
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="key"
            innerRadius={42}
            strokeWidth={2}
          >
            <Label
              content={({ viewBox }) => {
                if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                  return (
                    <text
                      x={viewBox.cx}
                      y={viewBox.cy}
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      <tspan
                        x={viewBox.cx}
                        y={viewBox.cy}
                        className="fill-foreground text-lg font-bold"
                      >
                        {total.toLocaleString()}
                      </tspan>
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy ?? 0) + 14}
                        className="fill-muted-foreground text-[8px]"
                      >
                        HOUSES
                      </tspan>
                    </text>
                  );
                }
                return null;
              }}
            />
          </Pie>
        </PieChart>
      </ChartContainer>
      <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5">
        {active.map((segment, index) => (
          <Link
            key={segment.name}
            href={segment.href}
            className="hover:bg-muted/40 flex min-h-7 items-center gap-1.5 rounded px-1 text-[10px] transition-colors"
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: colorFor(segment.name, index) }}
            />
            <span className="text-muted-foreground min-w-0 flex-1 truncate">
              {segment.name}
            </span>
            <span className="font-semibold tabular-nums">{segment.value}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
