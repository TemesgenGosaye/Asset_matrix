"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveTable,
  type Column,
} from "@/components/ui/responsive-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CalendarDays,
  ClipboardCheck,
  Clock,
  Image as ImageIcon,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Star,
  Camera,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { formatDate, formatDateTime, fullName } from "@/ui/household/house-format";
import {
  HouseCategoryBadge,
  HouseholdStatusBadge,
} from "@/ui/household/house-status";
import type { InspectionWorklistView } from "@/lib/house-queue/views";
import type { HouseQueueCapabilities } from "../house-queue/HouseQueueClient";

const TERMINATION_LABELS: Record<string, string> = {
  TRANSFER: "Transfer",
  EMPLOYEE_LEAVE: "Employee leave",
  RETIREMENT: "Retirement",
};

const CHECKLIST_AREAS = [
  { key: "checklistWindow", label: "Window" },
  { key: "checklistDoor", label: "Door" },
  { key: "checklistWaterPanel", label: "Water panel" },
  { key: "checklistRoof", label: "Roof" },
  { key: "checklistWall", label: "Wall" },
  { key: "checklistElectricity", label: "Electricity" },
] as const;

// ---------------------------------------------------------------------------
// Review & complete dialog
// ---------------------------------------------------------------------------

function CompleteInspectionDialog({
  inspection,
  onOpenChange,
  onCompleted,
}: {
  inspection: InspectionWorklistView;
  onOpenChange: (open: boolean) => void;
  onCompleted: () => void;
}) {
  const [damages, setDamages] = useState<Record<string, boolean>>({});
  const [conditionNote, setConditionNote] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggle = (key: string) =>
    setDamages((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    const urls: string[] = [];
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      try {
        const res = await fetch(
          `/api/house-queue/inspections/${inspection.inspectionId}/photos`,
          { method: "POST", body: form },
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(body.error ?? "Photo upload failed");
          continue;
        }
        urls.push(body.photoUrl as string);
      } catch {
        setError("Photo upload failed");
      }
    }
    setPhotos((prev) => [...prev, ...urls]);
    setUploading(false);
  };

  const submit = async () => {
    setCompleting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/house-queue/inspections/${inspection.inspectionId}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            checklistWindow: damages.checklistWindow ?? false,
            checklistDoor: damages.checklistDoor ?? false,
            checklistWaterPanel: damages.checklistWaterPanel ?? false,
            checklistRoof: damages.checklistRoof ?? false,
            checklistWall: damages.checklistWall ?? false,
            checklistElectricity: damages.checklistElectricity ?? false,
            conditionNote: conditionNote.trim() || undefined,
          }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Failed to complete the inspection");
        return;
      }
      toast.success("Inspection completed and house resolved.");
      onCompleted();
      onOpenChange(false);
    } catch {
      setError("Network error");
    } finally {
      setCompleting(false);
    }
  };

  const damageCount = Object.values(damages).filter(Boolean).length;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review &amp; complete — {inspection.houseNumber}</DialogTitle>
          <DialogDescription>
            {inspection.hid} · {inspection.locationName ?? "Location not set"} —
            record damages and resolve the house.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[min(60vh,560px)] overflow-y-auto pr-1 -mr-1 space-y-4">
          {/* Check-list */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Damage checklist — tick any item that is damaged
            </p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {CHECKLIST_AREAS.map((area) => {
                const on = damages[area.key] ?? false;
                return (
                  <button
                    key={area.key}
                    type="button"
                    onClick={() => toggle(area.key)}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      on
                        ? "border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/40"
                        : "border-border bg-card hover:border-primary/50"
                    }`}
                  >
                    <span className="font-medium">{area.label}</span>
                    <Badge
                      variant={on ? "destructive" : "outline"}
                      className="gap-1 px-2 py-0.5"
                    >
                      {on && <X className="h-3 w-3" />}
                      {on ? "Damage" : "OK"}
                    </Badge>
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {damageCount > 0
                ? `${damageCount} damaged area${damageCount === 1 ? "" : "s"} →
                the house will be resolved Under Maintenance.`
                : "No damages marked — the house will resolve back to Active."}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="insp-condition"
              className="text-xs font-medium text-muted-foreground"
            >
              Condition note <span className="font-normal">(optional)</span>
            </Label>
            <Textarea
              id="insp-condition"
              value={conditionNote}
              onChange={(e) => setConditionNote(e.target.value)}
              placeholder="Describe any issues found during the handback inspection"
              className="min-h-16 text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              Copied onto the household as damage notes when resolving Under
              Maintenance.
            </p>
          </div>

          {/* Photos */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              Photos
            </Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              multiple
              className="hidden"
              onChange={(e) => void uploadFiles(e.target.files)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
              {uploading ? "Uploading…" : "Add photos"}
            </Button>
            <div className="flex flex-wrap gap-2">
              {(photos.length > 0 ? photos : previewUrls).map((url) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border bg-muted/40"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- authed proxied photo; next/image loader cannot */}
                  <img
                    src={url}
                    alt="Inspection photo"
                    className="h-full w-full object-cover"
                  />
                </a>
              ))}
              {photos.length === 0 && previewUrls.length === 0 && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ImageIcon className="h-3.5 w-3.5" />
                  No photos yet
                </div>
              )}
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={uploading || completing}
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={uploading || completing}
            className="gap-1.5"
          >
            {completing && <Loader2 className="h-4 w-4 animate-spin" />}
            <ClipboardCheck className="h-4 w-4" />
            Complete inspection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Worklist
// ---------------------------------------------------------------------------

interface InspectionsWorklistClientProps {
  initialData: InspectionWorklistView[];
  capabilities: HouseQueueCapabilities;
}

const columns: Column[] = [
  { key: "house", label: "House", hideable: false },
  { key: "category", label: "Category", align: "center" },
  { key: "location", label: "Location" },
  { key: "vacated", label: "Vacated" },
  { key: "former", label: "Former occupant" },
  { key: "inspector", label: "Inspector", align: "center" },
  { key: "scheduled", label: "Scheduled", align: "center" },
  { key: "houseStatus", label: "House status", align: "center" },
  { key: "resolution", label: "Resolution", align: "center" },
  { key: "photos", label: "Photos", align: "center" },
  { key: "actions", label: "", hideable: false },
];

export default function InspectionsWorklistClient({
  initialData,
  capabilities,
}: InspectionsWorklistClientProps) {
  const [rows, setRows] = useState<InspectionWorklistView[]>(initialData);
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "resolved">(
    "open",
  );
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeRow, setActiveRow] = useState<InspectionWorklistView | null>(
    null,
  );
  const firstRun = useRef(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (search.trim()) params.set("search", search.trim());
    try {
      const res = await fetch(`/api/house-queue/inspections?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Failed to load inspections");
        return;
      }
      const data = (await res.json()) as { inspections: InspectionWorklistView[] };
      setRows(data.inspections);
    } catch {
      if (!silent) toast.error("Failed to load inspections");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [statusFilter, search]);

  // Deferred fetch on filter / search changes (skip the initial render).
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const t = setTimeout(() => void load(), 300);
    return () => clearTimeout(t);
  }, [statusFilter, search, load]);

  const counts = useMemo(() => {
    const open = rows.filter((r) => !r.resolvedTo).length;
    return {
      open,
      unscheduled: rows.filter((r) => !r.resolvedTo && !r.scheduledDate).length,
      scheduled: rows.filter((r) => !r.resolvedTo && !!r.scheduledDate).length,
      resolved: rows.length - open,
      total: rows.length,
      damaged: rows.filter((r) => r.houseStatus === "UnderMaintenance").length,
    };
  }, [rows]);

  /** Whole-day offset from today to a YYYY-MM-DD date (negative = overdue). */
  const daysFromToday = (dateStr: string) => {
    const target = new Date(`${dateStr}T12:00:00`);
    const today = new Date(`${new Date().toISOString().slice(0, 10)}T12:00:00`);
    return Math.round((target.getTime() - today.getTime()) / 86_400_000);
  };

  const renderCell = (item: InspectionWorklistView, key: string) => {
    switch (key) {
      case "house":
        return (
          <div>
            <div className="font-semibold">{item.houseNumber}</div>
            <div className="text-xs text-muted-foreground">{item.hid}</div>
          </div>
        );
      case "category":
        return <HouseCategoryBadge category={item.houseType} />;
      case "location":
        return (
          <div className="flex items-center gap-1 text-sm">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{item.locationName ?? "—"}</span>
          </div>
        );
      case "vacated":
        return (
          <div className="text-sm">
            <Badge variant="outline" className="font-semibold">
              {TERMINATION_LABELS[item.terminationReason ?? ""] ?? item.terminationReason ?? "—"}
            </Badge>
            <div className="mt-0.5 whitespace-nowrap text-xs text-muted-foreground">
              {item.vacatedAt ? formatDate(item.vacatedAt) : "—"}
            </div>
          </div>
        );
      case "former":
        return item.employee ? (
          <div>
            <div className="font-medium">{fullName(item.employee)}</div>
            <div className="text-xs text-muted-foreground">
              {item.employee.employeeNumber}
            </div>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        );
      case "inspector":
        return (
          <span className="text-sm">{item.inspectorName ?? "—"}</span>
        );
      case "scheduled": {
        if (item.scheduledDate) {
          const diff = daysFromToday(item.scheduledDate);
          return (
            <div>
              <div className="flex items-center gap-1.5">
                <span className="whitespace-nowrap text-sm font-medium">
                  {formatDate(item.scheduledDate)}
                </span>
                <Badge
                  variant={diff < 0 ? "destructive" : diff === 0 ? "warning" : "default"}
                  className="whitespace-nowrap px-1.5 py-0 text-[10px] font-semibold"
                >
                  {diff < 0 ? `${-diff}d overdue` : diff === 0 ? "today" : `in ${diff}d`}
                </Badge>
              </div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                {item.inspectorName ? `Inspector: ${item.inspectorName}` : "No inspector assigned"}
              </div>
            </div>
          );
        }
        const pendingDays = item.vacatedAt
          ? Math.max(1, Math.round(
              (new Date().getTime() - new Date(item.vacatedAt).getTime()) / 86_400_000,
            ) + 1)
          : 0;
        return (
          <div>
            <div className="flex justify-center">
              <Badge variant="warning" className="whitespace-nowrap">
                Unscheduled
              </Badge>
            </div>
            <div className="mt-0.5 text-center text-[10px] text-muted-foreground">
              {pendingDays > 0 ? `${pendingDays}d pending` : "pending"}
            </div>
          </div>
        );
      }
      case "houseStatus":
        return <HouseholdStatusBadge status={item.houseStatus} />;
      case "resolution":
        return item.completedAt ? (
          <div>
            <Badge variant="success" className="gap-1">
              <Star className="h-3 w-3" />
              {item.resolvedTo ?? "Resolved"}
            </Badge>
            <div className="mt-0.5 whitespace-nowrap text-[10px] text-muted-foreground">
              {formatDateTime(item.completedAt)}
            </div>
          </div>
        ) : (
          <Badge variant="warning">Pending</Badge>
        );
      case "photos":
        return (
          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
            <ImageIcon className="h-3.5 w-3.5" />
            {item.photoCount}
          </span>
        );
      case "actions":
        return item.resolvedTo ? (
          <Button variant="ghost" size="sm" className="h-8" disabled>
            Completed
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1"
            onClick={() => setActiveRow(item)}
            disabled={!capabilities.manage}
          >
            <ClipboardCheck className="h-3.5 w-3.5" />
            Review &amp; complete
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
          <h1 className="text-2xl font-bold tracking-tight">Inspections</h1>
          <div className="mt-1 h-0.5 w-16 rounded bg-gradient-to-r from-brass-400 to-transparent" />
          <p className="mt-2 text-sm text-muted-foreground">
            Handback inspections raised by the Release Workflow. Completing an
            inspection resolves the house back to the Active pool or into
            maintenance.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Pending</span>
            <ClipboardCheck className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-bold">{counts.open}</div>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Unscheduled
            </span>
            <Clock className="h-4 w-4 text-orange-500" />
          </div>
          <div className="mt-2 text-2xl font-bold">{counts.unscheduled}</div>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {counts.unscheduled === 0
              ? "All assigned"
              : "Need an inspector + date"}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Scheduled
            </span>
            <CalendarDays className="h-4 w-4 text-sky-600" />
          </div>
          <div className="mt-2 text-2xl font-bold">{counts.scheduled}</div>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {counts.scheduled === 0 ? "None booked" : "Awaiting inspection"}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Resolved</span>
            <Star className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold">{counts.resolved}</div>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Under maintenance
            </span>
            <X className="h-4 w-4 text-violet-500" />
          </div>
          <div className="mt-2 text-2xl font-bold">{counts.damaged}</div>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Photos</span>
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-2 text-2xl font-bold">
            {rows.reduce((acc, r) => acc + r.photoCount, 0)}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search house, HID, location, occupant…"
            className="pl-9 text-xs"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | "open" | "resolved")}>
          <SelectTrigger className="h-8 w-[150px] text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Pending only</SelectItem>
            <SelectItem value="resolved">Resolved only</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <ResponsiveTable
        columns={columns}
        data={rows}
        renderCell={renderCell}
        keyExtractor={(row) => row.inspectionId}
        mobileCardView
        minWidth="1150px"
        emptyMessage="No inspections matching this filter"
        emptyDescription="Vacate a house through the House Queue release workflow to raise an inspection."
      />

      {activeRow && (
        <CompleteInspectionDialog
          inspection={activeRow}
          onOpenChange={(open) => !open && setActiveRow(null)}
          onCompleted={() => void load(true)}
        />
      )}
    </div>
  );
}