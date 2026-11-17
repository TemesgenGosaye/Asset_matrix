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
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
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
          <Badge className="border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400">
            Approve / Allocated
          </Badge>
        );
      case "REASSIGN":
        return (
          <Badge className="border-blue-300 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-400">
            Reassign
          </Badge>
        );
      case "RELEASE":
        return (
          <Badge className="border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
            Released / Vacated
          </Badge>
        );
      case "SKIP":
        return (
          <Badge className="border-purple-300 bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-400">
            Skipped
          </Badge>
        );
      case "DEFER":
        return (
          <Badge className="border-indigo-300 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-400">
            Deferred
          </Badge>
        );
      case "RECALCULATE":
        return (
          <Badge
            variant="secondary"
            className="px-2 py-0.5 text-[11px] font-semibold"
          >
            Recalculated
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="px-2 py-0.5 text-[11px]">
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
    <Card className="bg-card text-card-foreground rounded-xl border shadow-sm">
      <CardHeader className="border-border/60 flex flex-col gap-3 border-b pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="text-primary h-5 w-5" />
            <CardTitle className="text-base font-bold tracking-tight sm:text-lg">
              Allocation Engine Activity Log
            </CardTitle>
          </div>
          <CardDescription className="text-muted-foreground mt-0.5 text-xs">
            Live audit trail of queue resolutions, reassignments, skip/defer
            decisions, and tenant releases
          </CardDescription>
        </div>

        {/* Filter & Search toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search candidate, house, actor…"
              autoFocus
              className="h-8 w-48 pl-8 text-xs sm:w-60"
            />
          </div>

          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="border-input bg-background text-foreground focus:ring-ring h-8 rounded-md border px-2 text-xs focus:ring-1 focus:outline-none"
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

      <CardContent className="px-0 pt-0">
        {filtered.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center p-6 text-center">
            <div className="bg-muted text-muted-foreground mb-2 flex h-10 w-10 items-center justify-center rounded-full">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <p className="text-foreground text-sm font-semibold">
              {search || actionFilter !== "all"
                ? "No matching allocation decisions found"
                : "No allocation-engine activity recorded yet"}
            </p>
            <p className="text-muted-foreground mt-1 max-w-sm text-xs">
              {search || actionFilter !== "all"
                ? "Try adjusting your search terms or decision filter."
                : "Queue decisions approved or released in House Queue will instantly populate this audit feed."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-border bg-muted/40 text-muted-foreground border-b text-[10px] font-semibold tracking-wider uppercase">
                <tr>
                  <th className="px-4 py-2.5">Decision</th>
                  <th className="px-3 py-2.5">Candidate / Employee</th>
                  <th className="px-3 py-2.5">House Assigned</th>
                  <th className="px-3 py-2.5">Decided By</th>
                  <th className="px-3 py-2.5">Timestamp</th>
                  <th className="px-4 py-2.5 text-right">Ledger Link</th>
                </tr>
              </thead>
              <tbody className="divide-border/60 divide-y">
                {filtered.map((item) => {
                  const time = formatTimestamp(item.timestamp);
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-muted/40 group transition-colors"
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        {renderActionBadge(item.action)}
                      </td>

                      <td className="px-3 py-3 whitespace-nowrap">
                        {item.employeeName !== "—" ? (
                          <div className="flex flex-col">
                            <span className="text-foreground font-semibold">
                              {item.employeeName}
                            </span>
                            {item.employeeNumber && (
                              <span className="text-muted-foreground font-mono text-[10px]">
                                #{item.employeeNumber}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </td>

                      <td className="px-3 py-3 whitespace-nowrap">
                        {item.houseNumber ? (
                          <div className="flex items-center gap-1.5">
                            <Home className="text-primary h-3.5 w-3.5 shrink-0" />
                            <div className="flex flex-col">
                              <span className="housing-serif text-foreground font-bold">
                                House {item.houseNumber}
                              </span>
                              {item.hid && (
                                <span className="text-muted-foreground font-mono text-[10px]">
                                  HID: {item.hid}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/60">
                            No house linked
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="text-muted-foreground flex items-center gap-1.5">
                          <User className="h-3 w-3" />
                          <span>{item.actorName}</span>
                        </div>
                      </td>

                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex flex-col" title={time.exact}>
                          <span className="text-foreground font-medium">
                            {time.relative}
                          </span>
                          <span className="text-muted-foreground font-mono text-[10px]">
                            {time.exact}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                          className="text-primary hover:text-primary hover:bg-primary/10 h-7 px-2 text-xs font-medium"
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
