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
      color: "hsl(var(--primary))",
    },
    {
      label: "Ready",
      value: funnel.ready,
      href: "/house-queue?status=ready_for_allocation",
      color: "hsl(var(--success))",
    },
    {
      label: "Allocated",
      value: funnel.allocated,
      href: "/houses/allocated",
      color: "var(--color-brass-500)",
    },
    {
      label: "No house",
      value: funnel.noHouse,
      href: "/house-queue?status=no_house_available",
      color: "hsl(var(--warning))",
    },
    {
      label: "Not eligible",
      value: funnel.notEligible,
      href: "/house-queue?status=not_eligible",
      color: "hsl(var(--destructive))",
    },
  ];
  const max = Math.max(1, ...stages.map((stage) => stage.value));
  const conversion =
    funnel.eligible > 0
      ? Math.round((funnel.allocated / funnel.eligible) * 100)
      : 0;

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-0.5">
      <div className="mb-0.5 flex items-center justify-between text-[9px]">
        <span className="text-muted-foreground tracking-wider uppercase">
          Eligible → allocated
        </span>
        <span className="text-foreground font-semibold tabular-nums">
          {conversion}%
        </span>
      </div>
      {stages.map((stage) => (
        <Link
          key={stage.label}
          href={stage.href}
          className="hover:bg-muted/50 block min-h-5 rounded-md px-1 py-0.5 transition-colors"
        >
          <div className="mb-0.5 flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">{stage.label}</span>
            <span className="font-semibold tabular-nums">{stage.value}</span>
          </div>
          <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{
                width: `${(stage.value / max) * 100}%`,
                backgroundColor: stage.color,
              }}
            />
          </div>
        </Link>
      ))}
      <p className="text-muted-foreground border-border/60 pt-1 text-[9px] tabular-nums">
        {funnel.skipped} skipped · {funnel.deferred} deferred
      </p>
    </div>
  );
}
