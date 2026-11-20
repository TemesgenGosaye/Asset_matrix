import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { HouseAnalyticsResponse } from "@/lib/house-analytics/contract";
import ChartCard from "./ChartCard";

type TopQueueRow = HouseAnalyticsResponse["topQueue"][number];

function statusLabel(status: string): string {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

interface TopQueueTableProps {
  rows: readonly TopQueueRow[];
}

export default function TopQueueTable({ rows }: TopQueueTableProps) {
  return (
    <ChartCard
      eyebrow="Priority list"
      title="Top allocation queue"
      description="Ranked ready and waiting requesters from the live queue engine"
      className="h-full"
      contentClassName="overflow-x-auto"
      surface
    >
      {rows.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-xs">
          No ranked requesters in the active queue.
        </p>
      ) : (
        <table className="w-full min-w-[34rem] text-left text-xs">
          <thead>
            <tr className="text-muted-foreground border-border/60 border-b text-[11px] tracking-[0.06em] uppercase">
              <th className="py-2 pr-3 font-semibold">Rank</th>
              <th className="py-2 pr-3 font-semibold">Employee</th>
              <th className="py-2 pr-3 font-semibold">Band</th>
              <th className="py-2 pr-3 text-right font-semibold">Score</th>
              <th className="py-2 pr-3 font-semibold">Status</th>
              <th className="py-2 font-semibold">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-border/60 divide-y">
            {rows.slice(0, 3).map((row) => (
              <tr key={`${row.employeeNumber}-${row.rank ?? "unranked"}`}>
                <td className="housing-serif py-2 pr-3 text-sm font-semibold tabular-nums">
                  {row.rank ?? "—"}
                </td>
                <td className="py-2 pr-3">
                  <p className="truncate font-medium">{row.name}</p>
                  <p className="text-muted-foreground text-[11px]">
                    {row.employeeNumber}
                  </p>
                </td>
                <td className="py-2 pr-3 text-sm">{row.grade}</td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {row.score === null ? "—" : row.score}
                </td>
                <td className="py-2 pr-3 text-xs">{statusLabel(row.status)}</td>
                <td className="py-2 text-right">
                  <Link
                    href={row.href}
                    aria-label={`Open ${row.name} in the house queue`}
                    className="focus-visible:ring-ring hover:bg-muted inline-flex h-11 w-11 items-center justify-center rounded-md focus-visible:ring-2 xl:h-7 xl:w-7"
                  >
                    <ArrowUpRight className="text-muted-foreground h-4 w-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ChartCard>
  );
}
