"use client";

import { RefreshCw } from "lucide-react";
import { HOUSE_TYPES } from "@/lib/household-constants";
import type {
  HouseAnalyticsQuery,
  HouseAnalyticsRange,
} from "@/lib/house-analytics/contract";
import { cn } from "@/lib/utils";

const rangeOptions: Array<{ value: HouseAnalyticsRange; label: string }> = [
  { value: "month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "quarter", label: "Last 3 months" },
  { value: "year", label: "Last 12 months" },
  { value: "custom", label: "Custom range" },
];

const controlClass =
  "border-border bg-background text-foreground focus-visible:ring-ring h-7 min-w-0 rounded-md border px-2 text-[11px] outline-none focus-visible:ring-2 sm:text-xs";

interface AnalyticsToolbarProps {
  value: HouseAnalyticsQuery;
  onChange: (next: HouseAnalyticsQuery) => void;
  onRefresh: () => void;
  loading: boolean;
}

export default function AnalyticsToolbar({
  value,
  onChange,
  onRefresh,
  loading,
}: AnalyticsToolbarProps) {
  return (
    <div className="border-border/70 bg-card/60 flex shrink-0 flex-wrap items-center gap-1.5 rounded-lg border px-1.5 py-1">
      <span className="text-muted-foreground hidden text-[9px] font-semibold tracking-[0.12em] uppercase sm:inline">
        Period
      </span>
      <select
        aria-label="Analytics period"
        className={controlClass}
        value={value.range}
        onChange={(event) =>
          onChange({
            ...value,
            range: event.target.value as HouseAnalyticsRange,
          })
        }
      >
        {rangeOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <span className="text-muted-foreground hidden text-[9px] font-semibold tracking-[0.12em] uppercase sm:inline">
        Type
      </span>
      <select
        aria-label="House type"
        className={controlClass}
        value={value.houseType}
        onChange={(event) =>
          onChange({
            ...value,
            houseType: event.target.value as HouseAnalyticsQuery["houseType"],
          })
        }
      >
        <option value="all">All types</option>
        {HOUSE_TYPES.map((type) => (
          <option key={type} value={type}>
            {type === "Staff" ? "S (Staff)" : type}
          </option>
        ))}
      </select>

      {value.range === "custom" && (
        <>
          <input
            aria-label="From date"
            className={cn(controlClass, "w-[7.5rem]")}
            type="date"
            value={value.from ?? ""}
            onChange={(event) =>
              onChange({ ...value, from: event.target.value })
            }
          />
          <input
            aria-label="To date"
            className={cn(controlClass, "w-[7.5rem]")}
            type="date"
            value={value.to ?? ""}
            onChange={(event) => onChange({ ...value, to: event.target.value })}
          />
        </>
      )}

      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        aria-label="Refresh analytics"
        className={cn(
          controlClass,
          "hover:bg-muted ml-auto inline-flex w-7 items-center justify-center px-0 transition-colors disabled:opacity-60",
        )}
      >
        <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
      </button>
    </div>
  );
}
