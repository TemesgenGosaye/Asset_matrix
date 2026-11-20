import Link from "next/link";
import {
  AlertTriangle,
  ClipboardCheck,
  House,
  LogOut,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { HouseAnalyticsResponse } from "@/lib/house-analytics/contract";
import { cn } from "@/lib/utils";

type Data = HouseAnalyticsResponse;

type Tone = "warning" | "danger" | "brass" | "navy" | "success";

interface Wish {
  id: string;
  label: string;
  detail: string;
  value: string;
  href: string;
  icon: LucideIcon;
  tone: Tone;
}

const tones: Record<Tone, string> = {
  warning: "bg-warning-bg text-warning-foreground",
  danger: "bg-destructive/10 text-destructive",
  brass: "bg-brass-500/10 text-brass-600 dark:text-brass-300",
  navy: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  success: "bg-success-bg text-success-foreground",
};

interface WishlistPanelProps {
  data: Data;
}

export default function WishlistPanel({ data }: WishlistPanelProps) {
  const awaiting = data.statusDistribution.find(
    (segment) => segment.name === "Awaiting inspection",
  );
  const inactive = data.statusDistribution.find(
    (segment) => segment.name === "Inactive / damaged",
  );
  const topShortage = [...data.supplyDemand].sort(
    (a, b) => b.shortage - a.shortage,
  )[0];
  const topRelease = [...data.releaseReasons].sort(
    (a, b) => b.value - a.value,
  )[0];
  const inactiveTotal = data.housesByType.reduce(
    (sum, row) => sum + row.inactive,
    0,
  );

  const wishes: Wish[] = [];
  if (awaiting && awaiting.value > 0) {
    wishes.push({
      id: "inspections",
      label: "Clear inspection backlog",
      detail: `${awaiting.value} houses awaiting handback inspection`,
      value: String(awaiting.value),
      href: awaiting.href,
      icon: ClipboardCheck,
      tone: "warning",
    });
  }
  if (topShortage && topShortage.shortage > 0) {
    wishes.push({
      id: "shortage",
      label: `Rebalance band ${topShortage.band}`,
      detail: `${topShortage.demand} eligible against ${topShortage.supply} free`,
      value: `-${topShortage.shortage}`,
      href: topShortage.href,
      icon: House,
      tone: "danger",
    });
  }
  if (data.funnel.noHouse > 0) {
    wishes.push({
      id: "no-house",
      label: "Unlock blocked demand",
      detail: `${data.funnel.noHouse} ready requesters have no house`,
      value: String(data.funnel.noHouse),
      href: "/house-queue?status=no_house_available",
      icon: AlertTriangle,
      tone: "brass",
    });
  }
  if (data.funnel.notEligible > 0) {
    wishes.push({
      id: "eligibility",
      label: "Review eligibility refusals",
      detail: `${data.funnel.notEligible} requesters outside current rules`,
      value: String(data.funnel.notEligible),
      href: "/house-queue?status=not_eligible",
      icon: Users,
      tone: "navy",
    });
  }
  if (inactiveTotal > 0 && inactive) {
    wishes.push({
      id: "inactive",
      label: "Return inactive stock",
      detail: `${inactiveTotal} houses inactive or under maintenance`,
      value: String(inactiveTotal),
      href: inactive.href,
      icon: Wrench,
      tone: "warning",
    });
  }
  if (topRelease && topRelease.value > 0) {
    wishes.push({
      id: "releases",
      label: "Review top exit reason",
      detail: `${topRelease.name} accounts for ${topRelease.value} releases`,
      value: String(topRelease.value),
      href: topRelease.href,
      icon: LogOut,
      tone: "success",
    });
  }

  const visible = wishes.slice(0, 4);

  if (visible.length === 0) {
    return (
      <p className="text-muted-foreground flex h-full min-h-20 items-center justify-center text-center text-[10px]">
        No priority actions from the live register in this range.
      </p>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-1">
      {visible.map((wish, index) => {
        const Icon = wish.icon;
        return (
          <Link
            key={wish.id}
            href={wish.href}
            className="border-border/60 bg-background/40 hover:border-brass-500/50 hover:bg-card grid min-h-8 grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border px-2 transition-all duration-150 hover:shadow-sm"
          >
            <span className="text-muted-foreground text-[10px] font-semibold tabular-nums">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[11px] leading-tight font-semibold">
                {wish.label}
              </span>
              <span className="text-muted-foreground block truncate text-[10px] leading-tight">
                {wish.detail}
              </span>
            </span>
            <span
              className={cn(
                "inline-flex min-w-8 items-center justify-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold tabular-nums",
                tones[wish.tone],
              )}
            >
              <Icon className="h-3 w-3" aria-hidden />
              {wish.value}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
