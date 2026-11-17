"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ResponsiveTable, type Column } from "@/components/ui/responsive-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Home,
  Users,
  ArrowRight,
  Search,
  RefreshCw,
  MapPin,
  MoreVertical,
  FileSpreadsheet,
  FileText,
  Loader2,
  X,
  Upload,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { notify } from "@/lib/feedback/notify";
import {
  exportBrandedTable,
  type BrandedTableColumn,
  type BrandedTableFormat,
} from "@/lib/house-admin/export";
import { formatDate, fullName } from "@/ui/household/house-format";
import {
  HouseCategoryBadge,
  QueueStatusBadge,
} from "@/ui/household/house-status";
import type { AllocatedHouseView } from "@/lib/house-queue/views";
import type { HouseQueueCapabilities } from "../house-queue/HouseQueueClient";
import HouseholdImportWizard from "@/app/import/ui/HouseholdImportWizard";

interface AllocatedHousesClientProps {
  initialData: AllocatedHouseView[];
  capabilities: HouseQueueCapabilities;
}

const columns: Column[] = [
  { key: "srNo", label: "#", hideable: false, align: "right" },
  { key: "house", label: "House", hideable: false },
  { key: "category", label: "Category", align: "center" },
  { key: "location", label: "Location" },
  { key: "occupant", label: "Occupant", hideable: false },
  { key: "grade", label: "Grade", align: "center" },
  { key: "priority", label: "Priority", align: "center" },
  { key: "allocatedOn", label: "Allocated On" },
  { key: "status", label: "Status", align: "center" },
  { key: "actions", label: "", hideable: false },
];

const EXPORT_COLUMNS: BrandedTableColumn<AllocatedHouseView>[] = [
  { header: "#", align: "right", width: 0.4, value: (_r, i) => String(i + 1) },
  {
    header: "House No.",
    width: 1.2,
    value: (r) => r.house?.houseNumber ?? "—",
  },
  { header: "HID", width: 1.3, value: (r) => r.house?.hid ?? "—" },
  {
    header: "Category",
    align: "center",
    width: 0.9,
    value: (r) => r.house?.houseType ?? "—",
  },
  {
    header: "Location",
    width: 1.4,
    value: (r) => r.house?.locationName ?? "—",
  },
  {
    header: "Occupant",
    width: 1.9,
    value: (r) => (r.employee ? fullName(r.employee) : "No employee data"),
  },
  {
    header: "Emp ID",
    width: 1.2,
    value: (r) => r.employee?.employeeNumber ?? "—",
  },
  {
    header: "Grade",
    align: "center",
    width: 0.7,
    value: (r) =>
      r.employee?.jobGrade != null ? String(r.employee.jobGrade) : "—",
  },
  {
    header: "Priority",
    align: "center",
    width: 0.8,
    value: (r) => (r.priorityRank != null ? `#${r.priorityRank}` : "—"),
  },
  {
    header: "Allocated On",
    width: 1.2,
    value: (r) => formatDate(r.decidedAt),
  },
  {
    header: "Occupancy",
    align: "center",
    width: 1.0,
    value: (r) => r.house?.occupancyStatus ?? "—",
  },
  {
    header: "Status",
    align: "center",
    width: 1.2,
    value: (r) => (r.awaitingHandback ? "Release pending" : "Allocated"),
  },
];

