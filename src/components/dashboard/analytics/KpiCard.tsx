import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CircleCheck,
  ClipboardCheck,
  DoorOpen,
  House,
  Inbox,
  LogOut,
  Minus,
  UserCheck,
  Users,
  UserX,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { HouseAnalyticsKpi } from "@/lib/house-analytics/contract";
import { cn } from "@/lib/utils";
import MiniSparkline from "./MiniSparkline";

const icons: Record<string, LucideIcon> = {
  "total-houses": Building2,
  "free-houses": DoorOpen,
  "occupied-houses": House,
  "awaiting-inspection": ClipboardCheck,
  "inactive-houses": Wrench,
  requests: Inbox,
  "queue-ready": UserCheck,
  "not-eligible": UserX,
  "no-house-available": Users,
  "allocated-month": CircleCheck,
  "released-month": LogOut,
};

const accents: Record<HouseAnalyticsKpi["variant"], string> = {
  brass: "before:bg-brass-500",
  navy: "before:bg-sky-500",
  warning: "before:bg-amber-500",
  destructive: "before:bg-destructive",
  success: "before:bg-emerald-500",
};

interface KpiCardProps {
  kpi: HouseAnalyticsKpi;
}

export default function KpiCard({ kpi }: KpiCardProps) {
  const Icon = icons[kpi.id] ?? Building2;
  const trend = kpi.trend;
  const hasTrend = typeof trend === "number" && Number.isFinite(trend);
  const value = trend ?? 0;
  const positive = kpi.positiveIsGood ? value >= 0 : value <= 0;
  const TrendIcon =
    value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;

  return (
    <Link
      href={kpi.href}
      title={kpi.hint}
      className={cn(
        "group border-border/80 bg-card/80 relative flex h-full min-w-0 flex-col justify-between overflow-hidden border p-2.5 transition-colors duration-150 xl:p-2",
        "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-['']",
        "hover:border-brass-500/50 hover:bg-card",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
        accents[kpi.variant],
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-muted-foreground line-clamp-1 text-[10px] font-semibold tracking-[0.09em] uppercase">
          {kpi.label}
        </p>
        <span className="border-border/60 bg-muted/40 text-muted-foreground group-hover:text-brass-600 group-hover:border-brass-500/40 flex h-5 w-5 shrink-0 items-center justify-center border transition-colors">
          <Icon className="h-3 w-3" aria-hidden />
        </span>
      </div>

      <div className="mt-1.5 flex items-end justify-between gap-2">
        <span className="text-xl leading-none font-semibold tracking-tight tabular-nums xl:text-lg 2xl:text-2xl">
          {kpi.value.toLocaleString()}
        </span>
        {hasTrend ? (
          <span
            className={cn(
              "border-border/60 inline-flex shrink-0 items-center gap-0.5 border px-1 py-0.5 text-[10px] font-medium tabular-nums",
              positive
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-destructive/10 text-destructive",
            )}
          >
            <TrendIcon className="h-3 w-3" aria-hidden />
            {Math.abs(value).toFixed(0)}%
          </span>
        ) : null}
      </div>

      <MiniSparkline
        values={kpi.sparkline}
        positive={positive}
        className="mt-1.5 h-4 w-full opacity-70 xl:h-3"
      />
    </Link>
  );
}
