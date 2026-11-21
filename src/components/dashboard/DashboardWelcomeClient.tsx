"use client";

import { useEffect, useState } from "react";
import {
  CalendarDays,
  MoonStar,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardWelcomeClientProps {
  fullName: string;
  initialHour: number;
  initialDateLabel: string;
  headingLevel: 1 | 2;
  className?: string;
  compact?: boolean;
}

const GREETINGS: ReadonlyArray<{
  label: string;
  note: string;
  Icon: LucideIcon;
}> = [
  {
    label: "Good morning",
    note: "A focused start to today's operations.",
    Icon: Sunrise,
  },
  {
    label: "Good afternoon",
    note: "Keeping momentum across your portfolio.",
    Icon: Sun,
  },
  {
    label: "Good evening",
    note: "A clear view as the day winds down.",
    Icon: Sunset,
  },
  {
    label: "Working late",
    note: "Your live overview is ready when you are.",
    Icon: MoonStar,
  },
];

function greetingIndexForHour(hour: number): number {
  if (hour < 12) return 0;
  if (hour < 17) return 1;
  if (hour < 22) return 2;
  return 3;
}

function localDateLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}

export default function DashboardWelcomeClient({
  fullName,
  initialHour,
  initialDateLabel,
  headingLevel,
  className,
  compact = false,
}: DashboardWelcomeClientProps) {
  const [greetingIndex, setGreetingIndex] = useState(() =>
    greetingIndexForHour(initialHour),
  );
  const [dateLabel, setDateLabel] = useState(initialDateLabel);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setGreetingIndex(greetingIndexForHour(now.getHours()));
      setDateLabel(localDateLabel(now));
    };

    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const greeting = GREETINGS[greetingIndex];
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const GreetingIcon = greeting.Icon;

  return (
    <section
      aria-label="Personalised welcome"
      className={cn(
        "dashboard-welcome border-border/70 bg-card/70 relative overflow-hidden border shadow-[0_10px_40px_-24px_rgba(120,89,12,0.55)] backdrop-blur-sm",
        compact
          ? "flex min-w-0 items-center justify-between gap-3 rounded-xl px-3 py-2 sm:px-4"
          : "dashboard-welcome--relaxed rounded-2xl px-4 py-3 sm:px-5",
        className,
      )}
    >
      <span className="dashboard-welcome__halo bg-brass-400/20 pointer-events-none absolute -top-16 -right-12 h-40 w-40 rounded-full blur-3xl" />
      <span className="dashboard-welcome__rule via-brass-400/70 pointer-events-none absolute inset-x-6 bottom-0 h-px origin-left bg-gradient-to-r from-transparent to-transparent" />

      <div
        className={cn(
          "dashboard-welcome__content relative flex flex-wrap items-center justify-between gap-3",
          compact && "flex-nowrap",
        )}
      >
        <div
          className={cn(
            "flex min-w-0 items-center",
            compact ? "gap-2" : "gap-3",
          )}
        >
          <span
            className={cn(
              "border-brass-400/30 bg-brass-400/10 relative flex shrink-0 items-center justify-center rounded-full border",
              compact ? "h-8 w-8" : "h-9 w-9",
            )}
          >
            <span className="bg-brass-400/25 absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" />
            <GreetingIcon
              className={cn(
                "text-brass-600 dark:text-brass-300 relative",
                compact ? "h-3.5 w-3.5" : "h-4 w-4",
              )}
            />
          </span>

          <div className="min-w-0">
            <p className="text-brass-600 dark:text-brass-400 flex items-center gap-1.5 text-[9px] font-semibold tracking-[0.18em] uppercase">
              <Sparkles className="h-3 w-3" />
              {compact ? "Welcome back · Dashboard" : "Welcome back"}
            </p>
            <Heading
              aria-live="polite"
              className={cn(
                "dashboard-welcome__name housing-serif font-semibold tracking-tight text-balance",
                compact
                  ? "mt-0 truncate text-base leading-tight sm:text-lg"
                  : "mt-0.5 text-lg leading-tight sm:text-xl",
              )}
            >
              {greeting.label}, {fullName}
            </Heading>
            {!compact && (
              <p className="text-muted-foreground mt-0.5 text-xs">
                {greeting.note}
              </p>
            )}
          </div>
        </div>

        <div className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-medium whitespace-nowrap">
          <CalendarDays className="text-brass-500 h-3.5 w-3.5" />
          <span className="hidden sm:inline">{dateLabel}</span>
          <span className="sm:hidden">Today</span>
        </div>
      </div>
    </section>
  );
}
