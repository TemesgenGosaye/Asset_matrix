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
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export default function ChartCard({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
}: ChartCardProps) {
  return (
    <Card className={cn("min-w-0 overflow-hidden", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 p-4 pb-2 sm:p-5 sm:pb-2">
        <div className="min-w-0 space-y-1">
          <CardTitle className="housing-serif text-base font-semibold sm:text-lg">
            {title}
          </CardTitle>
          {description && (
            <CardDescription className="text-xs leading-snug sm:text-sm">
              {description}
            </CardDescription>
          )}
        </div>
        {action}
      </CardHeader>
      <CardContent
        className={cn("min-w-0 p-3 pt-1 sm:p-5 sm:pt-2", contentClassName)}
      >
        {children}
      </CardContent>
    </Card>
  );
}
