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

const accents = {
  brass: {
    bar: "before:bg-brass-500",
    dot: "bg-brass-500",
    chip: "bg-brass-500/10 text-brass-600 dark:text-brass-300",
  },
  navy: {
    bar: "before:bg-sky-500",
    dot: "bg-sky-500",
    chip: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  },
  warning: {
    bar: "before:bg-amber-500",
    dot: "bg-amber-500",
    chip: "bg-warning-bg text-warning-foreground",
  },
  destructive: {
    bar: "before:bg-destructive",
    dot: "bg-destructive",
    chip: "bg-destructive/10 text-destructive",
  },
  success: {
    bar: "before:bg-emerald-500",
    dot: "bg-emerald-500",
    chip: "bg-success-bg text-success-foreground",
  },
} satisfies Record<
  HouseAnalyticsKpi["variant"],
  { bar: string; dot: string; chip: string }
>;

interface KpiCardProps {
  kpi: HouseAnalyticsKpi;
  size?: "featured" | "compact";
}

export default function KpiCard({ kpi, size = "featured" }: KpiCardProps) {
  const Icon = icons[kpi.id] ?? Building2;
  const accent = accents[kpi.variant];
  const trend = kpi.trend;
  const hasTrend = typeof trend === "number" && Number.isFinite(trend);
  const value = trend ?? 0;
  const positive = kpi.positiveIsGood ? value >= 0 : value <= 0;
  const TrendIcon =
    value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;

  const focusRing =
    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none";

  if (size === "compact") {
    return (
      <Link
        href={kpi.href}
        title={kpi.hint}
        className={cn(
          "group border-border/60 bg-card/60 flex min-h-9 items-center gap-2 rounded-lg border px-2.5 transition-all duration-150",
          "hover:border-foreground/20 hover:bg-card hover:-translate-y-px hover:shadow-sm",
          focusRing,
        )}
      >
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", accent.dot)} />
        <span className="text-muted-foreground min-w-0 flex-1 truncate text-[10px] font-medium">
          {kpi.label}
        </span>
        <span className="text-sm leading-none font-semibold tabular-nums xl:text-[13px]">
          {kpi.value.toLocaleString()}
        </span>
        {hasTrend ? (
          <TrendIcon
            className={cn(
              "h-3 w-3 shrink-0",
              positive ? "text-emerald-500" : "text-destructive",
            )}
            aria-hidden
          />
        ) : null}
      </Link>
    );
  }

  return (
    <Link
      href={kpi.href}
      title={kpi.hint}
      className={cn(
        "group border-border/70 bg-card/90 relative flex min-h-[78px] flex-col justify-between overflow-hidden rounded-xl border px-3 py-2 transition-all duration-200",
        "before:absolute before:inset-x-0 before:top-0 before:h-[2px] before:content-['']",
        "hover:border-foreground/20 hover:bg-card hover:-translate-y-px hover:shadow-[0_8px_24px_-16px_hsl(var(--foreground)_/_0.4)]",
        focusRing,
        accent.bar,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-muted-foreground min-w-0 truncate text-[10px] leading-none font-semibold tracking-[0.1em] uppercase">
          {kpi.label}
        </p>
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
            accent.chip,
          )}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
      </div>

      <div className="mt-1 flex items-end justify-between gap-2">
        <span className="text-2xl leading-none font-semibold tracking-tight tabular-nums xl:text-[26px]">
          {kpi.value.toLocaleString()}
        </span>
        {hasTrend ? (
          <span
            className={cn(
              "mb-0.5 inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] leading-none font-semibold tabular-nums",
              positive
                ? "bg-success-bg text-success-foreground"
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
        className="mt-1 h-4 w-full"
      />
    </Link>
  );
}
