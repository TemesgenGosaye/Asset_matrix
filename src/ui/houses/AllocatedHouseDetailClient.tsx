"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  History,
  Loader2,
  MapPin,
  PencilRuler,
  Phone,
  Printer,
  RefreshCw,
  Repeat,
  ShieldCheck,
  Undo2,
  X,
  ArchiveRestore,
  Check,
  ClipboardCheck,
  Image as ImageIcon,
  Truck,
} from "lucide-react";
import { notify } from "@/lib/feedback/notify";
import Link from "next/link";
import {
  formatDate,
  formatDateTime,
  fmtScore,
  fullName,
} from "@/ui/household/house-format";
import {
  HouseCategoryBadge,
  HouseholdStatusBadge,
  QueueStatusBadge,
} from "@/ui/household/house-status";
import { houseCategoryForJobGrade } from "@/lib/house-queue/eligibility";
import { isReleasePending } from "@/lib/house-queue/state";
import { canPrintHouseReceipt } from "@/lib/house-queue/receipt-gate";
import type { AllocationDetailView } from "@/lib/house-queue/views";
import type { HouseQueueCapabilities } from "../house-queue/HouseQueueClient";
import ReleaseWorkflowDialog from "../house-queue/ReleaseWorkflowDialog";

import AllocationReceiptPrint from "./AllocationReceiptPrint";

