import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Accent = "brass" | "blue" | "green" | "amber" | "red";

const accents: Record<Accent, string> = {
  brass: "bg-brass-500",
  blue: "bg-sky-500",
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-destructive",
};

interface ChartCardProps {
  title: string;
  description?: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  accent?: Accent;
}

export default function ChartCard({
  title,
  description,
  eyebrow,
  action,
  children,
  className,
  contentClassName,
  accent = "brass",
}: ChartCardProps) {
  return (
    <section
      className={cn(
        "group border-border/70 bg-card/90 relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border shadow-[0_1px_2px_0_rgb(0_0_0_/_0.03)] transition-[border-color,box-shadow] duration-200",
        "hover:border-border hover:shadow-[0_4px_18px_-12px_hsl(var(--foreground)_/_0.28)]",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-[2px]",
          accents[accent],
        )}
      />
      <header className="flex shrink-0 items-start justify-between gap-2 px-3 pt-2.5 pb-1.5 xl:px-2.5 xl:pt-2">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-brass-600 dark:text-brass-400 text-[9px] leading-none font-semibold tracking-[0.16em] uppercase">
              {eyebrow}
            </p>
          ) : null}
          <h3 className="mt-1 truncate text-[12px] leading-tight font-semibold tracking-tight xl:text-[11px]">
            {title}
          </h3>
          {description ? (
            <p
              className="text-muted-foreground mt-0.5 truncate text-[10px] leading-tight"
              title={description}
            >
              {description}
            </p>
          ) : null}
        </div>
        {action}
      </header>
      <div
        className={cn(
          "min-h-0 min-w-0 flex-1 px-3 pb-3 xl:px-2.5 xl:pb-2.5",
          contentClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}
