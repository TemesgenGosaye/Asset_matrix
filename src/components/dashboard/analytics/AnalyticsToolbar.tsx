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
  "border-border bg-background text-foreground focus-visible:ring-ring min-h-11 rounded-md border px-3 text-sm outline-none focus-visible:ring-2";

interface AnalyticsToolbarProps {
  value: HouseAnalyticsQuery;
  onChange: (next: HouseAnalyticsQuery) => void;
  onRefresh: () => void;
  loading: boolean;
  generatedAt?: string;
}

export default function AnalyticsToolbar({
  value,
  onChange,
  onRefresh,
  loading,
  generatedAt,
}: AnalyticsToolbarProps) {
  return (
    <div className="border-border/70 bg-card/60 mb-5 flex flex-col gap-3 rounded-xl border p-3 sm:p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[9rem] flex-col gap-1.5">
          <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.08em] uppercase">
            Period
          </span>
          <select
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

        <label className="flex min-w-[9rem] flex-col gap-1.5">
          <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.08em] uppercase">
            House type
          </span>
          <select
            className={controlClass}
            value={value.houseType}
            onChange={(event) =>
              onChange({
                ...value,
                houseType: event.target
                  .value as HouseAnalyticsQuery["houseType"],
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

        {value.range === "custom" && (
          <>
            <label className="flex min-w-[9rem] flex-1 flex-col gap-1.5">
              <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.08em] uppercase">
                From
              </span>
              <input
                className={controlClass}
                type="date"
                value={value.from ?? ""}
                onChange={(event) =>
                  onChange({ ...value, from: event.target.value })
                }
              />
            </label>
            <label className="flex min-w-[9rem] flex-1 flex-col gap-1.5">
              <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.08em] uppercase">
                To
              </span>
              <input
                className={controlClass}
                type="date"
                value={value.to ?? ""}
                onChange={(event) =>
                  onChange({ ...value, to: event.target.value })
                }
              />
            </label>
          </>
        )}

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className={cn(
            controlClass,
            "hover:bg-muted inline-flex min-w-[7rem] items-center justify-center gap-2 font-medium transition-colors disabled:opacity-60",
          )}
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Refresh
        </button>
      </div>
      {generatedAt && (
        <p className="text-muted-foreground text-[11px]">
          Data generated {new Date(generatedAt).toLocaleString()}. Figures are
          scoped to your organization and cached for 60 seconds.
        </p>
      )}
    </div>
  );
}
