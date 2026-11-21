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
  { accent: string; icon: string }
> = {
  brass: {
    accent: "before:bg-amber-400",
    icon: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  },
  navy: {
    accent: "before:bg-sky-400",
    icon: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  },
  warning: {
    accent: "before:bg-amber-400",
    icon: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  },
  destructive: {
    accent: "before:bg-rose-400",
    icon: "border-rose-400/30 bg-rose-400/10 text-rose-300",
  },
  success: {
    accent: "before:bg-emerald-400",
    icon: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
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
        "group relative flex h-full min-w-0 flex-col justify-between overflow-hidden rounded-none border border-slate-700 bg-slate-800 p-2.5 transition-all duration-200",
        "before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:content-['']",
        "hover:-translate-y-0.5 hover:border-amber-400/60 hover:bg-slate-700",
        "focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 focus-visible:outline-none",
        tone.accent,
      )}
    >
      <div className="relative flex items-start justify-between gap-2">
        <p className="line-clamp-1 text-[10px] font-semibold tracking-[0.12em] text-slate-400 uppercase">
          {kpi.label}
        </p>
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-none border transition-transform duration-200 group-hover:scale-105",
            tone.icon,
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>

      <div className="relative mt-1.5 flex items-end justify-between gap-2">
        <span className="text-2xl leading-none font-semibold tracking-tight text-slate-50 tabular-nums xl:text-xl 2xl:text-3xl">
          {displayValue}
        </span>
        {hasTrend ? (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-0.5 rounded-none px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
              positive
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-rose-500/15 text-rose-300",
            )}
          >
            <TrendIcon className="h-3 w-3" />
            {Math.abs(value).toFixed(0)}%
          </span>
        ) : (
          <span className="rounded-none bg-slate-700 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
            No trend
          </span>
        )}
      </div>

      <MiniSparkline
        values={kpi.sparkline}
        positive={positive}
        className={cn(
          "relative mt-2 h-4 w-full xl:h-3",
          positive ? "text-emerald-400" : "text-rose-400",
        )}
      />
    </Link>
  );
}
