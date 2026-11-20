import Link from "next/link";
import type { HouseAnalyticsResponse } from "@/lib/house-analytics/contract";
import { cn } from "@/lib/utils";

type Segment = HouseAnalyticsResponse["supplyDemand"][number];

interface SupplyPressureProps {
  data: readonly Segment[];
}

export default function SupplyPressure({ data }: SupplyPressureProps) {
  if (data.length === 0) {
    return (
      <p className="text-muted-foreground flex h-full min-h-24 items-center justify-center text-center text-[10px]">
        No band-level demand recorded for this filter.
      </p>
    );
  }

  const scale = Math.max(
    1,
    ...data.map((segment) => Math.max(segment.demand, segment.supply)),
  );
  const shortBands = data.filter((segment) => segment.shortage > 0).length;

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-0.5">
      <div className="mb-0.5 flex items-center justify-between text-[9px]">
        <span className="text-muted-foreground tracking-wider uppercase">
          {data.length} bands tracked
        </span>
        <span
          className={cn(
            "font-semibold tabular-nums",
            shortBands > 0
              ? "text-destructive"
              : "text-emerald-600 dark:text-emerald-400",
          )}
        >
          {shortBands} short
        </span>
      </div>
      {data.map((segment) => {
        const supply = (segment.supply / scale) * 100;
        const demand = (segment.demand / scale) * 100;
        const balanced = segment.shortage <= 0;

        return (
          <Link
            key={segment.band}
            href={segment.href}
            title={`${segment.band}: ${segment.demand} eligible demand, ${segment.supply} free houses`}
            className="hover:bg-muted/50 grid min-h-5 grid-cols-[1.75rem_minmax(0,1fr)_2.75rem] items-center gap-1.5 rounded px-1 transition-colors"
          >
            <span className="text-muted-foreground text-[10px] font-semibold">
              {segment.band}
            </span>
            <span className="bg-muted relative block h-2 overflow-hidden rounded-full">
              <span
                className="bg-brass-500 absolute inset-y-0 left-0 rounded-full opacity-85"
                style={{ width: `${supply}%` }}
              />
              <span
                aria-hidden
                className="absolute inset-y-0 border-l-2 border-sky-500"
                style={{ left: `${demand}%` }}
              />
            </span>
            <span
              className={cn(
                "text-right text-[10px] font-semibold tabular-nums",
                balanced
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-destructive",
              )}
            >
              {balanced
                ? `+${segment.supply - segment.demand}`
                : `-${segment.shortage}`}
            </span>
          </Link>
        );
      })}
      <div className="text-muted-foreground border-border/60 mt-0.5 flex items-center justify-between border-t pt-1 text-[9px]">
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="bg-brass-500 h-1.5 w-1.5 rounded-full" />
          Free stock
        </span>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-sky-500" />
          Demand
        </span>
      </div>
    </div>
  );
}
