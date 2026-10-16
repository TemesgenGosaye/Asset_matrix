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
import {
  formatDate,
  formatDateTime,
  fullName,
} from "@/ui/household/house-format";
import {
  HouseCategoryBadge,
  HouseholdStatusBadge,
} from "@/ui/household/house-status";
import type { TerminatedHouseView } from "@/lib/house-queue/views";
import { canPrintHouseReceipt } from "@/lib/house-queue/receipt-gate";
import { TerminationReceiptButton } from "./TerminationReceiptButton";

interface TerminatedHousesClientProps {
  initialData: TerminatedHouseView[];
  /** `house_queue:manage` — the permission the receipts endpoint enforces. */
  canPrint: boolean;
}

const REASON_META: Record<string, { label: string; className: string }> = {
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

export function TerminationReasonBadge({ reason }: { reason: string | null }) {
  if (!reason) return <Badge variant="outline">—</Badge>;
  const meta = REASON_META[reason] ?? REASON_META.RETIREMENT;
  return (
    <Badge variant="outline" className={meta.className}>
      {meta.label}
    </Badge>
  );
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
  canPrint,
}: TerminatedHousesClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [reasonFilter, setReasonFilter] = useState("all");
  const [refreshing, setRefreshing] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initialData.filter((row) => {
      const matchesReason =
        reasonFilter === "all" || row.terminationReason === reasonFilter;
      const haystack = [
        row.house?.houseNumber,
        row.house?.hid,
        row.employee?.firstname,
        row.employee?.lastname,
        row.employee?.employeeNumber,
        row.employee?.department?.name,
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
              {item.employee.firstname.charAt(0).toUpperCase()}
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
      case "reason":
        return <TerminationReasonBadge reason={item.terminationReason} />;
      case "note":
        return (
          <span className="text-muted-foreground max-w-[220px] truncate text-sm">
            {item.note ?? "—"}
          </span>
        );
      case "terminatedOn":
        return (
          <span className="text-muted-foreground text-sm whitespace-nowrap">
            {item.terminatedAt ? formatDateTime(item.terminatedAt) : "—"}
          </span>
        );
      case "status":
        return (
          <div className="flex flex-col items-center gap-1">
            <HouseholdStatusBadge status={item.house?.status ?? null} />
            <span className="text-muted-foreground text-[10px]">
              Occupancy: {item.house?.occupancyStatus ?? "—"}
            </span>
          </div>
        );
      case "actions": {
        // The archive prints the SAME document the Inspections page prints: the
        // one receipt in this app, snapshot from the handback inspection and
        // frozen on first print. There is deliberately no archive-only variant —
        // a second template would need its own upkeep and would be the one that
        // silently stopped agreeing with the inspection it reports.
        //
        // The gate is applied here so the refusal reads as a withheld button with
        // a reason, and again on the endpoint, which is what actually decides.
        const gate = canPrintHouseReceipt({
          variant: "handback",
          inspection: item.inspection,
        });
        return (
          <TerminationReceiptButton
            inspection={
              item.inspection
                ? {
                    inspectionId: item.inspection.id,
                    allocationId: item.allocationId,
                    houseNumber: item.house?.houseNumber ?? "—",
                    hid: item.house?.hid ?? "—",
                    vacatedAt: item.terminatedAt,
                    employee: item.employee,
                  }
                : null
            }
            disabled={!canPrint}
            blockedReason={
              gate.allowed
                ? null
                : canPrint
                  ? gate.message
                  : "You do not have permission to print house receipts."
            }
          />
        );
      }
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
          <div className="from-brass-400 mt-1 h-0.5 w-16 rounded bg-gradient-to-r to-transparent" />
          <p className="text-muted-foreground mt-2 text-sm">
            Archived, reason-coded releases. Every termination records who, when
            and why the allocation ended.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()}>
          <RefreshCw
            className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"}
          />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="bg-card rounded-xl border p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">
              Total terminations
            </span>
            <Archive className="text-muted-foreground h-4 w-4" />
          </div>
          <div className="mt-2 text-2xl font-bold">{initialData.length}</div>
        </div>
        <div className="bg-card rounded-xl border p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">
              Transfers
            </span>
            <DoorOpen className="h-4 w-4 text-sky-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-sky-600 dark:text-sky-400">
            {counts.TRANSFER}
          </div>
        </div>
        <div className="bg-card rounded-xl border p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">
              Employee leave
            </span>
            <UserMinus className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-400">
            {counts.EMPLOYEE_LEAVE}
          </div>
        </div>
        <div className="bg-card rounded-xl border p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">
              Retirements
            </span>
            <Building2 className="h-4 w-4 text-slate-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-600 dark:text-slate-300">
            {counts.RETIREMENT}
          </div>
        </div>
      </div>

      <div className="bg-card flex flex-col gap-3 rounded-xl border p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
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
    </div>
  );
}
