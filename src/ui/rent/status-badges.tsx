"use client";

/**
 * Rent status badges.
 *
 * Colour is never the only signal: every badge renders its label text alongside
 * the colour, so the state is readable without colour perception. Uses the
 * portal's existing `Badge` variants (brass/navy accent tokens included) rather
 * than introducing a new visual style.
 */

import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  RENT_DISPLAY_STATUS_BADGE_VARIANT,
  RENT_DISPLAY_STATUS_LABELS,
  RENT_INSTALLMENT_STATUS_BADGE_VARIANT,
  RENT_INSTALLMENT_STATUS_LABELS,
  RENT_OVERDUE_LABEL,
  type RentDisplayStatus,
} from "@/lib/rent/constants";
import type { RentInstallmentDto } from "@/lib/rent/types";

/** Lease status pill for the register table and the detail header. */
export function RentStatusBadge({
  status,
  className,
}: {
  status: RentDisplayStatus;
  className?: string;
}) {
  return (
    <Badge
      variant={RENT_DISPLAY_STATUS_BADGE_VARIANT[status]}
      className={className}
    >
      {RENT_DISPLAY_STATUS_LABELS[status]}
    </Badge>
  );
}

/**
 * Month status pill.
 *
 * `overdue` is a DERIVED flag, not a stored status, so it gets its own explicit
 * label ("Overdue") and an alert icon on top of the warning colour.
 */
export function RentInstallmentStatusBadge({
  installment,
  className,
}: {
  installment: Pick<RentInstallmentDto, "status" | "overdue">;
  className?: string;
}) {
  if (installment.overdue) {
    return (
      <Badge variant="warning" className={className}>
        <AlertTriangle className="mr-1 h-3 w-3" aria-hidden="true" />
        {RENT_OVERDUE_LABEL}
      </Badge>
    );
  }

  return (
    <Badge
      variant={RENT_INSTALLMENT_STATUS_BADGE_VARIANT[installment.status]}
      className={className}
    >
      {RENT_INSTALLMENT_STATUS_LABELS[installment.status]}
    </Badge>
  );
}

/**
 * Months-paid indicator: `7 / 24` plus a proportional bar.
 *
 * The bar is decorative (`aria-hidden`); the fraction is the accessible text, so
 * a screen reader announces "7 / 24 months paid" rather than a percentage.
 */
export function MonthsPaidIndicator({
  monthsPaid,
  totalMonths,
  className,
}: {
  monthsPaid: number;
  totalMonths: number;
  className?: string;
}) {
  const safeTotal = Math.max(totalMonths, 0);
  const pct = safeTotal === 0 ? 0 : Math.round((monthsPaid / safeTotal) * 100);

  return (
    <div className={className}>
      <div className="text-xs font-medium tabular-nums">
        {monthsPaid} / {safeTotal}
      </div>
      <div
        role="progressbar"
        aria-valuenow={monthsPaid}
        aria-valuemin={0}
        aria-valuemax={safeTotal}
        aria-label={`${monthsPaid} of ${safeTotal} months paid`}
        className="bg-muted mt-1 h-1.5 w-full overflow-hidden rounded-full"
      >
        <div
          className="bg-primary h-full rounded-full transition-[width] duration-300"
          style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
        />
      </div>
    </div>
  );
}