export default function AllocatedHousesClient({
  initialData,
  capabilities,
}: AllocatedHousesClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const submitSearch = () => setSearch(searchDraft.trim());
  const clearSearch = () => {
    setSearchDraft("");
    setSearch("");
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return initialData;
    return initialData.filter((row) => {
      const haystack = [
        row.house?.houseNumber,
        row.house?.hid,
        row.house?.locationName,
        row.employee?.firstname,
        row.employee?.lastname,
        row.employee?.employeeNumber,
        row.employee?.department?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [initialData, search]);

  const refresh = async () => {
    setRefreshing(true);
    router.refresh();
    setRefreshing(false);
  };

  const handleExport = useCallback(
    async (format: BrandedTableFormat) => {
      if (filtered.length === 0) {
        notify.error("Nothing to export — no rows match the current view.");
        return;
      }
      setExporting(true);
      try {
        await exportBrandedTable({
          title: "Allocated Houses",
          subtitle: "House Hold · Allocated Houses",
          summary: `${filtered.length} record${filtered.length === 1 ? "" : "s"} · ${
            filtered.filter((r) => r.awaitingHandback).length
          } awaiting handback · generated ${new Date().toLocaleString()}`,
          accentHex: "#22c55e",
          columns: EXPORT_COLUMNS,
          rows: filtered,
          format,
          fileStem: "allocated-houses",
          footerLabel: "allocated houses report",
        });
        notify.success(
          `Allocated houses exported as ${format === "excel" ? "Excel" : "PDF"}`,
        );
      } catch {
        notify.error("Failed to export allocated houses. Please try again.");
      } finally {
        setExporting(false);
      }
    },
    [filtered],
  );

  const renderCell = (item: AllocatedHouseView, key: string) => {
    switch (key) {
      case "srNo":
        return (
          <span className="text-muted-foreground tabular-nums">
            {filtered.indexOf(item) + 1}
          </span>
        );
      case "house":
        return (
          <div>
            <div className="font-semibold">
              {item.house?.houseNumber ?? "—"}
            </div>
            <div className="text-muted-foreground text-xs">
              {item.house?.hid ?? "—"}
            </div>
          </div>
        );
      case "category":
        return <HouseCategoryBadge category={item.house?.houseType ?? null} />;
      case "location":
        return (
          <div className="flex items-center gap-1 text-sm">
            <MapPin className="text-muted-foreground h-3.5 w-3.5" />
            <span>{item.house?.locationName ?? "—"}</span>
          </div>
        );
      case "occupant":
        if (!item.employee) {
          return (
            <div className="text-muted-foreground text-sm italic">
              No employee data
            </div>
          );
        }
        return (
          <div className="flex items-center gap-2.5">
            <div className="bg-primary/10 text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold">
              {item.employee.firstname?.charAt(0)?.toUpperCase() ?? "?"}
            </div>
            <div>
              <div className="font-semibold">{fullName(item.employee)}</div>
              <div className="text-muted-foreground text-xs">
                {item.employee.employeeNumber}
              </div>
            </div>
          </div>
        );
      case "grade":
        return item.employee?.jobGrade != null ? (
          <span className="font-semibold tabular-nums">
            {item.employee.jobGrade}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      case "department":
        return (
          <span className="text-sm">
            {item.employee?.department?.name ?? "—"}
          </span>
        );
      case "priority":
        return (
          <span className="text-sm tabular-nums">
            {item.priorityRank != null ? (
              <Badge variant="secondary" className="tabular-nums">
                #{item.priorityRank}
              </Badge>
            ) : (
              "—"
            )}
          </span>
        );
      case "allocatedOn":
        return (
          <span className="text-muted-foreground text-sm whitespace-nowrap">
            {formatDate(item.decidedAt)}
          </span>
        );
      case "status":
        return (
          <div className="flex flex-col items-center gap-1">
            <QueueStatusBadge
              status={item.awaitingHandback ? "RELEASE_PENDING" : "allocated"}
            />
            <span className="text-muted-foreground text-[10px]">
              Occupancy: {item.house?.occupancyStatus ?? "—"}
            </span>
            {item.awaitingHandback && (
              <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300">
                Awaiting handback inspection
              </span>
            )}
          </div>
        );
      case "actions":
        return (
          <div className="flex items-center justify-end gap-1">
            <Button asChild variant="ghost" size="sm" className="h-8 gap-1">
              <Link href={`/houses/allocated/${item.allocationId}`}>
                <ArrowRight className="h-3.5 w-3.5" />
                Open
              </Link>
            </Button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Allocated Houses: የተመደቡ ቤቶች
          </h1>
          <div className="from-brass-400 mt-1 h-0.5 w-16 rounded bg-gradient-to-r to-transparent" />
          <p className="text-muted-foreground mt-2 text-sm">
            Live allocation records — every row is a decision made once by the
            House Queue and instantly visible here.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()}>
          <RefreshCw
            className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"}
          />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-3">
        <div className="bg-card rounded-xl border p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">
              Live allocations
            </span>
            <Home className="h-4 w-4 text-blue-600" />
          </div>
          <div className="mt-2 text-2xl font-bold">
            {(initialData ?? []).length}
          </div>
        </div>
        <div className="bg-card rounded-xl border p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">
              Houses occupied
            </span>
            <Home className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold">
            {
              (initialData ?? []).filter(
                (r) => r?.house?.occupancyStatus === "Occupied",
              ).length
            }
          </div>
        </div>
        <div className="bg-card rounded-xl border p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">
              Occupants
            </span>
            <Users className="h-4 w-4 text-purple-500" />
          </div>
          <div className="mt-2 text-2xl font-bold">
            {
              new Set(
                (initialData ?? [])
                  .map((r) => r?.employee?.id)
                  .filter((id): id is string => Boolean(id)),
              ).size
            }
          </div>
        </div>
      </div>

      <div className="bg-card flex items-center gap-3 overflow-x-auto rounded-xl border p-3 shadow-sm">
        <div className="flex shrink-0 items-center gap-2">
          <div className="relative w-64 sm:w-80">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitSearch();
                }
              }}
              placeholder="Search house, occupant…"
              className="h-9 pr-9 pl-9 text-xs"
              aria-label="Search allocated houses"
              autoFocus
            />
            {searchDraft ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={clearSearch}
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-0.5 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          <Button
            size="sm"
            className="h-9 shrink-0 px-4"
            onClick={submitSearch}
          >
            Search
          </Button>
        </div>

        <div className="bg-border h-6 w-px shrink-0" aria-hidden />

        <div className="flex flex-nowrap items-center gap-2">
          {search && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSearch}
              className="text-muted-foreground hover:text-foreground h-9 shrink-0 text-xs"
            >
              Clear
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                disabled={exporting}
                aria-label="More options"
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MoreVertical className="h-4 w-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" />
                Import house records
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Export</DropdownMenuLabel>
              <DropdownMenuItem
                disabled={exporting}
                onClick={() => void handleExport("excel")}
              >
                <FileSpreadsheet className="h-4 w-4" />
                Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={exporting}
                onClick={() => void handleExport("pdf")}
              >
                <FileText className="h-4 w-4" />
                PDF (.pdf)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ResponsiveTable
        columns={columns}
        data={filtered}
        renderCell={renderCell}
        keyExtractor={(row) => row.allocationId}
        minWidth="1150px"
        emptyMessage={
          search ? "No matching allocations" : "No live allocations"
        }
        emptyDescription={
          search
            ? "Adjust your search terms."
            : "Approve a house in the House Queue to see it here."
        }
      />

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import House Records</DialogTitle>
            <DialogDescription>
              Import or update house register records using the existing import
              workflow. Allocation status is managed by the House Queue.
            </DialogDescription>
          </DialogHeader>
          <HouseholdImportWizard
            onComplete={() => {
              setImportOpen(false);
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
