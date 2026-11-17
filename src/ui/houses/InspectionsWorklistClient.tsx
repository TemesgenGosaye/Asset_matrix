"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ResponsiveTable, type Column } from "@/components/ui/responsive-table";
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
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Image as ImageIcon,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Star,
  Camera,
  X,
  MoreVertical,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { notify } from "@/lib/feedback/notify";
import {
  exportBrandedTable,
  type BrandedTableColumn,
  type BrandedTableFormat,
} from "@/lib/house-admin/export";
import {
  formatDate,
  formatDateTime,
  fullName,
} from "@/ui/household/house-format";
import {
  HouseCategoryBadge,
  HouseholdStatusBadge,
} from "@/ui/household/house-status";
import type { InspectionWorklistView } from "@/lib/house-queue/views";
import {
  DAMAGE_ITEMS,
  formatEtb,
  runningDamageTotal,
  validateDamage,
} from "@/lib/house-queue/damage";
import {
  DamageChecklistEditor,
  DamageChecklistReadonly,
  emptyDamageChecklist,
  type DamageChecklistValues,
} from "./DamageChecklist";
import { TerminationReceiptButton } from "./TerminationReceiptButton";
import type { HouseQueueCapabilities } from "../house-queue/HouseQueueClient";

const TERMINATION_LABELS: Record<string, string> = {
  TRANSFER: "Transfer",
  EMPLOYEE_LEAVE: "Employee leave",
  RETIREMENT: "Retirement",
};

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
  const [damages, setDamages] = useState<DamageChecklistValues>(
    emptyDamageChecklist(),
  );
  const [bedCount, setBedCount] = useState<number>(0);
  const [chairsCount, setChairsCount] = useState<number>(0);
  const [lockerCount, setLockerCount] = useState<number>(0);
  const [tablesCount, setTablesCount] = useState<number>(0);
  const [conditionNote, setConditionNote] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [issued, setIssued] = useState<{
    resolvedTo: "Active" | "UnderMaintenance";
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setIssued(null);
    try {
      const damage = validateDamage(
        Object.fromEntries(
          DAMAGE_ITEMS.map((i) => [i.stateKey, damages.state[i.key]]),
        ),
        Object.fromEntries(
          DAMAGE_ITEMS.map((i) => [i.costKey, damages.costs[i.key]]),
        ),
      );
      if (damage.errors.length > 0) {
        setError(damage.errors[0]);
        return;
      }

      const res = await fetch(
        `/api/house-queue/inspections/${inspection.inspectionId}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            checklistWindow: damages.state.window ?? false,
            checklistDoor: damages.state.door ?? false,
            checklistWaterPanel: damages.state.waterPanel ?? false,
            checklistRoof: damages.state.roof ?? false,
            checklistWall: damages.state.wall ?? false,
            checklistElectricity: damages.state.electricity ?? false,
            checklistBedCount: bedCount,
            checklistChairsCount: chairsCount,
            checklistLockerCount: lockerCount,
            checklistTablesCount: tablesCount,
            costWindow: damages.costs.window,
            costDoor: damages.costs.door,
            costWaterPanel: damages.costs.waterPanel,
            costRoof: damages.costs.roof,
            costWall: damages.costs.wall,
            costElectricity: damages.costs.electricity,
            conditionNote: conditionNote.trim() || undefined,
          }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Failed to complete the inspection");
        return;
      }
      setIssued({ resolvedTo: body.result.resolvedTo });
      notify.success("Inspection marked as completed.");
      onCompleted();
    } catch {
      setError("Network error");
    } finally {
      setCompleting(false);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Inspection Checklist — House {inspection.houseNumber}
          </DialogTitle>
          <DialogDescription>
            {inspection.hid} · {inspection.locationName ?? "Location not set"} —
            check damaged parts, inside items, and record notes.
          </DialogDescription>
        </DialogHeader>

        <div className="-mr-1 max-h-[min(60vh,560px)] space-y-4 overflow-y-auto pr-1">
          {/* Check-list: Damaged parts */}
          <div>
            <Label className="text-muted-foreground mb-2 block text-xs font-semibold tracking-wider uppercase">
              Damaged Parts Checklist
            </Label>
            <DamageChecklistEditor
              values={damages}
              onChange={setDamages}
              disabled={completing}
            />
          </div>

          {/* Inside items */}
          <div className="space-y-2 rounded-lg border p-3">
            <Label className="text-muted-foreground block text-xs font-semibold tracking-wider uppercase">
              Inside Items Count
            </Label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="space-y-1">
                <Label htmlFor="bed-count" className="text-xs">
                  Beds
                </Label>
                <Input
                  id="bed-count"
                  type="number"
                  min="0"
                  value={bedCount}
                  onChange={(e) => setBedCount(parseInt(e.target.value) || 0)}
                  disabled={completing}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="chairs-count" className="text-xs">
                  Chairs
                </Label>
                <Input
                  id="chairs-count"
                  type="number"
                  min="0"
                  value={chairsCount}
                  onChange={(e) =>
                    setChairsCount(parseInt(e.target.value) || 0)
                  }
                  disabled={completing}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="locker-count" className="text-xs">
                  Lockers
                </Label>
                <Input
                  id="locker-count"
                  type="number"
                  min="0"
                  value={lockerCount}
                  onChange={(e) =>
                    setLockerCount(parseInt(e.target.value) || 0)
                  }
                  disabled={completing}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tables-count" className="text-xs">
                  Tables
                </Label>
                <Input
                  id="tables-count"
                  type="number"
                  min="0"
                  value={tablesCount}
                  onChange={(e) =>
                    setTablesCount(parseInt(e.target.value) || 0)
                  }
                  disabled={completing}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="insp-condition"
              className="text-muted-foreground text-xs font-medium"
            >
              Condition Notes <span className="font-normal">(optional)</span>
            </Label>
            <Textarea
              id="insp-condition"
              value={conditionNote}
              onChange={(e) => setConditionNote(e.target.value)}
              placeholder="Describe house condition or observations from inspection"
              className="min-h-16 text-sm"
              disabled={completing}
            />
          </div>

          {/* Photos */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs font-medium">
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
              disabled={uploading || completing}
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
                  className="bg-muted/40 flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt="Inspection photo"
                    className="h-full w-full object-cover"
                  />
                </a>
              ))}
            </div>
          </div>

          {issued && (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/40">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                <CheckCircle2 className="h-4 w-4" />
                Inspection Completed & Release Finalised
              </div>
              <p className="mt-2 text-xs text-emerald-800 dark:text-emerald-300">
                The inspection for House {inspection.houseNumber} has been
                marked as COMPLETED (Findings:{" "}
                {issued.resolvedTo === "UnderMaintenance"
                  ? "Damage recorded"
                  : "No damage"}
                ). The release has been atomically finalised and the allocation
                archived.
              </p>
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {issued ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
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
                Mark as Completed
              </Button>
            </>
          )}
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
  { key: "handback", label: "Handback", align: "center" },
  { key: "damage", label: "Damage assessment", align: "left" },
  { key: "resolution", label: "Resolution", align: "center" },
  { key: "photos", label: "Photos", align: "center" },
  { key: "actions", label: "", hideable: false },
];

/** One-line damage summary for the export: count + priced total. */
function damageSummary(r: InspectionWorklistView): string {
  if (!r.completedAt) return "Recorded on completion";
  const damagedCount = DAMAGE_ITEMS.filter(
    (i) => r.damage.state[i.stateKey],
  ).length;
  if (damagedCount === 0) return "No damage";
  return `${damagedCount} damaged · ${formatEtb(
    runningDamageTotal(r.damage.state, r.damage.costs),
  )}`;
}

const EXPORT_COLUMNS: BrandedTableColumn<InspectionWorklistView>[] = [
  { header: "#", align: "right", width: 0.4, value: (_r, i) => String(i + 1) },
  { header: "House No.", width: 1.0, value: (r) => r.houseNumber },
  { header: "HID", width: 1.3, value: (r) => r.hid },
  {
    header: "Category",
    align: "center",
    width: 0.8,
    value: (r) => r.houseType,
  },
  { header: "Location", width: 1.3, value: (r) => r.locationName ?? "—" },
  {
    header: "Reason",
    align: "center",
    width: 1.0,
    value: (r) =>
      r.terminationReason
        ? (TERMINATION_LABELS[r.terminationReason] ?? r.terminationReason)
        : "—",
  },
  {
    header: "Vacated On",
    width: 1.1,
    value: (r) => (r.vacatedAt ? formatDate(r.vacatedAt) : "—"),
  },
  {
    header: "Former Occupant",
    width: 1.8,
    value: (r) => (r.employee ? fullName(r.employee) : "—"),
  },
  {
    header: "Emp ID",
    width: 1.1,
    value: (r) => r.employee?.employeeNumber ?? "—",
  },
  {
    header: "Inspector",
    width: 1.2,
    value: (r) => r.inspectorName ?? "Unassigned",
  },
  {
    header: "Scheduled",
    width: 1.1,
    value: (r) =>
      r.scheduledDate ? formatDate(r.scheduledDate) : "Unscheduled",
  },
  {
    header: "House Status",
    align: "center",
    width: 1.1,
    value: (r) => r.houseStatus,
  },
  {
    header: "Resolution",
    align: "center",
    width: 1.1,
    value: (r) => r.resolvedTo ?? "Pending",
  },
  {
    header: "Completed On",
    width: 1.2,
    value: (r) => (r.completedAt ? formatDateTime(r.completedAt) : "—"),
  },
  { header: "Damage", width: 1.6, value: (r) => damageSummary(r) },
  {
    header: "Photos",
    align: "center",
    width: 0.6,
    value: (r) => String(r.photoCount),
  },
];

export default function InspectionsWorklistClient({
  initialData,
  capabilities,
}: InspectionsWorklistClientProps) {
  const [rows, setRows] = useState<InspectionWorklistView[]>(initialData);
  /**
   * Which section is showing. There is no "all" view on purpose: a completed
   * inspection is a permanent record and lives in its own section, so it is
   * always reachable rather than hidden behind a filter someone can change.
   */
  const [statusFilter, setStatusFilter] = useState<"open" | "resolved">("open");
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const submitSearch = useCallback(() => {
    setSearch(searchDraft.trim());
  }, [searchDraft]);

  const clearSearch = useCallback(() => {
    setSearchDraft("");
    setSearch("");
  }, []);

  const [activeRow, setActiveRow] = useState<InspectionWorklistView | null>(
    null,
  );
  const [damageRow, setDamageRow] = useState<InspectionWorklistView | null>(
    null,
  );
  const firstRun = useRef(true);

  // Always fetch the full set and split in the client. Filtering server-side
  // would mean a section's row count depends on which section is showing, and
  // a completed record would be absent from the payload entirely — which is
  // exactly the "inspected house disappeared" failure this page must not have.
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/house-queue/inspections");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        notify.error(body.error ?? "Failed to load inspections");
        return;
      }
      const data = (await res.json()) as {
        inspections: InspectionWorklistView[];
      };
      setRows(data.inspections);
    } catch {
      if (!silent) notify.error("Failed to load inspections");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Deferred refetch on search change (skip the initial render). Section
  // switching is pure client-side, so it cannot drop a completed record.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const t = setTimeout(() => void load(), 300);
    return () => clearTimeout(t);
  }, [search, load]);

  const matches = useCallback(
    (r: InspectionWorklistView, needle: string) =>
      r.houseNumber.toLowerCase().includes(needle) ||
      r.hid.toLowerCase().includes(needle) ||
      r.houseType.toLowerCase().includes(needle) ||
      (!!r.employee &&
        `${r.employee.firstname} ${r.employee.lastname}`
          .toLowerCase()
          .includes(needle)),
    [],
  );

  const searched = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle ? rows.filter((r) => matches(r, needle)) : rows;
  }, [rows, search, matches]);

  /**
   * The two sections. A row belongs to exactly one, and both are derived from
   * the same in-memory set — so an inspected house cannot be excluded from the
   * page by any filter combination.
   */
  const sections = useMemo(() => {
    const pending = searched.filter((r) => !r.resolvedTo);
    const inspected = searched.filter((r) => !!r.resolvedTo);
    return {
      pending,
      inspected,
      // Newest first within the permanent section: the most recent handback is
      // the one being asked about.
      inspectedSorted: [...inspected].sort(
        (a, b) =>
          new Date(b.completedAt ?? 0).getTime() -
          new Date(a.completedAt ?? 0).getTime(),
      ),
      unscheduled: pending.filter((r) => !r.scheduledDate).length,
      scheduled: pending.filter((r) => !!r.scheduledDate).length,
      damaged: inspected.filter((r) => r.resolvedTo === "UnderMaintenance")
        .length,
      photos: rows.reduce((acc, r) => acc + r.photoCount, 0),
    };
  }, [searched, rows]);

  const handleExport = useCallback(
    async (format: BrandedTableFormat) => {
      const activeRows =
        statusFilter === "open" ? sections.pending : sections.inspectedSorted;
      if (activeRows.length === 0) {
        notify.error("Nothing to export — no rows in this section.");
        return;
      }
      const isOpen = statusFilter === "open";
      setExporting(true);
      try {
        await exportBrandedTable({
          title: isOpen
            ? "Inspections — Pending"
            : "Inspections — Inspected Houses",
          subtitle: "House Hold · Inspections",
          summary: `${activeRows.length} record${
            activeRows.length === 1 ? "" : "s"
          } · generated ${new Date().toLocaleString()}`,
          accentHex: "#f59e0b",
          columns: EXPORT_COLUMNS,
          rows: activeRows,
          format,
          fileStem: isOpen ? "inspections-pending" : "inspections-inspected",
          footerLabel: "inspections report",
        });
        notify.success(
          `Inspections exported as ${format === "excel" ? "Excel" : "PDF"}`,
        );
      } catch {
        notify.error("Failed to export inspections. Please try again.");
      } finally {
        setExporting(false);
      }
    },
    [sections, statusFilter],
  );

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
            <div className="text-muted-foreground text-xs">{item.hid}</div>
          </div>
        );
      case "category":
        return <HouseCategoryBadge category={item.houseType} />;
      case "location":
        return (
          <div className="flex items-center gap-1 text-sm">
            <MapPin className="text-muted-foreground h-3.5 w-3.5" />
            <span>{item.locationName ?? "—"}</span>
          </div>
        );
      case "vacated":
        return (
          <div className="text-sm">
            <Badge variant="outline" className="font-semibold">
              {TERMINATION_LABELS[item.terminationReason ?? ""] ??
                item.terminationReason ??
                "—"}
            </Badge>
            <div className="text-muted-foreground mt-0.5 text-xs whitespace-nowrap">
              {item.vacatedAt ? formatDate(item.vacatedAt) : "—"}
            </div>
          </div>
        );
      case "former":
        return item.employee ? (
          <div>
            <div className="font-medium">{fullName(item.employee)}</div>
            <div className="text-muted-foreground text-xs">
              {item.employee.employeeNumber}
            </div>
          </div>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        );
      case "inspector":
        return <span className="text-sm">{item.inspectorName ?? "—"}</span>;
      case "scheduled": {
        if (item.scheduledDate) {
          const diff = daysFromToday(item.scheduledDate);
          return (
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium whitespace-nowrap">
                  {formatDate(item.scheduledDate)}
                </span>
                <Badge
                  variant={
                    diff < 0
                      ? "destructive"
                      : diff === 0
                        ? "warning"
                        : "default"
                  }
                  className="px-1.5 py-0 text-[10px] font-semibold whitespace-nowrap"
                >
                  {diff < 0
                    ? `${-diff}d overdue`
                    : diff === 0
                      ? "today"
                      : `in ${diff}d`}
                </Badge>
              </div>
              <div className="text-muted-foreground mt-0.5 text-[10px]">
                {item.inspectorName
                  ? `Inspector: ${item.inspectorName}`
                  : "No inspector assigned"}
              </div>
            </div>
          );
        }
        const pendingDays = item.vacatedAt
          ? Math.max(
              1,
              Math.round(
                (new Date().getTime() - new Date(item.vacatedAt).getTime()) /
                  86_400_000,
              ) + 1,
            )
          : 0;
        return (
          <div>
            <div className="flex justify-center">
              <Badge variant="warning" className="whitespace-nowrap">
                Unscheduled
              </Badge>
            </div>
            <div className="text-muted-foreground mt-0.5 text-center text-[10px]">
              {pendingDays > 0 ? `${pendingDays}d pending` : "pending"}
            </div>
          </div>
        );
      }
      case "houseStatus":
        return <HouseholdStatusBadge status={item.houseStatus} />;
      case "handback": {
        const hb = item.handback;
        if (hb.status === "awaiting_inspection") {
          return (
            <span className="text-muted-foreground text-xs">Not inspected</span>
          );
        }
        return (
          <div className="space-y-0.5">
            <Badge
              variant={hb.status === "released" ? "success" : "outline"}
              className="text-[10px]"
            >
              {hb.status === "released" ? "Released" : "Finalising"}
            </Badge>
            {hb.terminatedAt && (
              <div className="text-muted-foreground text-[10px] whitespace-nowrap">
                {formatDate(hb.terminatedAt)}
              </div>
            )}
          </div>
        );
      }
      case "resolution":
        return item.completedAt ? (
          <div>
            <Badge variant="success" className="gap-1">
              <Star className="h-3 w-3" />
              {item.resolvedTo ?? "Resolved"}
            </Badge>
            <div className="text-muted-foreground mt-0.5 text-[10px] whitespace-nowrap">
              {formatDateTime(item.completedAt)}
            </div>
          </div>
        ) : (
          <Badge variant="warning">Pending</Badge>
        );
      case "damage":
        // Read-only, always: a completed inspection is permanent evidence. The
        // full checklist lives behind a Details button rather than being listed
        // inline, so the column stays a single line at worklist density.
        return item.completedAt ? (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1"
            onClick={() => setDamageRow(item)}
          >
            <ClipboardList className="h-3.5 w-3.5" />
            Details
          </Button>
        ) : (
          <span className="text-muted-foreground text-xs">
            Recorded on completion
          </span>
        );
      case "photos":
        return (
          <span className="text-muted-foreground inline-flex items-center gap-1 text-sm">
            <ImageIcon className="h-3.5 w-3.5" />
            {item.photoCount}
          </span>
        );
      case "actions":
        // A completed inspection has nothing left to fill in here. What it does
        // still owe is the paperwork: the termination receipt, which is printed
        // from the inspection's own frozen snapshot. Completing the inspection
        // is also what finalises the release, so there is no second step to
        // chase and no second place to look when the two disagree.
        return item.resolvedTo ? (
          <TerminationReceiptButton
            inspection={item}
            disabled={!capabilities.manage}
          />
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
          <h1 className="text-2xl font-bold tracking-tight">
            Inspections: ፍተሻዎች
          </h1>
          <div className="from-brass-400 mt-1 h-0.5 w-16 rounded bg-gradient-to-r to-transparent" />
          <p className="text-muted-foreground mt-2 text-sm">
            Handback inspections raised by the Release Workflow. Completing an
            inspection resolves the house back to the Active pool or into
            maintenance.
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            Every completed inspection is kept permanently and listed under
            <span className="font-medium"> Inspected Houses</span>. Records are
            never deleted — deleting the house they describe is refused while an
            inspection exists.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="bg-card rounded-xl border p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">
              Pending
            </span>
            <ClipboardCheck className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-bold">
            {sections.pending.length}
          </div>
        </div>
        <div className="bg-card rounded-xl border p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">
              Unscheduled
            </span>
            <Clock className="h-4 w-4 text-orange-500" />
          </div>
          <div className="mt-2 text-2xl font-bold">{sections.unscheduled}</div>
          <p className="text-muted-foreground mt-0.5 text-[10px]">
            {sections.unscheduled === 0
              ? "All assigned"
              : "Need an inspector + date"}
          </p>
        </div>
        <div className="bg-card rounded-xl border p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">
              Scheduled
            </span>
            <CalendarDays className="h-4 w-4 text-sky-600" />
          </div>
          <div className="mt-2 text-2xl font-bold">{sections.scheduled}</div>
          <p className="text-muted-foreground mt-0.5 text-[10px]">
            {sections.scheduled === 0 ? "None booked" : "Awaiting inspection"}
          </p>
        </div>
        <div className="bg-card rounded-xl border p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">
              Inspected houses
            </span>
            <Star className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold">
            {sections.inspected.length}
          </div>
          <p className="text-muted-foreground mt-0.5 text-[10px]">
            Kept permanently
          </p>
        </div>
        <div className="bg-card rounded-xl border p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">
              Under maintenance
            </span>
            <X className="h-4 w-4 text-violet-500" />
          </div>
          <div className="mt-2 text-2xl font-bold">{sections.damaged}</div>
        </div>
        <div className="bg-card rounded-xl border p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">
              Photos
            </span>
            <ImageIcon className="text-muted-foreground h-4 w-4" />
          </div>
          <div className="mt-2 text-2xl font-bold">{sections.photos}</div>
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
              placeholder="Search house, HID, location, occupant…"
              className="h-9 pr-9 pl-9 text-xs"
              aria-label="Search inspections"
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
          {/* A section switch, not a filter. There is deliberately no "All": an
            inspected house must always be findable in one of the two. */}
          <div
            role="tablist"
            aria-label="Inspection section"
            className="bg-muted/40 flex shrink-0 rounded-lg border p-0.5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={statusFilter === "open"}
              onClick={() => setStatusFilter("open")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === "open"
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ClipboardCheck className="h-3.5 w-3.5" />
              Pending inspection
              <span className="tabular-nums opacity-70">
                {sections.pending.length}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={statusFilter === "resolved"}
              onClick={() => setStatusFilter("resolved")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === "resolved"
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Star className="h-3.5 w-3.5" />
              Inspected houses
              <span className="tabular-nums opacity-70">
                {sections.inspected.length}
              </span>
            </button>
          </div>

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
                aria-label="Export options"
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MoreVertical className="h-4 w-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
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

      {statusFilter === "open" ? (
        <ResponsiveTable
          columns={columns}
          data={sections.pending}
          renderCell={renderCell}
          keyExtractor={(row) => row.inspectionId}
          minWidth="1150px"
          emptyMessage="No houses awaiting inspection"
          emptyDescription="Vacate a house through the House Queue release workflow to raise an inspection."
        />
      ) : (
        <ResponsiveTable
          columns={columns}
          data={sections.inspectedSorted}
          renderCell={renderCell}
          keyExtractor={(row) => row.inspectionId}
          minWidth="1150px"
          emptyMessage="No inspected houses yet"
          emptyDescription="Every house you complete a handback inspection on is listed here permanently."
        />
      )}

      {activeRow && (
        <CompleteInspectionDialog
          inspection={activeRow}
          onOpenChange={(open) => !open && setActiveRow(null)}
          onCompleted={() => void load(true)}
        />
      )}

      {damageRow && (
        <Dialog
          open={!!damageRow}
          onOpenChange={(open) => !open && setDamageRow(null)}
        >
          <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4" />
                Damage assessment
              </DialogTitle>
              <DialogDescription>
                {damageRow.houseNumber} · {damageRow.hid} — handback inspection
                record
              </DialogDescription>
            </DialogHeader>
            <DamageChecklistReadonly
              state={damageRow.damage.state}
              costs={damageRow.damage.costs}
              conditionNote={damageRow.damage.conditionNote}
              className="text-left"
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setDamageRow(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
