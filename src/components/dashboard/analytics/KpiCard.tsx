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
  { accent: string; iconText: string }
> = {
  brass: {
    accent: "before:bg-amber-500",
    iconText: "text-amber-700 dark:text-amber-300",
  },
  navy: {
    accent: "before:bg-sky-500",
    iconText: "text-sky-700 dark:text-sky-300",
  },
  warning: {
    accent: "before:bg-amber-500",
    iconText: "text-amber-700 dark:text-amber-300",
  },
  destructive: {
    accent: "before:bg-rose-500",
    iconText: "text-rose-700 dark:text-rose-300",
  },
  success: {
    accent: "before:bg-emerald-500",
    iconText: "text-emerald-700 dark:text-emerald-300",
  },
};

interface CardTheme {
  surface: string;
  border: string;
  hover: string;
  accent: string;
  icon: string;
  iconText: string;
  label: string;
}

const cardThemes: Record<string, CardTheme> = {
  "total-houses": {
    surface: "bg-card",
    border: "border-border/70",
    hover:
      "hover:border-sky-400/60 hover:bg-sky-50/60 dark:hover:bg-sky-950/20",
    accent: "before:bg-sky-500",
    icon: "border-sky-200 bg-sky-50 dark:border-sky-800/60 dark:bg-sky-950/30",
    iconText: "text-sky-700 dark:text-sky-300",
    label: "text-muted-foreground",
  },
  requests: {
    surface: "bg-card",
    border: "border-border/70",
    hover:
      "hover:border-cyan-400/60 hover:bg-cyan-50/60 dark:hover:bg-cyan-950/20",
    accent: "before:bg-cyan-500",
    icon: "border-cyan-200 bg-cyan-50 dark:border-cyan-800/60 dark:bg-cyan-950/30",
    iconText: "text-cyan-700 dark:text-cyan-300",
    label: "text-muted-foreground",
  },
  "allocated-month": {
    surface: "bg-card",
    border: "border-border/70",
    hover:
      "hover:border-emerald-400/60 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/20",
    accent: "before:bg-emerald-500",
    icon: "border-emerald-200 bg-emerald-50 dark:border-emerald-800/60 dark:bg-emerald-950/30",
    iconText: "text-emerald-700 dark:text-emerald-300",
    label: "text-muted-foreground",
  },
  "released-month": {
    surface: "bg-card",
    border: "border-border/70",
    hover:
      "hover:border-rose-400/60 hover:bg-rose-50/60 dark:hover:bg-rose-950/20",
    accent: "before:bg-rose-500",
    icon: "border-rose-200 bg-rose-50 dark:border-rose-800/60 dark:bg-rose-950/30",
    iconText: "text-rose-700 dark:text-rose-300",
    label: "text-muted-foreground",
  },
  "total-employees": {
    surface: "bg-card",
    border: "border-border/70",
    hover:
      "hover:border-indigo-400/60 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/20",
    accent: "before:bg-indigo-500",
    icon: "border-indigo-200 bg-indigo-50 dark:border-indigo-800/60 dark:bg-indigo-950/30",
    iconText: "text-indigo-700 dark:text-indigo-300",
    label: "text-muted-foreground",
  },
};

interface KpiCardProps {
  kpi: HouseAnalyticsKpi;
}

export default function KpiCard({ kpi }: KpiCardProps) {
  const Icon = icons[kpi.id] ?? Building2;
  const variantTone = tones[kpi.variant];
  const theme = cardThemes[kpi.id] ?? {
    surface: "bg-card",
    border: "border-border/70",
    hover: "hover:border-primary/50 hover:bg-accent/50",
    accent: variantTone.accent,
    icon: "border-border bg-muted/50",
    iconText: variantTone.iconText,
    label: "text-muted-foreground",
  };
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
        "group relative flex h-full min-w-0 flex-col justify-between overflow-hidden rounded-xl border p-3 shadow-[var(--shadow-sm)] transition-all duration-200",
        theme.surface,
        theme.border,
        "before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:content-['']",
        theme.accent,
        "hover:-translate-y-0.5",
        theme.hover,
        "focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
      )}
    >
      <div className="relative flex items-start justify-between gap-2">
        <p
          className={cn(
            "text-muted-foreground line-clamp-1 text-[10px] font-semibold tracking-[0.12em] uppercase",
            theme.label,
          )}
        >
          {kpi.label}
        </p>
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-transform duration-200 group-hover:scale-105",
            theme.icon,
          )}
        >
          <Icon className={cn("h-3.5 w-3.5", theme.iconText)} />
        </span>
      </div>

      <div className="relative mt-1.5 flex items-end justify-between gap-2">
        <span className="text-foreground text-2xl leading-none font-semibold tracking-tight tabular-nums xl:text-xl 2xl:text-3xl">
          {displayValue}
        </span>
        {hasTrend ? (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
              value === 0
                ? "bg-muted text-muted-foreground"
                : positive
                  ? "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                  : "bg-destructive/10 text-destructive dark:bg-destructive/15 dark:text-red-300",
            )}
          >
            <TrendIcon className="h-3 w-3" />
            {Math.abs(value).toFixed(0)}%
          </span>
        ) : (
          <span className="text-muted-foreground bg-muted rounded-md px-1.5 py-0.5 text-[10px] font-medium">
            No trend
          </span>
        )}
      </div>

      <MiniSparkline
        values={kpi.sparkline}
        positive={positive}
        className={cn(
          "relative mt-2 h-4 w-full xl:h-3",
          positive ? "text-emerald-600" : "text-destructive",
        )}
      />
    </Link>
  );
}
