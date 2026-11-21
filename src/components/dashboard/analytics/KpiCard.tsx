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

interface CardTheme {
  surface: string;
  border: string;
  hover: string;
  accent: string;
  icon: string;
  label: string;
}

const cardThemes: Record<string, CardTheme> = {
  "total-houses": {
    surface: "bg-[#123A57]",
    border: "border-[#2E6B90]",
    hover: "hover:bg-[#184B6D]",
    accent: "before:bg-sky-300",
    icon: "border-sky-300/30 bg-sky-300/10 text-sky-200",
    label: "text-sky-200/80",
  },
  requests: {
    surface: "bg-[#0F4C59]",
    border: "border-[#2A7F8C]",
    hover: "hover:bg-[#145E6D]",
    accent: "before:bg-cyan-300",
    icon: "border-cyan-300/30 bg-cyan-300/10 text-cyan-200",
    label: "text-cyan-200/80",
  },
  "allocated-month": {
    surface: "bg-[#15543C]",
    border: "border-[#2F8060]",
    hover: "hover:bg-[#1B684B]",
    accent: "before:bg-emerald-300",
    icon: "border-emerald-300/30 bg-emerald-300/10 text-emerald-200",
    label: "text-emerald-200/80",
  },
  "released-month": {
    surface: "bg-[#5A2433]",
    border: "border-[#8F4153]",
    hover: "hover:bg-[#6D2C3E]",
    accent: "before:bg-rose-300",
    icon: "border-rose-300/30 bg-rose-300/10 text-rose-200",
    label: "text-rose-200/80",
  },
  "total-employees": {
    surface: "bg-[#332D63]",
    border: "border-[#5B54A0]",
    hover: "hover:bg-[#403976]",
    accent: "before:bg-indigo-300",
    icon: "border-indigo-300/30 bg-indigo-300/10 text-indigo-200",
    label: "text-indigo-200/80",
  },
};

interface KpiCardProps {
  kpi: HouseAnalyticsKpi;
}

export default function KpiCard({ kpi }: KpiCardProps) {
  const Icon = icons[kpi.id] ?? Building2;
  const variantTone = tones[kpi.variant];
  const theme = cardThemes[kpi.id] ?? {
    surface: "bg-slate-800",
    border: "border-slate-700",
    hover: "hover:bg-slate-700",
    accent: variantTone.accent,
    icon: variantTone.icon,
    label: "text-slate-400",
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
        "group relative flex h-full min-w-0 flex-col justify-between overflow-hidden rounded-none border p-2.5 transition-all duration-200",
        theme.surface,
        theme.border,
        "before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:content-['']",
        theme.accent,
        "hover:-translate-y-0.5 hover:border-white/40",
        theme.hover,
        "focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 focus-visible:outline-none",
      )}
    >
      <div className="relative flex items-start justify-between gap-2">
        <p
          className={cn(
            "line-clamp-1 text-[10px] font-semibold tracking-[0.12em] uppercase",
            theme.label,
          )}
        >
          {kpi.label}
        </p>
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-none border transition-transform duration-200 group-hover:scale-105",
            theme.icon,
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
              value === 0
                ? "bg-white/10 text-slate-200"
                : positive
                  ? "bg-emerald-500/20 text-emerald-200"
                  : "bg-rose-500/20 text-rose-200",
            )}
          >
            <TrendIcon className="h-3 w-3" />
            {Math.abs(value).toFixed(0)}%
          </span>
        ) : (
          <span className="rounded-none bg-black/20 px-1.5 py-0.5 text-[10px] font-medium text-slate-300">
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
