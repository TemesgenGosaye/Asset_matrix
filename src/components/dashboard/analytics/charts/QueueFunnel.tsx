import Link from "next/link";
import type { HouseAnalyticsResponse } from "@/lib/house-analytics/contract";

type Funnel = HouseAnalyticsResponse["funnel"];

interface QueueFunnelProps {
  funnel: Funnel;
}

export default function QueueFunnel({ funnel }: QueueFunnelProps) {
  const stages: Array<{
    label: string;
    value: number;
    href: string;
    color: string;
  }> = [
    {
      label: "Eligible",
      value: funnel.eligible,
      href: "/house-queue",
      color: "hsl(var(--chart-1))",
    },
    {
      label: "Ready",
      value: funnel.ready,
      href: "/house-queue?status=ready_for_allocation",
      color: "hsl(var(--chart-2))",
    },
    {
      label: "Allocated",
      value: funnel.allocated,
      href: "/houses/allocated",
      color: "hsl(var(--chart-3))",
    },
    {
      label: "No house",
      value: funnel.noHouse,
      href: "/house-queue?status=no_house_available",
      color: "hsl(var(--chart-4))",
    },
    {
      label: "Not eligible",
      value: funnel.notEligible,
      href: "/house-queue?status=not_eligible",
      color: "hsl(var(--chart-5))",
    },
  ];
  const max = Math.max(1, ...stages.map((stage) => stage.value));

  return (
    <div className="flex h-full min-h-0 flex-col justify-center space-y-1.5">
      {stages.map((stage) => (
        <Link
          key={stage.label}
          href={stage.href}
          className="hover:bg-muted/40 block min-h-11 rounded-lg px-1 py-0.5 transition-colors xl:min-h-6"
        >
          <div className="mb-0.5 flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">{stage.label}</span>
            <span className="font-semibold tabular-nums">{stage.value}</span>
          </div>
          <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(stage.value / max) * 100}%`,
                backgroundColor: stage.color,
              }}
            />
          </div>
        </Link>
      ))}
      <p className="text-muted-foreground border-border/60 pt-1 text-[10px]">
        {funnel.skipped} skipped · {funnel.deferred} deferred in the active
        queue
      </p>
    </div>
  );
}
