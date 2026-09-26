"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ResponsiveTable, type Column } from "@/components/ui/responsive-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Archive,
  DoorOpen,
  Printer,
  RefreshCw,
  Search,
  UserMinus,
  Building2,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate, formatDateTime, fullName } from "@/ui/household/house-format";
import {
  HouseCategoryBadge,
  HouseholdStatusBadge,
} from "@/ui/household/house-status";
import type { TerminatedHouseView } from "@/lib/house-queue/views";
import AllocationReceiptPrint from "./AllocationReceiptPrint";

interface TerminatedHousesClientProps {
  initialData: TerminatedHouseView[];
}

const REASON_META: Record<
  string,
  { label: string; className: string }
> = {
  TRANSFER: {
    label: "Transfer",
    className:
      "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800",
  },
  EMPLOYEE_LEAVE: {
    label: "Employee Leave",
    className:
      "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  },
  RETIREMENT: {
    label: "Retirement",
    className:
      "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800",
  },
};

export function TerminationReasonBadge({
  reason,
}: {
  reason: string | null;
}) {
  if (!reason) return <Badge variant="outline">—</Badge>;
  const meta = REASON_META[reason] ?? REASON_META.RETIREMENT;
  return <Badge variant="outline" className={meta.className}>{meta.label}</Badge>;
}

const columns: Column[] = [
  { key: "srNo", label: "#", hideable: false, align: "right" },
  { key: "house", label: "House", hideable: false },
  { key: "category", label: "Category", align: "center" },
  { key: "occupant", label: "Former Occupant", hideable: false },
  { key: "grade", label: "Grade", align: "center" },
  { key: "department", label: "Department" },
  { key: "reason", label: "Termination Reason", align: "center" },
  { key: "note", label: "Note" },
  { key: "terminatedOn", label: "Terminated On" },
  { key: "status", label: "Status", align: "center" },
  { key: "actions", label: "", hideable: false, align: "right" },
];

export default function TerminatedHousesClient({
  initialData,
}: TerminatedHousesClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [reasonFilter, setReasonFilter] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  const [receiptRow, setReceiptRow] = useState<TerminatedHouseView | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initialData.filter((row) => {
      const matchesReason =
        reasonFilter === "all" || row.terminationReason === reasonFilter;
      const haystack = [
        row.house?.houseNumber,
        row.house?.hid,
        row.employee.firstname,
        row.employee.lastname,
        row.employee.employeeNumber,
        row.employee.department?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesSearch = !q || haystack.includes(q);
      return matchesReason && matchesSearch;
    });
  }, [initialData, search, reasonFilter]);

  const counts = useMemo(() => {
    const by = { TRANSFER: 0, EMPLOYEE_LEAVE: 0, RETIREMENT: 0 };
    for (const row of initialData) {
      if (row.terminationReason && row.terminationReason in by) {
        by[row.terminationReason as keyof typeof by] += 1;
      }
    }
    return by;
  }, [initialData]);

  const refresh = async () => {
    setRefreshing(true);
    router.refresh();
    setRefreshing(false);
  };

  const renderCell = (item: TerminatedHouseView, key: string) => {
    switch (key) {
      case "srNo":
        return (
          <span className="tabular-nums text-muted-foreground">
            {filtered.indexOf(item) + 1}
          </span>
        );
      case "house":
        return (
          <div>
            <div className="font-semibold">{item.house?.houseNumber ?? "—"}</div>
            <div className="text-xs text-muted-foreground">
              {item.house?.hid ?? "—"}
            </div>
          </div>
        );
      case "category":
        return <HouseCategoryBadge category={item.house?.houseType ?? null} />;
      case "occupant":
        return (
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
              {item.employee.firstname.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-semibold">{fullName(item.employee)}</div>
              <div className="text-xs text-muted-foreground">
                {item.employee.employeeNumber}
              </div>
            </div>
          </div>
        );
      case "grade":
        return item.employee.jobGrade != null ? (
          <span className="font-semibold tabular-nums">
            {item.employee.jobGrade}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      case "department":
        return (
          <span className="text-sm">
            {item.employee.department?.name ?? "—"}
          </span>
        );
      case "reason":
        return <TerminationReasonBadge reason={item.terminationReason} />;
      case "note":
        return (
          <span className="text-sm text-muted-foreground max-w-[220px] truncate">
            {item.note ?? "—"}
          </span>
        );
      case "terminatedOn":
        return (
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {item.terminatedAt ? formatDateTime(item.terminatedAt) : "—"}
          </span>
        );
      case "status":
        return (
          <div className="flex flex-col items-center gap-1">
            <HouseholdStatusBadge status={item.house?.status ?? null} />
            <span className="text-[10px] text-muted-foreground">
              Occupancy: {item.house?.occupancyStatus ?? "—"}
            </span>
          </div>
        );
      case "actions":
        return (
          <Button
            variant="outline"
            size="sm"
            title="Print handback confirmation"
            onClick={() => setReceiptRow(item)}
          >
            <Printer className="h-4 w-4" />
          </Button>
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
            Terminated Houses
          </h1>
          <div className="mt-1 h-0.5 w-16 rounded bg-gradient-to-r from-brass-400 to-transparent" />
          <p className="mt-2 text-sm text-muted-foreground">
            Archived, reason-coded releases. Every termination records who, when
            and why the allocation ended.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()}>
          <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Total terminations
            </span>
            <Archive className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-2 text-2xl font-bold">{initialData.length}</div>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Transfers
            </span>
            <DoorOpen className="h-4 w-4 text-sky-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-sky-600 dark:text-sky-400">
            {counts.TRANSFER}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Employee leave
            </span>
            <UserMinus className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-400">
            {counts.EMPLOYEE_LEAVE}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Retirements
            </span>
            <Building2 className="h-4 w-4 text-slate-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-600 dark:text-slate-300">
            {counts.RETIREMENT}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search house, occupant, department…"
            className="pl-9 text-xs"
          />
        </div>
        <Select value={reasonFilter} onValueChange={setReasonFilter}>
          <SelectTrigger className="h-8 w-[190px] text-xs">
            <SelectValue placeholder="Termination reason" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All reasons</SelectItem>
            <SelectItem value="TRANSFER">Transfer</SelectItem>
            <SelectItem value="EMPLOYEE_LEAVE">Employee Leave</SelectItem>
            <SelectItem value="RETIREMENT">Retirement</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <ResponsiveTable
        columns={columns}
        data={filtered}
        renderCell={renderCell}
        keyExtractor={(row) => row.allocationId}
        mobileCardView
        minWidth="1100px"
        emptyMessage={
          search || reasonFilter !== "all"
            ? "No matching terminations"
            : "No terminated allocations yet"
        }
        emptyDescription={
          search || reasonFilter !== "all"
            ? "Adjust your filters."
            : "Release an allocation with a reason code in the House Queue to see it here."
        }
      />

      {/* ─── Print-only handback confirmation (OF/MSF/HRSM/293) ─── */}
      {receiptRow && (
        <AllocationReceiptPrint
          detail={{ ...receiptRow, status: "terminated" }}
          open
          onClose={() => setReceiptRow(null)}
        />
      )}
    </div>
  );
}