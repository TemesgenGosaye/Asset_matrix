"use client";

import React, { useMemo, useState, useCallback } from "react";
import { ResponsiveTable } from "@/components/ui/responsive-table";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Warehouse,
  Plus,
  Search,
  RefreshCw,
  MoreVertical,
  Edit2,
  Trash2,
  Wrench,
  PackageCheck,
  PackageX,
  MapPin,
  CalendarClock,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import GeneralAssetFormModal from "./GeneralAssetFormModal";
import {
  GENERAL_ASSET_CONDITION_META,
  GENERAL_ASSET_CONDITIONS,
  GENERAL_ASSET_ITEM_TYPES,
} from "@/lib/general-asset-presets";

interface LocationItem {
  locationid: string;
  locationname: string | null;
}

export interface GeneralAssetItem {
  id: string;
  srNo: number;
  itemType: string;
  pid: string;
  category: string;
  locationId?: string | null;
  locationName?: string | null;
  location?: LocationItem | null;
  condition: string;
  brand?: string | null;
  reviewsDate?: string | null;
  remark?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SummaryStats {
  total: number;
  underMaintenance: number;
  newItems: number;
  disposed: number;
}

interface GeneralAssetClientProps {
  initialItems: GeneralAssetItem[];
  locations: LocationItem[];
  initialSummary: SummaryStats;
}

const ROWS_PER_PAGE_OPTIONS = [10, 20, 50, 100];

export default function GeneralAssetClient({
  initialItems,
  locations,
  initialSummary,
}: GeneralAssetClientProps) {
  const [items, setItems] = useState<GeneralAssetItem[]>(initialItems);
  const [summary, setSummary] = useState<SummaryStats>(initialSummary);
  const [loading, setLoading] = useState(false);

  // Filter States
  const [search, setSearch] = useState("");
  const [itemTypeFilter, setItemTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [conditionFilter, setConditionFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");

  // Pagination & Sorting States
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [sortBy, setSortBy] = useState<string>("srNo");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Modal States
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<GeneralAssetItem | null>(null);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState<GeneralAssetItem | null>(
    null,
  );
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Distinct categories from current data (used as autocomplete source)
  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.category) set.add(i.category);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  // Refresh data from server
  const refreshData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/general-asset");
      if (res.ok) {
        const data = await res.json();
        setItems(data);

        // Recalculate summary
        const total = data.length;
        const underMaintenance = data.filter(
          (i: GeneralAssetItem) => i.condition === "Under Maintenance",
        ).length;
        const newItems = data.filter(
          (i: GeneralAssetItem) => i.condition === "New",
        ).length;
        const disposed = data.filter(
          (i: GeneralAssetItem) => i.condition === "Disposed",
        ).length;
        setSummary({ total, underMaintenance, newItems, disposed });
      }
    } catch {
      toast.error("Failed to reload general assets");
    } finally {
      setLoading(false);
    }
  }, []);

  // Filtered & sorted items
  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();

    return items.filter((i) => {
      const matchesSearch =
        !q ||
        i.pid.toLowerCase().includes(q) ||
        i.itemType.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q) ||
        (i.brand && i.brand.toLowerCase().includes(q)) ||
        (i.locationName && i.locationName.toLowerCase().includes(q)) ||
        (i.location?.locationname &&
          i.location.locationname.toLowerCase().includes(q)) ||
        (i.remark && i.remark.toLowerCase().includes(q));

      const matchesItemType =
        itemTypeFilter === "all" || i.itemType === itemTypeFilter;
      const matchesCategory =
        categoryFilter === "all" || i.category === categoryFilter;
      const matchesCondition =
        conditionFilter === "all" || i.condition === conditionFilter;
      const matchesLocation =
        locationFilter === "all" || i.locationId === locationFilter;

      return (
        matchesSearch &&
        matchesItemType &&
        matchesCategory &&
        matchesCondition &&
        matchesLocation
      );
    });
  }, [
    items,
    search,
    itemTypeFilter,
    categoryFilter,
    conditionFilter,
    locationFilter,
  ]);

  const sortedItems = useMemo(() => {
    return [...filteredItems].sort((a, b) => {
      let aVal = (a as unknown as Record<string, unknown>)[sortBy];
      let bVal = (b as unknown as Record<string, unknown>)[sortBy];

      if (typeof aVal === "string") aVal = aVal.toLowerCase();
      if (typeof bVal === "string") bVal = bVal.toLowerCase();

      if (aVal === bVal) return 0;
      if (aVal === undefined || aVal === null) return 1;
      if (bVal === undefined || bVal === null) return -1;

      if (sortOrder === "asc") {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
  }, [filteredItems, sortBy, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(sortedItems.length / rowsPerPage));
  const paginatedItems = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return sortedItems.slice(start, start + rowsPerPage);
  }, [sortedItems, page, rowsPerPage]);

  const handleOpenCreate = () => {
    setEditingItem(null);
    setFormModalOpen(true);
  };

  const handleOpenEdit = (item: GeneralAssetItem) => {
    setEditingItem(item);
    setFormModalOpen(true);
  };

  const handleOpenDelete = (item: GeneralAssetItem) => {
    setDeletingItem(item);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingItem) return;
    setDeleteLoading(true);

    try {
      const res = await fetch("/api/general-asset", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deletingItem.id }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete general asset");
      }

      toast.success(`General asset ${deletingItem.pid} deleted successfully.`);
      setItems((prev) => prev.filter((i) => i.id !== deletingItem.id));
      setSummary((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }));
      setDeleteModalOpen(false);
      refreshData();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to delete general asset";
      toast.error(msg);
    } finally {
      setDeleteLoading(false);
    }
  };

  const formatDate = (value: string | null | undefined) => {
    if (!value) return "—";
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const conditionMeta = (condition: string) =>
    GENERAL_ASSET_CONDITION_META[condition] || {
      label: condition,
      variant: "outline" as const,
    };

  // Table Columns Definition
  const columns = useMemo(
    () => [
      { key: "srNo", label: "SR NO" },
      { key: "pid", label: "PID" },
      { key: "itemType", label: "Item Type" },
      { key: "category", label: "Category" },
      { key: "location", label: "Location" },
      { key: "condition", label: "Condition" },
      { key: "brand", label: "Brand" },
      { key: "reviewsDate", label: "Reviews Date" },
      { key: "remark", label: "Remark" },
      { key: "actions", label: "Actions", hideable: false },
    ],
    [],
  );

  // Render Cell Content
  const renderCell = useCallback(
    (item: GeneralAssetItem, columnKey: string) => {
      switch (columnKey) {
        case "srNo":
          return (
            <span className="font-mono text-xs font-semibold text-muted-foreground">
              #{item.srNo}
            </span>
          );

        case "pid":
          return (
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <Badge
                variant="outline"
                className="font-mono text-xs font-medium"
              >
                {item.pid}
              </Badge>
            </div>
          );

        case "itemType":
          return (
            <span className="text-sm font-semibold text-foreground whitespace-nowrap">
              {item.itemType}
            </span>
          );

        case "category":
          return (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {item.category}
            </span>
          );

        case "location": {
          const locName = item.location?.locationname || item.locationName || "—";
          return (
            <span
              className="block max-w-[150px] truncate text-xs text-muted-foreground whitespace-nowrap"
              title={locName}
            >
              {locName}
            </span>
          );
        }

        case "condition": {
          const meta = conditionMeta(item.condition);
          const variantClass =
            meta.variant === "destructive"
              ? "bg-destructive/15 text-destructive border-destructive/30 hover:bg-destructive/15"
              : meta.variant === "default"
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : meta.variant === "secondary"
                  ? "bg-sky-100 text-sky-700 hover:bg-sky-100 dark:bg-sky-500/15 dark:text-sky-300"
                  : "border-border bg-muted/50 text-muted-foreground";
          return (
            <Badge variant="outline" className={`gap-1 text-[11px] ${variantClass}`}>
              {meta.variant === "destructive" && (
                <AlertTriangle className="h-3 w-3" />
              )}
              {meta.label}
            </Badge>
          );
        }

        case "brand":
          return (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {item.brand || "—"}
            </span>
          );

        case "reviewsDate":
          return (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
              <CalendarClock className="h-3.5 w-3.5" />
              {formatDate(item.reviewsDate)}
            </span>
          );

        case "remark":
          return (
            <span
              className="block max-w-[220px] truncate text-xs text-muted-foreground"
              title={item.remark || ""}
            >
              {item.remark || "—"}
            </span>
          );

        case "actions":
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => handleOpenEdit(item)}>
                  <Edit2 className="mr-2 h-4 w-4" />
                  Edit Asset
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onClick={() => handleOpenDelete(item)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Asset
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );

        default:
          return null;
      }
    },
    [],
  );

  return (
    <div className="space-y-6">
      {/* ─── Header & Primary CTA ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <Warehouse className="h-7 w-7 text-primary" />
            General Asset Inventory
          </h1>
          <p className="text-sm text-muted-foreground">
            Track non-IT fixed assets across the factory — machinery, buildings,
            vehicles, furniture, and equipment.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refreshData}
            disabled={loading}
          >
            <RefreshCw
              className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button onClick={handleOpenCreate} size="sm">
            <Plus className="mr-1.5 h-4 w-4" />
            Add Asset
          </Button>
        </div>
      </div>

      {/* ─── Metric Stat Cards ─── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Total Assets
            </span>
            <Warehouse className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold">{summary.total}</div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            All registered items
          </p>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              New Items
            </span>
            <PackageCheck className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {summary.newItems}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Newly acquired
          </p>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Under Maintenance
            </span>
            <Wrench className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-400">
            {summary.underMaintenance}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            In workshop / repair
          </p>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Disposed / Scrapped
            </span>
            <PackageX className="h-4 w-4 text-destructive" />
          </div>
          <div className="mt-2 text-2xl font-bold text-destructive">
            {summary.disposed}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Written off from register
          </p>
        </div>
      </div>

      {/* ─── Search & Filters Bar ─── */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search PID, item type, category, brand..."
            className="pl-9 text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Item Type Filter */}
          <Select
            value={itemTypeFilter}
            onValueChange={(val) => {
              setItemTypeFilter(val);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue placeholder="Item Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Item Types</SelectItem>
              {GENERAL_ASSET_ITEM_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Category Filter */}
          <Select
            value={categoryFilter}
            onValueChange={(val) => {
              setCategoryFilter(val);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-8 w-[135px] text-xs">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categoryOptions.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Condition Filter */}
          <Select
            value={conditionFilter}
            onValueChange={(val) => {
              setConditionFilter(val);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue placeholder="Condition" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Conditions</SelectItem>
              {GENERAL_ASSET_CONDITIONS.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Location Filter */}
          {locations.length > 0 && (
            <Select
              value={locationFilter}
              onValueChange={(val) => {
                setLocationFilter(val);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue placeholder="Location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Locations</SelectItem>
                {locations.map((loc) => (
                  <SelectItem key={loc.locationid} value={loc.locationid}>
                    {loc.locationname || loc.locationid}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Clear Filters */}
          {(search ||
            itemTypeFilter !== "all" ||
            categoryFilter !== "all" ||
            conditionFilter !== "all" ||
            locationFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setItemTypeFilter("all");
                setCategoryFilter("all");
                setConditionFilter("all");
                setLocationFilter("all");
                setPage(1);
              }}
              className="h-8 text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* ─── Responsive Data Table ─── */}
      <div className="rounded-xl border bg-card shadow-sm">
        <ResponsiveTable<GeneralAssetItem>
          columns={columns}
          data={paginatedItems}
          renderCell={renderCell}
          storageKey="general_asset_table_columns"
          defaultVisibleColumns={[
            "srNo",
            "pid",
            "itemType",
            "category",
            "location",
            "condition",
            "brand",
            "reviewsDate",
            "remark",
            "actions",
          ]}
          emptyMessage="No general assets registered matching your filter criteria."
          emptyDescription="Add your first asset with the 'Add Asset' button."
          mobileCardView
        />

        {/* ─── Table Pagination Bar ─── */}
        <div className="flex flex-col items-center justify-between gap-3 border-t p-3 text-xs text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <span>Rows per page:</span>
            <Select
              value={String(rowsPerPage)}
              onValueChange={(val) => {
                setRowsPerPage(Number(val));
                setPage(1);
              }}
            >
              <SelectTrigger className="h-7 w-[70px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROWS_PER_PAGE_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={String(opt)}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>
              Showing{" "}
              {paginatedItems.length > 0 ? (page - 1) * rowsPerPage + 1 : 0}–
              {Math.min(page * rowsPerPage, sortedItems.length)} of{" "}
              {sortedItems.length}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="h-7 px-2.5 text-xs"
            >
              Previous
            </Button>
            <span className="px-2">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="h-7 px-2.5 text-xs"
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Create / Edit Modal ─── */}
      <GeneralAssetFormModal
        open={formModalOpen}
        onOpenChange={setFormModalOpen}
        initialData={editingItem}
        locations={locations}
        onSuccess={() => {
          refreshData();
        }}
      />

      {/* ─── Delete Confirmation Modal ─── */}
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Confirm Asset Deletion
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete general asset{" "}
              <strong className="text-foreground">
                {deletingItem?.pid}
              </strong>{" "}
              ({deletingItem?.itemType})? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeleteModalOpen(false)}
              disabled={deleteLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteLoading}
            >
              {deleteLoading ? "Deleting..." : "Delete Asset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}