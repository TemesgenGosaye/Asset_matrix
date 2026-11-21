"use client";

import { CalendarDays, House, RefreshCw } from "lucide-react";
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
  "h-8 min-w-0 rounded-none border border-slate-700 bg-slate-900 px-2.5 text-xs font-medium text-slate-100 outline-none transition-colors hover:border-amber-400/60 focus-visible:ring-2 focus-visible:ring-amber-300";

const labelClass =
  "text-slate-400 hidden items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] uppercase sm:flex";

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
    <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-none border border-slate-700 bg-slate-800 p-2">
      <span className={labelClass}>
        <CalendarDays className="h-3.5 w-3.5 text-amber-300" />
        Period
      </span>
      <select
        aria-label="Analytics period"
        className={cn(controlClass, "min-w-[7rem]")}
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

      <span className="mx-0.5 hidden h-5 w-px bg-slate-700 sm:block" />

      <span className={labelClass}>
        <House className="h-3.5 w-3.5 text-amber-300" />
        Type
      </span>
      <select
        aria-label="House type"
        className={cn(controlClass, "min-w-[6.5rem]")}
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
            className={cn(controlClass, "w-[8.5rem]")}
            type="date"
            value={value.from ?? ""}
            onChange={(event) =>
              onChange({ ...value, from: event.target.value })
            }
          />
          <input
            aria-label="To date"
            className={cn(controlClass, "w-[8.5rem]")}
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
        className={cn(
          controlClass,
          "ml-auto inline-flex items-center justify-center gap-1.5 px-2.5 hover:bg-slate-700 disabled:opacity-60",
        )}
      >
        <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        <span className="hidden md:inline">Refresh</span>
      </button>
    </div>
  );
}
