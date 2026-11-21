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
  "total-employees": Users,
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
        "group border-border/70 bg-card/70 relative flex h-full min-w-0 flex-col justify-between overflow-hidden rounded-lg border p-2 transition-all duration-200 sm:p-2.5",
        "before:absolute before:inset-x-0 before:top-0 before:h-px before:content-['']",
        "hover:border-brass-500/40 hover:bg-card hover:-translate-y-px hover:shadow-[0_10px_30px_-18px_hsl(var(--foreground)_/_0.45)]",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
        accents[kpi.variant],
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-muted-foreground line-clamp-1 text-[10px] font-semibold tracking-[0.09em] uppercase">
          {kpi.label}
        </p>
        <Icon className="text-muted-foreground group-hover:text-brass-500 h-3.5 w-3.5 shrink-0 transition-colors" />
      </div>

      <div className="mt-1.5 flex items-end justify-between gap-2">
        <span className="text-base leading-none font-semibold tracking-tight tabular-nums sm:text-lg 2xl:text-2xl">
          {kpi.value.toLocaleString()}
        </span>
        {hasTrend && (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
              positive
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-destructive/10 text-destructive",
            )}
          >
            <TrendIcon className="h-3 w-3" />
            {Math.abs(value).toFixed(0)}%
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <MiniSparkline
          values={kpi.sparkline}
          positive={positive}
          className="hidden h-3 w-full sm:block xl:h-3"
        />
      </div>
    </Link>
  );
}
