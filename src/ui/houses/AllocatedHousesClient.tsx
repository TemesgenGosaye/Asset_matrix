"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ResponsiveTable, type Column } from "@/components/ui/responsive-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Home,
  KeyRound,
  Users,
  ArrowRight,
  Search,
  RefreshCw,
  MapPin,
} from "lucide-react";
import { formatDate, fullName } from "@/ui/household/house-format";
import {
  HouseCategoryBadge,
  QueueStatusBadge,
} from "@/ui/household/house-status";
import type { AllocatedHouseView } from "@/lib/house-queue/views";
import type { HouseQueueCapabilities } from "../house-queue/HouseQueueClient";

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
  { key: "department", label: "Department" },
  { key: "priority", label: "Priority", align: "center" },
  { key: "allocatedOn", label: "Allocated On" },
  { key: "status", label: "Status", align: "center" },
  { key: "actions", label: "", hideable: false },
];

export default function AllocatedHousesClient({
  initialData,
  capabilities,
}: AllocatedHousesClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return initialData;
    return initialData.filter((row) => {
      const haystack = [
        row.house?.houseNumber,
        row.house?.hid,
        row.house?.locationName,
        row.employee.firstname,
        row.employee.lastname,
        row.employee.employeeNumber,
        row.employee.department?.name,
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

  const renderCell = (item: AllocatedHouseView, key: string) => {
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
      case "location":
        return (
          <div className="flex items-center gap-1 text-sm">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{item.house?.locationName ?? "—"}</span>
          </div>
        );
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
      case "priority":
        return (
          <span className="tabular-nums text-sm">
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
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {formatDate(item.decidedAt)}
          </span>
        );
      case "status":
        return (
          <div className="flex flex-col items-center gap-1">
            <QueueStatusBadge status="allocated" />
            <span className="text-[10px] text-muted-foreground">
              Occupancy: {item.house?.occupancyStatus ?? "—"}
            </span>
          </div>
        );
      case "actions":
        return (
          <Button asChild variant="ghost" size="sm" className="h-8 gap-1">
            <Link href={`/houses/allocated/${item.allocationId}`}>
              <ArrowRight className="h-3.5 w-3.5" />
              Open
            </Link>
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
          <h1 className="text-2xl font-bold tracking-tight">Allocated Houses</h1>
          <div className="mt-1 h-0.5 w-16 rounded bg-gradient-to-r from-brass-400 to-transparent" />
          <p className="mt-2 text-sm text-muted-foreground">
            Live allocation records — every row is a decision made once by the
            House Queue and instantly visible here.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()}>
          <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-3">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Live allocations
            </span>
            <KeyRound className="h-4 w-4 text-blue-600" />
          </div>
          <div className="mt-2 text-2xl font-bold">{initialData.length}</div>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Houses occupied
            </span>
            <Home className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold">
            {initialData.filter((r) => r.house?.occupancyStatus === "Occupied")
              .length}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Occupants
            </span>
            <Users className="h-4 w-4 text-purple-500" />
          </div>
          <div className="mt-2 text-2xl font-bold">
            {new Set(initialData.map((r) => r.employee.id)).size}
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
      </div>

      <ResponsiveTable
        columns={columns}
        data={filtered}
        renderCell={renderCell}
        keyExtractor={(row) => row.allocationId}
        mobileCardView
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
    </div>
  );
}