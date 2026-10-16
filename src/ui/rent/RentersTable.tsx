"use client";

/**
 * Pay Rent register.
 *
 * Follows the portal's enterprise-table conventions (see EmployeesTable):
 * server-side pagination / sorting / filtering, a debounced search across name /
 * National ID / phone, real aggregate summary cards, skeleton and error states,
 * row action menus, and CSV/Excel export driven by the same filters.
 *
 * The empty state only appears when the DATABASE genuinely has no matching
 * records - there is no placeholder or sample data anywhere in this module.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Banknote,
  Ban,
  Download,
  Eye,
  FileSignature,
  FileSpreadsheet,
  HandCoins,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  RotateCcw,
  ScrollText,
  Search,
  Users,
  X,
} from "lucide-react";
import { notify } from "@/lib/feedback/notify";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveTable, type Column } from "@/components/ui/responsive-table";
import MetricCard from "@/components/MetricCard";
import type { RentCapabilities } from "@/lib/rent/access";
import {
  GENDER_LABELS,
  RENT_DISPLAY_STATUS_OPTIONS,
  RENT_GENDER_OPTIONS,
  RENT_TYPE_OPTIONS,
} from "@/lib/rent/constants";
import {
  ALL,
  DEFAULT_RENT_QUERY,
  FILTER_FIELDS,
  toSearchParams,
  type RentQueryState,
  type RentRenterDto,
  type RentRenterListResponse,
  type RentSummary,
} from "@/lib/rent/types";
import RenterDetailDialog from "./RenterDetailDialog";
import RenterFormDialog from "./RenterFormDialog";
import {
  formatEtbNumber,
  formatRentDate,
  formatPhoneForDisplay,
  isZeroAmount,
} from "./format";
import { MonthsPaidIndicator, RentStatusBadge } from "./status-badges";

const PAGE_SIZE_OPTIONS = ["10", "25", "50", "100"] as const;
const SEARCH_DEBOUNCE_MS = 300;

interface RentersTableProps {
  capabilities: RentCapabilities;
  /** Server-rendered so the header paints with real numbers immediately. */
  initialSummary: RentSummary;
  ethiopianCalendar: boolean;
}

