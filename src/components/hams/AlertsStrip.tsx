"use client";

import React from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Building2,
  Users,
} from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { HamsCohortAlert } from "@/lib/hams/queries";

interface AlertsStripProps {
  alerts: HamsCohortAlert[];
}

export default function AlertsStrip({ alerts }: AlertsStripProps) {
  /* ── All-clear state ─────────────────────────────────── */
  if (alerts.length === 0) {
    return (
      <Alert className="border-border bg-card">
        <CheckCircle2 className="text-emerald-500" />
        <AlertTitle className="text-sm font-semibold text-foreground">
          Cohort Capacity Sound
        </AlertTitle>
        <AlertDescription className="text-muted-foreground text-xs">
          All eligible job grades with active queue candidates have available
          houses in their category pool.
        </AlertDescription>
      </Alert>
    );
  }

  /* ── Shortage alert ──────────────────────────────────── */
  return (
    <Alert variant="destructive" className="bg-card border-destructive/40">
      {/* Header row */}
      <AlertCircle />
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <AlertTitle className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            HR Exception: House Shortage Alert
            <Badge variant="destructive" className="text-[10px] font-bold px-2">
              {alerts.length}{" "}
              {alerts.length === 1 ? "Cohort Stalled" : "Cohorts Stalled"}
            </Badge>
          </AlertTitle>
          <AlertDescription className="mt-1 text-xs text-muted-foreground">
            Eligible employees are waiting in the queue, but zero vacant houses
            currently exist for their tier.
          </AlertDescription>
        </div>

        <Button
          asChild
          size="sm"
          variant="outline"
          className="shrink-0 h-7 gap-1 border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive text-xs"
        >
          <Link href="/house-queue">
            Open House Queue
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>

      {/* Cohort chips */}
      <div className="col-span-full mt-3 flex flex-wrap gap-2 pt-3 border-t border-border">
        {alerts.map((item, idx) => (
          <div
            key={idx}
            className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-xs"
          >
            {/* Category + grade */}
            <span className="flex items-center gap-1 font-semibold text-foreground">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              Category {item.category || "—"}
              <span className="font-normal text-muted-foreground">
                (Grade {item.grade ?? "—"})
              </span>
            </span>

            <span className="text-border">|</span>

            {/* Waiting count */}
            <span className="flex items-center gap-1 text-destructive">
              <Users className="h-3 w-3" />
              <strong>{item.waitingCount}</strong>
              <span className="text-muted-foreground font-normal">waiting</span>
            </span>

            <span className="text-border">|</span>

            {/* Available */}
            <span className="rounded border border-destructive/25 bg-destructive/10 px-1.5 py-0.5 font-bold text-destructive">
              0 available
            </span>
          </div>
        ))}
      </div>
    </Alert>
  );
}
