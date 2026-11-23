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

interface DashboardWelcomeClientProps {
  fullName: string;
  initialHour: number;
  initialDateLabel: string;
  headingLevel: 1 | 2;
  className?: string;
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
      className={`dashboard-welcome border-border/70 bg-card/80 relative overflow-hidden rounded-2xl border px-4 py-3 shadow-[0_10px_40px_-24px_rgba(15,23,42,0.45)] backdrop-blur-sm sm:px-5 ${className ?? ""}`}
    >
      <span className="dashboard-welcome__halo bg-primary/10 pointer-events-none absolute -top-16 -right-12 h-40 w-40 rounded-full blur-3xl" />
      <span className="dashboard-welcome__rule via-primary/40 pointer-events-none absolute inset-x-6 bottom-0 h-px origin-left bg-gradient-to-r from-transparent to-transparent" />

      <div className="dashboard-welcome__content relative flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="border-border/70 bg-muted/60 relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border">
            <span className="bg-primary/15 absolute inline-flex h-full w-full animate-ping rounded-full opacity-50" />
            <GreetingIcon className="text-foreground relative h-4 w-4" />
          </span>

          <div className="min-w-0">
            <p className="text-muted-foreground flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.14em] uppercase">
              <Sparkles className="h-3 w-3" />
              Welcome back
            </p>
            <Heading
              aria-live="polite"
              className="text-foreground mt-0.5 font-sans text-lg leading-tight font-semibold tracking-tight text-balance sm:text-xl"
            >
              {greeting.label}, {fullName}
            </Heading>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {greeting.note}
            </p>
          </div>
        </div>

        <div className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-medium whitespace-nowrap">
          <CalendarDays className="text-muted-foreground h-3.5 w-3.5" />
          <span className="hidden sm:inline">{dateLabel}</span>
          <span className="sm:hidden">Today</span>
        </div>
      </div>
    </section>
  );
}
