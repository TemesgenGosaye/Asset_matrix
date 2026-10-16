"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ResponsiveTable, type Column } from "@/components/ui/responsive-table";
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
  KeyRound,
  Users,
  Home,
  Sparkles,
  AlertTriangle,
  XCircle,
  PencilRuler,
  HelpCircle,
  FileText,
} from "lucide-react";
import { fmtScore, formatDate, fullName } from "@/ui/household/house-format";
import { notify } from "@/lib/feedback/notify";
import { useT } from "@/lib/i18n/react";
import {
  HouseCategoryBadge,
  QueueStatusBadge,
} from "@/ui/household/house-status";
import {
  houseCategoryLegend,
  jobGradeBandLabel,
} from "@/lib/house-queue/eligibility";
import { MCDA_CRITERIA } from "@/lib/house-queue/weights";
import type {
  GradeGroup,
  HouseAvailability,
  HouseQueueRow,
  HouseQueueResult,
} from "@/lib/house-queue/types";
import type { McdaWeights } from "@/lib/house-queue/config/types";
import type { QueueActionResult } from "@/lib/house-queue/service";
import { McdaLegend } from "./McdaBreakdown";

/** Verdict of one queue decision, as the dialogs consume it. */
interface QueueActionOutcome {
  ok: boolean;
  /** The server's own words, when it refused. */
  message?: string;
  /** What was committed, on success. Drives the confirmation's detail. */
  result?: QueueActionResult;
}
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
  | "audit"
  | "code";

/**
 * One column per MCDA criterion, generated from `MCDA_CRITERIA` so a criterion can
 * never appear in the engine without a column (or vice versa).
 *
 * Each cell shows that criterion's WEIGHTED contribution — normalized value ×
 * policy weight — because those four numbers are what actually sum to the
 * Priority Score in the next column. Showing the raw normalized value instead
 * would not add up to anything a reader could check.
 */
const MCDA_COLUMN_KEYS = [
  "mcdaService",
  "mcdaMarital",
  "mcdaDisability",
  "mcdaGender",
] as const;

/**
 * Short table header per criterion, keyed by criterion key. `MCDA_CRITERIA.label`
 * is the long form used in the score breakdown ("Service years"), which is too
 * wide for a queue table that already has an attribute column of the same name.
 */
const MCDA_COLUMN_LABELS: Record<string, string> = {
  serviceYears: "Service",
  maritalStatus: "Marital",
  disability: "Disability",
  gender: "Gender",
};

const mcdaColumns: Column[] = MCDA_CRITERIA.map((criterion, i) => ({
  key: MCDA_COLUMN_KEYS[i],
  label: MCDA_COLUMN_LABELS[criterion.key] ?? criterion.label,
  align: "center",
}));

const columns: Column[] = [
  { key: "srNo", label: "#", hideable: false, align: "right" },
  { key: "employee", label: "Employee", hideable: false },
  { key: "grade", label: "Grade", align: "center" },
  { key: "gender", label: "Gender", align: "center" },
  { key: "serviceYears", label: "Service", align: "center" },
  { key: "marital", label: "Marital", align: "center" },
  { key: "disability", label: "Disability", align: "center" },
  { key: "category", label: "House Band", align: "center" },
  ...mcdaColumns,
  { key: "mcdScore", label: "Priority Score", align: "center" },
  { key: "rank", label: "Rank in Band", align: "center" },
  { key: "recommended", label: "Recommended House" },
  { key: "status", label: "Status", align: "center" },
  { key: "requested", label: "Requested" },
  { key: "actions", label: "", hideable: false },
];

