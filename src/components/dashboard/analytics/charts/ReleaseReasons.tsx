import Link from "next/link";
import type { HouseAnalyticsResponse } from "@/lib/house-analytics/contract";

type Segment = HouseAnalyticsResponse["releaseReasons"][number];

interface ReleaseReasonsProps {
  data: readonly Segment[];
}

export default function ReleaseReasons({ data }: ReleaseReasonsProps) {
  const total = data.reduce((sum, segment) => sum + segment.value, 0);

  if (total === 0) {
    return (
      <p className="text-muted-foreground flex h-full min-h-20 items-center justify-center text-center text-[10px]">
        No terminations recorded in this period.
      </p>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-0.5">
      <p className="text-muted-foreground mb-0.5 text-[9px] tracking-wider uppercase">
        Top exit reasons
      </p>
      {data.slice(0, 3).map((segment) => (
        <Link
          key={segment.name}
          href={segment.href}
          className="hover:bg-muted/50 block min-h-5 rounded-md px-1 py-0.5 transition-colors"
        >
          <div className="mb-0.5 flex items-center justify-between gap-2 text-[10px]">
            <span className="truncate font-medium">{segment.name}</span>
            <span className="text-muted-foreground shrink-0 tabular-nums">
              {segment.value} · {Math.round((segment.value / total) * 100)}%
            </span>
          </div>
          <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
            <div
              className="bg-brass-500 h-full rounded-full"
              style={{ width: `${(segment.value / total) * 100}%` }}
            />
          </div>
        </Link>
      ))}
    </div>
  );
}
