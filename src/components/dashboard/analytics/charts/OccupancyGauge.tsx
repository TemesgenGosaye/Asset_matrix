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
    <div className="flex h-full min-h-0 flex-col">
      <ChartContainer config={config} className="min-h-0 w-full flex-1">
        <RadialBarChart
          data={data}
          innerRadius="76%"
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
                        className="fill-foreground text-2xl font-bold"
                      >
                        {occupancy.value}%
                      </tspan>
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy ?? 0) + 16}
                        className="fill-muted-foreground text-[8px]"
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
      <p className="text-muted-foreground mt-1 text-center text-[10px] leading-tight">
        {occupancy.occupied.toLocaleString()} /{" "}
        {occupancy.total.toLocaleString()} houses occupied
      </p>
    </div>
  );
}
