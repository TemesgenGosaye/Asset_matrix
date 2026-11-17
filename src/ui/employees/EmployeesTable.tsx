"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { notify } from "@/lib/feedback/notify";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Building2,
  CalendarClock,
  Download,
  MoreVertical,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  TriangleAlert,
  Upload,
  UserCheck,
  Users,
  UserX,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveTable, type Column } from "@/components/ui/responsive-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

import {
  ALL,
  DEFAULT_EMPLOYEE_QUERY,
  FILTER_FIELDS,
  toSearchParams,
  type BulkResponse,
  type EmployeeCounts,
  type EmployeeDto,
  type EmployeeListResponse,
  type EmployeeQueryState,
  type EmployeeReferenceOption,
  type EmployeeSortField,
} from "@/lib/employees/types";
import {
  GENDER_LABELS,
  GENDER_OPTIONS,
  MARITAL_STATUS_LABELS,
  MARITAL_STATUS_OPTIONS,
  MISSING_JOB_GRADE_LABEL,
  MISSING_JOB_GRADE_NOTICE,
  disabilityDisplayLabel,
  hasDisabilityRecord,
  labelOrDash,
} from "@/lib/employees/constants";
import { EmployeeImportDialog } from "./EmployeeImportDialog";
import { EmployeeFormModal } from "./EmployeeFormModal";
import { EmployeeDetailModal } from "./EmployeeDetailModal";
import { EditIcon, DeleteIcon } from "@/ui/Icons";

const PAGE_SIZE_OPTIONS = ["10", "25", "50", "100"] as const;

export interface EmployeesTableProps {
  counts: EmployeeCounts;
  canCreate?: boolean;
  canExport?: boolean;
  canImport?: boolean;
  canDelete?: boolean;
  canEdit?: boolean;
  canRestore?: boolean;
  /** Opens the create dialog on mount. Used by `/employees/create`. */
  initialCreateOpen?: boolean;
  /** Opens the edit dialog for this record on mount. Used by `/employees/[id]/edit`. */
  initialEditEmployee?: EmployeeDto | null;
}

function fullName(item: Pick<EmployeeDto, "firstname" | "lastname">): string {
  return `${item.firstname} ${item.lastname}`.trim();
}

function initials(item: Pick<EmployeeDto, "firstname" | "lastname">): string {
  const first = item.firstname?.charAt(0) || "";
  const last = item.lastname?.charAt(0) || "";
  return `${first}${last}`.toUpperCase() || "E";
}

/**
 * EXACTLY 8 COLUMNS, IN STRICT ORDER:
 * 1. Emp ID
 * 2. First Name
 * 3. Last Name
 * 4. Gender
 * 5. Job Grade
 * 6. Service Years
 * 7. Marital Status
 * 8. Disability
 *
 * There is no ninth column: the row actions and the selection checkbox live
 * inside the Emp ID cell, so the table shows the eight canonical employee
 * fields and nothing else.
 */
const REQUIRED_COLUMNS: Column[] = [
  { key: "employeeNumber", label: "Emp ID", align: "left", className: "w-64" },
  { key: "firstname", label: "First Name", align: "left" },
  { key: "lastname", label: "Last Name", align: "left" },
  { key: "gender", label: "Gender", align: "left", className: "w-28" },
  { key: "jobGrade", label: "Job Grade", align: "center", className: "w-32" },
  {
    key: "serviceYears",
    label: "Service Years",
    align: "center",
    className: "w-28",
  },
  {
    key: "maritalStatus",
    label: "Marital Status",
    align: "left",
    className: "w-32",
  },
  {
    key: "disabilityStatus",
    label: "Disability",
    align: "center",
    className: "w-48",
  },
];

const SORTABLE_COLUMNS: Record<string, EmployeeSortField> = {
  employeeNumber: "employeeNumber",
  firstname: "firstname",
  lastname: "lastname",
  jobGrade: "jobGrade",
};

