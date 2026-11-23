"use client";

import { useEffect, useState } from "react";
import {
  CalendarDays,
  MoonStar,
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
      className={`dashboard-welcome border-border/70 bg-card/80 relative overflow-hidden rounded-2xl border px-4 py-4 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.55)] backdrop-blur-sm sm:px-5 ${className ?? ""}`}
    >
      <span className="dashboard-welcome__halo bg-primary/10 pointer-events-none absolute -top-20 -right-16 h-48 w-48 rounded-full blur-3xl" />
      <span className="dashboard-welcome__rule via-primary/40 pointer-events-none absolute inset-x-8 bottom-0 h-px origin-left bg-gradient-to-r from-transparent to-transparent" />

      <div className="dashboard-welcome__content relative flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className="border-border/70 bg-muted/50 relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border shadow-sm">
            <span className="bg-primary/15 absolute inset-0 inline-flex animate-ping rounded-xl opacity-40" />
            <GreetingIcon className="text-foreground relative h-5 w-5" />
          </span>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="bg-primary/70 h-1.5 w-1.5 shrink-0 rounded-full" />
              <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.16em] uppercase">
                Welcome back
              </p>
            </div>
            <Heading
              aria-live="polite"
              className="text-foreground mt-1 font-sans text-xl leading-tight font-semibold tracking-tight text-balance sm:text-2xl"
            >
              {greeting.label}, {fullName}
            </Heading>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed sm:text-sm">
              {greeting.note}
            </p>
          </div>
        </div>

        <div className="border-border/70 bg-background/60 flex items-center gap-2.5 rounded-xl border px-3 py-2 shadow-sm">
          <CalendarDays className="text-muted-foreground h-4 w-4 shrink-0" />
          <div className="leading-tight">
            <p className="text-muted-foreground text-[9px] font-semibold tracking-[0.14em] uppercase">
              Today
            </p>
            <p className="text-foreground text-xs font-semibold tabular-nums">
              {dateLabel}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