export default function HouseQueueClient({
  initialData,
  capabilities,
}: HouseQueueClientProps) {
  const router = useRouter();
  const t = useT();
  const [rows, setRows] = useState<HouseQueueRow[]>(initialData.rows);
  const [gradeGroups, setGradeGroups] = useState<GradeGroup[]>(
    initialData.gradeGroups,
  );
  const [availability, setAvailability] = useState<HouseAvailability[]>(
    initialData.availability,
  );
  // The MCDA weights this queue was computed with (the ACTIVE engine config), so
  // the breakdown shown next to each score is the arithmetic that produced it.
  const [weights, setWeights] = useState<McdaWeights>(initialData.mcdaWeights);
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
        // A silent auto-refresh must not raise a card every 30 seconds if the
        // session has gone stale; that turns the screen into a light show and
        // buries the toasts that matter.
        if (!silent) {
          notify.error(body.error ?? "Failed to reload the house queue");
        }
        return;
      }
      const data = (await res.json()) as HouseQueueResult;
      setRows(data.rows);
      setGradeGroups(data.gradeGroups);
      setWeights(data.mcdaWeights);
      setAvailability(data.availability);
      setLastRefreshed(new Date().toLocaleTimeString());
    } catch {
      if (!silent) notify.error("Failed to reload the house queue");
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

  /**
   * Post a queue action and report exactly one outcome.
   *
   * Every decision funnels through here so that "the server said no" can never
   * again be swallowed: the dialog calls this and gets a verdict, and the
   * verdict always produces feedback. Before this, a failed approve returned
   * `{ok:false}` and nothing rendered it — the dialog simply stopped spinning,
   * which reads as a button that has given up rather than a transaction that
   * was refused.
   *
   * The committed `result` comes back on success so the confirmation can name
   * the house and the rank that were actually written, rather than echoing what
   * the operator was looking at before they clicked.
   */
  const runAction = useCallback(
    async (payload: Record<string, unknown>): Promise<QueueActionOutcome> => {
      try {
        const res = await fetch("/api/house-queue/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          result?: QueueActionResult;
        };
        if (!res.ok) {
          notify.error({
            title: t("feedback.error.title"),
            description: body.error ?? "Action failed",
          });
          return { ok: false, message: body.error ?? "Action failed" };
        }
        return { ok: true, result: body.result };
      } catch {
        notify.error(t("feedback.networkError.description"));
        return { ok: false, message: "Network error" };
      }
    },
    [t],
  );

  /** Refresh the ranking after a committed decision. */
  const handleActionSuccess = useCallback(() => {
    void loadQueue(true);
  }, [loadQueue]);

  const handleApprove = useCallback(
    async (payload: {
      employeeId: string;
      householdId: string;
      employeeName: string;
      employeeNumber: string;
      houseNumber: string | null;
      rank: number | null;
      score: number | null;
    }) => {
      const outcome = await runAction({ action: "approve", ...payload });
      if (!outcome.ok) return outcome;

      // Confirmed by the server, so it can be stated. The rank and score come
      // back from the committed row rather than from the table, which may have
      // moved while the dialog was open.
      notify.operation("allocationApproved", {
        values: {
          name: payload.employeeName,
          employeeNumber: payload.employeeNumber,
          houseNumber:
            outcome.result?.houseNumber ?? payload.houseNumber ?? "—",
        },
        meta: [
          ...(outcome.result?.priorityRank != null
            ? [
                t("feedback.allocationApprovedMeta.rank", {
                  rank: String(outcome.result.priorityRank),
                }),
              ]
            : []),
          ...(outcome.result?.mcdScore != null
            ? [
                t("feedback.allocationApprovedMeta.score", {
                  score: fmtScore(outcome.result.mcdScore),
                }),
              ]
            : []),
        ],
        action: outcome.result?.allocationId
          ? {
              label: t("feedback.allocationApprovedAction"),
              href: `/houses/allocated/${outcome.result.allocationId}`,
              onClick: () => {},
            }
          : undefined,
        // Two approvals of the same employee are different events; without this
        // they would collapse into one card.
        dedupeKey: outcome.result?.allocationId ?? payload.employeeId,
      });
      handleActionSuccess();
      return outcome;
    },
    [runAction, handleActionSuccess, t],
  );

  const handleReassign = useCallback(
    async (payload: {
      employeeId: string;
      householdId: string;
      employeeName: string;
      employeeNumber: string;
    }) => {
      const outcome = await runAction({ action: "reassign", ...payload });
      if (!outcome.ok) return outcome;

      notify.operation("allocationReassigned", {
        values: {
          name: payload.employeeName,
          employeeNumber: payload.employeeNumber,
          houseNumber: outcome.result?.houseNumber ?? "—",
        },
        dedupeKey: outcome.result?.allocationId ?? payload.employeeId,
      });
      handleActionSuccess();
      return outcome;
    },
    [runAction, handleActionSuccess],
  );

  const handleSkipDefer = useCallback(
    async (payload: {
      employeeId: string;
      employeeName: string;
      mode: "skip" | "defer";
      reason?: string;
    }) => {
      const outcome = await runAction({
        action: payload.mode,
        employeeId: payload.employeeId,
        reason: payload.reason,
      });
      if (!outcome.ok) return outcome;

      // Skipping and deferring are decisions, not failures, so they read as
      // info and clear themselves — an operator working a queue should not have
      // to dismiss a card for every row they deliberately pass over.
      notify.operation(payload.mode === "skip" ? "skipped" : "deferred", {
        values: { entity: payload.employeeName },
        dedupeKey: `${payload.mode}-${payload.employeeId}`,
      });
      handleActionSuccess();
      return outcome;
    },
    [runAction, handleActionSuccess],
  );

  const handleRecalculate = useCallback(async (grade?: number | null) => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/house-queue/recalculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grade: grade ?? null }),
      });
      const body = (await res.json().catch(() => ({}))) as
        HouseQueueResult | { error?: string };
      if (!res.ok) {
        notify.error(
          (body as { error?: string }).error ?? "Failed to recalculate",
        );
        return;
      }
      const data = body as HouseQueueResult;
      setRows(data.rows);
      setGradeGroups(data.gradeGroups);
      setWeights(data.mcdaWeights);
      setAvailability(data.availability);
      notify.success("House queue recalculated");
    } catch {
      notify.error("Failed to recalculate the house queue");
    } finally {
      setRefreshing(false);
    }
  }, []);

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

  /**
   * One table per JOB GRADE INTERVAL (Staff, A, B, C, D, E).
   *
   * The interval layout comes from the server (`gradeGroups`), which buckets with
   * the same `HOUSE_CATEGORIES` order the engine uses — the client only
   * re-filters the rows inside each interval, so the two can never disagree
   * about interval order. `gradeGroups` is empty whenever there is nothing to
   * show, so the local filter is what keeps an interval from rendering an empty
   * table.
   */
  const groups = useMemo(() => {
    return gradeGroups
      .map((group) => {
        const groupRows = group.rows.filter((row) =>
          filteredRows.some((f) => f.employeeId === row.employeeId),
        );
        if (groupRows.length === 0) return null;
        const ready = groupRows.filter(
          (r) => r.queueStatus === "ready_for_allocation",
        ).length;
        const allocated = groupRows.filter((r) => r.isAllocated).length;
        return {
          grade: group.grade,
          category: group.category,
          rows: groupRows,
          ready,
          allocated,
        };
      })
      .filter((g): g is NonNullable<typeof g> => g !== null);
  }, [gradeGroups, filteredRows]);

  const summary = useMemo(() => {
    const allocated = rows.filter((r) => r.isAllocated).length;
    return {
      total: filteredRows.length,
      eligible: filteredRows.filter((r) => r.houseCategory !== null).length,
      ready: filteredRows.filter(
        (r) => r.queueStatus === "ready_for_allocation",
      ).length,
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
          return (
            <span className="text-muted-foreground tabular-nums">
              {item.srNo}
            </span>
          );
        case "employee":
          return (
            <div className="flex items-center gap-2.5">
              <div className="bg-primary/10 text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold">
                {item.firstname.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="font-semibold">{fullName(item)}</div>
                <div className="text-muted-foreground text-xs">
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
          return <span className="tabular-nums">{item.serviceYears} yrs</span>;
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
          // The composite. The four criterion columns beside it sum to exactly
          // this number, which is what makes the score auditable.
          return item.mcdComponents ? (
            <span className="font-bold tabular-nums">
              {fmtScore(item.mcdScore)}
            </span>
          ) : (
            <span
              className="text-muted-foreground"
              title="Not scored — no eligible band."
            >
              —
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
              <div className="text-muted-foreground text-xs">
                {item.recommendedHid}
                {item.recommendedLocation
                  ? ` · ${item.recommendedLocation}`
                  : ""}
              </div>
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        case "status":
          return (
            <div className="flex flex-col items-center gap-1">
              <QueueStatusBadge status={item.queueStatus} />
              {/* No code entry here. A release is finalised only from the
                  Allocated Houses page, so this column reports state and points
                  the way rather than offering a second, competing action. */}
              {item.queueStatus === "release_pending" && (
                <Link
                  href="/houses/allocated"
                  className="text-[11px] font-medium text-amber-700 underline underline-offset-2 dark:text-amber-300"
                >
                  Finalize on Allocated Houses
                </Link>
              )}
            </div>
          );
        case "requested":
          return (
            <div>
              <div className="text-sm">
                {formatDate(item.requestSubmittedAt)}
              </div>
              <div className="text-muted-foreground font-mono text-[10px]">
                {item.requestId.slice(0, 8)}
              </div>
            </div>
          );
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
          // Per-criterion MCDA columns: one weighted contribution each. Generated
          // from MCDA_CRITERIA, so the key set is closed and TypeScript catches a
          // missing case if a criterion is ever added to the engine.
          if (
            (MCDA_COLUMN_KEYS as readonly string[]).includes(key) &&
            item.mcdComponents
          ) {
            const criterion =
              MCDA_CRITERIA[
                MCDA_COLUMN_KEYS.indexOf(
                  key as (typeof MCDA_COLUMN_KEYS)[number],
                )
              ];
            const normalized = item.mcdComponents[criterion.key];
            const weight = weights[criterion.key];
            const weighted = normalized * weight;
            return (
              <span
                className={
                  weighted > 0
                    ? "font-semibold tabular-nums"
                    : "text-muted-foreground tabular-nums"
                }
                title={`${criterion.label}: ${criterion.description} Normalized ${normalized.toFixed(2)} × weight ${weight.toFixed(2)} = ${weighted.toFixed(2)}`}
              >
                {fmtScore(weighted)}
              </span>
            );
          }
          return null;
      }
    },
    [capabilities, handleRecalculate, weights],
  );

  return (
    <div className="space-y-6">
      {/* ─── Heading strip ─── */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">House Queue</h1>
            <div className="from-brass-400 mt-1 h-0.5 w-16 rounded bg-gradient-to-r to-transparent" />
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
              One table per job grade interval — everyone inside an interval
              competes for the same houses and is ranked against each other by
              Engine A. Only employees who submitted a request are ranked.
              Recomputed on every view.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 self-start sm:self-start">
            {mounted && lastRefreshed && (
              <span className="text-muted-foreground mr-1 hidden text-xs lg:inline">
                Last refreshed {lastRefreshed}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadQueue()}
              disabled={refreshing}
              className="gap-1.5 shadow-xs"
            >
              <RefreshCw
                className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"}
              />
              Refresh
            </Button>
            {capabilities.manage && (
              <Button
                variant="default"
                size="sm"
                onClick={() =>
                  void handleRecalculate(
                    gradeFilter !== "all" ? Number(gradeFilter) : null,
                  )
                }
                className="gap-1.5 font-medium shadow-sm"
              >
                <Sparkles className="h-4 w-4" />
                Calculate
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/house-queue/help")}
              className="gap-1.5 shadow-xs"
            >
              <HelpCircle className="h-4 w-4" />
              Help
            </Button>
          </div>
        </div>
        <p className="bg-muted/40 text-muted-foreground rounded-lg border px-3 py-1.5 text-xs">
          <span className="font-semibold">Eligibility rule:</span>{" "}
          {houseCategoryLegend()}
        </p>
      </div>

      {/* ─── Metric Stat Cards ─── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="bg-card rounded-xl border p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">
              Employees
            </span>
            <Users className="text-primary h-4 w-4" />
          </div>
          <div className="mt-2 text-2xl font-bold">{summary.total}</div>
          <p className="text-muted-foreground mt-1 text-[11px]">
            Active, in view
          </p>
        </div>
        <div className="bg-card rounded-xl border p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">
              Eligible
            </span>
            <Home className="h-4 w-4 text-purple-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-purple-600 dark:text-purple-400">
            {summary.eligible}
          </div>
          <p className="text-muted-foreground mt-1 text-[11px]">
            Qualify for a house
          </p>
        </div>
        <div className="bg-card rounded-xl border p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">
              Ready
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {summary.ready}
          </div>
          <p className="text-muted-foreground mt-1 text-[11px]">
            House recommended
          </p>
        </div>
        <div className="bg-card rounded-xl border p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">
              Allocated
            </span>
            <CheckCircle2 className="h-4 w-4 text-blue-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-blue-600 dark:text-blue-400">
            {summary.allocated}
          </div>
          <p className="text-muted-foreground mt-1 text-[11px]">
            Live allocations
          </p>
        </div>
        <div className="bg-card rounded-xl border p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">
              No House
            </span>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-400">
            {summary.noHouse}
          </div>
          <p className="text-muted-foreground mt-1 text-[11px]">
            Waiting for stock
          </p>
        </div>
        <div className="bg-card rounded-xl border p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">
              Not Eligible
            </span>
            <XCircle className="text-muted-foreground h-4 w-4" />
          </div>
          <div className="text-muted-foreground mt-2 text-2xl font-bold">
            {summary.notEligible}
          </div>
          <p className="text-muted-foreground mt-1 text-[11px]">Below policy</p>
        </div>
      </div>

      {/* ─── Availability strip ─── */}
      {availability.some((a) => a.totalActive > 0) && (
        <div className="bg-card rounded-xl border p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-1.5">
            <Home className="text-muted-foreground h-4 w-4" />
            <span className="text-sm font-semibold">
              House availability (live)
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {availability.map((a) => (
              <div
                key={a.category}
                className="bg-muted/40 flex items-center gap-2 rounded-lg border px-3 py-1.5"
              >
                <HouseCategoryBadge category={a.category} />
                <span className="text-muted-foreground text-xs">
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {a.available}
                  </span>{" "}
                  free / {a.totalActive} active
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Filters toolbar ─── */}
      <div className="bg-card flex flex-col gap-3 rounded-xl border p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
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
              <SelectItem value="ready_for_allocation">
                Ready for Allocation
              </SelectItem>
              <SelectItem value="no_house_available">
                No House Available
              </SelectItem>
              <SelectItem value="allocated">Allocated</SelectItem>
              <SelectItem value="release_pending">Release Pending</SelectItem>
              <SelectItem value="skipped">Skipped</SelectItem>
              <SelectItem value="deferred">Deferred</SelectItem>
              <SelectItem value="terminated">Terminated</SelectItem>
              <SelectItem value="not_eligible">Not Eligible</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ─── Grade-grouped queue sections ─── */}
      {groups.length === 0 ? (
        <div className="border-border bg-card w-full rounded-xl border border-dashed p-12 text-center">
          <h3 className="text-foreground text-sm font-semibold">
            {rows.length === 0
              ? "No house requests have been submitted yet"
              : "No requesters match the current filters"}
          </h3>
          <p className="text-muted-foreground mx-auto mt-1 max-w-md text-xs">
            {rows.length === 0 ? (
              <>
                The House Queue only lists employees who have submitted a house
                request. File the first request from the{" "}
                <span className="font-semibold">House Request</span> page.
              </>
            ) : (
              <>
                Adjust or clear the filters. Only employees with an active house
                request appear in the queue.
              </>
            )}
          </p>
          {rows.length === 0 && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => router.push("/house-request")}
            >
              <FileText className="h-4 w-4" />
              Go to House Request
            </Button>
          )}
        </div>
      ) : (
        groups.map((group) => {
          const isUngraded = group.category === null;
          const headingId = `interval-${group.category ?? "ungraded"}`;
          return (
            <section
              key={headingId}
              className="space-y-2"
              aria-labelledby={headingId}
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 id={headingId} className="text-sm font-semibold">
                  {isUngraded
                    ? "No job grade on record"
                    : `${group.category} band`}
                </h2>
                <HouseCategoryBadge category={group.category} />
                {group.category && (
                  <span className="text-muted-foreground text-xs">
                    {jobGradeBandLabel(group.category)}
                  </span>
                )}
                <span className="text-muted-foreground text-xs">
                  {group.rows.length} requester
                  {group.rows.length !== 1 ? "s" : ""} · {group.ready} ready ·{" "}
                  {group.allocated} allocated
                </span>
                {capabilities.manage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-7 gap-1 text-xs"
                    onClick={() => void handleRecalculate(null)}
                  >
                    <PencilRuler className="h-3.5 w-3.5" />
                    Recalculate
                  </Button>
                )}
              </div>
              {isUngraded && (
                <p className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-300">
                  These requesters submitted while eligible, but their record
                  now carries no job grade, so the eligibility rule cannot place
                  them in a band. They stay listed so an allocator can act on
                  them — they are simply not eligible for a house right now.
                </p>
              )}
              <ResponsiveTable
                columns={columns}
                storageKey="house-queue-columns"
                data={group.rows}
                renderCell={renderCell}
                keyExtractor={(row) => row.employeeId}
                mobileCardView
                minWidth="1560px"
                emptyMessage="No requesters in this band"
                emptyDescription="Nobody in this band has submitted a house request."
              />
            </section>
          );
        })
      )}

      {/* ─── MCDA legend ─── */}
      <McdaLegend weights={weights} />

      {/* ─── Row-action dialogs ─── */}
      <QueueDetailsDialog
        row={activeRow}
        weights={weights}
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
