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

const colors = [
  "hsl(var(--chart-2))",
  "var(--color-brass-500)",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

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
      <p className="text-muted-foreground flex h-[220px] items-center justify-center text-sm">
        No houses recorded for this filter.
      </p>
    );
  }

  const config: ChartConfig = { value: { label: "Houses" } };
  const chartData = active.map((segment, index) => {
    const key = toKey(segment.name);
    config[key] = { label: segment.name, color: colors[index % colors.length] };
    return { key, value: segment.value, fill: `var(--color-${key})` };
  });

  return (
    <div className="space-y-3">
      <ChartContainer
        config={config}
        className="mx-auto aspect-square max-h-[220px]"
      >
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="key"
            innerRadius={58}
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
                        className="fill-foreground housing-serif text-2xl font-bold"
                      >
                        {total.toLocaleString()}
                      </tspan>
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy ?? 0) + 20}
                        className="fill-muted-foreground text-[10px]"
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
      <div className="grid grid-cols-2 gap-2">
        {active.map((segment, index) => (
          <Link
            key={segment.name}
            href={segment.href}
            className="hover:bg-muted/40 flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs transition-colors"
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: colors[index % colors.length] }}
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
