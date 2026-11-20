"use client";

import { Label, PolarAngleAxis, RadialBar, RadialBarChart } from "recharts";
import type { ChartConfig } from "@/components/ui/chart";
import { ChartContainer } from "@/components/ui/chart";
import type { HouseAnalyticsResponse } from "@/lib/house-analytics/contract";

type Occupancy = HouseAnalyticsResponse["occupancy"];

const config = {
  occupancy: { label: "Occupancy", color: "var(--color-brass-500)" },
} satisfies ChartConfig;

interface OccupancyGaugeProps {
  occupancy: Occupancy;
}

export default function OccupancyGauge({ occupancy }: OccupancyGaugeProps) {
  const data = [{ occupancy: occupancy.value, fill: "var(--color-occupancy)" }];

  return (
    <div className="space-y-3">
      <ChartContainer
        config={config}
        className="mx-auto aspect-square max-h-[210px]"
      >
        <RadialBarChart
          data={data}
          innerRadius="78%"
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
                        className="fill-foreground housing-serif text-3xl font-bold"
                      >
                        {occupancy.value}%
                      </tspan>
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy ?? 0) + 22}
                        className="fill-muted-foreground text-[10px]"
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
      <p className="text-muted-foreground text-center text-xs">
        {occupancy.occupied.toLocaleString()} of{" "}
        {occupancy.total.toLocaleString()} registered houses physically occupied
      </p>
    </div>
  );
}
