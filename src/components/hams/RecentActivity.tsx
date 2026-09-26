"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  Search,
  User,
  Home,
  FileSpreadsheet,
} from "lucide-react";
import type { HamsActivityItem } from "@/lib/hams/queries";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatRelativeTime } from "@/lib/formatting";

interface RecentActivityProps {
  activities: HamsActivityItem[];
}

export default function RecentActivity({ activities }: RecentActivityProps) {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  const filtered = useMemo(() => {
    return activities.filter((act) => {
      if (actionFilter !== "all" && act.action !== actionFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        act.employeeName.toLowerCase().includes(q) ||
        act.employeeNumber.toLowerCase().includes(q) ||
        act.houseNumber.toLowerCase().includes(q) ||
        act.hid.toLowerCase().includes(q) ||
        act.actorName.toLowerCase().includes(q) ||
        act.action.toLowerCase().includes(q)
      );
    });
  }, [activities, search, actionFilter]);

  const renderActionBadge = (action: string) => {
    switch (action) {
      case "ALLOCATE":
        return (
          <Badge className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 font-semibold text-[11px] px-2 py-0.5">
            Approve / Allocated
          </Badge>
        );
      case "REASSIGN":
        return (
          <Badge className="bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-800 font-semibold text-[11px] px-2 py-0.5">
            Reassign
          </Badge>
        );
      case "RELEASE":
        return (
          <Badge className="bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800 font-semibold text-[11px] px-2 py-0.5">
            Released / Vacated
          </Badge>
        );
      case "SKIP":
        return (
          <Badge className="bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 border-purple-300 dark:border-purple-800 font-semibold text-[11px] px-2 py-0.5">
            Skipped
          </Badge>
        );
      case "DEFER":
        return (
          <Badge className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border-indigo-300 dark:border-indigo-800 font-semibold text-[11px] px-2 py-0.5">
            Deferred
          </Badge>
        );
      case "RECALCULATE":
        return (
          <Badge variant="secondary" className="font-semibold text-[11px] px-2 py-0.5">
            Recalculated
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-[11px] px-2 py-0.5">
            {action}
          </Badge>
        );
    }
  };

  const formatTimestamp = (iso: string) => {
    try {
      const d = new Date(iso);
      const relative = formatRelativeTime(d);
      const exact = formatDate(d, "short");
      return { relative, exact };
    } catch {
      return { relative: iso, exact: iso };
    }
  };

  return (
    <Card className="rounded-xl border bg-card text-card-foreground shadow-sm">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 gap-3 border-b border-border/60">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <CardTitle className="text-base sm:text-lg font-bold tracking-tight">
              Allocation Engine Activity Log
            </CardTitle>
          </div>
          <CardDescription className="text-xs text-muted-foreground mt-0.5">
            Live audit trail of queue resolutions, reassignments, skip/defer decisions, and tenant releases
          </CardDescription>
        </div>

        {/* Filter & Search toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search candidate, house, actor…"
              className="h-8 w-48 sm:w-60 pl-8 text-xs"
            />
          </div>

          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">All Decisions</option>
            <option value="ALLOCATE">Allocated</option>
            <option value="REASSIGN">Reassigned</option>
            <option value="RELEASE">Released</option>
            <option value="SKIP">Skipped</option>
            <option value="DEFER">Deferred</option>
          </select>
        </div>
      </CardHeader>

      <CardContent className="pt-0 px-0">
        {filtered.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center p-6 text-center">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-2 text-muted-foreground">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <p className="text-sm font-semibold text-foreground">
              {search || actionFilter !== "all"
                ? "No matching allocation decisions found"
                : "No allocation-engine activity recorded yet"}
            </p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              {search || actionFilter !== "all"
                ? "Try adjusting your search terms or decision filter."
                : "Queue decisions approved or released in House Queue will instantly populate this audit feed."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/40 text-muted-foreground uppercase text-[10px] tracking-wider font-semibold">
                <tr>
                  <th className="py-2.5 px-4">Decision</th>
                  <th className="py-2.5 px-3">Candidate / Employee</th>
                  <th className="py-2.5 px-3">House Assigned</th>
                  <th className="py-2.5 px-3">Decided By</th>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-4 text-right">Ledger Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filtered.map((item) => {
                  const time = formatTimestamp(item.timestamp);
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-muted/40 transition-colors group"
                    >
                      <td className="py-3 px-4 whitespace-nowrap">
                        {renderActionBadge(item.action)}
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        {item.employeeName !== "—" ? (
                          <div className="flex flex-col">
                            <span className="font-semibold text-foreground">
                              {item.employeeName}
                            </span>
                            {item.employeeNumber && (
                              <span className="text-[10px] text-muted-foreground font-mono">
                                #{item.employeeNumber}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        {item.houseNumber ? (
                          <div className="flex items-center gap-1.5">
                            <Home className="h-3.5 w-3.5 text-primary shrink-0" />
                            <div className="flex flex-col">
                              <span className="housing-serif font-bold text-foreground">
                                House {item.houseNumber}
                              </span>
                              {item.hid && (
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  HID: {item.hid}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/60">No house linked</span>
                        )}
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <User className="h-3 w-3" />
                          <span>{item.actorName}</span>
                        </div>
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="flex flex-col" title={time.exact}>
                          <span className="text-foreground font-medium">
                            {time.relative}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {time.exact}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                          className="h-7 px-2 text-xs font-medium text-primary hover:text-primary hover:bg-primary/10"
                        >
                          <Link href={item.targetHref}>
                            <span>Open</span>
                            <ArrowUpRight className="ml-1 h-3 w-3" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
