"use client";

import React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type MetricCardVariant =
  | "brass"
  | "navy"
  | "warning"
  | "destructive"
  | "success"
  | "default";

export interface MetricCardProps {
  title: string;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: LucideIcon;
  variant?: MetricCardVariant;
  trend?: {
    value: number;
    label?: string;
    positiveIsGood?: boolean;
  };
  badge?: string;
  breakdown?: Array<{
    label: string;
    value: number | string;
  }>;
  href?: string;
  className?: string;
}

export default function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = "brass",
  trend,
  badge,
  breakdown,
  href,
  className,
}: MetricCardProps) {
  const variantStyles = {
    brass: {
      accentBar: "bg-gradient-to-r from-brass-400 via-brass-500 to-transparent",
      iconBg: "bg-brass-500/10 text-brass-600 dark:text-brass-300 border-brass-500/20",
      valueColor: "text-foreground group-hover:text-brass-600 dark:group-hover:text-brass-400",
      badgeStyle: "bg-brass-50 dark:bg-brass-950/40 text-brass-700 dark:text-brass-300 border-brass-200 dark:border-brass-800",
    },
    navy: {
      accentBar: "bg-gradient-to-r from-blue-500 via-sky-500 to-transparent",
      iconBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
      valueColor: "text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400",
      badgeStyle: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    },
    warning: {
      accentBar: "bg-gradient-to-r from-amber-500 to-transparent",
      iconBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
      valueColor: "text-foreground group-hover:text-amber-600 dark:group-hover:text-amber-400",
      badgeStyle: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    },
    destructive: {
      accentBar: "bg-gradient-to-r from-destructive to-transparent",
      iconBg: "bg-destructive/10 text-destructive border-destructive/20",
      valueColor: "text-foreground group-hover:text-destructive",
      badgeStyle: "bg-rose-50 dark:bg-rose-950/40 text-destructive border-rose-200 dark:border-rose-900",
    },
    success: {
      accentBar: "bg-gradient-to-r from-emerald-500 to-transparent",
      iconBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
      valueColor: "text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400",
      badgeStyle: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    },
    default: {
      accentBar: "bg-gradient-to-r from-border to-transparent",
      iconBg: "bg-muted text-muted-foreground border-border",
      valueColor: "text-foreground",
      badgeStyle: "bg-muted text-muted-foreground border-border",
    },
  }[variant];

  const cardContent = (
    <Card
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
        className,
      )}
    >
      {/* Top accent line */}
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-[2px] transition-opacity",
          variantStyles.accentBar,
        )}
      />

      <CardContent className="p-4 sm:p-5 flex flex-col justify-between h-full">
        <div>
          {/* Header: Title, Badge & Icon */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                {title}
              </span>
              {badge && (
                <span
                  className={cn(
                    "inline-flex w-fit items-center rounded px-1.5 py-0.5 text-[10px] font-semibold border",
                    variantStyles.badgeStyle,
                  )}
                >
                  {badge}
                </span>
              )}
            </div>

            {Icon && (
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-transform duration-200 group-hover:scale-105",
                  variantStyles.iconBg,
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
            )}
          </div>

          {/* Main Value Display */}
          <div className="mt-3 flex items-baseline gap-2">
            <div
              className={cn(
                "housing-serif text-2xl sm:text-3xl font-bold tracking-tight transition-colors",
                variantStyles.valueColor,
              )}
            >
              {value}
            </div>
          </div>

          {/* Subtitle */}
          {subtitle && (
            <div className="mt-1 text-xs text-muted-foreground leading-relaxed">
              {subtitle}
            </div>
          )}

          {/* Compact Breakdown Strip */}
          {breakdown && breakdown.length > 0 && (
            <div className="mt-3.5 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2.5">
              {breakdown.map((item) => (
                <div
                  key={item.label}
                  className="inline-flex items-center gap-1 rounded bg-muted/60 px-2 py-0.5 text-[11px] font-medium border border-border/40"
                >
                  <span className="text-muted-foreground">{item.label}:</span>
                  <span className="text-foreground font-semibold">{item.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer: Trend or View Action */}
        {(trend || href) && (
          <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2 text-xs">
            {trend ? (
              <div
                className={cn(
                  "flex items-center gap-1 font-medium",
                  (trend.positiveIsGood ?? true)
                    ? trend.value >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-destructive"
                    : trend.value <= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-destructive",
                )}
              >
                {trend.value >= 0 ? (
                  <TrendingUp className="h-3.5 w-3.5" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5" />
                )}
                <span>{trend.value >= 0 ? `+${trend.value}` : trend.value}</span>
                {trend.label && (
                  <span className="text-muted-foreground font-normal">
                    {trend.label}
                  </span>
                )}
              </div>
            ) : <div />}

            {href && (
              <div className="inline-flex items-center gap-1 text-[11px] text-muted-foreground group-hover:text-primary font-medium transition-colors">
                <span>View</span>
                <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
      >
        {cardContent}
      </Link>
    );
  }

  return cardContent;
}