export default function RentersTable({
  capabilities,
  initialSummary,
  ethiopianCalendar,
}: RentersTableProps) {
  const router = useRouter();

  const [query, setQuery] = useState<RentQueryState>(DEFAULT_RENT_QUERY);
  const [searchDraft, setSearchDraft] = useState("");
  const [rows, setRows] = useState<RentRenterDto[]>([]);
  const [summary, setSummary] = useState<RentSummary>(initialSummary);
  const [meta, setMeta] = useState({
    total: 0,
    page: 1,
    pageSize: 25,
    totalPages: 1,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const requestId = useRef(0);
  const summaryRequestId = useRef(0);

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RentRenterDto | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<RentRenterDto | null>(
    null,
  );
  const [archiveReason, setArchiveReason] = useState("");
  const [isArchiving, setIsArchiving] = useState(false);

  // ------------------------------------------------------------------ fetching

  const fetchPage = useCallback(async (state: RentQueryState) => {
    const id = ++requestId.current;
    setIsLoading(true);
    setLoadError(null);
    try {
      const params = toSearchParams(state);
      const res = await fetch(`/api/rent?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Failed to load renters.");
      }
      const body: RentRenterListResponse = await res.json();
      if (id !== requestId.current) return; // drop a stale response
      setRows(body.data);

      // A mutation can shrink the result set under the current page (archiving
      // the last row of page 3 of 3). Without this clamp the table renders empty
      // and the status bar reads "Showing 51-50 of 50 records".
      const totalPages = Math.max(body.totalPages, 1);
      if (body.page > totalPages) {
        setQuery((prev) => ({ ...prev, page: totalPages }));
        return; // the corrected page triggers its own fetch
      }

      setMeta({
        total: body.total,
        page: body.page,
        pageSize: body.pageSize,
        totalPages,
      });
    } catch (error) {
      if (id !== requestId.current) return;
      setLoadError(
        error instanceof Error ? error.message : "Failed to load renters.",
      );
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  }, []);

  const fetchSummary = useCallback(async () => {
    const id = ++summaryRequestId.current;
    setIsSummaryLoading(true);
    try {
      const res = await fetch("/api/rent/summary", { cache: "no-store" });
      if (!res.ok) throw new Error("summary request failed");
      const body = (await res.json()) as RentSummary;
      if (id !== summaryRequestId.current) return; // drop a stale response
      setSummary(body);
      setSummaryError(null);
    } catch {
      // Surface it rather than leaving six cards showing stale numbers in
      // silence - but keep showing the last good figures.
      if (id === summaryRequestId.current) {
        setSummaryError(
          "Totals could not be refreshed. Figures may be out of date.",
        );
      }
    } finally {
      if (id === summaryRequestId.current) setIsSummaryLoading(false);
    }
  }, []);

  // Debounced search: the request only fires 300ms after typing stops.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery((prev) =>
        prev.search === searchDraft
          ? prev
          : { ...prev, search: searchDraft, page: 1 },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchDraft]);

  // Fetch on query change, deferred off the commit phase.
  useEffect(() => {
    void Promise.resolve().then(() => fetchPage(query));
  }, [query, fetchPage]);

  const refresh = useCallback(() => {
    void fetchPage(query);
    void fetchSummary();
    router.refresh();
  }, [fetchPage, fetchSummary, query, router]);

  // ------------------------------------------------------------------ mutators

  const applyFilter = useCallback(
    <K extends keyof RentQueryState>(key: K, value: RentQueryState[K]) => {
      setQuery((prev) => ({
        ...prev,
        [key]: value,
        ...(FILTER_FIELDS.includes(key as (typeof FILTER_FIELDS)[number])
          ? { page: 1 }
          : {}),
      }));
    },
    [],
  );

  const SORTABLE: Record<string, RentQueryState["sortBy"]> = useMemo(
    () => ({
      fullName: "lastName",
      nationalId: "nationalId",
      rentType: "rentType",
      monthlyPrice: "monthlyPrice",
      startDate: "startDate",
      term: "termMonths",
      monthsPaid: "startDate",
      outstanding: "monthlyPrice",
      status: "status",
    }),
    [],
  );

  const toggleSort = useCallback((field: RentQueryState["sortBy"]) => {
    setQuery((prev) => ({
      ...prev,
      sortBy: field,
      sortOrder:
        prev.sortBy === field && prev.sortOrder === "asc" ? "desc" : "asc",
      page: 1,
    }));
  }, []);

  const sortIcon = useCallback(
    (field: RentQueryState["sortBy"]) => {
      if (query.sortBy !== field)
        return (
          <ArrowUpDown className="ml-1 inline h-3 w-3" aria-hidden="true" />
        );
      return query.sortOrder === "asc" ? (
        <ArrowUp className="ml-1 inline h-3 w-3" aria-hidden="true" />
      ) : (
        <ArrowDown className="ml-1 inline h-3 w-3" aria-hidden="true" />
      );
    },
    [query.sortBy, query.sortOrder],
  );

  const hasActiveFilters = useMemo(
    () =>
      query.search !== "" ||
      query.rentType !== ALL ||
      query.status !== ALL ||
      query.gender !== ALL ||
      query.overdueOnly ||
      query.startDateFrom !== "" ||
      query.startDateTo !== "" ||
      query.onlyArchived,
    [query],
  );

  const clearFilters = useCallback(() => {
    setSearchDraft("");
    setQuery({ ...DEFAULT_RENT_QUERY, pageSize: query.pageSize });
  }, [query.pageSize]);

  // ------------------------------------------------------------------ actions

  /**
   * Download the register through the API's own export route, using the exact
   * filters currently on screen.
   *
   * A real anchor click rather than `window.location.href`, so this is a file
   * download (which navigates away from the SPA) and not a client-side route
   * change - the export must not push an `/api/...` entry onto the router stack.
   */
  const exportRegister = useCallback(
    (format: "csv" | "xlsx") => {
      const params = toSearchParams(query);
      params.set("format", format);
      const url = `/api/rent/export?${params.toString()}`;

      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.rel = "noopener";
      anchor.download = "";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    },
    [query],
  );

  const archive = useCallback(async () => {
    if (!archiveTarget || isArchiving) return;
    setIsArchiving(true);
    try {
      const res = await fetch(`/api/rent/${archiveTarget.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: archiveReason.trim() || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(body?.error ?? "Could not archive the renter.");
      notify.success({
        title: "Renter archived",
        description: `${archiveTarget.fullName} was moved to the archive. Their receipts are kept.`,
      });
      setArchiveTarget(null);
      setArchiveReason("");
      refresh();
    } catch (error) {
      notify.error({
        title: "Could not archive renter",
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsArchiving(false);
    }
  }, [archiveReason, archiveTarget, isArchiving, refresh]);

  const restore = useCallback(
    async (renter: RentRenterDto) => {
      try {
        const res = await fetch(`/api/rent/${renter.id}/restore`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok)
          throw new Error(body?.error ?? "Could not restore the renter.");
        notify.success({
          title: "Renter restored",
          description: `${renter.fullName} is back in the live register.`,
        });
        refresh();
      } catch (error) {
        notify.error({
          title: "Could not restore renter",
          description: error instanceof Error ? error.message : undefined,
        });
      }
    },
    [refresh],
  );

  const onSaved = useCallback(async () => {
    notify.success("Renter saved");
    refresh();
  }, [refresh]);

  // ------------------------------------------------------------------ columns

  const columns: Column[] = useMemo(() => {
    const base: Column[] = [
      { key: "srNo", label: "#", align: "center", className: "w-14" },
      { key: "fullName", label: "Full Name" },
      { key: "gender", label: "Gender" },
      { key: "nationalId", label: "National ID" },
      { key: "phones", label: "Phone(s)" },
      { key: "rentType", label: "Rent Type" },
      { key: "monthlyPrice", label: "Monthly Price", align: "right" },
      { key: "startDate", label: "Start Date" },
      { key: "term", label: "Term", align: "center" },
      { key: "monthsPaid", label: "Months Paid" },
      { key: "totalPaid", label: "Total Paid", align: "right" },
      { key: "outstanding", label: "Outstanding", align: "right" },
      { key: "nextDue", label: "Next Due" },
      { key: "status", label: "Status" },
      { key: "actions", label: "Actions", align: "right", className: "w-24" },
    ];
    return base.map((column) => {
      const sortField = SORTABLE[column.key];
      if (!sortField) return column;
      return {
        ...column,
        icon: sortIcon(sortField),
        onHeaderClick: () => toggleSort(sortField),
        ariaSort:
          query.sortBy === sortField
            ? query.sortOrder === "desc"
              ? ("descending" as const)
              : ("ascending" as const)
            : ("none" as const),
      };
    });
  }, [SORTABLE, sortIcon, toggleSort, query.sortBy, query.sortOrder]);

  const renderCell = useCallback(
    (item: RentRenterDto, key: string) => {
      switch (key) {
        case "srNo":
          return (
            <span className="text-muted-foreground tabular-nums">
              {item.srNo}
            </span>
          );

        case "fullName":
          return (
            <button
              type="button"
              onClick={() => setDetailId(item.id)}
              className="text-left font-medium hover:underline"
            >
              {item.fullName}
              {item.deletedAt ? (
                <Badge variant="muted" className="ml-2">
                  Archived
                </Badge>
              ) : null}
            </button>
          );

        case "gender":
          return GENDER_LABELS[item.gender] ?? item.gender;

        case "nationalId":
          return (
            <span className="font-mono text-xs">
              {item.nationalId}
              {item.nationalIdMasked ? (
                <Badge variant="muted" className="ml-1.5">
                  Masked
                </Badge>
              ) : null}
            </span>
          );

        case "phones":
          return (
            <span className="text-xs">
              {item.phones.length > 0
                ? item.phones
                    .map((p) => formatPhoneForDisplay(p.phone))
                    .join(", ")
                : "—"}
            </span>
          );

        case "rentType":
          return (
            <span>
              {item.rentType === "Other" && item.rentTypeDetail
                ? `${item.rentType} — ${item.rentTypeDetail}`
                : item.rentType}
            </span>
          );

        case "monthlyPrice":
          return (
            <span className="tabular-nums">
              {formatEtbNumber(item.monthlyPrice)}
            </span>
          );

        case "startDate":
          return (
            <span className="whitespace-nowrap">
              {formatRentDate(item.startDate)}
            </span>
          );

        case "term":
          return (
            <span className="tabular-nums">
              {item.termMonths}
              <span className="text-muted-foreground text-xs"> mo</span>
            </span>
          );

        case "monthsPaid":
          return (
            <MonthsPaidIndicator
              monthsPaid={item.totals.monthsPaid}
              totalMonths={item.totals.totalMonths}
              className="w-24"
            />
          );

        case "totalPaid":
          return (
            <span className="tabular-nums">
              {formatEtbNumber(item.totals.totalPaid)}
            </span>
          );

        case "outstanding":
          return (
            <span className="tabular-nums">
              {formatEtbNumber(item.totals.outstanding)}
              {item.totals.overdueMonths > 0 ? (
                <Badge variant="warning" className="ml-1.5">
                  {item.totals.overdueMonths} overdue
                </Badge>
              ) : null}
            </span>
          );

        case "nextDue":
          return (
            <span className="whitespace-nowrap">
              {item.totals.nextDueDate
                ? formatRentDate(item.totals.nextDueDate)
                : "—"}
            </span>
          );

        case "status":
          return (
            <div className="space-y-1">
              <RentStatusBadge status={item.displayStatus} />
              {item.status === "Completed" ? (
                <p className="text-muted-foreground text-xs">
                  Contract value{" "}
                  {formatEtbNumber(item.totals.totalContractValue)}
                </p>
              ) : null}
            </div>
          );

        case "actions":
          return (
            <div className="flex items-center justify-end gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground h-7 w-7"
                onClick={() => setDetailId(item.id)}
                title="View lease and record payments"
                aria-label={`View ${item.fullName}`}
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
              {capabilities.update &&
              !item.deletedAt &&
              item.status !== "Terminated" ? (
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground h-7 w-7"
                  onClick={() => {
                    setEditing(item);
                    setFormOpen(true);
                  }}
                  title="Edit renter"
                  aria-label={`Edit ${item.fullName}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-muted-foreground hover:text-foreground h-7 w-7"
                    aria-label={`More actions for ${item.fullName}`}
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => setDetailId(item.id)}>
                    <Eye className="mr-2 h-4 w-4" />
                    View / Record payment
                  </DropdownMenuItem>
                  {capabilities.update && !item.deletedAt ? (
                    <DropdownMenuItem
                      onClick={() => {
                        setEditing(item);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit record
                    </DropdownMenuItem>
                  ) : null}
                  {capabilities.archive && item.deletedAt ? (
                    <DropdownMenuItem onClick={() => void restore(item)}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Restore
                    </DropdownMenuItem>
                  ) : null}
                  {capabilities.archive && !item.deletedAt ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive cursor-pointer"
                        onClick={() => setArchiveTarget(item)}
                      >
                        <Ban className="mr-2 h-4 w-4" />
                        Archive
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );

        default:
          return null;
      }
    },
    [capabilities.archive, capabilities.update, restore],
  );

  // ------------------------------------------------------------------ render

  const showingFrom =
    meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
  const showingTo = Math.min(meta.page * meta.pageSize, meta.total);

  // Decimal strings, compared as decimals rather than with `>` so "9" is not
  // treated as greater than "100".
  const hasOutstanding = !isZeroAmount(summary.totalOutstanding);

  return (
    <div className="space-y-4">
      {/* ---- Summary cards, from real aggregates.
             Same shared MetricCard component and 6-up grid the rest of the
             portal uses (see hams/KpiRow), each card given its own icon,
             variant and breakdown strip. ---- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          title="Total Renters"
          value={summary.totalRenters}
          icon={Users}
          variant="navy"
          subtitle="People renting premises from the factory"
          breakdown={[
            {
              label: "Live",
              value: summary.totalRenters - summary.archivedRenters,
            },
            { label: "Archived", value: summary.archivedRenters },
          ]}
        />
        <MetricCard
          title="Active Leases"
          value={summary.activeLeases}
          icon={FileSignature}
          variant="success"
          subtitle="Currently collecting rent"
          breakdown={[
            { label: "Completed", value: summary.completedLeases },
            { label: "Terminated", value: summary.terminatedLeases },
          ]}
        />
        <MetricCard
          title="Overdue"
          value={summary.overdueRenters}
          icon={AlertTriangle}
          variant={summary.overdueRenters > 0 ? "destructive" : "default"}
          badge={summary.overdueRenters > 0 ? "Needs Action" : "All Current"}
          subtitle={
            summary.overdueRenters > 0
              ? "Leases with an unpaid month past its due date"
              : "No lease is past its due date"
          }
          breakdown={[{ label: "Months", value: summary.overdueMonths }]}
        />
        <MetricCard
          title="Total Collected"
          value={formatEtbNumber(summary.totalCollected)}
          icon={Banknote}
          variant="brass"
          subtitle="ETB received against live leases"
        />
        <MetricCard
          title="Total Outstanding"
          value={formatEtbNumber(summary.totalOutstanding)}
          icon={HandCoins}
          variant={hasOutstanding ? "warning" : "default"}
          badge={hasOutstanding ? "Collectable" : "Settled"}
          subtitle={
            hasOutstanding
              ? "ETB invoiced and not yet received"
              : "Nothing outstanding across live leases"
          }
        />
        <MetricCard
          title="Contract Value"
          value={formatEtbNumber(summary.totalContractValue)}
          icon={ScrollText}
          variant="default"
          subtitle="ETB billed across all live lease terms"
          breakdown={[
            {
              label: "Collected",
              value: `${formatEtbNumber(summary.totalCollected)} / ${formatEtbNumber(summary.totalContractValue)}`,
            },
          ]}
        />
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {isSummaryLoading ? "Refreshing totals" : (summaryError ?? "")}
      </div>

      {summaryError ? (
        <p role="alert" className="text-muted-foreground text-xs">
          {summaryError}
        </p>
      ) : null}

      {/* ---- Toolbar ---- */}
      <div className="border-border bg-card flex flex-col gap-3 rounded-xl border p-3 lg:flex-row lg:items-center">
        <div className="relative w-full lg:max-w-md">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            className="pr-8 pl-9"
            placeholder="Search name, National ID or phone..."
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            aria-label="Search renters"
          />
          {searchDraft ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearchDraft("")}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <Select
          value={query.rentType}
          onValueChange={(v) => applyFilter("rentType", v)}
        >
          <SelectTrigger
            className="w-full sm:w-40"
            aria-label="Filter by rent type"
          >
            <SelectValue placeholder="Rent type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any rent type</SelectItem>
            {RENT_TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={query.status}
          onValueChange={(v) => applyFilter("status", v)}
        >
          <SelectTrigger
            className="w-full sm:w-40"
            aria-label="Filter by lease status"
          >
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any status</SelectItem>
            {RENT_DISPLAY_STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={query.gender}
          onValueChange={(v) => applyFilter("gender", v)}
        >
          <SelectTrigger
            className="w-full sm:w-36"
            aria-label="Filter by gender"
          >
            <SelectValue placeholder="Gender" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any gender</SelectItem>
            {RENT_GENDER_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant={query.overdueOnly ? "default" : "outline"}
            aria-pressed={query.overdueOnly}
            onClick={() => applyFilter("overdueOnly", !query.overdueOnly)}
          >
            Overdue only
          </Button>
          <Button
            size="sm"
            variant={query.onlyArchived ? "default" : "outline"}
            aria-pressed={query.onlyArchived}
            onClick={() => applyFilter("onlyArchived", !query.onlyArchived)}
          >
            Archived
          </Button>
        </div>

        {/* Start-date range */}
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="rent-start-from" className="text-xs">
              Start from
            </Label>
            <Input
              id="rent-start-from"
              type="date"
              className="h-9 w-36"
              value={query.startDateFrom}
              onChange={(e) => applyFilter("startDateFrom", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rent-start-to" className="text-xs">
              to
            </Label>
            <Input
              id="rent-start-to"
              type="date"
              className="h-9 w-36"
              value={query.startDateTo}
              onChange={(e) => applyFilter("startDateTo", e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          {hasActiveFilters ? (
            <Button size="sm" variant="ghost" onClick={clearFilters}>
              <X className="mr-1.5 h-3.5 w-3.5" />
              Clear
            </Button>
          ) : null}

          {capabilities.export ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <Download className="text-muted-foreground mr-2 h-4 w-4" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportRegister("xlsx")}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportRegister("csv")}>
                  <Download className="mr-2 h-4 w-4" />
                  CSV format
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          {capabilities.create ? (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Register renter
            </Button>
          ) : null}
        </div>
      </div>

      {/* ---- Error state ---- */}
      {loadError ? (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive flex items-center justify-between rounded-lg border p-3 text-sm"
        >
          <span>{loadError}</span>
          <Button size="sm" variant="outline" onClick={refresh}>
            Retry
          </Button>
        </div>
      ) : null}

      {/* ---- Table ---- */}
      {loadError && rows.length === 0 ? (
        // A cold-load failure must not also read as an empty register: the
        // empty state below claims "no renter records exist yet", which an
        // outage would otherwise look like.
        <div className="border-border text-muted-foreground rounded-xl border p-8 text-center text-sm">
          The register could not be loaded. Use Retry above.
        </div>
      ) : isLoading && rows.length === 0 ? (
        <div className="border-border space-y-2 rounded-xl border p-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded" />
          ))}
        </div>
      ) : (
        <ResponsiveTable
          columns={columns}
          data={rows}
          renderCell={renderCell}
          keyExtractor={(item) => item.id}
          emptyMessage={
            query.onlyArchived ? "No archived renters" : "No renters found"
          }
          emptyDescription={
            hasActiveFilters
              ? "No records matched your filter criteria. Try clearing or relaxing the filters."
              : query.onlyArchived
                ? "Renter records you archive will appear here."
                : "No renter records exist yet. Click 'Register renter' to add the first one - their monthly rent schedule is generated automatically."
          }
          stickyHeader
          mobileCardView
          minWidth="1600px"
          storageKey="rent-table-columns"
        />
      )}

      {/* ---- Status bar + pagination ---- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-muted-foreground flex items-center gap-3 text-sm">
          {/* Live region: the row range and page change on every filter, sort,
              page turn and post-mutation refresh, which is silent otherwise. */}
          <span role="status" aria-live="polite" aria-atomic="true">
            {isLoading
              ? "Updating rent records..."
              : `Showing ${showingFrom}-${showingTo} of ${meta.total} records`}
          </span>
          <Select
            value={String(query.pageSize)}
            onValueChange={(v) => applyFilter("pageSize", Number(v))}
          >
            <SelectTrigger className="h-8 w-24" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={size}>
                  {size} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <nav
          className="flex items-center justify-center gap-2"
          aria-label="Rent register pagination"
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => setQuery((p) => ({ ...p, page: 1 }))}
            disabled={meta.page <= 1 || isLoading}
          >
            First
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setQuery((p) => ({ ...p, page: Math.max(1, p.page - 1) }))
            }
            disabled={meta.page <= 1 || isLoading}
          >
            Previous
          </Button>
          <span className="text-muted-foreground text-sm" aria-live="polite">
            Page <strong className="text-foreground">{meta.page}</strong> of{" "}
            <strong className="text-foreground">{meta.totalPages}</strong>
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setQuery((p) => ({
                ...p,
                page: Math.min(meta.totalPages, p.page + 1),
              }))
            }
            disabled={meta.page >= meta.totalPages || isLoading}
          >
            Next
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setQuery((p) => ({ ...p, page: meta.totalPages }))}
            disabled={meta.page >= meta.totalPages || isLoading}
          >
            Last
          </Button>
        </nav>
      </div>

      {/* ---- Dialogs ---- */}
      <RenterFormDialog
        open={formOpen}
        onOpenChange={(next) => {
          setFormOpen(next);
          if (!next) setEditing(null);
        }}
        renter={editing}
        hasPayments={(editing?.totals.monthsPaid ?? 0) > 0}
        canOverrideTerms={capabilities.overrideTerms}
        onSaved={onSaved}
      />

      <RenterDetailDialog
        open={detailId !== null}
        onOpenChange={(next) => {
          if (!next) setDetailId(null);
        }}
        renterId={detailId}
        capabilities={capabilities}
        ethiopianCalendar={ethiopianCalendar}
        onChanged={refresh}
        onEdit={(renter) => {
          setDetailId(null);
          setEditing(renter as RentRenterDto);
          setFormOpen(true);
        }}
      />

      <Dialog
        open={archiveTarget !== null}
        onOpenChange={(next) => {
          if (!next) {
            setArchiveTarget(null);
            setArchiveReason("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Archive Renter</DialogTitle>
            <DialogDescription>
              {archiveTarget
                ? `${archiveTarget.fullName} will be moved to the archive. Their schedule and receipts are kept, and the record can be restored later.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rent-archive-reason">
              Reason{" "}
              <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Input
              id="rent-archive-reason"
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              maxLength={500}
              placeholder="e.g. Left the premises; account closed."
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setArchiveTarget(null);
                setArchiveReason("");
              }}
              disabled={isArchiving}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={archive}
              disabled={isArchiving}
            >
              {isArchiving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Archiving...
                </>
              ) : (
                "Archive renter"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
