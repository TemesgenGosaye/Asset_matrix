"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ResponsiveTable,
  type Column,
} from "@/components/ui/responsive-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  RefreshCw,
  MoreVertical,
  Eye,
  CheckCircle2,
  Repeat,
  Ban,
  Undo2,
  History,
  Users,
  Home,
  Sparkles,
  AlertTriangle,
  XCircle,
  PencilRuler,
  HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import { fmtScore, fullName } from "@/ui/household/house-format";
import {
  HouseCategoryBadge,
  QueueStatusBadge,
} from "@/ui/household/house-status";
import { houseCategoryLegend } from "@/lib/house-queue/eligibility";
import type {
  HouseAvailability,
  HouseQueueRow,
  HouseQueueResult,
} from "@/lib/house-queue/types";
import {
  ApproveDialog,
  AuditTrailDialog,
  QueueDetailsDialog,
  ReassignDialog,
  SkipDeferDialog,
} from "./dialogs";
import ReleaseWorkflowDialog from "./ReleaseWorkflowDialog";

export interface HouseQueueCapabilities {
  view: boolean;
  allocate: boolean;
  manage: boolean;
  audit: boolean;
}

interface HouseQueueClientProps {
  initialData: HouseQueueResult;
  capabilities: HouseQueueCapabilities;
}

const AUTO_REFRESH_MS = 30_000;

type DialogKey =
  | "details"
  | "approve"
  | "reassign"
  | "skipdefer"
  | "release"
  | "audit";

const columns: Column[] = [
  { key: "srNo", label: "#", hideable: false, align: "right" },
  { key: "employee", label: "Employee", hideable: false },
  { key: "grade", label: "Grade", align: "center" },
  { key: "gender", label: "Gender", align: "center" },
  { key: "serviceYears", label: "Service", align: "center" },
  { key: "marital", label: "Marital", align: "center" },
  { key: "disability", label: "Disability", align: "center" },
  { key: "category", label: "Category", align: "center" },
  { key: "mcdScore", label: "Priority Score", align: "center" },
  { key: "rank", label: "Rank", align: "center" },
  { key: "recommended", label: "Recommended House" },
  { key: "status", label: "Status", align: "center" },
  { key: "actions", label: "", hideable: false },
];

