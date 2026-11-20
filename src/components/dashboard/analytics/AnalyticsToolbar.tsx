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
  "border-border/70 bg-card/80 text-foreground h-8 rounded-md border px-2.5 text-[11px] font-medium outline-none focus-visible:ring-ring focus-visible:ring-2";

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
    <div className="flex shrink-0 flex-wrap items-end gap-2">
      <label className="flex min-w-[8.5rem] flex-col gap-1">
        <span className="text-muted-foreground text-[9px] leading-none font-semibold tracking-[0.12em] uppercase">
          Period
        </span>
        <select
          aria-label="Period"
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
      </label>

      <label className="flex min-w-[8rem] flex-col gap-1">
        <span className="text-muted-foreground text-[9px] leading-none font-semibold tracking-[0.12em] uppercase">
          House type
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
      </label>

      {value.range === "custom" ? (
        <>
          <label className="flex min-w-[8.5rem] flex-col gap-1">
            <span className="text-muted-foreground text-[9px] leading-none font-semibold tracking-[0.12em] uppercase">
              From
            </span>
            <input
              aria-label="From date"
              className={controlClass}
              type="date"
              value={value.from ?? ""}
              onChange={(event) =>
                onChange({ ...value, from: event.target.value })
              }
            />
          </label>
          <label className="flex min-w-[8.5rem] flex-col gap-1">
            <span className="text-muted-foreground text-[9px] leading-none font-semibold tracking-[0.12em] uppercase">
              To
            </span>
            <input
              aria-label="To date"
              className={controlClass}
              type="date"
              value={value.to ?? ""}
              onChange={(event) =>
                onChange({ ...value, to: event.target.value })
              }
            />
          </label>
        </>
      ) : null}

      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        title="Refresh analytics"
        className={cn(
          controlClass,
          "hover:bg-muted inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60",
        )}
      >
        <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        Refresh
      </button>
    </div>
  );
}
