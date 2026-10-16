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
  Home,
  Plus,
  Search,
  RefreshCw,
  MoreVertical,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Building2,
  Check,
  Package,
  User,
} from "lucide-react";
import { notify } from "@/lib/feedback/notify";
import HouseholdFormModal from "./HouseholdFormModal";
import HouseholdStatusModal from "./HouseholdStatusModal";
import { HouseholdStatusBadge } from "./house-status";

interface LocationItem {
  locationid: string;
  locationname: string | null;
}

export interface HouseholdItem {
  id: string;
  srNo: number;
  hid: string;
  houseType: string;
  staffCategory?: string | null;
  houseNumber: string;
  rgType: string;
  locationId?: string | null;
  locationName?: string | null;
  location?: LocationItem | null;
  status: string;
  bedCount: number;
  chairsCount: number;
  lockerCount: number;
  tablesCount: number;
  damageWindow: boolean;
  damageDoor: boolean;
  damageWaterPanel: boolean;
  damageRoof: boolean;
  damageWall: boolean;
  damageElectricity: boolean;
  damageNotes?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SummaryStats {
  total: number;
  active: number;
  inactive: number;
  staff: number;
}

interface HouseholdRegisterClientProps {
  initialHouseholds: HouseholdItem[];
  locations: LocationItem[];
  initialSummary: SummaryStats;
  /** House ids currently allocated via the House Queue decision ledger. */
  initiallyAssignedHouseIds: string[];
}

const ROWS_PER_PAGE_OPTIONS = [10, 20, 50, 100];

export default function HouseholdRegisterClient({
  initialHouseholds,
  locations,
  initialSummary,
  initiallyAssignedHouseIds,
}: HouseholdRegisterClientProps) {
  const [households, setHouseholds] =
    useState<HouseholdItem[]>(initialHouseholds);
  const [summary, setSummary] = useState<SummaryStats>(initialSummary);
  const [loading, setLoading] = useState(false);
  const [assignedHouseIds, setAssignedHouseIds] = useState<string[]>(
    initiallyAssignedHouseIds,
  );

  // Filter States
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [assignmentFilter, setAssignmentFilter] = useState("all");
  const [rgFilter, setRgFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");

  // Pagination & Sorting States
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [sortBy, setSortBy] = useState<string>("srNo");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Modal States
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingHousehold, setEditingHousehold] =
    useState<HouseholdItem | null>(null);

  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [statusTargetHousehold, setStatusTargetHousehold] =
    useState<HouseholdItem | null>(null);
  const [targetStatus, setTargetStatus] = useState<"Active" | "Inactive">(
    "Active",
  );

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingHousehold, setDeletingHousehold] =
    useState<HouseholdItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Refresh data from server
  const refreshData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/household");
      if (res.ok) {
        const data = await res.json();
        setHouseholds(data);

        // recalculate summary
        const total = data.length;
        const active = data.filter(
          (h: HouseholdItem) => h.status === "Active",
        ).length;
        const inactive = data.filter(
          (h: HouseholdItem) => h.status === "Inactive",
        ).length;
        const staff = data.filter(
          (h: HouseholdItem) => h.houseType === "Staff",
        ).length;
        setSummary({ total, active, inactive, staff });
      }
    } catch {
      notify.error("Failed to reload households");
    } finally {
      setLoading(false);
    }
  }, []);

  // Filtered & Sorted items
  const assignedSet = useMemo(
    () => new Set(assignedHouseIds),
    [assignedHouseIds],
  );

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();

    return households.filter((h) => {
      const matchesSearch =
        !q ||
        h.hid.toLowerCase().includes(q) ||
        h.houseNumber.toLowerCase().includes(q) ||
        (h.locationName && h.locationName.toLowerCase().includes(q)) ||
        (h.location?.locationname &&
          h.location.locationname.toLowerCase().includes(q)) ||
        (h.damageNotes && h.damageNotes.toLowerCase().includes(q));

      const matchesType = typeFilter === "all" || h.houseType === typeFilter;
      const matchesStatus = statusFilter === "all" || h.status === statusFilter;
      // Occupancy comes from the live House Queue decision ledger — the same
      // source the queue table uses, so the register view can never disagree.
      const isAssigned = assignedSet.has(h.id);
      const matchesAssignment =
        assignmentFilter === "all" ||
        (assignmentFilter === "assigned" && isAssigned) ||
        (assignmentFilter === "unassigned" && !isAssigned);
      const matchesRg = rgFilter === "all" || h.rgType === rgFilter;
      const matchesLocation =
        locationFilter === "all" || h.locationId === locationFilter;

      return (
        matchesSearch &&
        matchesType &&
        matchesStatus &&
        matchesAssignment &&
        matchesRg &&
        matchesLocation
      );
    });
  }, [
    households,
    search,
    typeFilter,
    statusFilter,
    assignmentFilter,
    rgFilter,
    locationFilter,
    assignedSet,
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

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
  };

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingHousehold(null);
    setFormModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (item: HouseholdItem) => {
    setEditingHousehold(item);
    setFormModalOpen(true);
  };

  // Open Status Toggle Modal
  const handleToggleStatus = (item: HouseholdItem) => {
    setStatusTargetHousehold(item);
    setTargetStatus(item.status === "Active" ? "Inactive" : "Active");
    setStatusModalOpen(true);
  };

  // Open Delete Modal
  const handleOpenDelete = (item: HouseholdItem) => {
    setDeletingHousehold(item);
    setDeleteModalOpen(true);
  };

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!deletingHousehold) return;
    setDeleteLoading(true);

    try {
      const res = await fetch("/api/household", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deletingHousehold.id }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete household");
      }

      notify.success(`Household ${deletingHousehold.houseNumber} deleted`);
      setHouseholds((prev) =>
        prev.filter((h) => h.id !== deletingHousehold.id),
      );
      setDeleteModalOpen(false);
      refreshData();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to delete household";
      notify.error(msg);
    } finally {
      setDeleteLoading(false);
    }
  };

  // Table Columns Definition
  const columns = useMemo(
    () => [
      { key: "srNo", label: "SR NO" },
      { key: "hid", label: "HID" },
      { key: "houseNumber", label: "House No." },
      { key: "houseType", label: "Type" },
      { key: "rgType", label: "R / G" },
      { key: "location", label: "Location" },
      { key: "status", label: "Status" },
      { key: "assignmentStatus", label: "Occupancy & Category" },
      { key: "insideItems", label: "Inside Items" },
      { key: "damage", label: "Damage Info" },
      { key: "actions", label: "Actions", hideable: false },
    ],
    [],
  );

  // Render Cell Content
  const renderCell = useCallback(
    (item: HouseholdItem, columnKey: string) => {
      switch (columnKey) {
        case "srNo":
          return (
            <span className="text-muted-foreground font-mono text-xs font-semibold">
              #{item.srNo}
            </span>
          );

        case "hid":
          return (
            <Badge
              variant="outline"
              className="font-mono text-xs font-medium whitespace-nowrap"
            >
              {item.hid}
            </Badge>
          );

        case "houseNumber":
          return (
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="text-primary font-mono text-sm font-bold">
                {item.houseNumber}
              </span>
            </div>
          );

        case "houseType":
          return (
            <div className="text-xs whitespace-nowrap">
              <span className="font-semibold">{item.houseType}</span>
              {item.houseType === "Staff" && item.staffCategory && (
                <span className="text-muted-foreground ml-1">
                  (Cat. {item.staffCategory})
                </span>
              )}
            </div>
          );

        case "rgType":
          return (
            <Badge
              variant={item.rgType === "Regular" ? "secondary" : "outline"}
              className="text-[11px]"
            >
              {item.rgType === "Regular" ? "Regular" : "Guest House"}
            </Badge>
          );

        case "location": {
          const locName =
            item.location?.locationname || item.locationName || "—";
          return (
            <span
              className="text-muted-foreground block max-w-[130px] truncate text-xs whitespace-nowrap"
              title={locName}
            >
              {locName}
            </span>
          );
        }

        case "status": {
          return <HouseholdStatusBadge status={item.status} />;
        }

        case "assignmentStatus": {
          const categoryDisplay =
            item.houseType === "Staff" && item.staffCategory
              ? `Staff (${item.staffCategory})`
              : item.houseType;
          const isAssigned = assignedSet.has(item.id);
          return (
            <div className="flex flex-col gap-1 whitespace-nowrap">
              {isAssigned ? (
                <Badge
                  variant="default"
                  className="w-fit gap-1 bg-blue-600 text-[11px] font-semibold text-white hover:bg-blue-700"
                >
                  <User className="h-3 w-3" />
                  Occupied
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="w-fit gap-1 border-emerald-500 bg-emerald-50/80 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                >
                  <User className="h-3 w-3" />
                  Unassigned
                </Badge>
              )}
              <Badge
                variant="secondary"
                className="border-border/60 bg-muted/60 text-muted-foreground border px-1.5 py-0 text-[10px] font-medium"
              >
                {categoryDisplay}
              </Badge>
            </div>
          );
        }

        case "insideItems": {
          return (
            <div className="flex items-center gap-1 text-[11px] whitespace-nowrap">
              <span
                className="bg-muted/70 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5"
                title="Beds"
              >
                🛏️{item.bedCount}
              </span>
              <span
                className="bg-muted/70 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5"
                title="Chairs"
              >
                🪑{item.chairsCount}
              </span>
              <span
                className="bg-muted/70 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5"
                title="Lockers"
              >
                🗄️{item.lockerCount}
              </span>
              <span
                className="bg-muted/70 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5"
                title="Tables"
              >
                🪵{item.tablesCount}
              </span>
            </div>
          );
        }

        case "damage": {
          if (item.status === "Active") {
            return <span className="text-muted-foreground text-xs">—</span>;
          }

          const damaged: string[] = [];
          if (item.damageWindow) damaged.push("Win");
          if (item.damageDoor) damaged.push("Door");
          if (item.damageWaterPanel) damaged.push("Water");
          if (item.damageRoof) damaged.push("Roof");
          if (item.damageWall) damaged.push("Wall");
          if (item.damageElectricity) damaged.push("Elec");

          const fullDamageList = [];
          if (item.damageWindow) fullDamageList.push("Window");
          if (item.damageDoor) fullDamageList.push("Door");
          if (item.damageWaterPanel) fullDamageList.push("Water Panel");
          if (item.damageRoof) fullDamageList.push("Roof");
          if (item.damageWall) fullDamageList.push("Wall");
          if (item.damageElectricity) fullDamageList.push("Electricity");

          const damageTitle =
            fullDamageList.join(", ") +
            (item.damageNotes ? ` | Note: ${item.damageNotes}` : "");

          return (
            <div
              className="flex items-center gap-1 whitespace-nowrap"
              title={damageTitle}
            >
              {damaged.map((d) => (
                <Badge
                  key={d}
                  variant="outline"
                  className="border-destructive/40 bg-destructive/10 text-destructive px-1 py-0 text-[10px] font-normal"
                >
                  {d}
                </Badge>
              ))}
            </div>
          );
        }

        case "actions":
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => handleOpenEdit(item)}>
                  <Edit2 className="mr-2 h-4 w-4" />
                  Edit House
                </DropdownMenuItem>

                <DropdownMenuItem onClick={() => handleToggleStatus(item)}>
                  {item.status === "Active" ? (
                    <>
                      <XCircle className="text-destructive mr-2 h-4 w-4" />
                      Deactivate...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" />
                      Activate
                    </>
                  )}
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onClick={() => handleOpenDelete(item)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete House
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );

        default:
          return null;
      }
    },
    [assignedSet],
  );

  return (
    <div className="space-y-6">
      {/* ─── Header & Primary CTA ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-foreground flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Home className="text-primary h-7 w-7" />
            Household Management
          </h1>
          <p className="text-muted-foreground text-sm">
            Register, inspect, and maintain organization houses, staff quarters,
            and facilities.
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
            Register House
          </Button>
        </div>
      </div>

      {/* ─── Metric Stat Cards ─── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="bg-card rounded-xl border p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">
              Total Houses
            </span>
            <Building2 className="text-primary h-4 w-4" />
          </div>
          <div className="mt-2 text-2xl font-bold">{summary.total}</div>
          <p className="text-muted-foreground mt-1 text-[11px]">
            All registered units
          </p>
        </div>

        <div className="bg-card rounded-xl border p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">
              Active Units
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {summary.active}
          </div>
          <p className="text-muted-foreground mt-1 text-[11px]">
            Ready for occupancy
          </p>
        </div>

        <div className="bg-card rounded-xl border p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">
              Inactive / Damaged
            </span>
            <AlertTriangle className="text-destructive h-4 w-4" />
          </div>
          <div className="text-destructive mt-2 text-2xl font-bold">
            {summary.inactive}
          </div>
          <p className="text-muted-foreground mt-1 text-[11px]">
            Under maintenance/repairs
          </p>
        </div>

        <div className="bg-card rounded-xl border p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">
              Staff Quarters
            </span>
            <Package className="h-4 w-4 text-blue-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-blue-600 dark:text-blue-400">
            {summary.staff}
          </div>
          <p className="text-muted-foreground mt-1 text-[11px]">
            Staff categories A–E
          </p>
        </div>

        <div className="bg-card rounded-xl border p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">
              Assigned
            </span>
            <User className="h-4 w-4 text-blue-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-blue-600 dark:text-blue-400">
            {assignedSet.size}
          </div>
          <p className="text-muted-foreground mt-1 text-[11px]">
            Currently occupied
          </p>
        </div>

        <div className="bg-card rounded-xl border p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">
              Unassigned
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {Math.max(
              0,
              households.filter((h) => h.status === "Active").length -
                assignedSet.size,
            )}
          </div>
          <p className="text-muted-foreground mt-1 text-[11px]">
            Available for allocation
          </p>
        </div>
      </div>

      {/* ─── Search & Filters Bar ─── */}
      <div className="bg-card flex flex-col gap-3 rounded-xl border p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search house no, HID, location..."
            className="pl-9 text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* House Type Filter */}
          <Select
            value={typeFilter}
            onValueChange={(val) => {
              setTypeFilter(val);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-8 w-[125px] text-xs">
              <SelectValue placeholder="House Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="Staff">Staff</SelectItem>
              <SelectItem value="A">Type A</SelectItem>
              <SelectItem value="B">Type B</SelectItem>
              <SelectItem value="C">Type C</SelectItem>
              <SelectItem value="D">Type D</SelectItem>
              <SelectItem value="E">Type E</SelectItem>
            </SelectContent>
          </Select>

          {/* Status Filter */}
          <Select
            value={statusFilter}
            onValueChange={(val) => {
              setStatusFilter(val);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-8 w-[115px] text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="PendingInspection">
                Pending Inspection
              </SelectItem>
              <SelectItem value="UnderMaintenance">
                Under Maintenance
              </SelectItem>
              <SelectItem value="Inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>

          {/* Assignment Status Filter */}
          <Select
            value={assignmentFilter}
            onValueChange={(val) => {
              setAssignmentFilter(val);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-8 w-[135px] text-xs">
              <SelectValue placeholder="Assignment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Assignment</SelectItem>
              <SelectItem value="assigned">Assigned</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
            </SelectContent>
          </Select>

          {/* R / G Filter */}
          <Select
            value={rgFilter}
            onValueChange={(val) => {
              setRgFilter(val);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-8 w-[115px] text-xs">
              <SelectValue placeholder="R / G Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All R/G</SelectItem>
              <SelectItem value="Regular">Regular</SelectItem>
              <SelectItem value="Guest">Guest</SelectItem>
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
            typeFilter !== "all" ||
            statusFilter !== "all" ||
            assignmentFilter !== "all" ||
            rgFilter !== "all" ||
            locationFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setTypeFilter("all");
                setStatusFilter("all");
                setAssignmentFilter("all");
                setRgFilter("all");
                setLocationFilter("all");
                setPage(1);
              }}
              className="text-muted-foreground hover:text-foreground h-8 text-xs"
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* ─── Responsive Data Table ─── */}
      <div className="bg-card rounded-xl border shadow-sm">
        <ResponsiveTable<HouseholdItem>
          columns={columns}
          data={paginatedItems}
          renderCell={renderCell}
          storageKey="household_table_columns"
          defaultVisibleColumns={[
            "srNo",
            "hid",
            "houseNumber",
            "houseType",
            "rgType",
            "location",
            "status",
            "assignmentStatus",
            "insideItems",
            "damage",
            "actions",
          ]}
          emptyMessage="No households registered matching your filter criteria."
        />

        {/* ─── Table Pagination Bar ─── */}
        <div className="text-muted-foreground flex flex-col items-center justify-between gap-3 border-t p-3 text-xs sm:flex-row">
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

      {/* ─── Registration & Edit Modal ─── */}
      <HouseholdFormModal
        open={formModalOpen}
        onOpenChange={setFormModalOpen}
        initialData={editingHousehold}
        locations={locations}
        onSuccess={() => {
          refreshData();
        }}
      />

      {/* ─── Status Toggle / Damage Inspection Modal ─── */}
      <HouseholdStatusModal
        open={statusModalOpen}
        onOpenChange={setStatusModalOpen}
        household={statusTargetHousehold}
        targetStatus={targetStatus}
        onSuccess={() => {
          refreshData();
        }}
      />

      {/* ─── Delete Confirmation Modal ─── */}
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Confirm House Deletion
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete house{" "}
              <strong className="text-foreground">
                {deletingHousehold?.houseNumber}
              </strong>{" "}
              ({deletingHousehold?.hid})? This action cannot be undone.
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
              {deleteLoading ? "Deleting..." : "Delete House"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
