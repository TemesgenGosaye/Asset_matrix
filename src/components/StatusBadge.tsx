"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "default";
}

const statusColorMap: Record<string, string> = {
  // Green statuses
  active: "bg-success-bg text-success-foreground border-success-bg",
  approved: "bg-success-bg text-success-foreground border-success-bg",
  completed: "bg-success-bg text-success-foreground border-success-bg",
  compliant: "bg-success-bg text-success-foreground border-success-bg",

  // Yellow statuses
  pending: "bg-warning-bg text-warning-foreground border-warning-bg",
  processing: "bg-warning-bg text-warning-foreground border-warning-bg",
  in_progress: "bg-warning-bg text-warning-foreground border-warning-bg",

  // Gray statuses
  inactive: "bg-muted text-muted-foreground border-muted",
  retired: "bg-muted text-muted-foreground border-muted",
  expired: "bg-muted text-muted-foreground border-muted",

  // Red statuses
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
  failed: "bg-destructive/10 text-destructive border-destructive/20",
  overdue: "bg-destructive/10 text-destructive border-destructive/20",

  // Blue statuses
  available: "bg-info-bg text-info-foreground border-info-bg",
  ready: "bg-info-bg text-info-foreground border-info-bg",
};

function capitalize(str: string): string {
  return str
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function StatusBadge({ status, size = "default" }: StatusBadgeProps) {
  const normalizedStatus = status.toLowerCase().trim();
  const colorClasses = statusColorMap[normalizedStatus];

  return (
    <Badge
      variant="outline"
      className={cn(
        colorClasses,
        size === "sm" && "px-1.5 py-0 text-[10px]",
      )}
    >
      {capitalize(normalizedStatus)}
    </Badge>
  );
}
