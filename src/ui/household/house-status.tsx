"use client";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import {
  ALLOCATION_STATUSES,
  type AllocationStatus,
} from "@/lib/house-queue/state";

// ---------------------------------------------------------------------------
// House category colors (category → pill styling)
// ---------------------------------------------------------------------------

export const CATEGORY_COLORS: Record<string, string> = {
  Staff:
    "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800",
  A: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  B: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800",
  C: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  D: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  E: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800",
};

const CATEGORY_ORDER = ["Staff", "A", "B", "C", "D", "E"] as const;

export function HouseCategoryBadge({
  category,
}: {
  category: string | null | undefined;
}) {
  if (!category) return <Badge variant="outline">—</Badge>;
  return (
    <Badge
      variant="outline"
      className={CATEGORY_COLORS[category] ?? "font-semibold whitespace-nowrap"}
    >
      {category}
    </Badge>
  );
}

export function sortCategories(a: string, b: string): number {
  const ia = CATEGORY_ORDER.indexOf(a as (typeof CATEGORY_ORDER)[number]);
  const ib = CATEGORY_ORDER.indexOf(b as (typeof CATEGORY_ORDER)[number]);
  return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
}

// ---------------------------------------------------------------------------
// Queue eligibility status badges
// ---------------------------------------------------------------------------

export const QUEUE_STATUS_META: Record<
  string,
  { variant: NonNullable<BadgeProps["variant"]>; className?: string }
> = {
  not_eligible: { variant: "outline" },
  waiting: {
    variant: "warning",
    className: "bg-amber-50 dark:bg-amber-950/40",
  },
  no_house_available: {
    variant: "secondary",
    className: "bg-amber-50 dark:bg-amber-950/40",
  },
  ready_for_allocation: {
    variant: "success",
    className: "bg-emerald-50 dark:bg-emerald-950/40",
  },
  allocated: {
    variant: "default",
    className: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  },
  release_pending: {
    variant: "warning",
    className:
      "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  },
  RELEASE_PENDING: {
    variant: "warning",
    className:
      "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  },
  skipped: {
    variant: "destructive",
    className: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  },
  deferred: {
    variant: "warning",
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  released: {
    variant: "secondary",
    className: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  },
  terminated: {
    variant: "secondary",
    className: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
  },
};

export const QUEUE_STATUS_LABELS: Record<string, string> = {
  not_eligible: "Not Eligible",
  waiting: "Waiting",
  no_house_available: "No House Available",
  ready_for_allocation: "Ready for Allocation",
  allocated: "Allocated",
  release_pending: "Release Pending",
  RELEASE_PENDING: "Release Pending",
  skipped: "Skipped",
  deferred: "Deferred",
  released: "Released",
  terminated: "Terminated",
};

/** All statuses the queue can display, in display order. */
export const QUEUE_STATUS_ORDER: AllocationStatus[] = [...ALLOCATION_STATUSES];

export function QueueStatusBadge({ status }: { status: string }) {
  const meta = QUEUE_STATUS_META[status] ?? { variant: "outline" as const };
  return (
    <Badge variant={meta.variant} className={meta.className ?? ""}>
      {QUEUE_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Household (register) status badges
// ---------------------------------------------------------------------------

export const HOUSEHOLD_STATUS_META: Record<
  string,
  { label: string; className: string }
> = {
  Active: {
    label: "Active",
    className:
      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  },
  Inactive: {
    label: "Inactive",
    className:
      "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800",
  },
  PendingInspection: {
    label: "Pending Inspection",
    className:
      "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  },
  UnderMaintenance: {
    label: "Under Maintenance",
    className:
      "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800",
  },
};

export function HouseholdStatusBadge({ status }: { status: string | null }) {
  const meta = HOUSEHOLD_STATUS_META[status ?? ""] ?? {
    label: status ?? "—",
    className: "text-muted-foreground",
  };
  return (
    <Badge variant="outline" className={meta.className}>
      {meta.label}
    </Badge>
  );
}