const OCCUPANCY_META: Record<string, { label: string; className: string }> = {
  Vacant: {
    label: "Vacant",
    className:
      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  },
  Occupied: {
    label: "Occupied",
    className:
      "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  },
  Maintenance: {
    label: "Maintenance",
    className:
      "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  },
};

export function OccupancyBadge({ status }: { status: string | null }) {
  const meta = OCCUPANCY_META[status ?? ""] ?? {
    label: status ?? "—",
    className: "text-muted-foreground",
  };
  return (
    <Badge variant="outline" className={meta.className}>
      {meta.label}
    </Badge>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium">{children}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reassign house picker
// ---------------------------------------------------------------------------

interface AvailableHouse {
  id: string;
  houseNumber: string;
  hid: string;
  rgType: string;
  locationName: string | null;
  houseType: string;
}

function ReassignHouseDialog({
  open,
  onOpenChange,
  employeeId,
  employeeName,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  employeeName: string;
  onSubmit: (payload: { employeeId: string; householdId: string }) => Promise<{
    ok: boolean;
    message?: string;
  }>;
}) {
  const [houses, setHouses] = useState<AvailableHouse[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    setHouses([]);
    setSelectedId(null);
    try {
      const res = await fetch(
        `/api/house-queue/transfer/candidates?employeeId=${encodeURIComponent(employeeId)}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        notify.error(body.error ?? "Failed to load available houses");
        return;
      }
      const data = (await res.json()) as { houses: AvailableHouse[] };
      setHouses(data.houses);
    } catch {
      notify.error("Failed to load available houses");
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load when the dialog opens
    if (open) void load();
  }, [open, load]);

  const confirm = async () => {
    if (!selectedId || !employeeId) return;
    setSubmitting(true);
    const result = await onSubmit({ employeeId, householdId: selectedId });
    setSubmitting(false);
    if (result.ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reassign house</DialogTitle>
          <DialogDescription>
            Choose an eligible house for {employeeName}.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
          {loading && (
            <div className="text-muted-foreground flex items-center justify-center gap-2 py-6 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading houses…
            </div>
          )}
          {!loading && houses.length === 0 && (
            <p className="text-muted-foreground py-6 text-center text-sm">
              No eligible houses available.
            </p>
          )}
          {houses.map((house) => {
            const selected = selectedId === house.id;
            return (
              <button
                key={house.id}
                type="button"
                onClick={() => setSelectedId(house.id)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  selected
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:border-primary/50"
                }`}
              >
                <div>
                  <div className="font-semibold">{house.houseNumber}</div>
                  <div className="text-muted-foreground flex items-center gap-1 text-xs">
                    <MapPin className="h-3 w-3" />
                    {house.locationName ?? "Location not set"}
                  </div>
                </div>
                <Badge variant="outline">{house.rgType}</Badge>
              </button>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={confirm}
            disabled={!selectedId || submitting}
            className="gap-1.5"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Reassign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Handback inspection card (shown on terminated allocations)
// ---------------------------------------------------------------------------

function ChecklistRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="bg-muted/40 flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {ok ? (
        <Badge variant="success" className="gap-1">
          <Check className="h-3 w-3" /> OK
        </Badge>
      ) : (
        <Badge variant="destructive" className="gap-1">
          <X className="h-3 w-3" /> Damage
        </Badge>
      )}
    </div>
  );
}

function InspectionCard({
  inspection,
}: {
  inspection: NonNullable<AllocationDetailView["inspection"]>;
}) {
  const resolved = inspection.resolvedTo;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ClipboardCheck className="h-4 w-4 text-amber-600" />
          Handback inspection
        </CardTitle>
        {resolved ? (
          <Badge variant={resolved === "Active" ? "success" : "secondary"}>
            Resolved → {resolved}
          </Badge>
        ) : (
          <Badge variant="warning">Pending inspection</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 text-xs">
          {inspection.scheduledDate && (
            <span>
              Scheduled{" "}
              <span className="text-foreground font-semibold">
                {formatDate(inspection.scheduledDate)}
              </span>
            </span>
          )}
          <span>
            Inspector{" "}
            <span className="text-foreground font-semibold">
              {inspection.inspectorName ?? "not assigned"}
            </span>
          </span>
          {inspection.completedAt && (
            <span>
              Completed{" "}
              <span className="text-foreground font-semibold">
                {formatDateTime(inspection.completedAt)}
              </span>
            </span>
          )}
        </div>

        <div>
          <p className="text-muted-foreground mb-1.5 text-[11px] font-semibold tracking-wide uppercase">
            Damage checklist
          </p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            <ChecklistRow label="Window" ok={!inspection.checklistWindow} />
            <ChecklistRow label="Door" ok={!inspection.checklistDoor} />
            <ChecklistRow
              label="Water panel"
              ok={!inspection.checklistWaterPanel}
            />
            <ChecklistRow label="Roof" ok={!inspection.checklistRoof} />
            <ChecklistRow label="Wall" ok={!inspection.checklistWall} />
            <ChecklistRow
              label="Electricity"
              ok={!inspection.checklistElectricity}
            />
          </div>
        </div>

        {inspection.conditionNote && (
          <div>
            <p className="text-muted-foreground mb-1 text-[11px] font-semibold tracking-wide uppercase">
              Condition note
            </p>
            <p className="bg-muted/40 rounded-lg border p-3 text-sm">
              {inspection.conditionNote}
            </p>
          </div>
        )}

        {inspection.photoUrls.length > 0 && (
          <div>
            <p className="text-muted-foreground mb-1.5 text-[11px] font-semibold tracking-wide uppercase">
              Photos ({inspection.photoUrls.length})
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {inspection.photoUrls.map((url) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-muted/40 text-muted-foreground hover:border-primary/50 flex h-16 items-center justify-center rounded-lg border transition-colors"
                >
                  <ImageIcon className="h-5 w-5" />
                </a>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

interface AuditEntry {
  id: string;
  action: string;
  entityId: string | null;
  details: string | null;
  createdAt: string;
  user?: { firstname: string | null; lastname: string | null } | null;
}

function AuditTrailCard({ employeeId }: { employeeId: string }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/house-queue/audit?employeeId=${encodeURIComponent(employeeId)}`)
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error("failed")),
      )
      .then((data: { logs: AuditEntry[] }) => {
        if (!cancelled) setEntries(data.logs);
      })
      .catch(() => {
        if (!cancelled) notify.error("Failed to load the audit trail");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <History className="h-4 w-4" />
          Decision audit trail
        </CardTitle>
      </CardHeader>
      <CardContent className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {loading && (
          <div className="text-muted-foreground flex items-center justify-center gap-2 py-6 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        )}
        {!loading && entries.length === 0 && (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No recorded decisions yet.
          </p>
        )}
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="bg-card space-y-1 rounded-lg border p-3 text-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge variant="outline" className="font-semibold">
                {entry.action}
              </Badge>
              <span className="text-muted-foreground text-xs">
                {formatDateTime(entry.createdAt)}
              </span>
            </div>
            {entry.user && (
              <p className="text-muted-foreground text-xs">
                By {entry.user.firstname} {entry.user.lastname}
              </p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main client
// ---------------------------------------------------------------------------

interface AllocatedHouseDetailClientProps {
  detail: AllocationDetailView;
  capabilities: HouseQueueCapabilities;
}

type DialogKey = "reassign" | "release" | null;

export default function AllocatedHouseDetailClient({
  detail,
  capabilities,
}: AllocatedHouseDetailClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  /**
   * Deep link from another page: `?action=release` / `?action=transfer`.
   *
   * The House Request page refuses a second request from an employee who already
   * holds a house, and the useful response to that is not "go and look" but
   * "start the release". Carrying the intent in the URL means the button that
   * sent the user here does not have to re-implement either workflow, and a
   * refresh or a shared link still lands on the right step.
   *
   * Read once, at arrival, rather than tracked as a param: after the user closes
   * the dialog the param is still in the address bar, and a component that
   * re-opened on every param change would make it impossible to dismiss.
   */
  const [requestedAction] = useState(searchParams.get("action"));

  const [dialog, setDialog] = useState<DialogKey>(
    requestedAction === "release" ? "release" : null,
  );
  const [acting, setActing] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(requestedAction === "transfer");

  const runAction = useCallback(async (payload: Record<string, unknown>) => {
    try {
      const res = await fetch("/api/house-queue/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok)
        return { ok: false as const, message: body.error ?? "Action failed" };
      return { ok: true as const };
    } catch {
      return { ok: false as const, message: "Network error" };
    }
  }, []);

  const handleReassign = useCallback(
    async (payload: { employeeId: string; householdId: string }) => {
      const result = await runAction({ action: "reassign", ...payload });
      if (result.ok) {
        notify.success("Allocation reassigned");
        router.refresh();
      }
      return result;
    },
    [runAction, router],
  );

  // Handle missing employee data
  if (!detail.employee) {
    return (
      <div className="border-destructive bg-destructive/5 rounded-xl border p-6">
        <h2 className="text-destructive text-lg font-semibold">
          Missing Employee Data
        </h2>
        <p className="text-muted-foreground mt-2 text-sm">
          This allocation record is missing employee information and cannot be
          displayed properly.
        </p>
      </div>
    );
  }

  const isReleasePendingState = isReleasePending(detail.status);
  const isTerminated =
    detail.status === "terminated" || detail.status === "released";

  /**
   * Termination and transfer receipts may only be printed once the handback
   * inspection is complete, since completing it is what finalises the release.
   * The component enforces this too; computing it here lets the buttons explain
   * themselves instead of opening a dialog that immediately refuses.
   */
  // Narrowed to the refusal branch once declared, so `message` is reachable
  // without a cast at each use site.
  const receiptGate = canPrintHouseReceipt({
    variant: "handover",
    inspection: detail.inspection ?? null,
  });
  const moveGate = canPrintHouseReceipt({
    variant: "move",
    inspection: detail.inspection ?? null,
  });
  const receiptBlocked = !receiptGate.allowed;
  const moveBlocked = !moveGate.allowed;
  const receiptBlockMessage = receiptBlocked ? receiptGate.message : undefined;
  const moveBlockMessage = moveBlocked ? moveGate.message : undefined;
  const category = houseCategoryForJobGrade(detail.employee.jobGrade);

  return (
    <div className="space-y-6">
      {/* ─── Header card ─── */}
      <div className="bg-card rounded-xl border p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="housing-serif text-brass-500 dark:text-brass-300 text-3xl font-bold tracking-tight">
                {detail.house?.houseNumber ?? "Unassigned house"}
              </h1>
              <span className="text-muted-foreground text-sm">
                ({detail.house?.hid ?? "no hid"})
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <QueueStatusBadge status={detail.status} />
              <OccupancyBadge status={detail.house?.occupancyStatus ?? null} />
              <HouseholdStatusBadge status={detail.house?.status ?? null} />
              <HouseCategoryBadge category={detail.house?.houseType ?? null} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.refresh()}
              disabled={acting}
            >
              <RefreshCw className="h-4 w-4" />
              Reload
            </Button>
            {/* `auto` resolves to the handback form once the allocation is terminated, so
                the button inherits the gate for that case and stays open for the
                handover form. */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReceiptOpen(true)}
              disabled={isTerminated && receiptBlocked}
              title={isTerminated ? receiptBlockMessage : undefined}
            >
              <Printer className="h-4 w-4" />
              Print Receipt
            </Button>
            {!isTerminated && detail.transferred && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMoveOpen(true)}
                disabled={moveBlocked}
                title={moveBlockMessage}
              >
                <Truck className="h-4 w-4" />
                Moving / Transfer Request
              </Button>
            )}
            {!isTerminated &&
              !isReleasePendingState &&
              capabilities.allocate && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDialog("reassign")}
                >
                  <Repeat className="h-4 w-4" />
                  Reassign
                </Button>
              )}
            {!isTerminated && !isReleasePendingState && capabilities.manage && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDialog("release")}
              >
                <Undo2 className="h-4 w-4" />
                Release
              </Button>
            )}
          </div>
        </div>
        {detail.house?.locationName && (
          <p className="text-muted-foreground mt-3 flex items-center gap-1.5 text-sm">
            <MapPin className="h-4 w-4" />
            {detail.house.locationName}
          </p>
        )}
      </div>

      {/* ─── Release Pending banner ─── */}
      {isReleasePendingState && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/50">
          <div className="flex items-center gap-3">
            <ClipboardCheck className="h-5 w-5 text-amber-600" />
            <div>
              <p className="font-semibold text-amber-900 dark:text-amber-200">
                Release pending — awaiting handback inspection
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                The house is vacated and held out of the pool. Completing the
                handback inspection finalises the release: it records the
                damage, returns the house to stock, and files this allocation on
                the Terminated Houses page.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Terminated archive banner ─── */}
      {isTerminated && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-950/50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <ArchiveRestore className="text-muted-foreground h-5 w-5" />
              <div>
                <p className="font-semibold">
                  Allocation terminated at {formatDateTime(detail.terminatedAt)}
                </p>
                <p className="text-muted-foreground text-xs">
                  {detail.terminatedByName ?? "Unknown user"} closed this
                  allocation • reason: {detail.terminationReason ?? "—"}
                  {detail.reason ? ` • ${detail.reason}` : ""}
                </p>
              </div>
            </div>
            <Link
              href="/houses/terminated"
              className="text-primary inline-flex items-center gap-1 text-xs font-semibold hover:underline"
            >
              View terminations archive →
            </Link>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ─── Occupant ─── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Occupant
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 text-primary flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold">
                {detail.employee.firstname.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="text-base font-semibold">
                  {fullName(detail.employee)}
                </div>
                <div className="text-muted-foreground text-xs">
                  {detail.employee.employeeNumber}
                </div>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-4">
              <Field label="Department">
                {detail.employee.department?.name ?? "—"}
              </Field>
              <Field label="Job Grade">{detail.employee.jobGrade ?? "—"}</Field>
              <Field label="Gender">{detail.employee.gender ?? "—"}</Field>
              <Field label="Marital Status">
                {detail.employee.maritalStatus ?? "—"}
              </Field>
              <Field label="Family size">
                {detail.employee.familySize ?? "—"}
              </Field>
              <Field label="Phone">
                {detail.employee.phone ? (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {detail.employee.phone}
                  </span>
                ) : (
                  "—"
                )}
              </Field>
            </dl>
          </CardContent>
        </Card>

        {/* ─── Allocation record ─── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Allocation record</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <Field label="Priority score">
                <span className="font-semibold tabular-nums">
                  {fmtScore(detail.mcdScore)}
                </span>
              </Field>
              <Field label="Priority rank">
                {detail.priorityRank != null ? `#${detail.priorityRank}` : "—"}
              </Field>
              <Field label="Decision approved by">
                {detail.decidedByName ?? "—"}
              </Field>
              <Field label="Approved on">
                {formatDateTime(detail.decidedAt)}
              </Field>
              <Field label="Ledger created">
                {formatDateTime(detail.createdAt)}
              </Field>
              <Field label="Note">{detail.reason ?? "—"}</Field>
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* ─── House inventory ─── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <PencilRuler className="h-4 w-4" />
            House inventory
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Beds">{detail.house?.bedCount ?? 0}</Field>
            <Field label="Chairs">{detail.house?.chairsCount ?? 0}</Field>
            <Field label="Lockers">{detail.house?.lockerCount ?? 0}</Field>
            <Field label="Tables">{detail.house?.tablesCount ?? 0}</Field>
          </dl>
        </CardContent>
      </Card>

      {/* ─── Audit trail ─── */}
      <AuditTrailCard employeeId={detail.employee.id} />

      {/* ─── Handback inspection (terminated allocations) ─── */}
      {detail.inspection && <InspectionCard inspection={detail.inspection} />}

      {/* ─── Print-only allocation receipt (Original + Duplicate) ─── */}
      <AllocationReceiptPrint
        detail={detail}
        open={receiptOpen}
        onClose={() => setReceiptOpen(false)}
      />

      {/* ─── Print-only moving / transfer request (OF/MSF/HRMS/291) ─── */}
      <AllocationReceiptPrint
        detail={detail}
        variant="move"
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
      />

      {dialog === "reassign" && (
        <ReassignHouseDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          employeeId={detail.employee.id}
          employeeName={fullName(detail.employee)}
          onSubmit={handleReassign}
        />
      )}
      {dialog === "release" && (
        <ReleaseWorkflowDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          onComplete={() => router.refresh()}
          employee={{
            id: detail.employee.id,
            name: fullName(detail.employee),
            employeeNumber: detail.employee.employeeNumber,
            jobGrade: detail.employee.jobGrade,
          }}
          currentHouseNumber={detail.house?.houseNumber ?? null}
          currentHid={detail.house?.hid ?? null}
        />
      )}
    </div>
  );
}
