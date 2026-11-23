import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ChartCardProps {
  title: string;
  description?: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  surface?: boolean;
}

export default function ChartCard({
  title,
  description,
  eyebrow,
  action,
  children,
  className,
  contentClassName,
  surface = false,
}: ChartCardProps) {
  return (
    <Card
      className={cn(
        "border-border/70 bg-card/70 flex min-h-0 min-w-0 flex-col overflow-hidden",
        surface && "analytics-surface",
        className,
      )}
    >
      <CardHeader className="flex shrink-0 flex-row items-start justify-between gap-3 space-y-0 px-3 py-2">
        <div className="min-w-0 space-y-0.5">
          {eyebrow && (
            <p className="text-muted-foreground text-[9px] font-semibold tracking-[0.16em] uppercase">
              {eyebrow}
            </p>
          )}
          <div className="flex items-center gap-2">
            <span className="bg-primary/70 h-1.5 w-1.5 shrink-0 rounded-full" />
            <CardTitle className="text-[10px] leading-tight font-semibold tracking-[0.1em] uppercase">
              {title}
            </CardTitle>
          </div>
          {description && (
            <CardDescription className="text-[10px] leading-snug xl:hidden">
              {description}
            </CardDescription>
          )}
        </div>
        {action}
      </CardHeader>
      <CardContent
        className={cn(
          "min-h-0 min-w-0 flex-1 px-2.5 pt-0 pb-2.5",
          contentClassName,
        )}
      >
        {children}
      </CardContent>
    </Card>
  );
}
