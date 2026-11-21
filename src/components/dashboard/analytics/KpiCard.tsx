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

const tones: Record<
  HouseAnalyticsKpi["variant"],
  { accent: string; icon: string; glow: string }
> = {
  brass: {
    accent: "before:bg-brass-500",
    icon: "border-brass-500/25 bg-brass-500/10 text-brass-600 dark:text-brass-300",
    glow: "from-brass-500/15",
  },
  navy: {
    accent: "before:bg-sky-500",
    icon: "border-sky-500/25 bg-sky-500/10 text-sky-600 dark:text-sky-300",
    glow: "from-sky-500/15",
  },
  warning: {
    accent: "before:bg-amber-500",
    icon: "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-300",
    glow: "from-amber-500/15",
  },
  destructive: {
    accent: "before:bg-destructive",
    icon: "border-destructive/25 bg-destructive/10 text-destructive",
    glow: "from-destructive/15",
  },
  success: {
    accent: "before:bg-emerald-500",
    icon: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
    glow: "from-emerald-500/15",
  },
};

interface KpiCardProps {
  kpi: HouseAnalyticsKpi;
}

export default function KpiCard({ kpi }: KpiCardProps) {
  const Icon = icons[kpi.id] ?? Building2;
  const tone = tones[kpi.variant];
  const trend = kpi.trend;
  const hasTrend = typeof trend === "number" && Number.isFinite(trend);
  const value = trend ?? 0;
  const positive = kpi.positiveIsGood ? value >= 0 : value <= 0;
  const TrendIcon =
    value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;
  const displayValue =
    kpi.unit === "percent"
      ? `${kpi.value.toLocaleString()}%`
      : kpi.value.toLocaleString();

  return (
    <Link
      href={kpi.href}
      title={kpi.hint}
      aria-label={`${kpi.label}: ${displayValue}`}
      className={cn(
        "group border-border/70 bg-card/80 relative flex h-full min-w-0 flex-col justify-between overflow-hidden rounded-xl border p-2.5 shadow-[0_1px_2px_hsl(var(--foreground)/0.04)] backdrop-blur-sm transition-all duration-200",
        "before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:content-['']",
        "hover:border-brass-500/40 hover:bg-card hover:-translate-y-0.5 hover:shadow-[0_14px_32px_-20px_hsl(var(--foreground)/0.55)]",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
        tone.accent,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -right-10 -bottom-12 h-28 w-28 rounded-full bg-gradient-to-tl to-transparent opacity-70 transition-opacity duration-200 group-hover:opacity-100",
          tone.glow,
        )}
      />

      <div className="relative flex items-start justify-between gap-2">
        <p className="text-muted-foreground line-clamp-1 text-[10px] font-semibold tracking-[0.12em] uppercase">
          {kpi.label}
        </p>
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-transform duration-200 group-hover:scale-105",
            tone.icon,
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>

      <div className="relative mt-1.5 flex items-end justify-between gap-2">
        <span className="text-2xl leading-none font-semibold tracking-tight tabular-nums xl:text-xl 2xl:text-3xl">
          {displayValue}
        </span>
        {hasTrend ? (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
              positive
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-destructive/10 text-destructive",
            )}
          >
            <TrendIcon className="h-3 w-3" />
            {Math.abs(value).toFixed(0)}%
          </span>
        ) : (
          <span className="text-muted-foreground bg-muted/70 rounded-full px-1.5 py-0.5 text-[10px] font-medium">
            No trend
          </span>
        )}
      </div>

      <MiniSparkline
        values={kpi.sparkline}
        positive={positive}
        className="relative mt-2 h-4 w-full xl:h-3"
      />
    </Link>
  );
}