export default function EmployeesTable({
  counts,
  canCreate = true,
  canExport = true,
  canImport = true,
  canDelete = true,
  canEdit = true,
  canRestore = true,
  initialCreateOpen = false,
  initialEditEmployee = null,
}: EmployeesTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [query, setQuery] = useState<EmployeeQueryState>(
    DEFAULT_EMPLOYEE_QUERY,
  );
  const [rows, setRows] = useState<EmployeeDto[]>([]);
  const [meta, setMeta] = useState<Omit<EmployeeListResponse, "data">>({
    total: counts.total,
    page: 1,
    pageSize: DEFAULT_EMPLOYEE_QUERY.pageSize,
    totalPages: 1,
    unmaskedNationalIds: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Row selection for bulk actions
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Centered dialogs
  const [editingEmployee, setEditingEmployee] = useState<EmployeeDto | null>(
    initialEditEmployee ?? null,
  );
  const [isFormOpen, setIsFormOpen] = useState(
    Boolean(initialCreateOpen || initialEditEmployee),
  );

  const [isViewOpen, setIsViewOpen] = useState(false);
  const [viewingEmployee, setViewingEmployee] = useState<EmployeeDto | null>(
    null,
  );

  const [isImportOpen, setIsImportOpen] = useState(false);

  // Destructive Confirmation Dialog state
  const [archiveTarget, setArchiveTarget] = useState<EmployeeDto | null>(null);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);

  const [isBulkArchiveDialogOpen, setIsBulkArchiveDialogOpen] = useState(false);
  const [isBulkArchiving, setIsBulkArchiving] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // Debounced search
  const [searchDraft, setSearchDraft] = useState("");
  const requestId = useRef(0);

  const fetchPage = useCallback(async (state: EmployeeQueryState) => {
    const id = ++requestId.current;
    setIsLoading(true);
    setLoadError(null);

    try {
      const params = toSearchParams(state);
      const res = await fetch(`/api/employees?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Failed to load employees.");
      }
      const body: EmployeeListResponse = await res.json();

      if (id !== requestId.current) return;

      setRows(body.data);
      setMeta({
        total: body.total,
        page: body.page,
        pageSize: body.pageSize,
        totalPages: body.totalPages,
        unmaskedNationalIds: body.unmaskedNationalIds,
      });
    } catch (error) {
      if (id !== requestId.current) return;
      setLoadError(
        error instanceof Error ? error.message : "Failed to load employees.",
      );
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  }, []);

  // Search submit is explicit (Search button / Enter), so results only change
  // when the user confirms the term.

  // Fetch when query changes. The fetch is started on a microtask so the
  // loading/error flags update outside the commit phase instead of cascading a
  // synchronous re-render from inside the effect body.
  useEffect(() => {
    void Promise.resolve().then(() => fetchPage(query));
  }, [query, fetchPage]);

  // Prune selected keys to the visible rows. Selection never spans pages, so it
  // is derived during render rather than mirrored into state by an effect.
  const [lastRows, setLastRows] = useState<EmployeeDto[]>(rows);
  if (lastRows !== rows) {
    setLastRows(rows);
    const visible = new Set(rows.map((r) => r.id));
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }

  const applyFilter = useCallback(
    <K extends keyof EmployeeQueryState>(
      key: K,
      value: EmployeeQueryState[K],
    ) => {
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

  // The Search button and the Enter key both apply the typed term and reset to
  // the first page.
  const submitSearch = useCallback(() => {
    applyFilter("search", searchDraft);
  }, [applyFilter, searchDraft]);

  // Clearing the box also clears the applied term so results reset immediately.
  const clearSearch = useCallback(() => {
    setSearchDraft("");
    setQuery((prev) =>
      prev.search === "" ? prev : { ...prev, search: "", page: 1 },
    );
  }, []);

  const toggleSort = useCallback((field: EmployeeSortField) => {
    setQuery((prev) => ({
      ...prev,
      sortBy: field,
      sortOrder:
        prev.sortBy === field && prev.sortOrder === "asc" ? "desc" : "asc",
      page: 1,
    }));
  }, []);

  const sortIcon = useCallback(
    (field: EmployeeSortField) => {
      if (query.sortBy !== field) {
        return (
          <ArrowUpDown className="ml-1 inline-block h-3.5 w-3.5 opacity-40" />
        );
      }
      return query.sortOrder === "asc" ? (
        <ArrowUp className="text-primary ml-1 inline-block h-3.5 w-3.5" />
      ) : (
        <ArrowDown className="text-primary ml-1 inline-block h-3.5 w-3.5" />
      );
    },
    [query.sortBy, query.sortOrder],
  );

  const clearFilters = useCallback(() => {
    setSearchDraft("");
    setQuery({ ...DEFAULT_EMPLOYEE_QUERY, pageSize: query.pageSize });
  }, [query.pageSize]);

  const hasActiveFilters =
    query.departmentId !== ALL ||
    query.gender !== ALL ||
    query.maritalStatus !== ALL ||
    query.disability !== ALL ||
    query.jobGradeFrom !== "" ||
    query.jobGradeTo !== "" ||
    query.search.trim() !== "" ||
    query.onlyDeleted;

  const refresh = useCallback(() => {
    void fetchPage(query);
    startTransition(() => router.refresh());
  }, [fetchPage, query, router]);

  const exportRegister = useCallback(
    (format: "csv" | "xlsx") => {
      const params = toSearchParams(query);
      params.set("format", format);
      window.location.href = `/api/employees/export?${params.toString()}`;
    },
    [query],
  );

  const openCreateForm = useCallback(() => {
    setEditingEmployee(null);
    setIsFormOpen(true);
  }, []);

  const openEditForm = useCallback((emp: EmployeeDto) => {
    setEditingEmployee(emp);
    setIsFormOpen(true);
  }, []);

  const openViewProfile = useCallback((emp: EmployeeDto) => {
    setViewingEmployee(emp);
    setIsViewOpen(true);
  }, []);

  // Single Archive confirm handler
  const handleArchiveConfirm = useCallback(async () => {
    if (!archiveTarget) return;
    try {
      const res = await fetch(`/api/employees/${archiveTarget.id}`, {
        method: "DELETE",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error ?? "Failed to archive employee.");
      }

      notify.success({
        title: "Employee archived",
        description: `${fullName(archiveTarget)} (${archiveTarget.employeeNumber}) moved to archive.`,
      });
      setIsArchiveDialogOpen(false);
      setArchiveTarget(null);
      refresh();
    } catch (err) {
      notify.error({
        title: "Could not archive employee",
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }, [archiveTarget, refresh]);

  // Bulk Archive execute handler
  const handleBulkArchiveConfirm = useCallback(async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setIsBulkArchiving(true);
    try {
      const res = await fetch("/api/employees/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "delete",
          rows: ids.map((id) => ({ id, values: {} })),
        }),
      });
      const body: BulkResponse = await res.json();
      if (!res.ok && res.status !== 207) {
        throw new Error(body?.error ?? "Bulk archive failed.");
      }

      if (body.succeeded) {
        notify.success(`Archived ${body.succeeded} employee(s).`);
      }
      if (body.failed?.length) {
        notify.warning({
          title: `${body.failed.length} row(s) could not be archived.`,
          description: body.failed
            .slice(0, 3)
            .map((f) => f.message)
            .join(" · "),
        });
      }
      setSelected(new Set());
      setIsBulkArchiveDialogOpen(false);
      refresh();
    } catch (error) {
      notify.error({
        title: "Bulk archive failed",
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsBulkArchiving(false);
    }
  }, [selected, refresh]);

  // Bulk restore
  const handleBulkRestore = useCallback(async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setIsRestoring(true);
    try {
      const res = await fetch("/api/employees/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "restore",
          rows: ids.map((id) => ({ id, values: {} })),
        }),
      });
      const body: BulkResponse = await res.json();
      if (!res.ok && res.status !== 207) {
        throw new Error(body?.error ?? "Bulk restore failed.");
      }
      if (body.succeeded) {
        notify.success(`Restored ${body.succeeded} employee(s).`);
      }
      if (body.failed?.length) {
        notify.warning({
          title: `${body.failed.length} row(s) could not be restored.`,
          description: body.failed
            .slice(0, 3)
            .map((f) => f.message)
            .join(" · "),
        });
      }
      setSelected(new Set());
      refresh();
    } catch (error) {
      notify.error({
        title: "Bulk restore failed",
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsRestoring(false);
    }
  }, [selected, refresh]);

  // Restore archived employee
  const handleRestore = useCallback(
    async (id: string) => {
      setIsRestoring(true);
      try {
        const res = await fetch(`/api/employees/${id}`, { method: "PATCH" });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? "Failed to restore employee.");
        }
        notify.success("Employee restored");
        refresh();
      } catch (err) {
        notify.error({
          title: "Restore failed",
          description: err instanceof Error ? err.message : undefined,
        });
      } finally {
        setIsRestoring(false);
      }
    },
    [refresh],
  );

  // Selection is offered on live rows when the user may archive them, and on
  // archived rows when the user may restore them.
  const canSelectRows =
    (canDelete && !query.onlyDeleted) || (canRestore && query.onlyDeleted);

  const toggleRowSelection = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allPageRowsSelected =
    rows.length > 0 && rows.every((row) => selected.has(row.id));

  const toggleSelectAllOnPage = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (rows.every((row) => next.has(row.id))) {
        rows.forEach((row) => next.delete(row.id));
      } else {
        rows.forEach((row) => next.add(row.id));
      }
      return next;
    });
  }, [rows]);

  // Cell renderer enforcing the exact 8 columns in order
  const renderCell = useCallback(
    (item: EmployeeDto, key: string) => {
      switch (key) {
        // 1. Emp ID — carries the selection checkbox and the row actions, so
        // the table itself stays at exactly eight columns.
        case "employeeNumber":
          return (
            <div className="flex items-center gap-2">
              {canSelectRows ? (
                <Checkbox
                  checked={selected.has(item.id)}
                  onCheckedChange={() => toggleRowSelection(item.id)}
                  aria-label={`Select ${fullName(item)}`}
                />
              ) : null}

              <button
                type="button"
                onClick={() => openViewProfile(item)}
                className="group flex items-center gap-2.5 text-left transition-opacity hover:opacity-80"
              >
                <div className="bg-primary/10 border-primary/20 text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">
                  {initials(item)}
                </div>
                <span className="bg-muted/30 border-border/50 group-hover:text-primary rounded border px-2 py-0.5 font-mono text-xs font-medium group-hover:underline">
                  {item.employeeNumber}
                </span>
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-muted-foreground hover:text-foreground h-7 w-7"
                    aria-label={`Options for ${fullName(item)}`}
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onClick={() => openViewProfile(item)}>
                    <Users className="mr-2 h-4 w-4" />
                    View Details
                  </DropdownMenuItem>

                  {canEdit ? (
                    <DropdownMenuItem onClick={() => openEditForm(item)}>
                      <EditIcon className="mr-2 h-4 w-4" />
                      Edit Record
                    </DropdownMenuItem>
                  ) : null}

                  {query.onlyDeleted && canRestore ? (
                    <DropdownMenuItem
                      onClick={() => void handleRestore(item.id)}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Restore
                    </DropdownMenuItem>
                  ) : canDelete && !query.onlyDeleted ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive cursor-pointer"
                        onClick={() => {
                          setArchiveTarget(item);
                          setIsArchiveDialogOpen(true);
                        }}
                      >
                        <DeleteIcon className="mr-2 h-4 w-4" />
                        Archive
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );

        // 2. First Name
        case "firstname":
          return <span className="text-sm font-medium">{item.firstname}</span>;

        // 3. Last Name
        case "lastname":
          return <span className="text-sm font-medium">{item.lastname}</span>;

        // 4. Gender
        case "gender":
          return (
            <span className="text-sm">
              {labelOrDash(GENDER_LABELS, item.gender)}
            </span>
          );

        // 5. Job Grade — a missing grade is called out, because house
        // eligibility and the House Queue ranking are both derived from it.
        case "jobGrade":
          return item.jobGrade != null ? (
            <Badge
              variant="secondary"
              className="font-mono text-xs font-semibold"
            >
              Grade {item.jobGrade}
            </Badge>
          ) : (
            <Badge
              variant="warning"
              className="gap-1 text-xs"
              title={MISSING_JOB_GRADE_NOTICE}
            >
              <TriangleAlert className="h-3 w-3" />
              {MISSING_JOB_GRADE_LABEL}
            </Badge>
          );

        // 6. Service Years
        case "serviceYears":
          return item.serviceYears != null ? (
            <span className="font-mono text-xs font-semibold tabular-nums">
              {item.serviceYears} yr{item.serviceYears !== 1 ? "s" : ""}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          );

        // 7. Marital Status
        case "maritalStatus":
          return (
            <span className="text-sm">
              {labelOrDash(MARITAL_STATUS_LABELS, item.maritalStatus)}
            </span>
          );

        // 8. Disability — one of two labels, plus the MCDA priority score when
        // the record states a disability.
        case "disabilityStatus":
          return hasDisabilityRecord(item.disabilityStatus) ? (
            <div className="flex flex-col items-center gap-1">
              <Badge className="border-amber-500/30 bg-amber-500/20 text-xs text-amber-500">
                {disabilityDisplayLabel(item.disabilityStatus)}
              </Badge>
              {item.mcdaScore != null ? (
                <span
                  className="text-muted-foreground font-mono text-[10px] tabular-nums"
                  title={
                    item.mcdaRank != null && item.mcdaCohortSize != null
                      ? `MCDA priority score ${item.mcdaScore.toFixed(3)} — rank ${item.mcdaRank} of ${item.mcdaCohortSize} in this job-grade band`
                      : `MCDA priority score ${item.mcdaScore.toFixed(3)}`
                  }
                >
                  MCDA {item.mcdaScore.toFixed(3)}
                  {item.mcdaRank != null && item.mcdaCohortSize != null
                    ? ` · #${item.mcdaRank}/${item.mcdaCohortSize}`
                    : ""}
                </span>
              ) : null}
            </div>
          ) : (
            <span className="text-muted-foreground text-xs font-medium">
              {disabilityDisplayLabel(item.disabilityStatus)}
            </span>
          );

        default:
          return null;
      }
    },
    [
      openViewProfile,
      openEditForm,
      canEdit,
      canDelete,
      canRestore,
      canSelectRows,
      selected,
      toggleRowSelection,
      query.onlyDeleted,
      handleRestore,
    ],
  );

  // Attach header click sort handlers
  const columns = useMemo(
    () =>
      REQUIRED_COLUMNS.map((column) => {
        const sortField = SORTABLE_COLUMNS[column.key];
        if (!sortField) return column;
        return {
          ...column,
          icon: sortIcon(sortField),
          onHeaderClick: () => toggleSort(sortField),
        };
      }),
    [sortIcon, toggleSort],
  );

  const totalPages = Math.max(1, meta.totalPages);
  const showingFrom =
    meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
  const showingTo = Math.min(meta.page * meta.pageSize, meta.total);
  const missingJobGradeCount = rows.filter(
    (row) => row.jobGrade == null && !row.deletedAt,
  ).length;

  return (
    <div className="w-full space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-foreground flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Users className="text-primary h-7 w-7" />
            Employee Register: ሠራተኞች
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Maintain staff records, department assignments, and housing
            eligibility attributes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={isLoading}
          >
            <RefreshCw
              className={`mr-1.5 h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          {canCreate ? (
            <Button size="sm" onClick={openCreateForm}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add Employee
            </Button>
          ) : null}
        </div>
      </div>

      {/* ─── Metric Stat Cards ─── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <div className="bg-card rounded-xl border p-4 shadow-sm transition-shadow hover:shadow-md">
          <div className="flex items-start justify-between gap-3">
            <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
              Total Employees
            </span>
            <span className="bg-primary/10 text-primary ring-primary/15 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1">
              <Users className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold tabular-nums">
            {counts.total}
          </div>
          <p className="text-muted-foreground mt-1 text-[11px]">
            Live records in register
          </p>
        </div>

        <div className="bg-card rounded-xl border p-4 shadow-sm transition-shadow hover:shadow-md">
          <div className="flex items-start justify-between gap-3">
            <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
              Active
            </span>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
              <UserCheck className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
            {counts.active}
          </div>
          <p className="text-muted-foreground mt-1 text-[11px]">
            Currently employed
          </p>
        </div>

        <div className="bg-card rounded-xl border p-4 shadow-sm transition-shadow hover:shadow-md">
          <div className="flex items-start justify-between gap-3">
            <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
              On Leave
            </span>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400">
              <CalendarClock className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-600 tabular-nums dark:text-amber-400">
            {counts.onLeave}
          </div>
          <p className="text-muted-foreground mt-1 text-[11px]">
            Temporarily off duty
          </p>
        </div>

        <div className="bg-card rounded-xl border p-4 shadow-sm transition-shadow hover:shadow-md">
          <div className="flex items-start justify-between gap-3">
            <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
              Terminated / Retired
            </span>
            <span className="bg-destructive/10 text-destructive ring-destructive/20 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1">
              <UserX className="h-4 w-4" />
            </span>
          </div>
          <div className="text-destructive mt-2 text-2xl font-bold tabular-nums">
            {counts.terminated + counts.retired}
          </div>
          <p className="text-muted-foreground mt-1 text-[11px]">
            No longer in service
          </p>
        </div>

        <div className="bg-card rounded-xl border p-4 shadow-sm transition-shadow hover:shadow-md">
          <div className="flex items-start justify-between gap-3">
            <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
              Archived
            </span>
            <span className="bg-muted text-muted-foreground ring-border flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1">
              <Archive className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold tabular-nums">
            {counts.archived}
          </div>
          <p className="text-muted-foreground mt-1 text-[11px]">
            Soft-deleted, restorable
          </p>
        </div>
      </div>

      {/* ─── Prominent search ─── */}
      <div className="border-border/60 bg-card rounded-xl border p-3 shadow-sm sm:p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2" />
            <Input
              className="h-12 pr-10 pl-12 text-base"
              placeholder="Search by employee ID or name…"
              autoFocus
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitSearch();
                }
              }}
              aria-label="Search employees by ID or name"
            />
            {searchDraft ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={clearSearch}
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2 rounded-md p-1 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <Button
            size="default"
            className="h-12 shrink-0 px-6"
            onClick={submitSearch}
            disabled={isLoading}
          >
            Search
          </Button>
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          Matches the employee number, first name or last name. Press Enter or
          click Search.
        </p>
      </div>

      {/* Filter controls + row actions */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        {/* Gender Filter */}
        <Select
          value={query.gender}
          onValueChange={(v) => applyFilter("gender", v)}
        >
          <SelectTrigger
            className="w-full sm:w-40"
            aria-label="Filter by gender"
          >
            <SelectValue placeholder="Gender" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any gender</SelectItem>
            {GENDER_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Marital Status Filter */}
        <Select
          value={query.maritalStatus}
          onValueChange={(v) => applyFilter("maritalStatus", v)}
        >
          <SelectTrigger
            className="w-full sm:w-48"
            aria-label="Filter by marital status"
          >
            <SelectValue placeholder="Marital status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any marital status</SelectItem>
            {MARITAL_STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Disability Filter */}
        <Select
          value={query.disability}
          onValueChange={(v) => applyFilter("disability", v)}
        >
          <SelectTrigger
            className="w-full sm:w-44"
            aria-label="Filter by disability status"
          >
            <SelectValue placeholder="Disability: Any" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Disability: All</SelectItem>
            <SelectItem value="recorded">Disability recorded</SelectItem>
            <SelectItem value="none">No disability recorded</SelectItem>
          </SelectContent>
        </Select>

        {/* Job Grade Range Filter */}
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            min={1}
            max={50}
            placeholder="Min Grade"
            value={query.jobGradeFrom}
            onChange={(e) => applyFilter("jobGradeFrom", e.target.value)}
            className="w-24 font-mono"
            aria-label="Minimum job grade"
          />
          <span className="text-muted-foreground text-sm">–</span>
          <Input
            type="number"
            min={1}
            max={50}
            placeholder="Max Grade"
            value={query.jobGradeTo}
            onChange={(e) => applyFilter("jobGradeTo", e.target.value)}
            className="w-24 font-mono"
            aria-label="Maximum job grade"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={query.onlyDeleted ? "default" : "outline"}
            size="sm"
            onClick={() => applyFilter("onlyDeleted", !query.onlyDeleted)}
          >
            {query.onlyDeleted ? "Viewing archived" : "View archived"}
          </Button>
          {hasActiveFilters ? (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="mr-1 h-3 w-3" />
              Clear
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          {canImport || canExport ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Import and export options"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {canImport ? (
                  <DropdownMenuItem onClick={() => setIsImportOpen(true)}>
                    <Upload className="mr-2 h-4 w-4" />
                    Import employees
                  </DropdownMenuItem>
                ) : null}

                {canExport ? (
                  <>
                    {canImport ? <DropdownMenuSeparator /> : null}
                    <DropdownMenuItem onClick={() => exportRegister("xlsx")}>
                      <Download className="mr-2 h-4 w-4" />
                      Export as Excel (.xlsx)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => exportRegister("csv")}>
                      <Download className="mr-2 h-4 w-4" />
                      Export as CSV
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      {/* Status bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-muted-foreground text-sm">
          {isLoading ? (
            "Updating employee records..."
          ) : (
            <>
              Showing{" "}
              <strong className="text-foreground">
                {showingFrom}–{showingTo}
              </strong>{" "}
              of <strong className="text-foreground">{meta.total}</strong>{" "}
              records
            </>
          )}
        </span>

        <div className="flex items-center gap-2">
          {canSelectRows && rows.length > 0 ? (
            <label className="text-muted-foreground flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={allPageRowsSelected}
                onCheckedChange={toggleSelectAllOnPage}
                aria-label="Select every employee on this page"
              />
              Select page
            </label>
          ) : null}
          <span className="text-muted-foreground text-sm">Rows per page:</span>
          <Select
            value={String(query.pageSize)}
            onValueChange={(v) => applyFilter("pageSize", Number(v))}
          >
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Job grade data-quality recommendation */}
      {missingJobGradeCount > 0 ? (
        <div
          role="status"
          className="border-warning/40 bg-warning/10 text-warning-foreground flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm"
        >
          <span className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong className="font-semibold">
                {missingJobGradeCount} employee
                {missingJobGradeCount === 1 ? "" : "s"} on this page
                {missingJobGradeCount === 1 ? " has" : " have"} no job grade.
              </strong>{" "}
              {MISSING_JOB_GRADE_NOTICE}
            </span>
          </span>
          {canEdit ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const target = rows.find((row) => row.jobGrade == null);
                if (target) openEditForm(target);
              }}
            >
              <EditIcon className="mr-1.5 h-3.5 w-3.5" />
              Add job grade
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Error alert with retry button */}
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

      {/* Bulk action banner */}
      {selected.size > 0 && canDelete && !query.onlyDeleted ? (
        <div className="bg-primary/10 border-primary/20 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-2 text-sm">
          <div className="flex items-center gap-2">
            <UserCheck className="text-primary h-4 w-4" />
            <span className="text-foreground font-semibold">
              {selected.size} employee{selected.size === 1 ? "" : "s"} selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
            >
              Clear selection
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setIsBulkArchiveDialogOpen(true)}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Archive Selected
            </Button>
          </div>
        </div>
      ) : null}

      {/* Bulk restore banner for archived view */}
      {selected.size > 0 && canRestore && query.onlyDeleted ? (
        <div className="bg-primary/10 border-primary/20 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-2 text-sm">
          <div className="flex items-center gap-2">
            <UserCheck className="text-primary h-4 w-4" />
            <span className="text-foreground font-semibold">
              {selected.size} archived employee{selected.size === 1 ? "" : "s"}{" "}
              selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
            >
              Clear selection
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleBulkRestore()}
              disabled={isRestoring}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Restore Selected
            </Button>
          </div>
        </div>
      ) : null}

      {/* Responsive Data Table */}
      {isLoading ? (
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
          emptyMessage="No employees found"
          emptyDescription={
            hasActiveFilters
              ? "No records matched your filter criteria. Try clearing or relaxing filters."
              : "No employee records exist yet. Click 'Add Employee' to register the first."
          }
          stickyHeader
          mobileCardView
        />
      )}

      {/* Pagination controls */}
      <div className="flex items-center justify-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setQuery((p) => ({ ...p, page: Math.max(1, p.page - 1) }))
          }
          disabled={meta.page <= 1 || isLoading || isPending}
        >
          Previous
        </Button>
        <span className="text-muted-foreground text-sm">
          Page <strong className="text-foreground">{meta.page}</strong> of{" "}
          <strong className="text-foreground">{totalPages}</strong>
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setQuery((p) => ({ ...p, page: Math.min(totalPages, p.page + 1) }))
          }
          disabled={meta.page >= totalPages || isLoading || isPending}
        >
          Next
        </Button>
      </div>

      {/* Single Employee Archive Confirmation Dialog */}
      <Dialog open={isArchiveDialogOpen} onOpenChange={setIsArchiveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Archive Employee Record
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-2 text-sm">
              <p>
                Are you sure you want to archive{" "}
                <strong className="text-foreground">
                  {archiveTarget ? fullName(archiveTarget) : "this employee"}
                </strong>{" "}
                (
                <span className="font-mono">
                  {archiveTarget?.employeeNumber}
                </span>
                )?
              </p>
              <p className="text-muted-foreground text-xs">
                Soft delete preserves all historical house queue allocations,
                damage checklists, and audit trails. The employee will be
                excluded from live queue rankings but can be restored at any
                time under <strong>View archived</strong>.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsArchiveDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void handleArchiveConfirm()}
            >
              Confirm Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Archive Confirmation Dialog */}
      <Dialog
        open={isBulkArchiveDialogOpen}
        onOpenChange={setIsBulkArchiveDialogOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Bulk Archive Confirmation
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-2 text-sm">
              <p>
                You are about to archive <strong>{selected.size}</strong>{" "}
                selected employee record(s).
              </p>
              <p className="text-muted-foreground text-xs">
                This is a reversible soft-delete. Allocations and audit logs
                remain intact. Employees with active direct reports must have
                their reports reassigned first.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              disabled={isBulkArchiving}
              onClick={() => setIsBulkArchiveDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={isBulkArchiving}
              onClick={() => void handleBulkArchiveConfirm()}
            >
              {isBulkArchiving
                ? "Archiving..."
                : `Archive ${selected.size} Records`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Centered Add/Edit dialog with inline validation */}
      <EmployeeFormModal
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        employee={editingEmployee}
        onSuccess={refresh}
      />

      {/* Centered read-only profile dialog */}
      <EmployeeDetailModal
        open={isViewOpen}
        onOpenChange={setIsViewOpen}
        employee={viewingEmployee}
        canEdit={canEdit}
        canDelete={canDelete}
        canRestore={canRestore}
        onEdit={(emp) => {
          setIsViewOpen(false);
          openEditForm(emp);
        }}
        onArchive={(emp) => {
          setIsViewOpen(false);
          setArchiveTarget(emp);
          setIsArchiveDialogOpen(true);
        }}
        onRestore={(emp) => {
          setIsViewOpen(false);
          void handleRestore(emp.id);
        }}
      />

      {/* Bulk Import Dialog */}
      <EmployeeImportDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        onImported={refresh}
      />
    </div>
  );
}
