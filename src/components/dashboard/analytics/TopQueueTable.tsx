import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { HouseAnalyticsResponse } from "@/lib/house-analytics/contract";
import { cn } from "@/lib/utils";
import ChartCard from "./ChartCard";

type TopQueueRow = HouseAnalyticsResponse["topQueue"][number];

function statusLabel(status: string): string {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusTone(status: string): string {
  const value = status.toLowerCase();
  if (value.includes("ready")) return "bg-success-bg text-success-foreground";
  if (value.includes("allocated"))
    return "bg-brass-500/10 text-brass-600 dark:text-brass-300";
  if (value.includes("no_house") || value.includes("house"))
    return "bg-warning-bg text-warning-foreground";
  if (value.includes("eligible") || value.includes("not"))
    return "bg-destructive/10 text-destructive";
  return "bg-secondary text-secondary-foreground";
}

interface TopQueueTableProps {
  rows: readonly TopQueueRow[];
}

export default function TopQueueTable({ rows }: TopQueueTableProps) {
  return (
    <ChartCard
      eyebrow="Priority list"
      title="Top allocation queue"
      description="Ranked ready and waiting requesters from the live engine"
      className="h-full"
      contentClassName="overflow-x-auto"
    >
      {rows.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-xs">
          No ranked requesters in the active queue.
        </p>
      ) : (
        <table className="w-full min-w-[30rem] text-left text-xs">
          <thead>
            <tr className="text-muted-foreground border-border/60 border-b text-[9px] tracking-[0.1em] uppercase">
              <th className="py-1.5 pr-2 font-semibold">#</th>
              <th className="py-1.5 pr-2 font-semibold">Employee</th>
              <th className="py-1.5 pr-2 font-semibold">Band</th>
              <th className="py-1.5 pr-2 text-right font-semibold">Score</th>
              <th className="py-1.5 pr-2 font-semibold">Status</th>
              <th className="py-1.5">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-border/60 divide-y">
            {rows.slice(0, 3).map((row) => (
              <tr key={`${row.employeeNumber}-${row.rank ?? "unranked"}`}>
                <td className="py-1.5 pr-2">
                  <span
                    className={cn(
                      "housing-serif inline-flex h-6 min-w-6 items-center justify-center rounded-md border px-1 text-xs font-semibold tabular-nums",
                      row.rank !== null && row.rank <= 3
                        ? "border-brass-500/30 bg-brass-500/10 text-brass-600 dark:text-brass-300"
                        : "border-border/60 bg-secondary/60 text-muted-foreground",
                    )}
                  >
                    {row.rank ?? "—"}
                  </span>
                </td>
                <td className="py-1.5 pr-2">
                  <p className="truncate text-[11px] font-semibold">
                    {row.name}
                  </p>
                  <p className="text-muted-foreground text-[10px] tabular-nums">
                    {row.employeeNumber}
                  </p>
                </td>
                <td className="py-1.5 pr-2 text-[11px] font-medium">
                  {row.grade}
                </td>
                <td className="py-1.5 pr-2 text-right text-[11px] font-semibold tabular-nums">
                  {row.score === null ? "—" : row.score}
                </td>
                <td className="py-1.5 pr-2">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap",
                      statusTone(row.status),
                    )}
                  >
                    {statusLabel(row.status)}
                  </span>
                </td>
                <td className="py-1.5 text-right">
                  <Link
                    href={row.href}
                    aria-label={`Open ${row.name} in the house queue`}
                    className="focus-visible:ring-ring hover:bg-muted inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
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
