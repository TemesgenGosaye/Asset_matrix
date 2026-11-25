"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DashboardAnalyticsTabsProps {
  house: ReactNode;
  fixedAssets?: ReactNode | null;
}

export default function DashboardAnalyticsTabs({
  house,
  fixedAssets,
}: DashboardAnalyticsTabsProps) {
  const [tab, setTab] = useState<"house" | "fixed">("house");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="border-border/70 flex shrink-0 items-center gap-1 border-b pb-2"
        role="tablist"
        aria-label="Dashboard analytics views"
      >
        <Button
          id="analytics-tab-house"
          type="button"
          role="tab"
          size="sm"
          variant={tab === "house" ? "secondary" : "ghost"}
          aria-selected={tab === "house"}
          aria-controls="analytics-panel-house"
          onClick={() => setTab("house")}
          className={cn(tab === "house" && "text-foreground font-semibold")}
        >
          House analytics
        </Button>
        {fixedAssets ? (
          <Button
            id="analytics-tab-fixed"
            type="button"
            role="tab"
            size="sm"
            variant={tab === "fixed" ? "secondary" : "ghost"}
            aria-selected={tab === "fixed"}
            aria-controls="analytics-panel-fixed"
            onClick={() => setTab("fixed")}
            className={cn(tab === "fixed" && "text-foreground font-semibold")}
          >
            Fixed asset analytics
          </Button>
        ) : null}
      </div>
      <div
        id={tab === "house" ? "analytics-panel-house" : "analytics-panel-fixed"}
        role="tabpanel"
        aria-labelledby={
          tab === "house" ? "analytics-tab-house" : "analytics-tab-fixed"
        }
        className="mt-2 min-h-0 flex-1"
      >
        {tab === "house" ? house : fixedAssets}
      </div>
    </div>
  );
}
