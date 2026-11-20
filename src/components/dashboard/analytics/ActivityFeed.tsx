import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { HouseAnalyticsResponse } from "@/lib/house-analytics/contract";
import ChartCard from "./ChartCard";

type ActivityItem = HouseAnalyticsResponse["activity"][number];

function formatUtc(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

interface ActivityFeedProps {
  items: readonly ActivityItem[];
}

export default function ActivityFeed({ items }: ActivityFeedProps) {
  return (
    <ChartCard
      eyebrow="Audit trail"
      title="Recent activity"
      description="Latest audited house-queue actions"
      className="h-full"
    >
      {items.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-xs">
          No house-queue activity in this period.
        </p>
      ) : (
        <ul className="divide-border/60 divide-y">
          {items.slice(0, 3).map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className="group hover:bg-muted/40 -mx-2 flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">
                    {item.description}
                  </p>
                  <p className="text-muted-foreground text-[10px]">
                    {formatUtc(item.at)} UTC
                  </p>
                </div>
                <ArrowUpRight className="text-muted-foreground group-hover:text-primary h-4 w-4 shrink-0 transition-colors" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}
