"use client";

import React, { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { HamsOccupancyItem } from "@/lib/hams/queries";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2 } from "lucide-react";

interface OccupancyChartProps {
  data: HamsOccupancyItem[];
}

export default function OccupancyChart({ data }: OccupancyChartProps) {
  const [chartMode, setChartMode] = useState<"stacked" | "grouped">("stacked");

  const totalHouses = data.reduce((sum, item) => sum + item.total, 0);
  const totalOccupied = data.reduce((sum, item) => sum + item.occupied, 0);
  const totalVacant = data.reduce((sum, item) => sum + item.vacant, 0);
  const totalMaintenance = data.reduce((sum, item) => sum + item.maintenance, 0);

  // Modern accessible chart palette adhering to theme
  const colorOccupied = "#c9a227"; // Brass accent
  const colorVacant = "#3b82f6"; // Blue
  const colorMaintenance = "#f59e0b"; // Amber

  return (
    <Card className="rounded-xl border bg-card text-card-foreground shadow-sm">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 gap-3 border-b border-border/60">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <CardTitle className="text-base sm:text-lg font-bold tracking-tight">
              Occupancy by House Category
            </CardTitle>
          </div>
          <CardDescription className="text-xs text-muted-foreground mt-0.5">
            Physical allocation and vacant capacity across Staff quarters and tiers A through E
          </CardDescription>
        </div>

        <div className="flex items-center gap-2">
          <Tabs
            value={chartMode}
            onValueChange={(val) => setChartMode(val as "stacked" | "grouped")}
            className="w-auto"
          >
            <TabsList className="h-8 p-0.5 bg-muted">
              <TabsTrigger
                value="stacked"
                className="text-xs px-2.5 py-1"
              >
                Stacked
              </TabsTrigger>
              <TabsTrigger
                value="grouped"
                className="text-xs px-2.5 py-1"
              >
                Grouped
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        {totalHouses === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border p-6 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground/40 mb-2" />
            <p className="text-sm font-medium text-foreground">No house units registered yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add houses in Household Register to visualize category capacity.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data}
                  margin={{ top: 15, right: 10, left: -15, bottom: 0 }}
                  barGap={chartMode === "grouped" ? 4 : 0}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="currentColor"
                    className="text-border/60"
                  />
                  <XAxis
                    dataKey="category"
                    stroke="currentColor"
                    className="text-muted-foreground"
                    tick={{ fontSize: 12, fontWeight: 500 }}
                    tickLine={{ stroke: "currentColor" }}
                    axisLine={{ stroke: "currentColor" }}
                  />
                  <YAxis
                    stroke="currentColor"
                    className="text-muted-foreground"
                    allowDecimals={false}
                    tick={{ fontSize: 11 }}
                    tickLine={{ stroke: "currentColor" }}
                    axisLine={{ stroke: "currentColor" }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      borderColor: "hsl(var(--border))",
                      borderRadius: "0.5rem",
                      boxShadow: "var(--shadow-md)",
                      color: "hsl(var(--popover-foreground))",
                      fontSize: "12px",
                      padding: "8px 12px",
                    }}
                    cursor={{ fill: "currentColor", opacity: 0.05 }}
                  />
                  <Legend
                    wrapperStyle={{ paddingTop: "12px" }}
                    formatter={(value) => (
                      <span className="text-xs text-foreground font-medium ml-1 mr-3">
                        {value}
                      </span>
                    )}
                  />
                  <Bar
                    dataKey="occupied"
                    name="Occupied"
                    stackId={chartMode === "stacked" ? "a" : undefined}
                    fill={colorOccupied}
                    radius={chartMode === "stacked" ? [0, 0, 0, 0] : [4, 4, 0, 0]}
                    maxBarSize={45}
                  />
                  <Bar
                    dataKey="vacant"
                    name="Vacant"
                    stackId={chartMode === "stacked" ? "a" : undefined}
                    fill={colorVacant}
                    radius={chartMode === "stacked" ? [0, 0, 0, 0] : [4, 4, 0, 0]}
                    maxBarSize={45}
                  />
                  <Bar
                    dataKey="maintenance"
                    name="Maintenance"
                    stackId={chartMode === "stacked" ? "a" : undefined}
                    fill={colorMaintenance}
                    radius={chartMode === "stacked" ? [4, 4, 0, 0] : [4, 4, 0, 0]}
                    maxBarSize={45}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Micro stats summary */}
            <div className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
              <div className="rounded-lg bg-muted/40 py-2 px-3 border border-border/60">
                <span className="text-[11px] text-muted-foreground block">Occupied Units</span>
                <span className="housing-serif text-sm sm:text-base font-bold text-foreground">
                  {totalOccupied}
                </span>
              </div>
              <div className="rounded-lg bg-muted/40 py-2 px-3 border border-border/60">
                <span className="text-[11px] text-muted-foreground block">Available Vacant</span>
                <span className="housing-serif text-sm sm:text-base font-bold text-blue-600 dark:text-blue-400">
                  {totalVacant}
                </span>
              </div>
              <div className="rounded-lg bg-muted/40 py-2 px-3 border border-border/60">
                <span className="text-[11px] text-muted-foreground block">In Maintenance</span>
                <span className="housing-serif text-sm sm:text-base font-bold text-amber-600 dark:text-amber-400">
                  {totalMaintenance}
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
