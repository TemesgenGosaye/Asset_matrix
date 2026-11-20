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

const colorByName: Record<string, string> = {
  Free: "hsl(var(--success))",
  Occupied: "hsl(var(--primary))",
  "Awaiting inspection": "hsl(var(--warning))",
  "Inactive / damaged": "hsl(var(--destructive))",
};

function colorFor(name: string): string {
  return colorByName[name] ?? "hsl(var(--muted-foreground))";
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
      <p className="text-muted-foreground flex h-full min-h-24 items-center justify-center text-center text-[10px]">
        No houses recorded for this filter.
      </p>
    );
  }

  const config: ChartConfig = { value: { label: "Houses" } };
  const chartData = active.map((segment) => {
    const key = toKey(segment.name);
    config[key] = { label: segment.name, color: colorFor(segment.name) };
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
            innerRadius={38}
            strokeWidth={2}
            stroke="hsl(var(--card))"
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
                        className="fill-foreground text-lg font-bold tabular-nums"
                      >
                        {total.toLocaleString()}
                      </tspan>
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy ?? 0) + 13}
                        className="fill-muted-foreground text-[8px] font-medium tracking-[0.1em]"
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
      <div className="mt-1 grid min-h-0 grid-cols-1 gap-0.5 overflow-y-auto sm:grid-cols-2 xl:grid-cols-1">
        {active.map((segment) => (
          <Link
            key={segment.name}
            href={segment.href}
            className="hover:bg-muted/50 flex min-h-5 items-center gap-1.5 rounded px-1 text-[10px] transition-colors"
          >
            <span
              aria-hidden
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: colorFor(segment.name) }}
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
