"use client";
import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";

// Isolated self-ticking clock so relative timestamps update without
// re-rendering the entire (large) table component.
function RelativeTime({ from }: { from: Date }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!from) return <span>-</span>;

  const diff = Math.max(0, Math.floor((now.getTime() - new Date(from).getTime()) / 1000));
  let label: string;
  if (diff < 5) label = "just now";
  else if (diff < 60) label = `${diff}s ago`;
  else {
    const mins = Math.floor(diff / 60);
    if (mins < 60) label = `${mins}m ago`;
    else {
      const hours = Math.floor(mins / 60);
      label = hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
    }
  }
  return (
    <span className="text-muted-foreground text-sm" suppressHydrationWarning>
      Last updated: {label}
    </span>
  );
}
import { useVirtualizer } from "@tanstack/react-virtual";
import { useUrlState } from "@/hooks/useUrlState";
import { usePersistentState } from "@/hooks/usePersistentState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import {
  AssignIcon,
  PlusIcon,
  EditIcon,
  SearchIcon,
  EyeIcon,
  DeleteIcon,
  QrCode,
  Label,
  Info,
  Status,
  MoreVertical,
  ChevronDownIcon,
  CalendarPlusIcon,
} from "../Icons";
import { capitalize } from "../../utils/utils";
import { formatCurrency } from "@/lib/depreciation";
import QRCode from "react-qr-code";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import SavedFilters from "@/components/SavedFilters";
import PrintLabelDialog from "@/components/PrintLabelDialog";
import RequestItemDialog from "@/components/RequestItemDialog";
import { Undo2 as Undo2Icon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const statusColorMap = {
  Active: "default",
  Available: "default",
  Pending: "secondary",
  "Lost/Stolen": "destructive",
  "Out for Repair": "secondary",
  Archived: "secondary",
};

const statusOptions = [
  { name: "Active", uid: "active" },
  { name: "Available", uid: "available" },
  { name: "Pending", uid: "pending" },
  { name: "Lost/Stolen", uid: "lost" },
  { name: "Out for Repair", uid: "repair" },
  { name: "Archived", uid: "archived" },
];

const INITIAL_VISIBLE_COLUMNS = [
  "srno",
  "assetname",
  "assetcategorytypeid",
  "serialnumber",
  "statustypeid",
  "locationid",
  "manufacturerid",
  "reviewsDate",
  "remark",
  "actions",
];

const HEADER_ALIGN = {
  srno: "text-right",
  purchaseprice: "text-right",
};

export default function App({
  data,
  locations,
  departments,
  status,
  user,
  manufacturers,
  models,
  categories,
  suppliers = [],
  columns,
  selectOptions,
  userAssets,
  isAdmin = true,
  currentUserId = null,
}) {
  // -- URL-synced state for shareable filter / pagination URLs --
  const allStatusUids = statusOptions.map((s) => s.uid).join(",");
  const [urlState, setUrlState] = useUrlState({
    search: "",
    page: "1",
    pageSize: selectOptions[0].value,
    status: allStatusUids,
  });

  // -- Client-only sort state (not persisted in URL) --
  const [sortDescriptor, setSortDescriptor] = useState({
    column: "assettag",
    direction: "ascending",
  });

  // Derived values from URL state
  const filterValue = urlState.search;
  const showAll = urlState.pageSize === "all";
  const page = showAll ? 1 : Number(urlState.page) || 1;
  const rowsPerPage = showAll
    ? Infinity
    : Number(urlState.pageSize) || Number(selectOptions[0].value);
  const statusFilter = useMemo<Set<string>>(
    () => new Set(urlState.status ? urlState.status.split(",") : []),
    [urlState.status],
  );

  // Convenience setters that update URL state
  const setFilterValue = useCallback(
    (v: string) => setUrlState({ search: v, page: "1" }),
    [setUrlState],
  );
  const setPage = useCallback(
    (p: number) => setUrlState({ page: String(p) }),
    [setUrlState],
  );
  const setRowsPerPage = useCallback(
    (v: string) => setUrlState({ pageSize: v, page: "1" }),
    [setUrlState],
  );
  const setStatusFilter = useCallback(
    (s: Set<string>) => setUrlState({ status: Array.from(s).join(",") }),
    [setUrlState],
  );

  // -- Local-only state (not shareable via URL) --
  const [selectedKeys, setSelectedKeys] = useState(new Set([]));
  const [deleteButtonActive, setDeleteButtonActive] = useState(false);
  const [persistedColumns, setPersistedColumns] = usePersistentState<string[]>(
    "columns:assets:v3",
    INITIAL_VISIBLE_COLUMNS,
  );
  const visibleColumns = useMemo(
    () => new Set(persistedColumns),
    [persistedColumns],
  );
  const setVisibleColumns = useCallback(
    (s: Set<string>) => setPersistedColumns(Array.from(s)),
    [setPersistedColumns],
  );
  const [assetsData, setAssetsData] = useState(data);
  const [userAssetsData, setUserAssetsData] = useState(userAssets);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isQRCodeModalOpen, setIsQRCodeModalOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isLabelModalOpen, setIsLabelModalOpen] = useState(false);
  const [isBulkStatusModalOpen, setIsBulkStatusModalOpen] = useState(false);
  const [bulkStatusId, setBulkStatusId] = useState("");
  const [isBulkDepartmentModalOpen, setIsBulkDepartmentModalOpen] =
    useState(false);
  const [bulkDepartmentStep, setBulkDepartmentStep] = useState<"select" | "confirm">("select");
  const [bulkDepartmentId, setBulkDepartmentId] = useState("");
  const [bulkUpdating, setBulkUpdating] = useState(false);

  const [selectedAsset, setSelectedAsset] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [requestingAsset, setRequestingAsset] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returningAsset, setReturningAsset] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteMode, setDeleteMode] = useState("single");
  const [confirmAssigned, setConfirmAssigned] = useState(false);

  // Status workflow transitions for filtering allowed status changes
  const [statusTransitions, setStatusTransitions] = useState<
    Array<{ fromStatusId: string; toStatusId: string }>
  >([]);
  const [hasTransitions, setHasTransitions] = useState(false);

  useEffect(() => {
    const fetchTransitions = async () => {
      try {
        const res = await fetch("/api/status-transitions");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setStatusTransitions(data);
            setHasTransitions(true);
          }
        }
      } catch {
        // Transitions not available — fall back to showing all statuses
      }
    };
    fetchTransitions();
  }, []);

  // Virtual scrolling setup for "All" mode
  const virtualScrollRef = useRef<HTMLDivElement>(null);

  const handleStatusUpdate = useCallback(
    async (assetId, statusId) => {
      try {
        const res = await fetch("/api/asset/updateStatus", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assetId, statusTypeId: statusId }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error || "Failed to update status");
        }
        const updated = await res.json();
        toast.success("Status updated", { description: updated.assettag });
        setAssetsData((prev) =>
          prev.map((a) =>
            a.assetid === assetId
              ? { ...a, statustypeid: updated.statustypeid }
              : a,
          ),
        );
      } catch (e) {
        console.error(e);
        toast.error("Status update failed", { description: e.message });
      }
    },
    [setAssetsData],
  );

  const hasSearchFilter = Boolean(filterValue);

  const handleDelete = useCallback(
    async (assetId) => {
      try {
        const response = await fetch("/api/asset/deleteAsset/", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ assetId }),
        });

        if (!response.ok) {
          toast.error("Error deleting asset");
          throw new Error("Error deleting asset");
        }

        const result = await response.json();

        toast.success(result.message, {
          description: `${assetId} deleted successfully`,
        });

        setAssetsData((prevItems) =>
          prevItems.filter((item) => item.assetid !== assetId),
        );
        setUserAssetsData((prev) =>
          prev.filter((ua) => ua.assetid !== assetId),
        );
      } catch (error) {
        toast.error("Error deleting asset", { description: error });
        console.error(error);
      }
    },
    [setAssetsData, setUserAssetsData],
  );

  const handleAssign = useCallback(
    async (assetId, userId) => {
      try {
        const response = await fetch("/api/userAssets/assign/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ assetId: assetId, userId: userId }),
        });

        if (!response.ok) {
          toast.error("Error assigning asset");
          const errorData = await response.json();
          throw new Error(errorData.error || "Error assigning asset");
        }

        const result = await response.json();
        toast.success("Entry assigned successfully");
        // Update local userAssets mapping so UI reflects change immediately
        setUserAssetsData((prev) => {
          const existing = prev.find((ua) => ua.assetid === assetId);
          if (existing) {
            return prev.map((ua) =>
              ua.assetid === assetId
                ? {
                    ...ua,
                    userid: userId,
                    change_date: new Date().toISOString(),
                  }
                : ua,
            );
          }
          return [
            ...prev,
            {
              userassetsid:
                result?.userAsset?.userassetsid || `${assetId}-${userId}`,
              assetid: assetId,
              userid: userId,
              creation_date: new Date().toISOString(),
              change_date: new Date().toISOString(),
            },
          ];
        });
        // Also reflect status = Active locally if we can resolve it
        const active = status.find(
          (s) => s.statustypename?.toLowerCase() === "active",
        );
        if (active) {
          setAssetsData((prev) =>
            prev.map((a) =>
              a.assetid === assetId
                ? { ...a, statustypeid: active.statustypeid }
                : a,
            ),
          );
        }
      } catch (error) {
        console.error("Error:", error);
      }
    },
    [setAssetsData, setUserAssetsData, status],
  );

  const handleUnassign = useCallback(
    async (assetId, userId) => {
      try {
        const response = await fetch("/api/userAssets/unassign/", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ assetId, userId }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Error unassigning asset");
        }

        const result = await response.json();
        // Remove mapping locally
        setUserAssetsData((prev) =>
          prev.filter((ua) => ua.assetid !== assetId),
        );
        // Reflect status = Available locally if we can resolve it
        const available = status.find(
          (s) => s.statustypename?.toLowerCase() === "available",
        );
        if (available) {
          setAssetsData((prev) =>
            prev.map((a) =>
              a.assetid === assetId
                ? { ...a, statustypeid: available.statustypeid }
                : a,
            ),
          );
        }
      } catch (error) {
        console.error("Error:", error);
      }
    },
    [setAssetsData, setUserAssetsData, status],
  );

  const handleBulkStatusChange = useCallback(async () => {
    if (!bulkStatusId || selectedKeys.size === 0) return;
    setBulkUpdating(true);
    try {
      const ids = Array.from(selectedKeys);
      await Promise.all(
        ids.map((assetId) =>
          fetch("/api/asset/updateStatus", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assetId, statusTypeId: bulkStatusId }),
          }),
        ),
      );
      setAssetsData((prev) =>
        prev.map((a) =>
          selectedKeys.has(a.assetid)
            ? { ...a, statustypeid: bulkStatusId }
            : a,
        ),
      );
      toast.success(`Status updated for ${ids.length} asset(s)`);
      setIsBulkStatusModalOpen(false);
      setBulkStatusId("");
      setSelectedKeys(new Set([]));
    } catch (e) {
      toast.error("Bulk status update failed", { description: e.message });
    } finally {
      setBulkUpdating(false);
    }
  }, [bulkStatusId, selectedKeys, setAssetsData]);

  const handleBulkDepartmentChange = useCallback(async () => {
    if (!bulkDepartmentId || selectedKeys.size === 0) return;
    setBulkUpdating(true);
    try {
      const ids = Array.from(selectedKeys);
      const results = await Promise.all(
        ids.map((assetId) =>
          fetch("/api/asset", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              assetid: assetId,
              departmentId: bulkDepartmentId,
            }),
          }),
        ),
      );
      if (results.some((r) => !r.ok)) {
        throw new Error("One or more updates failed");
      }
      // Reflect the change locally with the authoritative department code.
      const dept = departments.find((d) => d.id === bulkDepartmentId);
      setAssetsData((prev) =>
        prev.map((a) =>
          selectedKeys.has(a.assetid)
            ? {
                ...a,
                departmentId: bulkDepartmentId,
                departmentCode: dept?.code ?? a.departmentCode,
              }
            : a,
        ),
      );
      toast.success(`Department updated for ${ids.length} asset(s)`);
      setIsBulkDepartmentModalOpen(false);
      setBulkDepartmentStep("select");
      setBulkDepartmentId("");
      setSelectedKeys(new Set([]));
    } catch (e) {
      toast.error("Bulk department update failed", {
        description: (e as Error).message,
      });
    } finally {
      setBulkUpdating(false);
    }
  }, [bulkDepartmentId, selectedKeys, setAssetsData, departments]);

  const handleUserSelection = (value) => {
    // Check if value is empty or null and set selectedUser accordingly
    if (!value || value.size === 0 || (typeof value === "string" && !value)) {
      setSelectedUser(null);
    } else if (value instanceof Set) {
      // If it's a Set, get the first value
      setSelectedUser(value.values().next().value || (value as any).anchorKey);
    } else {
      // Otherwise use the value directly (string from Select)
      setSelectedUser(value);
    }
  };

  //does not work
  const qrRef = useRef(null);
  const handleDownload = useCallback(() => {
    const canvas = qrRef.current?.querySelector("canvas");
    if (canvas) {
      const url = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = url;
      link.download = `QRCode_${selectedAsset?.assettag}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      console.error("Canvas not found");
    }
  }, [selectedAsset]);

  useEffect(() => {
    setDeleteButtonActive(selectedKeys.size > 0);
  }, [selectedKeys]);

  const handleOpenModal = useCallback((asset, target) => {
    switch (target) {
      case "assign":
        setSelectedAsset(asset);
        setIsAssignModalOpen(true);
        break;
      case "status":
        setSelectedAsset(asset);
        setIsStatusModalOpen(true);
        break;
      case "delete":
        setSelectedAsset(asset);
        setDeleteMode("single");
        setIsDeleteModalOpen(true);
        break;
      case "delete-bulk":
        setSelectedAsset(null);
        setDeleteMode("bulk");
        setIsDeleteModalOpen(true);
        break;
      case "qrcode":
        setSelectedAsset(asset);
        setIsQRCodeModalOpen(true);
        break;
      case "label":
        setSelectedAsset(asset);
        setIsLabelModalOpen(true);
        break;
      default:
        break;
    }
  }, []);

  const headerColumns = useMemo(() => {
    const base = columns ?? [];
    const hasAll = base.length > 0 && visibleColumns.size >= base.length;
    let cols = hasAll
      ? base
      : base.filter((column) => Array.from(visibleColumns).includes(column.uid));

    // Sr.No. is a required column — always render it first, even if the
    // persisted column set (localStorage) predates it.
    const srnoCol = base.find((column) => column.uid === "srno");
    if (srnoCol && !cols.some((column) => column.uid === "srno")) {
      cols = [srnoCol, ...cols];
    }
    return cols;
  }, [visibleColumns, columns]);

  const filteredItems = useMemo(() => {
    let filteredAssets = [...assetsData];
    const q = filterValue.trim().toLowerCase();

    if (hasSearchFilter) {
      filteredAssets = filteredAssets.filter((data) => {
        const deptMatch = departments.find(
          (dep) => dep.id === data.departmentId,
        );
        const deptHaystack = deptMatch
          ? `${deptMatch.name} ${deptMatch.code ?? ""}`
          : "";
        const categoryMatch = categories.find(
          (cat) => cat.assetcategorytypeid === data.assetcategorytypeid,
        );
        const manufacturerMatch = manufacturers.find(
          (manu) => manu.manufacturerid === data.manufacturerid,
        );
        const modelMatch = models.find(
          (mod) => mod.modelid === data.modelid,
        );
        const statusMatch = status.find(
          (stat) => stat.statustypeid === data.statustypeid,
        );
        return [
          data.assetname,
          data.assettag,
          data.serialnumber,
          data.remark ?? "",
          data.specs ?? "",
          data.notes ?? "",
          data.assetid ?? "",
          categoryMatch?.assetcategorytypename ?? "",
          manufacturerMatch?.manufacturername ?? "",
          modelMatch?.modelname ?? "",
          statusMatch?.statustypename ?? "",
          deptHaystack,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      });
    }
    if (statusFilter.size !== statusOptions.length) {
      filteredAssets = filteredAssets.filter((asset) => {
        const assetStatus = status.find(
          (stat) => stat.statustypeid === asset.statustypeid,
        );
        return (
          assetStatus &&
          statusFilter.has(assetStatus.statustypename.toLowerCase())
        );
      });
    }

    return filteredAssets;
  }, [
    assetsData,
    status,
    departments,
    categories,
    manufacturers,
    models,
    filterValue,
    statusFilter,
    hasSearchFilter,
  ]);

  const pages = Math.ceil(filteredItems.length / rowsPerPage);

  const items = useMemo(() => {
    if (showAll) return filteredItems;
    const start = (page - 1) * rowsPerPage;
    return filteredItems.slice(start, start + rowsPerPage);
  }, [page, filteredItems, rowsPerPage, showAll]);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      let first, second;
      switch (sortDescriptor.column) {
        case "departmentid":
          const departmentA = departments.find(
            (dep) => dep.id === a.departmentId,
          );
          const departmentB = departments.find(
            (dep) => dep.id === b.departmentId,
          );
          first = departmentA ? (departmentA.code ?? "") + " " + departmentA.name : "";
          second = departmentB ? (departmentB.code ?? "") + " " + departmentB.name : "";
          break;
        case "manufacturerid":
          const manufacturerA = manufacturers.find(
            (manu) => manu.manufacturerid === a.manufacturerid,
          );
          const manufacturerB = manufacturers.find(
            (manu) => manu.manufacturerid === b.manufacturerid,
          );
          first = manufacturerA ? manufacturerA.manufacturername : "";
          second = manufacturerB ? manufacturerB.manufacturername : "";
          break;
        case "supplierid":
          const supplierA = suppliers.find(
            (sup) => sup.supplierid === a.supplierid,
          );
          const supplierB = suppliers.find(
            (sup) => sup.supplierid === b.supplierid,
          );
          first = supplierA ? supplierA.suppliername : "";
          second = supplierB ? supplierB.suppliername : "";
          break;
        case "locationid":
          const locA = locations.find((loc) => loc.locationid === a.locationid);
          const locB = locations.find((loc) => loc.locationid === b.locationid);
          first = locA ? locA.locationname : "";
          second = locB ? locB.locationname : "";
          break;
        case "modelid":
          const modelA = models.find((mod) => mod.modelid === a.modelid);
          const modelB = models.find((mod) => mod.modelid === b.modelid);
          first = modelA ? modelA.modelname : "";
          second = modelB ? modelB.modelname : "";
          break;
        case "assetcategorytypeid":
          const categoryA = categories.find(
            (cat) => cat.assetcategorytypeid === a.assetcategorytypeid,
          );
          const categoryB = categories.find(
            (cat) => cat.assetcategorytypeid === b.assetcategorytypeid,
          );
          first = categoryA ? categoryA.assetcategorytypename : "";
          second = categoryB ? categoryB.assetcategorytypename : "";
          break;
        case "statustypeid":
          const statusA = status.find(
            (st) => st.statustypeid === a.statustypeid,
          );
          const statusB = status.find(
            (st) => st.statustypeid === b.statustypeid,
          );
          first = statusA ? statusA.statustypename : "";
          second = statusB ? statusB.statustypename : "";
          break;
        case "creation_date":
        case "change_date":
        case "purchasedate":
        case "reviewsDate":
        case "warrantyExpires":
          first = a[sortDescriptor.column]
            ? new Date(a[sortDescriptor.column]).getTime()
            : 0;
          second = b[sortDescriptor.column]
            ? new Date(b[sortDescriptor.column]).getTime()
            : 0;
          break;
        case "purchaseprice":
          first = Number(a.purchaseprice) || 0;
          second = Number(b.purchaseprice) || 0;
          break;
        case "mobile":
        case "requestable":
          first = a[sortDescriptor.column] ? 1 : 0;
          second = b[sortDescriptor.column] ? 1 : 0;
          break;
        default:
          first = a[sortDescriptor.column] || "";
          second = b[sortDescriptor.column] || "";
          break;
      }
      const cmp =
        typeof first === "string"
          ? first.localeCompare(second, undefined, {
              numeric: true,
              sensitivity: "base",
            })
          : first - second;
      return sortDescriptor.direction === "descending" ? -cmp : cmp;
    });
  }, [
    sortDescriptor,
    items,
    locations,
    departments,
    manufacturers,
    models,
    status,
    categories,
    suppliers,
  ]);

  const virtualizer = useVirtualizer({
    count: showAll ? sortedItems.length : 0,
    getScrollElement: () => virtualScrollRef.current,
    estimateSize: () => 48,
    overscan: 15,
  });

  // O(1) lookup so each row shows its global position within the
  // filtered list (continuous numbering across pagination).
  const srNoMap = useMemo(
    () => new Map(sortedItems.map((a, i) => [a.assetid, i])),
    [sortedItems],
  );

  const virtualMeasureRef = useCallback(
    (node: HTMLTableRowElement | null) => {
      if (node) {
        const index = Number(node.dataset.index);
        if (!isNaN(index)) {
          virtualizer.measureElement(node);
        }
      }
    },
    [virtualizer],
  );

  const renderCell = useCallback(
    (asset, columnKey) => {
      const cellValue = asset[columnKey];

      switch (columnKey) {
        case "srno":
          return (
            <span className="text-muted-foreground block text-right text-sm tabular-nums">
              {(srNoMap.get(asset.assetid) ?? 0) + 1}
            </span>
          );
        case "assetid":
          return (
            <Link
              href={`/assets/${asset.assetid}`}
              title={asset.assetid}
              className="text-muted-foreground font-mono text-xs hover:text-foreground hover:underline"
            >
              {asset.assetid.slice(0, 8)}…
            </Link>
          );
        case "assetname":
          return (
            <Link
              href={`/assets/${asset.assetid}`}
              className="text-sm font-medium text-foreground capitalize hover:text-primary hover:underline"
            >
              {asset.assetname}
            </Link>
          );
        case "assettag":
          return (
            <Link
              href={`/assets/${asset.assetid}`}
              className="text-small hover:text-primary font-medium hover:underline"
            >
              {asset.assettag}
            </Link>
          );
        case "serialnumber":
          return (
            <div className="flex flex-col">
              <p className="text-bold text-small capitalize">
                {asset.serialnumber}
              </p>
            </div>
          );
        case "reviewsDate":
          return (
            <div className="flex flex-col">
              <p className="text-sm text-foreground">
                {asset.reviewsDate
                  ? new Date(asset.reviewsDate).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })
                  : "-"}
              </p>
            </div>
          );
        case "purchasedate":
          return (
            <div className="flex flex-col">
              <p className="text-sm text-foreground">
                {asset.purchasedate
                  ? new Date(asset.purchasedate).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })
                  : "-"}
              </p>
            </div>
          );
        case "remark":
          return (
            <div className="flex flex-col">
              <p
                className="text-sm max-w-[240px] truncate text-foreground"
                title={asset.remark || ""}
              >
                {asset.remark || "-"}
              </p>
            </div>
          );
        case "belongsto":
          const userAssetEntry = userAssetsData.find(
            (ua) => ua.assetid === asset.assetid,
          );
          if (!userAssetEntry) {
            return (
              <div className="flex flex-col">
                <p className="text-sm text-muted-foreground">-</p>
              </div>
            );
          }
          const belongingUser = user.find(
            (user) => user.userid === userAssetEntry.userid,
          );
          const userName = belongingUser
            ? belongingUser.firstname + " " + belongingUser.lastname
            : "-";

          return (
            <div className="flex flex-col">
              <p className="text-sm text-foreground capitalize">{userName}</p>
            </div>
          );
        case "manufacturerid":
          const manu = manufacturers.find(
            (manu) => manu.manufacturerid === asset.manufacturerid,
          );
          return (
            <div className="flex flex-col">
              <p className="text-sm text-foreground capitalize">
                {manu ? manu.manufacturername : "-"}
              </p>
            </div>
          );
        case "modelid":
          const mod = models.find((mod) => mod.modelid === asset.modelid);
          return (
            <div className="flex flex-col">
              <p className="text-sm text-foreground capitalize">
                {mod ? mod.modelname : "-"}
              </p>
            </div>
          );
        case "supplierid":
          const supplier = suppliers.find((s) => s.supplierid === asset.supplierid);
          return (
            <div className="flex flex-col">
              <p className="text-sm text-foreground capitalize">
                {supplier ? supplier.suppliername : "-"}
              </p>
            </div>
          );
        case "locationid":
          const loc = locations.find(
            (l) => l.locationid === asset.locationid,
          );
          return (
            <div className="flex flex-col">
              <p className="text-sm text-foreground capitalize">
                {loc ? loc.locationname : "-"}
              </p>
            </div>
          );
        case "specs":
          return (
            <div className="flex flex-col">
              <p className="text-sm text-foreground">{asset.specs || "-"}</p>
            </div>
          );
        case "notes":
          return (
            <div className="flex flex-col">
              <p className="text-sm text-foreground capitalize">
                {asset.notes ? asset.notes : "-"}
              </p>
            </div>
          );
        case "statustypeid":
          const stat = status.find(
            (s) => s.statustypeid === asset.statustypeid,
          );
          const badgeVariant =
            statusColorMap[stat?.statustypename] || "default";
          return (
            <Badge className="capitalize" variant={badgeVariant}>
              {stat?.statustypename || "Unknown"}
            </Badge>
          );
        case "assetcategorytypeid":
          const cat = categories.find(
            (cat) => cat.assetcategorytypeid === asset.assetcategorytypeid,
          );
          return (
            <div className="flex flex-col">
              <p className="text-sm text-foreground capitalize">
                {cat ? cat.assetcategorytypename : "Unknown"}
              </p>
            </div>
          );
        case "requestable":
          return (
            <Badge variant={asset.requestable ? "default" : "destructive"}>
              {asset.requestable.toString()}
            </Badge>
          );
        case "mobile":
          return (
            <Badge variant={asset.mobile ? "default" : "destructive"}>
              {asset.mobile.toString()}
            </Badge>
          );
        case "departmentid":
          // Find the department object based on the asset's departmentId
          const department = departments.find(
            (dep) => dep.id === asset.departmentId,
          );
          return (
            <div className="flex flex-col">
              <p className="text-sm text-foreground capitalize">
                {department
                  ? `${department.code ? department.code + " — " : ""}${department.name}`
                  : "Unknown"}
              </p>
            </div>
          );
        case "purchaseprice":
          return (
            <div className="flex flex-col text-right">
              <p className="text-sm text-foreground tabular-nums">
                {asset.purchaseprice != null
                  ? formatCurrency(Number(asset.purchaseprice))
                  : "-"}
              </p>
            </div>
          );
        case "actions": {
          const assetAvailableStatusIds = new Set(
            status
              .filter((s) =>
                String(s.statustypename ?? "")
                  .toLowerCase()
                  .includes("available"),
              )
              .map((s) => s.statustypeid),
          );
          const isAvailable =
            asset.statustypeid &&
            assetAvailableStatusIds.has(asset.statustypeid);
          const isAssignedToMe =
            currentUserId &&
            userAssetsData.some(
              (ua) =>
                ua.assetid === asset.assetid && ua.userid === currentUserId,
            );
          const canRequest =
            !isAssignedToMe && (asset.requestable || isAvailable);
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/assets/${asset.assetid}`}>
                    <EyeIcon className="mr-2 h-4 w-4" />
                    View Details
                  </Link>
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem asChild>
                    <Link href={`/assets/${asset.assetid}/edit`}>
                      <EditIcon className="mr-2 h-4 w-4" />
                      Edit
                    </Link>
                  </DropdownMenuItem>
                )}
                {isAdmin && (
                  <DropdownMenuItem
                    onClick={() => handleOpenModal(asset, "assign")}
                    disabled={!asset.requestable}
                  >
                    <AssignIcon className="mr-2 h-4 w-4" />
                    Assign User
                  </DropdownMenuItem>
                )}
                {!isAdmin && canRequest && (
                  <DropdownMenuItem
                    onClick={() => {
                      setRequestingAsset({
                        id: asset.assetid,
                        name: asset.assetname,
                      });
                      setRequestDialogOpen(true);
                    }}
                  >
                    <CalendarPlusIcon className="mr-2 h-4 w-4" />
                    Request
                  </DropdownMenuItem>
                )}
                {!isAdmin && isAssignedToMe && (
                  <DropdownMenuItem
                    onClick={() => {
                      setReturningAsset({
                        id: asset.assetid,
                        name: asset.assetname,
                      });
                      setReturnDialogOpen(true);
                    }}
                  >
                    <Undo2Icon className="mr-2 h-4 w-4" />
                    Return
                  </DropdownMenuItem>
                )}
                {isAdmin && <DropdownMenuSeparator />}
                {isAdmin && (
                  <DropdownMenuItem
                    onClick={() => handleOpenModal(asset, "status")}
                  >
                    <Status className="mr-2 h-4 w-4" />
                    Change Status
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => handleOpenModal(asset, "qrcode")}
                >
                  <QrCode className="mr-2 h-4 w-4" />
                  QR Code
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleOpenModal(asset, "label")}
                >
                  <Label className="mr-2 h-4 w-4" />
                  Print Label
                </DropdownMenuItem>
                {isAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => handleOpenModal(asset, "delete")}
                    >
                      <DeleteIcon className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        }
        default:
          return cellValue;
      }
    },
    [
      locations,
      departments,
      status,
      manufacturers,
      models,
      categories,
      suppliers,
      user,
      userAssetsData,
      handleOpenModal,
      isAdmin,
      currentUserId,
      setRequestingAsset,
      setRequestDialogOpen,
      srNoMap,
    ],
  );

  const onRowsPerPageChange = useCallback(
    (e) => {
      setRowsPerPage(e.target.value);
    },
    [setRowsPerPage],
  );

  const onSearchChange = useCallback(
    (value) => {
      setFilterValue(value);
    },
    [setFilterValue],
  );

  const onClear = useCallback(() => {
    setFilterValue("");
  }, [setFilterValue]);

  const refreshData = useCallback(
    async () => {
      try {
        setIsRefreshing(true);
        const [assetsRes, userAssetsRes] = await Promise.all([
          fetch("/api/asset"),
          fetch("/api/userAssets"),
        ]);

        // If the session expired or the user was logged out, redirect
        // to login instead of spewing console errors on every tab-focus.
        if (assetsRes.status === 401 || userAssetsRes.status === 401) {
          if (typeof window !== "undefined") {
            window.location.href = "/login";
          }
          return;
        }

        if (!assetsRes.ok) {
          toast.error("Refresh failed", {
            description: `Assets: ${assetsRes.status}`,
          });
          return;
        }
        if (!userAssetsRes.ok) {
          toast.error("Refresh failed", {
            description: `Assignments: ${userAssetsRes.status}`,
          });
          return;
        }

        const [assetsJson, userAssetsJson] = await Promise.all([
          assetsRes.json(),
          userAssetsRes.json(),
        ]);

        let refreshedAssets = assetsJson || [];
        const refreshedUserAssets = userAssetsJson || [];

        // Non-admin self-service filter: only show assigned + available assets
        if (!isAdmin && currentUserId) {
          const assignedAssetIds = new Set(
            refreshedUserAssets
              .filter((ua) => ua.userid === currentUserId)
              .map((ua) => ua.assetid),
          );
          const availableStatusIds = new Set(
            status
              .filter((s) =>
                String(s.statustypename ?? "")
                  .toLowerCase()
                  .includes("available"),
              )
              .map((s) => s.statustypeid),
          );
          refreshedAssets = refreshedAssets.filter(
            (a) =>
              assignedAssetIds.has(a.assetid) ||
              (a.statustypeid && availableStatusIds.has(a.statustypeid)),
          );
        }

        setAssetsData(refreshedAssets);
        setUserAssetsData(refreshedUserAssets);
        setLastUpdated(new Date());
      } catch {
        // Network error or unexpected failure — don't crash the app;
        // the user can continue using the stale (but still functional)
        // data already on screen.
        toast.error("Refresh failed", {
          description: "Network error — will retry next focus",
        });
      } finally {
        setIsRefreshing(false);
      }
    },
    [isAdmin, currentUserId, status],
  );

  // Auto refresh when returning to tab or when page becomes visible.
  // Guarded by a 30s staleness window so re-focusing the tab doesn't
  // re-fetch the full tables (and toast) on every click back.
  const lastRefreshAt = useRef(0);
  useEffect(() => {
    const onFocus = () => {
      const nowTs = Date.now();
      if (nowTs - lastRefreshAt.current < 30_000) return;
      lastRefreshAt.current = nowTs;
      void refreshData();
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      onFocus();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshData]);

  // Initialize lastUpdated on client
  useEffect(() => {
    setLastUpdated(new Date());
  }, []);

  // Keyboard shortcut: press "r" to refresh (ignored while typing in inputs)
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== "r" && e.key !== "R") return;
      const target = e.target;
      const tag = target?.tagName?.toLowerCase();
      const isEditable =
        target?.isContentEditable ||
        tag === "input" ||
        tag === "textarea" ||
        tag === "select";
      if (isEditable) return;
      e.preventDefault();
      refreshData();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [refreshData]);

  const topContent = useMemo(() => {
    const handleStatusToggle = (statusUid: string) => {
      const currentFilter = new Set(statusFilter);
      if (currentFilter.has(statusUid)) {
        currentFilter.delete(statusUid);
      } else {
        currentFilter.add(statusUid);
      }
      setStatusFilter(currentFilter);
    };

    const handleColumnToggle = (columnUid: string) => {
      const currentColumns = new Set(visibleColumns);
      if (currentColumns.has(columnUid)) {
        currentColumns.delete(columnUid);
      } else {
        currentColumns.add(columnUid);
      }
      setVisibleColumns(currentColumns);
    };

    const currentStatusSet = statusFilter;
    const currentColumnsSet = visibleColumns;

    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="relative w-full sm:w-auto sm:max-w-[44%] sm:flex-1">
            <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              className="pl-9"
              placeholder="Search for an Item..."
              value={filterValue}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild className="hidden sm:flex">
                <Button variant="outline">
                  Status
                  <ChevronDownIcon className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {statusOptions.map((status) => (
                  <DropdownMenuItem
                    key={status.uid}
                    className="capitalize"
                    onSelect={(e) => {
                      e.preventDefault();
                      handleStatusToggle(status.uid);
                    }}
                  >
                    <Checkbox
                      checked={currentStatusSet.has(status.uid)}
                      onCheckedChange={() => handleStatusToggle(status.uid)}
                      className="mr-2"
                    />
                    {capitalize(status.name)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Select
              value={`${sortDescriptor.column}:${sortDescriptor.direction}`}
              onValueChange={(v) => {
                const [col, dir] = v.split(":");
                setSortDescriptor({ column: col, direction: dir });
              }}
            >
              <SelectTrigger className="hidden w-[160px] sm:flex">
                <SelectValue placeholder="Sort by..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="creation_date:descending">
                  Newest first
                </SelectItem>
                <SelectItem value="creation_date:ascending">
                  Oldest first
                </SelectItem>
                <SelectItem value="assetname:ascending">Name A–Z</SelectItem>
                <SelectItem value="assetname:descending">Name Z–A</SelectItem>
                <SelectItem value="assettag:ascending">Tag A–Z</SelectItem>
                <SelectItem value="assettag:descending">Tag Z–A</SelectItem>
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild className="hidden sm:flex">
                <Button variant="outline">
                  Columns
                  <ChevronDownIcon className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {columns.map((column) => {
                  const isSrNo = column.uid === "srno";
                  return (
                    <DropdownMenuItem
                      key={column.uid}
                      className="capitalize"
                      disabled={isSrNo}
                      onSelect={(e) => {
                        if (isSrNo) {
                          e.preventDefault();
                          return;
                        }
                        e.preventDefault();
                        handleColumnToggle(column.uid);
                      }}
                    >
                      <Checkbox
                        checked={currentColumnsSet.has(column.uid) || isSrNo}
                        disabled={isSrNo}
                        onCheckedChange={() => handleColumnToggle(column.uid)}
                        className="mr-2"
                      />
                      {capitalize(column.name)}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="hidden sm:flex">
              <SavedFilters
                entity="asset"
                currentFilters={{
                  search: filterValue,
                  statuses: Array.from(statusFilter),
                  columns: Array.from(visibleColumns),
                }}
                onApplyFilter={(filters: Record<string, unknown>) => {
                  if (filters.search !== undefined)
                    setFilterValue(filters.search as string);
                  if (filters.statuses)
                    setStatusFilter(new Set(filters.statuses as string[]));
                  if (filters.columns)
                    setVisibleColumns(new Set(filters.columns as string[]));
                }}
              />
            </div>
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild className="hidden sm:flex">
                  <Button variant="outline" disabled={!deleteButtonActive}>
                    Bulk Edit
                    <ChevronDownIcon className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => setIsBulkStatusModalOpen(true)}
                  >
                    Change Status
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setBulkDepartmentStep("select");
                      setBulkDepartmentId("");
                      setIsBulkDepartmentModalOpen(true);
                    }}
                  >
                    Change Department
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      const selected = assetsData.filter((a) =>
                        selectedKeys.has(a.assetid),
                      );
                      if (selected.length > 0) {
                        setSelectedAsset(null);
                        setIsLabelModalOpen(true);
                      }
                    }}
                  >
                    Print Labels
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={async () => {
                      const ids = Array.from(selectedKeys);
                      if (ids.length === 0) return;
                      try {
                        const res = await fetch("/api/asset/qrcode/bulk", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ assetIds: ids }),
                        });
                        if (!res.ok) throw new Error();
                        const blob = await res.blob();
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `qr-codes-${Date.now()}.pdf`;
                        a.click();
                        URL.revokeObjectURL(url);
                        toast.success("QR sheet downloaded");
                      } catch {
                        toast.error("Failed to download QR sheet");
                      }
                    }}
                  >
                    Download QR Sheet
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => handleOpenModal(null, "delete-bulk")}
                  >
                    Delete Entries
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button
              variant="outline"
              className="hidden sm:inline-flex"
              onClick={() => refreshData()}
              disabled={isRefreshing}
            >
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </Button>
            {isAdmin && (
              <Button asChild>
                <Link href="assets/create/">
                  <PlusIcon className="mr-2 h-4 w-4" />
                  Add New
                </Link>
              </Button>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">
            Total: {assetsData.length} Entries
          </span>
          <RelativeTime from={lastUpdated} />
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">
              Rows per page:
            </span>
            <Select
              value={showAll ? "all" : String(rowsPerPage)}
              onValueChange={(value) => {
                setRowsPerPage(value);
              }}
            >
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {selectOptions.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    );
  }, [
    filterValue,
    statusFilter,
    visibleColumns,
    onSearchChange,
    deleteButtonActive,
    columns,
    rowsPerPage,
    assetsData,
    selectOptions,
    handleOpenModal,
    isRefreshing,
    refreshData,
    lastUpdated,
    selectedKeys,
    setFilterValue,
    setRowsPerPage,
    setStatusFilter,
    setVisibleColumns,
    showAll,
    isAdmin,
  ]);

  const bottomContent = useMemo(() => {
    return (
      <div className="flex items-center justify-between px-2 py-2">
        <span className="text-muted-foreground text-sm">
          {selectedKeys.size === assetsData.length && assetsData.length > 0
            ? "All items selected"
            : `${selectedKeys.size} of ${assetsData.length} selected`}
        </span>
        {!showAll && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <span className="text-sm">
              Page {page} of {pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.min(pages, page + 1))}
              disabled={page === pages}
            >
              Next
            </Button>
          </div>
        )}
        {showAll && (
          <span className="text-muted-foreground text-sm">
            Showing all {filteredItems.length} entries (virtual scroll)
          </span>
        )}
      </div>
    );
  }, [
    selectedKeys,
    page,
    pages,
    assetsData.length,
    showAll,
    filteredItems.length,
    setPage,
  ]);

  return (
    <div className="w-full space-y-4">
      {topContent}
      {/* Mobile: Card view */}
      <div className="block space-y-3 lg:hidden">
        {sortedItems.length === 0 ? (
          <div className="rounded-md border p-8 text-center">
            <p className="text-muted-foreground text-sm">No assets found</p>
          </div>
        ) : (
          sortedItems.map((item) => {
            const stat = status.find(
              (s) => s.statustypeid === item.statustypeid,
            );
            const cat = categories.find(
              (c) => c.assetcategorytypeid === item.assetcategorytypeid,
            );
            const dept = departments.find((d) => d.id === item.departmentId);
            const manu = manufacturers.find(
              (m) => m.manufacturerid === item.manufacturerid,
            );
            const userAssetEntry = userAssetsData.find(
              (ua) => ua.assetid === item.assetid,
            );
            const assignedUser = userAssetEntry
              ? user.find((u) => u.userid === userAssetEntry.userid)
              : null;
            const badgeVariant =
              statusColorMap[stat?.statustypename] || "default";
            const mobileAvailableStatusIds = new Set(
              status
                .filter((s: Record<string, unknown>) =>
                  String(s.statustypename ?? "")
                    .toLowerCase()
                    .includes("available"),
                )
                .map((s: Record<string, unknown>) => s.statustypeid),
            );
            const mobileIsAvailable =
              item.statustypeid &&
              mobileAvailableStatusIds.has(item.statustypeid);
            const mobileIsAssignedToMe =
              currentUserId &&
              userAssetsData.some(
                (ua: Record<string, unknown>) =>
                  ua.assetid === item.assetid && ua.userid === currentUserId,
              );
            const mobileCanRequest =
              !mobileIsAssignedToMe && (item.requestable || mobileIsAvailable);

            return (
              <Card key={item.assetid} className="overflow-hidden">
                <CardContent className="px-4 py-3">
                  <div className="mb-2 flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`assets/${item.assetid}/`}
                        className="text-sm font-semibold hover:underline"
                      >
                        {item.assetname}
                      </Link>
                      <p className="text-muted-foreground text-xs">
                        {item.assettag}
                      </p>
                    </div>
                    <Badge
                      className="ml-2 shrink-0 capitalize"
                      variant={badgeVariant}
                    >
                      {stat?.statustypename || "Unknown"}
                    </Badge>
                  </div>
                  <div className="space-y-1 text-xs sm:text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground shrink-0">
                        Asset ID
                      </span>
                      <span className="min-w-0 truncate text-right font-mono">
                        {item.assetid.slice(0, 8)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground shrink-0">
                        PID (Asset ID)
                      </span>
                      <span className="min-w-0 truncate text-right">
                        {item.serialnumber}
                      </span>
                    </div>
                    {cat && (
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground shrink-0">
                          Asset Type
                        </span>
                        <span className="min-w-0 truncate text-right">
                          {cat.assetcategorytypename}
                        </span>
                      </div>
                    )}
                    {item.reviewsDate && (
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground shrink-0">
                          Review Date
                        </span>
                        <span className="min-w-0 truncate text-right">
                          {new Date(item.reviewsDate).toLocaleDateString(
                            "en-US",
                            {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            },
                          )}
                        </span>
                      </div>
                    )}
                    {dept && (
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground shrink-0">
                          Department
                        </span>
                        <span className="min-w-0 truncate text-right">
                          {dept.code ? dept.code + " — " : ""}
                          {dept.name}
                        </span>
                      </div>
                    )}
                    {manu && (
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground shrink-0">
                          Brand
                        </span>
                        <span className="min-w-0 truncate text-right">
                          {manu.manufacturername}
                        </span>
                      </div>
                    )}
                    {assignedUser && (
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground shrink-0">
                          Assigned To
                        </span>
                        <span className="min-w-0 truncate text-right">
                          {assignedUser.firstname} {assignedUser.lastname}
                        </span>
                      </div>
                    )}
                    {item.remark && (
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground shrink-0">
                          Remark
                        </span>
                        <span className="min-w-0 truncate text-right">
                          {item.remark}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex items-center justify-end border-t pt-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/assets/${item.assetid}`}>
                            <EyeIcon className="mr-2 h-4 w-4" />
                            View Details
                          </Link>
                        </DropdownMenuItem>
                        {isAdmin && (
                          <DropdownMenuItem asChild>
                            <Link href={`/assets/${item.assetid}/edit`}>
                              <EditIcon className="mr-2 h-4 w-4" />
                              Edit
                            </Link>
                          </DropdownMenuItem>
                        )}
                        {isAdmin && (
                          <DropdownMenuItem
                            onClick={() => handleOpenModal(item, "assign")}
                            disabled={!item.requestable}
                          >
                            <AssignIcon className="mr-2 h-4 w-4" />
                            Assign User
                          </DropdownMenuItem>
                        )}
                        {!isAdmin && mobileCanRequest && (
                          <DropdownMenuItem
                            onClick={() => {
                              setRequestingAsset({
                                id: item.assetid,
                                name: item.assetname,
                              });
                              setRequestDialogOpen(true);
                            }}
                          >
                            <CalendarPlusIcon className="mr-2 h-4 w-4" />
                            Request
                          </DropdownMenuItem>
                        )}
                        {isAdmin && <DropdownMenuSeparator />}
                        {isAdmin && (
                          <DropdownMenuItem
                            onClick={() => handleOpenModal(item, "status")}
                          >
                            <Status className="mr-2 h-4 w-4" />
                            Change Status
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => handleOpenModal(item, "qrcode")}
                        >
                          <QrCode className="mr-2 h-4 w-4" />
                          QR Code
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleOpenModal(item, "label")}
                        >
                          <Label className="mr-2 h-4 w-4" />
                          Print Label
                        </DropdownMenuItem>
                        {isAdmin && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleOpenModal(item, "delete")}
                              className="text-destructive focus:text-destructive"
                            >
                              <DeleteIcon className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Desktop: Table view */}
      {showAll ? (
        <div
          ref={virtualScrollRef}
          className="hidden w-full overflow-auto rounded-md border lg:block"
          style={{ maxHeight: 600 }}
        >
          <Table>
            <TableHeader className="bg-background sticky top-0 z-10">
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={
                      sortedItems.length > 0 &&
                      sortedItems.every((i) => selectedKeys.has(i.assetid))
                    }
                    ref={(el) => {
                      if (el) {
                        const some = sortedItems.some((i) =>
                          selectedKeys.has(i.assetid),
                        );
                        const all =
                          sortedItems.length > 0 &&
                          sortedItems.every((i) => selectedKeys.has(i.assetid));
                        (el as unknown as HTMLInputElement).indeterminate =
                          some && !all;
                      }
                    }}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedKeys(
                          new Set(sortedItems.map((i) => i.assetid)),
                        );
                      } else {
                        setSelectedKeys(new Set());
                      }
                    }}
                  />
                </TableHead>
                {headerColumns.map((column) => (
                  <TableHead
                    key={column.uid}
                    className={[
                      column.uid === "actions" ? "text-center" : "",
                      HEADER_ALIGN[column.uid] || "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {column.name}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedItems.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={headerColumns.length + 1}
                    className="text-center"
                  >
                    No assets found
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {virtualizer.getVirtualItems().length > 0 && (
                    <tr>
                      <td
                        colSpan={headerColumns.length + 1}
                        style={{
                          height: virtualizer.getVirtualItems()[0].start,
                          padding: 0,
                        }}
                      />
                    </tr>
                  )}
                  {virtualizer.getVirtualItems().map((virtualRow) => {
                    const item = sortedItems[virtualRow.index];
                    return (
                      <TableRow
                        key={item.assetid}
                        data-index={virtualRow.index}
                        ref={virtualMeasureRef}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedKeys.has(item.assetid)}
                            onCheckedChange={(checked) => {
                              const next = new Set(selectedKeys);
                              if (checked) {
                                next.add(item.assetid);
                              } else {
                                next.delete(item.assetid);
                              }
                              setSelectedKeys(next);
                            }}
                          />
                        </TableCell>
                        {headerColumns.map((column) => (
                          <TableCell key={column.uid}>
                            {renderCell(item, column.uid)}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                  {virtualizer.getVirtualItems().length > 0 && (
                    <tr>
                      <td
                        colSpan={headerColumns.length + 1}
                        style={{
                          height:
                            virtualizer.getTotalSize() -
                            virtualizer.getVirtualItems()[
                              virtualizer.getVirtualItems().length - 1
                            ].end,
                          padding: 0,
                        }}
                      />
                    </tr>
                  )}
                </>
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="hidden w-full overflow-x-auto rounded-md border lg:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={
                      sortedItems.length > 0 &&
                      sortedItems.every((i) => selectedKeys.has(i.assetid))
                    }
                    ref={(el) => {
                      if (el) {
                        const some = sortedItems.some((i) =>
                          selectedKeys.has(i.assetid),
                        );
                        const all =
                          sortedItems.length > 0 &&
                          sortedItems.every((i) => selectedKeys.has(i.assetid));
                        (el as unknown as HTMLInputElement).indeterminate =
                          some && !all;
                      }
                    }}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedKeys(
                          new Set(sortedItems.map((i) => i.assetid)),
                        );
                      } else {
                        setSelectedKeys(new Set());
                      }
                    }}
                  />
                </TableHead>
                {headerColumns.map((column) => (
                  <TableHead
                    key={column.uid}
                    className={[
                      column.uid === "actions" ? "text-center" : "",
                      HEADER_ALIGN[column.uid] || "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {column.name}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedItems.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={headerColumns.length + 1}
                    className="text-center"
                  >
                    No assets found
                  </TableCell>
                </TableRow>
              ) : (
                sortedItems.map((item) => (
                  <TableRow key={item.assetid}>
                    <TableCell>
                      <Checkbox
                        checked={selectedKeys.has(item.assetid)}
                        onCheckedChange={(checked) => {
                          const next = new Set(selectedKeys);
                          if (checked) {
                            next.add(item.assetid);
                          } else {
                            next.delete(item.assetid);
                          }
                          setSelectedKeys(next);
                        }}
                      />
                    </TableCell>
                    {headerColumns.map((column) => (
                      <TableCell key={column.uid}>
                        {renderCell(item, column.uid)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
      {bottomContent}
      <Dialog open={isAssignModalOpen} onOpenChange={setIsAssignModalOpen}>
        <DialogContent className="sm:max-w-lg">
          {(() => {
            const assignedUser = userAssetsData.find(
              (ua) => ua.assetid === selectedAsset?.assetid,
            );
            const assignedUserId = assignedUser ? assignedUser.userid : null;

            return (
              <>
                <DialogHeader>
                  <DialogTitle>
                    {assignedUser && selectedAsset
                      ? `Update User for ${selectedAsset?.assetname} from ${
                          user.find(
                            (user) => user.userid === assignedUser.userid,
                          ).firstname
                        }`
                      : `Assign User to ${selectedAsset?.assetname}`}
                  </DialogTitle>
                </DialogHeader>
                <div className="py-4">
                  <Select
                    value={
                      selectedUser
                        ? String(selectedUser)
                        : assignedUserId
                          ? String(assignedUserId)
                          : ""
                    }
                    onValueChange={(value) =>
                      handleUserSelection(new Set([value]))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a user" />
                    </SelectTrigger>
                    <SelectContent>
                      {user.map((u) => (
                        <SelectItem key={u.userid} value={String(u.userid)}>
                          {u.firstname + " " + u.lastname}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsAssignModalOpen(false)}
                  >
                    Close
                  </Button>
                  {assignedUser ? (
                    <>
                      <Button
                        variant="destructive"
                        onClick={() => {
                          handleUnassign(
                            selectedAsset?.assetid,
                            assignedUser.userid,
                          );
                          setTimeout(() => {
                            setSelectedUser(null);
                          }, 500);
                          setIsAssignModalOpen(false);
                        }}
                      >
                        Remove
                      </Button>
                      <Button
                        disabled={!selectedUser}
                        onClick={() => {
                          handleAssign(selectedAsset?.assetid, selectedUser);
                          setTimeout(() => {
                            setSelectedUser(null);
                          }, 500);
                          setIsAssignModalOpen(false);
                        }}
                      >
                        Update
                      </Button>
                    </>
                  ) : (
                    <Button
                      disabled={!selectedUser}
                      onClick={() => {
                        handleAssign(selectedAsset?.assetid, selectedUser);
                        setTimeout(() => {
                          setSelectedUser(null);
                        }, 500);
                        setIsAssignModalOpen(false);
                      }}
                    >
                      Assign
                    </Button>
                  )}
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {deleteMode === "bulk"
                ? `Delete ${selectedKeys.size === assetsData.length ? assetsData.length : selectedKeys.size} selected item(s)?`
                : `Delete ${selectedAsset?.assetname || "this item"}?`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-muted-foreground text-sm">
              This action permanently removes the asset and its user assignment.
              This cannot be undone.
            </p>
            {deleteMode === "single" && selectedAsset
              ? (() => {
                  const assigned = userAssetsData.find(
                    (ua) => ua.assetid === selectedAsset.assetid,
                  );
                  if (!assigned) return null;
                  const u = user.find((x) => x.userid === assigned.userid);
                  return (
                    <p className="text-destructive text-sm">
                      This asset is currently assigned to{" "}
                      {u ? `${u.firstname} ${u.lastname}` : "a user"}.
                    </p>
                  );
                })()
              : null}
            {deleteMode === "bulk"
              ? (() => {
                  const ids = Array.from(selectedKeys);
                  const assignedCount = userAssetsData.filter((ua) =>
                    ids.includes(ua.assetid),
                  ).length;
                  if (!assignedCount) return null;
                  return (
                    <div className="flex flex-col gap-2">
                      <p className="text-destructive text-sm">
                        {assignedCount} selected item(s) are currently assigned
                        to users.
                      </p>
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={confirmAssigned}
                          onCheckedChange={(checked) =>
                            setConfirmAssigned(checked === true)
                          }
                        />
                        I understand and want to delete them anyway
                      </label>
                    </div>
                  );
                })()
              : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={
                deleteMode === "bulk" &&
                (() => {
                  const ids = Array.from(selectedKeys);
                  const assignedCount = userAssetsData.filter((ua) =>
                    ids.includes(ua.assetid),
                  ).length;
                  return assignedCount > 0 && !confirmAssigned;
                })()
              }
              onClick={async () => {
                if (deleteMode === "bulk") {
                  const ids = Array.from(selectedKeys);
                  for (const id of ids) {
                    await handleDelete(id);
                  }
                  setSelectedKeys(new Set());
                  setConfirmAssigned(false);
                } else if (selectedAsset) {
                  await handleDelete(selectedAsset.assetid);
                }
                setIsDeleteModalOpen(false);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isQRCodeModalOpen} onOpenChange={setIsQRCodeModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="bg-white text-black">
              QR-Code for {selectedAsset?.assettag}
            </DialogTitle>
          </DialogHeader>
          <div
            ref={qrRef}
            className="flex items-center justify-center bg-white py-4"
          >
            <QRCodeCanvas
              value={`${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/assets/${selectedAsset?.assetid}`}
              size={256}
              bgColor={"#ffffff"}
              fgColor={"#000000"}
              level={"H"}
              includeMargin={false}
            />
          </div>
          <DialogFooter className="bg-white">
            <Button
              variant="outline"
              onClick={() => setIsQRCodeModalOpen(false)}
            >
              Close
            </Button>
            <Button onClick={handleDownload}>Download</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isStatusModalOpen} onOpenChange={setIsStatusModalOpen}>
        <DialogContent className="sm:max-w-lg">
          {(() => {
            const assignedStatus = status.find(
              (stat) => stat.statustypeid === selectedAsset?.statustypeid,
            );

            const assignedUser = userAssetsData.find(
              (ua) => ua.assetid === selectedAsset?.assetid,
            );

            // Build the list of statuses allowed for this transition
            const currentStatusId = selectedAsset?.statustypeid;
            let allowedStatuses = status;

            if (hasTransitions && currentStatusId) {
              // Only show statuses that are valid transitions from the current status
              const allowedIds = new Set(
                statusTransitions
                  .filter((t) => t.fromStatusId === currentStatusId)
                  .map((t) => t.toStatusId),
              );
              allowedStatuses = status.filter((s) =>
                allowedIds.has(s.statustypeid),
              );
            }

            const disabledKeys = new Set(
              assignedStatus ? [assignedStatus.statustypeid] : [],
            );

            if (assignedUser) {
              const availableStatus = status.find(
                (stat) => stat.statustypename.toLowerCase() === "available",
              );
              if (availableStatus) {
                disabledKeys.add(availableStatus.statustypeid);
              }
            } else {
              const activeStatus = status.find(
                (stat) => stat.statustypename.toLowerCase() === "active",
              );
              if (activeStatus) {
                disabledKeys.add(activeStatus.statustypeid);
              }
            }

            return (
              <>
                <DialogHeader>
                  <DialogTitle>
                    {selectedAsset &&
                      `Update Status for ${selectedAsset?.assetname}`}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <Select
                    value={
                      selectedUser
                        ? String(selectedUser)
                        : assignedStatus
                          ? String(assignedStatus.statustypeid)
                          : ""
                    }
                    onValueChange={(value) => setSelectedUser(value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a status" />
                    </SelectTrigger>
                    <SelectContent>
                      {allowedStatuses.map((s) => (
                        <SelectItem
                          key={s.statustypeid}
                          value={String(s.statustypeid)}
                          disabled={disabledKeys.has(s.statustypeid)}
                        >
                          {s?.statustypename || "Unknown"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-muted-foreground text-sm">
                    <Info className="mr-1 inline" />
                    {hasTransitions
                      ? "Only statuses allowed by the configured workflow are shown."
                      : 'Note: The current status and "Available" status cannot be selected again. If the asset is not assigned to any user, it cannot be set to "Active."'}
                  </p>
                  {hasTransitions && allowedStatuses.length === 0 && (
                    <p className="text-destructive text-sm">
                      No status transitions are configured from the current
                      status. Contact an administrator.
                    </p>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsStatusModalOpen(false)}
                  >
                    Close
                  </Button>
                  <Button
                    disabled={
                      !selectedUser ||
                      (hasTransitions && allowedStatuses.length === 0)
                    }
                    onClick={async () => {
                      await handleStatusUpdate(
                        selectedAsset?.assetid,
                        selectedUser,
                      );
                      setTimeout(() => setSelectedUser(null), 300);
                      setIsStatusModalOpen(false);
                    }}
                  >
                    Update
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <PrintLabelDialog
        open={isLabelModalOpen}
        onOpenChange={setIsLabelModalOpen}
        assets={
          selectedAsset
            ? [selectedAsset]
            : assetsData.filter((a) => selectedKeys.has(a.assetid))
        }
        manufacturers={manufacturers}
        models={models}
        locations={locations}
        categories={categories}
      />

      <Dialog
        open={isBulkStatusModalOpen}
        onOpenChange={setIsBulkStatusModalOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Change Status for {selectedKeys.size} selected asset(s)
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Select value={bulkStatusId} onValueChange={setBulkStatusId}>
              <SelectTrigger>
                <SelectValue placeholder="Select new status" />
              </SelectTrigger>
              <SelectContent>
                {status.map((s) => (
                  <SelectItem key={s.statustypeid} value={s.statustypeid}>
                    {s.statustypename}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsBulkStatusModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={!bulkStatusId || bulkUpdating}
              onClick={handleBulkStatusChange}
            >
              {bulkUpdating ? "Updating..." : "Update Status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isBulkDepartmentModalOpen}
        onOpenChange={(open) => {
          setIsBulkDepartmentModalOpen(open);
          if (!open) {
            setBulkDepartmentStep("select");
            setBulkDepartmentId("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Change Department for {selectedKeys.size} selected asset(s)
            </DialogTitle>
          </DialogHeader>
          {bulkDepartmentStep === "select" ? (
            <>
              <div className="py-4">
                <Select
                  value={bulkDepartmentId}
                  onValueChange={setBulkDepartmentId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select new department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments
                      .filter((d) => d.isActive !== false)
                      .map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.code ? `${d.code} — ` : ""}
                          {d.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsBulkDepartmentModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  disabled={!bulkDepartmentId}
                  onClick={() => setBulkDepartmentStep("confirm")}
                >
                  Continue
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogDescription>
                You are about to assign{" "}
                <span className="font-medium">{selectedKeys.size}</span> selected
                asset(s) to{" "}
                <span className="font-medium">
                  {(() => {
                    const targetDept = departments.find(
                      (d) => d.id === bulkDepartmentId,
                    );
                    return targetDept
                      ? `${targetDept.code ? `${targetDept.code} — ` : ""}${targetDept.name}`
                      : "the selected department";
                  })()}
                </span>
                . This change is written to the audit log for every affected
                asset.
              </DialogDescription>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setBulkDepartmentStep("select")}
                >
                  Back
                </Button>
                <Button
                  disabled={bulkUpdating}
                  onClick={handleBulkDepartmentChange}
                >
                  {bulkUpdating ? "Updating..." : "Confirm Assignment"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {requestingAsset && (
        <RequestItemDialog
          entityType="asset"
          entityId={requestingAsset.id}
          entityName={requestingAsset.name}
          open={requestDialogOpen}
          onOpenChange={setRequestDialogOpen}
        />
      )}

      <Dialog open={returnDialogOpen} onOpenChange={setReturnDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Return</DialogTitle>
            <DialogDescription>
              Submit a return request for{" "}
              <span className="font-medium">{returningAsset?.name}</span>. An
              admin will confirm collection and complete the return.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReturnDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                try {
                  const res = await fetch("/api/requests", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      entityType: "asset",
                      entityId: returningAsset?.id,
                      notes: "Return request",
                      status: "return_pending",
                    }),
                  });
                  if (!res.ok) throw new Error();
                  toast.success("Return requested", {
                    description:
                      "An admin will collect the item and confirm the return",
                  });
                  setReturnDialogOpen(false);
                } catch {
                  toast.error("Failed to request return");
                }
              }}
            >
              Submit Return Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
