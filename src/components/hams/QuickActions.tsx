"use client";

import React from "react";
import Link from "next/link";
import {
  ListOrdered,
  KeyRound,
  Archive,
  Home,
  ClipboardCheck,
  Zap,
  ArrowUpRight,
  ShieldCheck,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface QuickActionsProps {
  pendingInspectionsCount: number;
  activeQueueCount: number;
}

export default function QuickActions({
  pendingInspectionsCount,
  activeQueueCount,
}: QuickActionsProps) {
  return (
    <Card className="flex flex-col justify-between rounded-xl border bg-card text-card-foreground shadow-sm h-full">
      <div>
        <CardHeader className="pb-3 border-b border-border/60">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <CardTitle className="text-base sm:text-lg font-bold tracking-tight">
              Command & Quick Actions
            </CardTitle>
          </div>
          <CardDescription className="text-xs text-muted-foreground mt-0.5">
            Direct operational shortcuts to review queues, process transfers, and conduct handbacks
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-4 space-y-3">
          {/* Prominent Inspection Alert Action when wait-state list is non-empty */}
          {pendingInspectionsCount > 0 && (
            <Link href="/houses/inspections" className="block group">
              <div className="flex items-center justify-between p-3 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100/60 dark:hover:bg-amber-900/40 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-md bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex items-center justify-center">
                    <ClipboardCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wide">
                        Needs Inspection
                      </span>
                      <span className="rounded-full bg-amber-500 text-black px-1.5 py-0.2 text-[10px] font-bold">
                        {pendingInspectionsCount}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Vacated houses held in inspection wait-state
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="bg-amber-500 hover:bg-amber-600 text-white dark:text-black font-semibold h-8 text-xs"
                >
                  Inspect Now
                </Button>
              </div>
            </Link>
          )}

          {/* Primary CTA: Run/Review Queue */}
          <Link href="/house-queue" className="block group">
            <div className="flex items-center justify-between p-3.5 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary border border-primary/20 flex items-center justify-center">
                  <ListOrdered className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground tracking-wide group-hover:text-primary transition-colors">
                      Run / Review Queue
                    </span>
                    {activeQueueCount > 0 && (
                      <span className="rounded bg-primary/15 text-primary border border-primary/25 px-1.5 py-0.2 text-[10px] font-semibold">
                        {activeQueueCount} ready
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Stage 1 cohort sorting & Stage 2 MCDA ranking
                  </p>
                </div>
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
          </Link>

          {/* Secondary Quick Links Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            <Link
              href="/houses/allocated"
              className="flex flex-col p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors group"
            >
              <div className="flex items-center justify-between text-muted-foreground group-hover:text-primary">
                <KeyRound className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <span className="text-xs font-semibold text-foreground mt-2">
                Allocated
              </span>
              <span className="text-[11px] text-muted-foreground mt-0.5">
                Active tenant ledger
              </span>
            </Link>

            <Link
              href="/houses/terminated"
              className="flex flex-col p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors group"
            >
              <div className="flex items-center justify-between text-muted-foreground group-hover:text-primary">
                <Archive className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <span className="text-xs font-semibold text-foreground mt-2">
                Terminated
              </span>
              <span className="text-[11px] text-muted-foreground mt-0.5">
                Leave & return records
              </span>
            </Link>

            <Link
              href="/household/register"
              className="flex flex-col p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors group"
            >
              <div className="flex items-center justify-between text-muted-foreground group-hover:text-primary">
                <Home className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <span className="text-xs font-semibold text-foreground mt-2">
                Register
              </span>
              <span className="text-[11px] text-muted-foreground mt-0.5">
                House inventory & state
              </span>
            </Link>
          </div>
        </CardContent>
      </div>

      <div className="p-3 bg-muted/40 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>Asset Manager, HR & Admin access</span>
        </div>
        <Link
          href="/house-queue/config"
          className="text-primary hover:underline font-medium"
        >
          Engine Config →
        </Link>
      </div>
    </Card>
  );
}
