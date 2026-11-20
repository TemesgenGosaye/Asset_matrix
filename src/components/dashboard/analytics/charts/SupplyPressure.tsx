import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { HouseAnalyticsResponse } from "@/lib/house-analytics/contract";
import { cn } from "@/lib/utils";

type Segment = HouseAnalyticsResponse["supplyDemand"][number];

interface SupplyPressureProps {
  data: readonly Segment[];
}

export default function SupplyPressure({ data }: SupplyPressureProps) {
  if (data.length === 0) {
    return (
      <p className="text-muted-foreground flex h-full min-h-24 items-center justify-center text-xs">
        No band-level demand recorded for this filter.
      </p>
    );
  }

  const scale = Math.max(
    1,
    ...data.map((segment) => Math.max(segment.demand, segment.supply)),
  );

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-1">
      {data.map((segment) => {
        const supply = (segment.supply / scale) * 100;
        const demand = (segment.demand / scale) * 100;
        const balanced = segment.shortage <= 0;

        return (
          <Link
            key={segment.band}
            href={segment.href}
            title={`${segment.band}: ${segment.demand} eligible demand, ${segment.supply} free houses`}
            className="hover:bg-muted/40 grid min-h-6 grid-cols-[2.25rem_minmax(0,1fr)_3.25rem] items-center gap-2 rounded px-1 transition-colors"
          >
            <span className="text-muted-foreground text-[10px] font-semibold">
              {segment.band}
            </span>
            <span className="bg-muted relative block h-2.5 overflow-hidden rounded-full">
              <span
                className="bg-brass-500 absolute inset-y-0 left-0 rounded-full opacity-80"
                style={{ width: `${supply}%` }}
              />
              <span
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
      <div className="text-muted-foreground mt-0.5 flex items-center justify-between border-t pt-1 text-[9px]">
        <span>Brass = free stock</span>
        <span>Blue marker = demand</span>
        <span>Delta = supply gap</span>
      </div>
    </div>
  );
}
