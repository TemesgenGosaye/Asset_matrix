"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  History,
  Loader2,
  MapPin,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  formatDate,
  formatDateTime,
  fmtScore,
  fullName,
} from "@/ui/household/house-format";
import {
  HouseCategoryBadge,
  QueueStatusBadge,
} from "@/ui/household/house-status";
import type { HouseQueueRow } from "@/lib/house-queue/types";

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium">{children}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// View Details
// ---------------------------------------------------------------------------

export function QueueDetailsDialog({
  row,
  open,
  onOpenChange,
}: {
  row: HouseQueueRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!row) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{fullName(row)}</DialogTitle>
          <DialogDescription>
            Employee {row.employeeNumber} · Grade {row.jobGrade ?? "—"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <Field label="Queue Status">
            <QueueStatusBadge status={row.queueStatus} />
          </Field>
          <Field label="House Category">
            <HouseCategoryBadge category={row.houseCategory} />
          </Field>
          <Field label="Priority Score">
            <span className="font-semibold tabular-nums">
              {fmtScore(row.mcdScore)}
            </span>
          </Field>
          <Field label="Priority Rank (in grade)">
            <span className="font-semibold tabular-nums">
              {row.priorityRank != null
                ? `#${row.priorityRank}`
                : "—"}
            </span>
          </Field>
          <Field label="Gender">{row.gender ?? "—"}</Field>
          <Field label="Service Years">
            {row.serviceYears > 0 ? row.serviceYears : 0}
          </Field>
          <Field label="Marital Status">{row.maritalStatus ?? "—"}</Field>
          <Field label="Disability">
            {row.disabilityStatus ? "Yes" : "No"}
          </Field>
          <Field label="Hired">
            {formatDate(row.hireDate)}
          </Field>
          <Field label="Allocation Ledger">
            {row.allocationStatus ? (
              <Badge variant="outline">{row.allocationStatus}</Badge>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </Field>
        </div>

        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            Recommended house
          </div>
          {row.recommendedHouseNumber ? (
            <div className="mt-1.5 space-y-0.5">
              <div className="font-semibold">
                {row.recommendedHouseNumber}{" "}
                <span className="text-muted-foreground font-normal">
                  ({row.recommendedHid})
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {row.recommendedLocation ?? "Location not set"}
              </div>
            </div>
          ) : (
            <p className="mt-1.5 text-xs text-muted-foreground">
              No available house for this category right now.
            </p>
          )}
        </div>

        {row.note && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            Note: {row.note}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Approve (allocates the recommended house)
// ---------------------------------------------------------------------------

export function ApproveDialog({
  row,
  open,
  onOpenChange,
  onSubmit,
}: {
  row: HouseQueueRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: { employeeId: string; householdId: string }) => Promise<{
    ok: boolean;
    message?: string;
  }>;
}) {
  const [submitting, setSubmitting] = useState(false);

  if (!row) return null;
  const canApprove =
    row.recommendedHouseId != null && !row.isAllocated;

  const confirm = async () => {
    if (!row.recommendedHouseId) return;
    setSubmitting(true);
    const result = await onSubmit({
      employeeId: row.employeeId,
      householdId: row.recommendedHouseId,
    });
    setSubmitting(false);
    if (result.ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Approve allocation</DialogTitle>
          <DialogDescription>
            Allocate the recommended house to {fullName(row)}.
          </DialogDescription>
        </DialogHeader>

        {canApprove ? (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3">
              <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600" />
              <div>
                <div className="font-semibold">
                  {row.recommendedHouseNumber}{" "}
                  <span className="text-muted-foreground font-normal">
                    ({row.recommendedHid})
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {row.recommendedLocation ?? "Location not set"} · Category{" "}
                  {row.houseCategory}
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Score {fmtScore(row.mcdScore)} · Rank{" "}
              {row.priorityRank != null ? `#${row.priorityRank}` : "—"} within
              grade {row.jobGrade ?? "—"}.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {row.isAllocated
              ? "This employee already has a live allocation. Use Reassign or Release instead."
              : "No available house was recommended for this category right now."}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={confirm}
            disabled={!canApprove || submitting}
            className="gap-1.5"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            <CheckCircle2 className="h-4 w-4" />
            Approve allocation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Reassign (pick another free house of the employee's category)
// ---------------------------------------------------------------------------

interface AvailableHouse {
  id: string;
  houseNumber: string;
  hid: string;
  rgType: string;
  locationName: string | null;
  houseType: string;
}

export function ReassignDialog({
  row,
  open,
  onOpenChange,
  onSubmit,
}: {
  row: HouseQueueRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
    if (!row?.houseCategory) return;
    setLoading(true);
    setHouses([]);
    setSelectedId(null);
    try {
      const res = await fetch(
        `/api/house-queue/available-houses?houseType=${encodeURIComponent(row.houseCategory)}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Failed to load available houses");
        return;
      }
      const data = (await res.json()) as { houses: AvailableHouse[] };
      setHouses(data.houses);
    } catch {
      toast.error("Failed to load available houses");
    } finally {
      setLoading(false);
    }
  }, [row]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: refresh free-house list when the dialog opens
    if (open) void load();
  }, [open, load]);

  const confirm = async () => {
    if (!selectedId || !row) return;
    setSubmitting(true);
    const result = await onSubmit({
      employeeId: row.employeeId,
      householdId: selectedId,
    });
    setSubmitting(false);
    if (result.ok) onOpenChange(false);
  };

  if (!row) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reassign house</DialogTitle>
          <DialogDescription>
            Choose a free {row.houseCategory} house for {fullName(row)}.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading houses…
            </div>
          )}
          {!loading && houses.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No free {row.houseCategory} houses available.
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
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {house.locationName ?? "Location not set"}
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant="outline">{house.rgType}</Badge>
                  {selected && (
                    <CheckCircle2 className="ml-1 inline h-4 w-4 text-primary" />
                  )}
                </div>
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
// Skip / Defer
// ---------------------------------------------------------------------------

export function SkipDeferDialog({
  row,
  open,
  onOpenChange,
  onSubmit,
}: {
  row: HouseQueueRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: {
    employeeId: string;
    mode: "skip" | "defer";
    reason?: string;
  }) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [mode, setMode] = useState<"skip" | "defer">("defer");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const confirm = async () => {
    if (!row) return;
    setSubmitting(true);
    const result = await onSubmit({
      employeeId: row.employeeId,
      mode,
      reason: reason.trim() || undefined,
    });
    setSubmitting(false);
    if (result.ok) onOpenChange(false);
  };

  if (!row) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Skip / Defer {fullName(row)}</DialogTitle>
          <DialogDescription>
            This excludes the employee from the live queue until released.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={mode}
          onValueChange={(val) => setMode(val as "skip" | "defer")}
          className="space-y-2"
        >
          <Label
            htmlFor="hq-defer"
            className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm"
          >
            <RadioGroupItem value="defer" id="hq-defer" className="mt-0.5" />
            <div>
              <div className="font-semibold">Defer</div>
              <div className="text-xs text-muted-foreground">
                Temporarily hold the employee&apos;s place (e.g. awaiting
                paperwork).
              </div>
            </div>
          </Label>
          <Label
            htmlFor="hq-skip"
            className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm"
          >
            <RadioGroupItem value="skip" id="hq-skip" className="mt-0.5" />
            <div>
              <div className="font-semibold">Skip</div>
              <div className="text-xs text-muted-foreground">
                Permanently exclude from housing allocation for now.
              </div>
            </div>
          </Label>
        </RadioGroup>

        <div className="space-y-1.5">
          <Label htmlFor="hq-reason" className="text-xs font-medium text-muted-foreground">
            Reason
          </Label>
          <Textarea
            id="hq-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Optional reason (recorded in the audit trail)"
            className="min-h-20 text-sm"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={confirm}
            disabled={submitting}
            variant={mode === "skip" ? "destructive" : "default"}
            className="gap-1.5"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "skip" ? "Skip employee" : "Defer employee"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

function AuditRow({ entry }: { entry: AuditEntry }) {
  const parsed = (() => {
    try {
      return entry.details ? (JSON.parse(entry.details) as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  })();

  return (
    <div className="space-y-1 rounded-lg border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant="outline" className="font-semibold">
          {entry.action}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {formatDateTime(entry.createdAt)}
        </span>
      </div>
      {entry.user && (
        <p className="text-xs text-muted-foreground">
          By {entry.user.firstname} {entry.user.lastname}
        </p>
      )}
      {parsed && (
        <p className="text-xs text-muted-foreground">
          {Object.entries(parsed)
            .filter(([, v]) => typeof v !== "object" && v !== null)
            .map(([k, v]) => `${k}: ${String(v)}`)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}

export function AuditTrailDialog({
  row,
  open,
  onOpenChange,
}: {
  row: HouseQueueRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !row) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load the audit trail when the dialog opens
    setLoading(true);
    setEntries([]);
    fetch(`/api/house-queue/audit?employeeId=${encodeURIComponent(row.employeeId)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((data: { logs: AuditEntry[] }) => setEntries(data.logs))
      .catch(() => toast.error("Failed to load the audit trail"))
      .finally(() => setLoading(false));
  }, [open, row]);

  if (!row) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Audit trail — {fullName(row)}
          </DialogTitle>
          <DialogDescription>
            Decision history for this employee&apos;s housing thread.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          )}
          {!loading && entries.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No recorded decisions yet.
            </p>
          )}
          {entries.map((entry) => (
            <AuditRow key={entry.id} entry={entry} />
          ))}
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <RefreshCw className="h-3 w-3" />
            Auto-refreshing every 30 seconds
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="mr-1 h-4 w-4" />
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}