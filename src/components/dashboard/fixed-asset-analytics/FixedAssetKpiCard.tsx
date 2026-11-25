import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  Building2,
  CircleCheck,
  ClipboardCheck,
  Minus,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import MiniSparkline from "@/components/dashboard/analytics/MiniSparkline";
import type { FixedAssetAnalyticsKpi } from "@/lib/fixed-asset-analytics/contract";
import { cn } from "@/lib/utils";

const icons: Record<string, LucideIcon> = {
  "total-assets": Boxes,
  "department-coverage": Building2,
  "reviewed-12m": ClipboardCheck,
  "good-condition": CircleCheck,
  "needs-review": TriangleAlert,
};

const tones: Record<
  FixedAssetAnalyticsKpi["variant"],
  { accent: string; icon: string }
> = {
  brass: {
    accent: "before:bg-amber-500",
    icon: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300",
  },
  navy: {
    accent: "before:bg-sky-500",
    icon: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800/60 dark:bg-sky-950/30 dark:text-sky-300",
  },
  success: {
    accent: "before:bg-emerald-500",
    icon: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300",
  },
  warning: {
    accent: "before:bg-amber-500",
    icon: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300",
  },
  destructive: {
    accent: "before:bg-rose-500",
    icon: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/30 dark:text-rose-300",
  },
};

interface FixedAssetKpiCardProps {
  kpi: FixedAssetAnalyticsKpi;
}

export default function FixedAssetKpiCard({ kpi }: FixedAssetKpiCardProps) {
  const Icon = icons[kpi.id] ?? Boxes;
  const tone = tones[kpi.variant];
  const hasTrend = typeof kpi.trend === "number" && Number.isFinite(kpi.trend);
  const trend = kpi.trend ?? 0;
  const positive = kpi.positiveIsGood ? trend >= 0 : trend <= 0;
  const TrendIcon =
    trend > 0 ? ArrowUpRight : trend < 0 ? ArrowDownRight : Minus;
  const display =
    kpi.unit === "percent"
      ? `${kpi.value.toLocaleString()}%`
      : kpi.value.toLocaleString();

  return (
    <Link
      href={kpi.href}
      title={kpi.hint}
      aria-label={`${kpi.label}: ${display}`}
      className={cn(
        "group border-border/70 bg-card relative flex h-full min-w-0 flex-col justify-between overflow-hidden rounded-xl border p-3 shadow-[var(--shadow-sm)] transition-all duration-200",
        "before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:content-['']",
        tone.accent,
        "hover:border-primary/50 hover:bg-accent/50 hover:-translate-y-0.5",
        "focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-muted-foreground line-clamp-1 text-[10px] font-semibold tracking-[0.14em] uppercase">
          {kpi.label}
        </p>
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition-transform duration-200 group-hover:scale-105",
            tone.icon,
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <span className="text-foreground text-[1.7rem] leading-none font-semibold tracking-tight tabular-nums xl:text-xl 2xl:text-[2rem]">
          {display}
        </span>
        {hasTrend ? (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-0.5 rounded-lg px-2 py-1 text-[10px] font-semibold tabular-nums",
              trend === 0
                ? "bg-muted text-muted-foreground"
                : positive
                  ? "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                  : "bg-destructive/10 text-destructive dark:bg-destructive/15 dark:text-red-300",
            )}
          >
            <TrendIcon className="h-3 w-3" />
            {Math.abs(trend).toFixed(1)}%
          </span>
        ) : (
          <span className="text-muted-foreground bg-muted/70 rounded-lg px-2 py-1 text-[10px] font-medium">
            Baseline
          </span>
        )}
      </div>
      <MiniSparkline
        values={kpi.sparkline}
        positive={positive}
        className="mt-2.5 h-4 w-full xl:h-3"
      />
    </Link>
  );
}
