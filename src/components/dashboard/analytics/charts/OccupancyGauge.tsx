"use client";

import { Label, PolarAngleAxis, RadialBar, RadialBarChart } from "recharts";
import type { ChartConfig } from "@/components/ui/chart";
import { ChartContainer } from "@/components/ui/chart";
import type { HouseAnalyticsResponse } from "@/lib/house-analytics/contract";

type Occupancy = HouseAnalyticsResponse["occupancy"];

const config = {
  occupancy: { label: "Occupancy", color: "hsl(var(--primary))" },
} satisfies ChartConfig;

interface OccupancyGaugeProps {
  occupancy: Occupancy;
}

export default function OccupancyGauge({ occupancy }: OccupancyGaugeProps) {
  const data = [{ occupancy: occupancy.value, fill: "var(--color-occupancy)" }];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ChartContainer config={config} className="min-h-0 w-full flex-1">
        <RadialBarChart
          data={data}
          innerRadius="74%"
          outerRadius="100%"
          startAngle={210}
          endAngle={-30}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar
            dataKey="occupancy"
            background
            cornerRadius={8}
            strokeWidth={0}
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
                        className="fill-foreground text-xl font-bold tabular-nums"
                      >
                        {occupancy.value}%
                      </tspan>
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy ?? 0) + 14}
                        className="fill-muted-foreground text-[8px] font-medium tracking-[0.1em]"
                      >
                        OCCUPIED
                      </tspan>
                    </text>
                  );
                }
                return null;
              }}
            />
          </RadialBar>
        </RadialBarChart>
      </ChartContainer>
      <p className="text-muted-foreground mt-1 truncate text-center text-[10px] leading-tight tabular-nums">
        {occupancy.occupied.toLocaleString()} /{" "}
        {occupancy.total.toLocaleString()} houses
      </p>
    </div>
  );
}