export default function HouseQueueClient({
  initialData,
  capabilities,
}: HouseQueueClientProps) {
  const router = useRouter();
  const [rows, setRows] = useState<HouseQueueRow[]>(initialData.rows);
  const [availability, setAvailability] = useState<HouseAvailability[]>(
    initialData.availability,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>("");
  const [mounted, setMounted] = useState(false);

  // Set initial timestamp only on client side to avoid hydration mismatch
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: one-time client-only mount stamp
    setMounted(true);
    setLastRefreshed(new Date().toLocaleTimeString());
  }, []);

  // Filters (applied on the client — ranks stay cohort-true on the server)
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Row actions
  const [activeRow, setActiveRow] = useState<HouseQueueRow | null>(null);
  const [dialogKey, setDialogKey] = useState<DialogKey | null>(null);

  // Keep the latest filter values for the background refresh callback.
  const filtersRef = useRef({ search, gradeFilter, statusFilter });
  useEffect(() => {
    filtersRef.current = { search, gradeFilter, statusFilter };
  }, [search, gradeFilter, statusFilter]);

  const openDialog = (key: DialogKey, row: HouseQueueRow) => {
    setActiveRow(row);
    setDialogKey(key);
  };
  const closeDialog = () => {
    setDialogKey(null);
    setActiveRow(null);
  };

  // -----------------------------------------------------------------
  // Data loading
  // -----------------------------------------------------------------
  const loadQueue = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await fetch("/api/house-queue");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Failed to reload the house queue");
        return;
      }
      const data = (await res.json()) as HouseQueueResult;
      setRows(data.rows);
      setAvailability(data.availability);
      setLastRefreshed(new Date().toLocaleTimeString());
    } catch {
      if (!silent) toast.error("Failed to reload the house queue");
    } finally {
      if (!silent) setRefreshing(false);
    }
  }, []);

  // Live auto-refresh (the queue is computed live on every read).
  useEffect(() => {
    const interval = setInterval(() => void loadQueue(true), AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [loadQueue]);

  // -----------------------------------------------------------------
  // Action plumbing
  // -----------------------------------------------------------------
  const runAction = useCallback(
    async (payload: Record<string, unknown>) => {
      try {
        const res = await fetch("/api/house-queue/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) return { ok: false as const, message: body.error ?? "Action failed" };
        return { ok: true as const };
      } catch {
        return { ok: false as const, message: "Network error" };
      }
    },
    [],
  );

  const handleActionSuccess = useCallback(
    (message: string) => {
      toast.success(message);
      void loadQueue(true);
    },
    [loadQueue],
  );

  const handleApprove = useCallback(
    async (payload: { employeeId: string; householdId: string }) => {
      const result = await runAction({ action: "approve", ...payload });
      if (result.ok) handleActionSuccess("Allocation approved.");
      return result;
    },
    [runAction, handleActionSuccess],
  );

  const handleReassign = useCallback(
    async (payload: { employeeId: string; householdId: string }) => {
      const result = await runAction({ action: "reassign", ...payload });
      if (result.ok) handleActionSuccess("Allocation reassigned.");
      return result;
    },
    [runAction, handleActionSuccess],
  );

  const handleSkipDefer = useCallback(
    async (payload: {
      employeeId: string;
      mode: "skip" | "defer";
      reason?: string;
    }) => {
      const result = await runAction({ action: payload.mode, ...payload });
      if (result.ok)
        handleActionSuccess(
          payload.mode === "skip"
            ? "Employee skipped from the queue."
            : "Employee deferred in the queue.",
        );
      return result;
    },
    [runAction, handleActionSuccess],
  );

  const handleRecalculate = useCallback(
    async (grade?: number | null) => {
      setRefreshing(true);
      try {
        const res = await fetch("/api/house-queue/recalculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ grade: grade ?? null }),
        });
        const body = (await res.json().catch(() => ({}))) as
          | HouseQueueResult
          | { error?: string };
        if (!res.ok) {
          toast.error(
            (body as { error?: string }).error ?? "Failed to recalculate",
          );
          return;
        }
        const data = body as HouseQueueResult;
        setRows(data.rows);
        setAvailability(data.availability);
        toast.success("House queue recalculated.");
      } catch {
        toast.error("Failed to recalculate the house queue");
      } finally {
        setRefreshing(false);
      }
    },
    [],
  );

  // -----------------------------------------------------------------
  // Client-side (display-only) filtering + grouping
  // -----------------------------------------------------------------
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesGrade =
        gradeFilter === "all" || row.jobGrade === Number(gradeFilter);
      const matchesStatus =
        statusFilter === "all" || row.queueStatus === statusFilter;
      const matchesSearch =
        !q ||
        row.employeeNumber.toLowerCase().includes(q) ||
        row.firstname.toLowerCase().includes(q) ||
        (row.lastname ?? "").toLowerCase().includes(q);
      return matchesGrade && matchesStatus && matchesSearch;
    });
  }, [rows, search, gradeFilter, statusFilter]);

  const groups = useMemo(() => {
    const map = new Map<number | null, HouseQueueRow[]>();
    for (const row of filteredRows) {
      const key = row.jobGrade ?? null;
      const bucket = map.get(key) ?? [];
      bucket.push(row);
      map.set(key, bucket);
    }
    return [...map.entries()]
      .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : b - a))
      .map(([grade, groupRows]) => ({
        grade,
        category: groupRows[0]?.houseCategory ?? null,
        rows: groupRows,
      }));
  }, [filteredRows]);

  const summary = useMemo(() => {
    const allocated = rows.filter((r) => r.isAllocated).length;
    return {
      total: filteredRows.length,
      eligible: filteredRows.filter((r) => r.houseCategory !== null).length,
      ready: filteredRows.filter((r) => r.queueStatus === "ready_for_allocation")
        .length,
      allocated,
      noHouse: filteredRows.filter(
        (r) => r.queueStatus === "no_house_available",
      ).length,
      notEligible: filteredRows.filter((r) => r.queueStatus === "not_eligible")
        .length,
    };
  }, [filteredRows, rows]);

  // Distinct grades for the grade filter.
  const gradeOptions = useMemo(() => {
    const set = new Set<number>();
    for (const row of rows) if (row.jobGrade != null) set.add(row.jobGrade);
    return [...set].sort((a, b) => b - a);
  }, [rows]);

  // -----------------------------------------------------------------
  // Cell rendering
  // -----------------------------------------------------------------
  const renderCell = useCallback(
    (item: HouseQueueRow, key: string) => {
      switch (key) {
        case "srNo":
          return <span className="tabular-nums text-muted-foreground">{item.srNo}</span>;
        case "employee":
          return (
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {item.firstname.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="font-semibold">{fullName(item)}</div>
                <div className="text-xs text-muted-foreground">
                  {item.employeeNumber}
                </div>
              </div>
            </div>
          );
        case "grade":
          return item.jobGrade != null ? (
            <span className="font-semibold tabular-nums">{item.jobGrade}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        case "gender":
          return item.gender ?? "—";
        case "serviceYears":
          return (
            <span className="tabular-nums">{item.serviceYears} yrs</span>
          );
        case "marital":
          return item.maritalStatus ?? "—";
        case "disability":
          return item.disabilityStatus ? (
            <Badge variant="destructive">Yes</Badge>
          ) : (
            <span className="text-muted-foreground">No</span>
          );
        case "category":
          return <HouseCategoryBadge category={item.houseCategory} />;
        case "mcdScore":
          return (
            <span className="font-semibold tabular-nums">
              {fmtScore(item.mcdScore)}
            </span>
          );
        case "rank":
          return item.priorityRank != null ? (
            <Badge variant="secondary" className="tabular-nums">
              #{item.priorityRank}
            </Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        case "recommended":
          return item.recommendedHouseNumber ? (
            <div>
              <div className="font-medium">{item.recommendedHouseNumber}</div>
              <div className="text-xs text-muted-foreground">
                {item.recommendedHid}
                {item.recommendedLocation ? ` · ${item.recommendedLocation}` : ""}
              </div>
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        case "status":
          return <QueueStatusBadge status={item.queueStatus} />;
        case "actions":
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreVertical className="h-4 w-4" />
                  <span className="sr-only">Queue actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  {fullName(item)} — {item.employeeNumber}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => openDialog("details", item)}>
                  <Eye className="mr-2 h-4 w-4" />
                  View Details
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => openDialog("audit", item)}
                  disabled={!capabilities.audit}
                >
                  <History className="mr-2 h-4 w-4" />
                  Audit Trail
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => openDialog("approve", item)}
                  disabled={
                    !capabilities.allocate ||
                    !item.recommendedHouseId ||
                    item.isAllocated
                  }
                >
                  <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" />
                  Approve
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => openDialog("reassign", item)}
                  disabled={!capabilities.allocate || !item.houseCategory}
                >
                  <Repeat className="mr-2 h-4 w-4 text-blue-600" />
                  Reassign
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => openDialog("skipdefer", item)}
                  disabled={!capabilities.manage || item.isAllocated}
                >
                  <Ban className="mr-2 h-4 w-4 text-amber-600" />
                  Skip / Defer
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => openDialog("release", item)}
                  disabled={!capabilities.manage || !item.isAllocated}
                >
                  <Undo2 className="mr-2 h-4 w-4 text-rose-600" />
                  Release
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => void handleRecalculate(item.jobGrade)}
                  disabled={!capabilities.manage}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Calculate grade
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        default:
          return null;
      }
    },
    [capabilities, handleRecalculate],
  );

  return (
    <div className="space-y-6">
      {/* ─── Heading strip ─── */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              House Queue
            </h1>
            <p className="text-sm text-muted-foreground">
              Live priority ranking &amp; house recommendation. Recomputed on
              every view.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {mounted && lastRefreshed && (
              <span className="hidden text-xs text-muted-foreground sm:inline">
                Last refreshed {lastRefreshed}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadQueue()}
              disabled={refreshing}
            >
              <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              Refresh
            </Button>
            {capabilities.manage && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleRecalculate(gradeFilter !== "all" ? Number(gradeFilter) : null)}
              >
                <Sparkles className="h-4 w-4" />
                Calculate
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/house-queue/help")}
            >
              <HelpCircle className="h-4 w-4" />
              Help
            </Button>
          </div>
        </div>
        <p className="rounded-lg border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
          <span className="font-semibold">Eligibility rule:</span>{" "}
          {houseCategoryLegend()}
        </p>
      </div>

      {/* ─── Metric Stat Cards ─── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Employees</span>
            <Users className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold">{summary.total}</div>
          <p className="mt-1 text-[11px] text-muted-foreground">Active, in view</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Eligible</span>
            <Home className="h-4 w-4 text-purple-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-purple-600 dark:text-purple-400">
            {summary.eligible}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Qualify for a house</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Ready</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {summary.ready}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">House recommended</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Allocated</span>
            <CheckCircle2 className="h-4 w-4 text-blue-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-blue-600 dark:text-blue-400">
            {summary.allocated}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Live allocations</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">No House</span>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-400">
            {summary.noHouse}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Waiting for stock</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Not Eligible</span>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-2 text-2xl font-bold text-muted-foreground">
            {summary.notEligible}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Below policy</p>
        </div>
      </div>

      {/* ─── Availability strip ─── */}
      {availability.some((a) => a.totalActive > 0) && (
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-1.5">
            <Home className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">House availability (live)</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {availability.map((a) => (
              <div key={a.category} className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-1.5">
                <HouseCategoryBadge category={a.category} />
                <span className="text-xs text-muted-foreground">
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">{a.available}</span>
                  {" "}free / {a.totalActive} active
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Filters toolbar ─── */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or employee no…"
            className="pl-9 text-xs"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={gradeFilter} onValueChange={setGradeFilter}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue placeholder="Job Grade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Grades</SelectItem>
              {gradeOptions.map((g) => (
                <SelectItem key={g} value={String(g)}>
                  Grade {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="ready_for_allocation">Ready for Allocation</SelectItem>
              <SelectItem value="no_house_available">No House Available</SelectItem>
              <SelectItem value="allocated">Allocated</SelectItem>
              <SelectItem value="skipped">Skipped</SelectItem>
              <SelectItem value="deferred">Deferred</SelectItem>
              <SelectItem value="released">Released</SelectItem>
              <SelectItem value="terminated">Terminated</SelectItem>
              <SelectItem value="not_eligible">Not Eligible</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ─── Grade-grouped queue sections ─── */}
      {groups.length === 0 ? (
        <div className="w-full rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <h3 className="text-sm font-semibold text-foreground">No employees in view</h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
            Adjust or clear the filters. The queue only includes active
            employees.
          </p>
        </div>
      ) : (
        groups.map((group) => {
          const ready = group.rows.filter(
            (r) => r.queueStatus === "ready_for_allocation",
          ).length;
          const allocated = group.rows.filter((r) => r.isAllocated).length;
          return (
            <section key={group.grade ?? "ungraded"} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="px-2.5 py-1 text-xs">
                  Grade {group.grade ?? "—"}
                </Badge>
                {group.category && <HouseCategoryBadge category={group.category} />}
                <span className="text-xs text-muted-foreground">
                  {group.rows.length} employee
                  {group.rows.length !== 1 ? "s" : ""} · {ready} ready · {allocated}{" "}
                  allocated
                </span>
                {capabilities.manage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-7 gap-1 text-xs"
                    onClick={() => void handleRecalculate(group.grade)}
                  >
                    <PencilRuler className="h-3.5 w-3.5" />
                    Calculate grade
                  </Button>
                )}
              </div>
              <ResponsiveTable
                columns={columns}
                data={group.rows}
                renderCell={renderCell}
                keyExtractor={(row) => row.employeeId}
                mobileCardView
                minWidth="1150px"
                emptyMessage="No employees in this grade"
                emptyDescription="Add active employees with this job grade to see them here."
              />
            </section>
          );
        })
      )}

      {/* ─── Row-action dialogs ─── */}
      <QueueDetailsDialog
        row={activeRow}
        open={dialogKey === "details"}
        onOpenChange={(open) => !open && closeDialog()}
      />
      <ApproveDialog
        row={activeRow}
        open={dialogKey === "approve"}
        onOpenChange={(open) => !open && closeDialog()}
        onSubmit={handleApprove}
      />
      <ReassignDialog
        row={activeRow}
        open={dialogKey === "reassign"}
        onOpenChange={(open) => !open && closeDialog()}
        onSubmit={handleReassign}
      />
      <SkipDeferDialog
        row={activeRow}
        open={dialogKey === "skipdefer"}
        onOpenChange={(open) => !open && closeDialog()}
        onSubmit={handleSkipDefer}
      />
      <ReleaseWorkflowDialog
        open={dialogKey === "release"}
        onOpenChange={(open) => !open && closeDialog()}
        onComplete={() => void loadQueue(true)}
        employee={
          activeRow
            ? {
                id: activeRow.employeeId,
                name: fullName(activeRow),
                employeeNumber: activeRow.employeeNumber,
                jobGrade: activeRow.jobGrade,
              }
            : { id: "", name: "", employeeNumber: "", jobGrade: null }
        }
        currentHouseNumber={activeRow?.recommendedHouseNumber ?? null}
        currentHid={activeRow?.recommendedHid ?? null}
      />
      <AuditTrailDialog
        row={activeRow}
        open={dialogKey === "audit"}
        onOpenChange={(open) => !open && closeDialog()}
      />
    </div>
  );
}