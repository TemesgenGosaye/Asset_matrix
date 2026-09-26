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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowRight,
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  CornerDownRight,
  Loader2,
  User,
} from "lucide-react";
import { houseCategoryForJobGrade } from "@/lib/house-queue/eligibility";
import { HouseCategoryBadge } from "@/ui/household/house-status";
import EngineHousePicker, {
  type PickerHouse,
} from "@/ui/house-queue/EngineHousePicker";

type ReleaseBranch = "TRANSFER" | "EMPLOYEE_LEAVE" | "RETIREMENT";

export const RELEASE_BRANCH_OPTIONS: Array<{
  value: ReleaseBranch;
  label: string;
  description: string;
}> = [
  {
    value: "TRANSFER",
    label: "Transfer to another house",
    description:
      "The employee is moved to a new house right away — exactly the same as Reassign. The vacated house returns to the pool as part of that action.",
  },
  {
    value: "EMPLOYEE_LEAVE",
    label: "Employee leaving the factory",
    description:
      "The house is vacated and held for a handback inspection before it re-enters the pool.",
  },
  {
    value: "RETIREMENT",
    label: "Employee retirement",
    description:
      "The house is vacated and held for a handback inspection before it re-enters the pool.",
  },
];

export const RELEASE_BRANCH_LABELS: Record<ReleaseBranch, string> = {
  TRANSFER: "Transfer",
  EMPLOYEE_LEAVE: "Employee Leave",
  RETIREMENT: "Retirement",
};

const STEPS = ["Reason", "Transfer / Release", "Inspection", "Done"] as const;

interface InitResult {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  jobGrade: number | null;
  houseCategory: string | null;
  allocationId: string;
  householdId: string | null;
  houseNumber: string | null;
  hid: string | null;
  houseType: string | null;
  rgType: string | null;
  locationName: string | null;
  branch: ReleaseBranch;
}

interface ExecuteResult {
  inspectionId: string;
  allocationId: string;
  householdId: string | null;
  houseNumber: string | null;
  hid: string | null;
}

interface TransferResult {
  householdId: string;
  houseNumber: string;
  hid: string;
  houseType: string;
  rgType: string;
  locationName: string | null;
  rank: number;
}

interface Inspector {
  userid: string;
  firstname: string | null;
  lastname: string | null;
}

function tomorrowDateInput(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface ReleaseWorkflowEmployee {
  id: string;
  name: string;
  employeeNumber: string;
  jobGrade: number | null;
}

interface ReleaseWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
  employee: ReleaseWorkflowEmployee;
  currentHouseNumber: string | null;
  currentHid: string | null;
}

function Stepper({
  step,
  skipped = [],
}: {
  step: number;
  skipped?: number[];
}) {
  return (
    <ol className="flex items-center gap-1.5 pb-1">
      {STEPS.map((label, idx) => {
        const n = idx + 1;
        const active = n === step;
        const done = n < step && !skipped.includes(n);
        const skip = skipped.includes(n);
        return (
          <li
            key={label}
            className={`flex items-center gap-1.5 text-xs ${
              active
                ? "font-semibold text-foreground"
                : done
                  ? "text-primary"
                  : skip
                    ? "text-muted-foreground/50"
                    : "text-muted-foreground"
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : done
                    ? "border-primary bg-primary/10 text-primary"
                    : skip
                      ? "border-dashed border-border bg-muted text-muted-foreground/50"
                      : "border-border bg-muted"
              }`}
            >
              {done ? (
                <Check className="h-3 w-3" />
              ) : skip ? (
                <span aria-hidden="true">–</span>
              ) : (
                n
              )}
            </span>
            <span className="hidden sm:inline">{label}</span>
            {n < STEPS.length && <span className="text-border">—</span>}
          </li>
        );
      })}
    </ol>
  );
}

export default function ReleaseWorkflowDialog({
  open,
  onOpenChange,
  onComplete,
  employee,
  currentHouseNumber,
  currentHid,
}: ReleaseWorkflowDialogProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [branch, setBranch] = useState<ReleaseBranch | null>(null);
  const [note, setNote] = useState("");

  const [initiating, setInitiating] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [initResult, setInitResult] = useState<InitResult | null>(null);

  const [houses, setHouses] = useState<PickerHouse[]>([]);
  const [housesLoading, setHousesLoading] = useState(false);
  const [housesError, setHousesError] = useState<string | null>(null);
  const [targetChoice, setTargetChoice] = useState<string>("");

  const [executing, setExecuting] = useState(false);
  const [execError, setExecError] = useState<string | null>(null);
  const [execResult, setExecResult] = useState<ExecuteResult | null>(null);
  const [transferResult, setTransferResult] = useState<TransferResult | null>(
    null,
  );

  const [inspectors, setInspectors] = useState<Inspector[]>([]);
  const [inspectorsLoading, setInspectorsLoading] = useState(false);
  const [inspectorId, setInspectorId] = useState<string>("");
  const [scheduledDate, setScheduledDate] = useState(tomorrowDateInput());
  const [scheduling, setScheduling] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  // Reset the workflow state every time the dialog (re)opens.
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reset on open
      setStep(1);
      setBranch(null);
      setNote("");
      setInitResult(null);
      setHouses([]);
      setTargetChoice("");
      setTransferResult(null);
      setExecResult(null);
      setInspectorId("");
      setScheduledDate(tomorrowDateInput());
      setInitError(null);
      setHousesError(null);
      setExecError(null);
      setScheduleError(null);
    }
  }, [open]);

  const category = houseCategoryForJobGrade(employee.jobGrade);

  const loadHouses = useCallback(async () => {
    if (!category) {
      setHousesError("This employee's grade has no house category configured.");
      return;
    }
    setHousesLoading(true);
    setHousesError(null);
    try {
      const res = await fetch(
        `/api/house-queue/available-houses?houseType=${encodeURIComponent(category)}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setHousesError(body.error ?? "Failed to load houses for transfer");
        return;
      }
      const data = (await res.json()) as { houses: PickerHouse[] };
      setHouses(data.houses);
    } catch {
      setHousesError("Network error while loading houses");
    } finally {
      setHousesLoading(false);
    }
  }, [category]);

  const loadInspectors = useCallback(async () => {
    setInspectorsLoading(true);
    try {
      const res = await fetch("/api/house-queue/inspectors");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setScheduleError(body.error ?? "Failed to load inspectors");
        return;
      }
      const data = (await res.json()) as { inspectors: Inspector[] };
      setInspectors(data.inspectors);
    } catch {
      setScheduleError("Network error while loading inspectors");
    } finally {
      setInspectorsLoading(false);
    }
  }, []);

  // Prime step data when the relevant step is entered.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: prime Engine B list on entry
    if (open && step === 2 && branch === "TRANSFER") void loadHouses();
  }, [open, step, branch, loadHouses]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: prime inspectors on entry
    if (open && step === 3) void loadInspectors();
  }, [open, step, loadInspectors]);

  const resetToReason = () => {
    setStep(1);
    setInitResult(null);
    setTargetChoice("");
    setTransferResult(null);
    setExecResult(null);
    setInitError(null);
    setHousesError(null);
    setExecError(null);
  };

  const continueFromReason = () => {
    if (!branch) return;
    if (branch === "TRANSFER") {
      // A transfer IS the Reassign action — no release is initiated.
      // Step 2 loads the Engine B ranked list; confirm calls the action route.
      setInitResult(null);
      setExecResult(null);
      setStep(2);
      return;
    }
    void submitInitiate();
  };

  const submitInitiate = async () => {
    if (!branch) return;
    setInitiating(true);
    setInitError(null);
    try {
      const res = await fetch("/api/house-queue/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "initiate",
          employeeId: employee.id,
          branch,
          reason: note.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setInitError(body.error ?? "Failed to start the release");
        return;
      }
      setInitResult(body.result as InitResult);
      setStep(2);
    } catch {
      setInitError("Network error");
    } finally {
      setInitiating(false);
    }
  };

  const submitTransfer = async () => {
    if (!branch || !targetChoice) return;
    setExecuting(true);
    setExecError(null);
    try {
      const res = await fetch("/api/house-queue/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reassign",
          employeeId: employee.id,
          householdId: targetChoice,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setExecError(body.error ?? "Failed to transfer the employee");
        return;
      }
      const target = houses.find((h) => h.id === targetChoice);
      setTransferResult(
        target
          ? {
              householdId: target.id,
              houseNumber: target.houseNumber,
              hid: target.hid,
              houseType: target.houseType,
              rgType: target.rgType,
              locationName: target.locationName,
              rank: houses.indexOf(target) + 1,
            }
          : null,
      );
      setStep(4);
    } catch {
      setExecError("Network error");
    } finally {
      setExecuting(false);
    }
  };

  const submitExecute = async () => {
    if (!branch) return;
    setExecuting(true);
    setExecError(null);
    try {
      const res = await fetch("/api/house-queue/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "execute",
          employeeId: employee.id,
          branch,
          reason: note.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setExecError(body.error ?? "Failed to execute the release");
        return;
      }
      setExecResult(body.result as ExecuteResult);
      setStep(3);
    } catch {
      setExecError("Network error");
    } finally {
      setExecuting(false);
    }
  };

  const submitSchedule = async () => {
    if (!execResult || !inspectorId || !scheduledDate) return;
    setScheduling(true);
    setScheduleError(null);
    try {
      const res = await fetch(
        `/api/house-queue/inspections/${execResult.inspectionId}/schedule`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inspectorId, scheduledDate }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setScheduleError(body.error ?? "Failed to schedule the inspection");
        return;
      }
      setStep(4);
    } catch {
      setScheduleError("Network error");
    } finally {
      setScheduling(false);
    }
  };

  const closeCompleted = () => {
    onOpenChange(false);
    onComplete();
  };

  const stepInspectionSkipped = branch === "TRANSFER";

  const canContinueReason = branch != null && !initiating;
  const canContinueTransfer = !!targetChoice && !executing;
  const canContinueRelease = branch !== null && !executing;
  const canContinueSchedule = !!inspectorId && !!scheduledDate && !scheduling;

  const selectedTargetHouse = houses.find((h) => h.id === targetChoice) ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {branch === "TRANSFER" ? "Transfer house" : "Release house"} —{" "}
            {employee.name}
          </DialogTitle>
          <DialogDescription>
            {employee.employeeNumber} · Grade {employee.jobGrade ?? "—"} ·{" "}
            {currentHouseNumber ?? "no house"}{" "}
            {currentHid ? `(${currentHid})` : ""}
          </DialogDescription>
          <Stepper step={step} skipped={stepInspectionSkipped ? [3] : []} />
        </DialogHeader>

        <div className="max-h-[min(60vh,560px)] overflow-y-auto pr-1 -mr-1">
          {/* ─── Step 1: Reason ─── */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Choose why this allocation is ending. The house cannot return to
                the pool without a completed handback inspection.
              </p>
              <div className="space-y-2">
                {RELEASE_BRANCH_OPTIONS.map((opt) => {
                  const selected = branch === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setBranch(opt.value)}
                      className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left text-sm transition-colors ${
                        selected
                          ? "border-primary bg-primary/10"
                          : "border-border bg-card hover:border-primary/50"
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                          selected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border"
                        }`}
                      >
                        {selected && <Check className="h-3 w-3" />}
                      </span>
                      <span>
                        <span className="font-semibold">{opt.label}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {opt.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="rw-note"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Note <span className="font-normal">(optional)</span>
                </Label>
                <Textarea
                  id="rw-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Additional context (e.g. new duty station, posting end date)"
                  className="min-h-16 text-sm"
                />
              </div>
              {initError && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                  {initError}
                </p>
              )}
            </div>
          )}

          {/* ─── Step 2: Transfer (Reassign) ─── */}
          {step === 2 && branch === "TRANSFER" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
                <CornerDownRight className="h-4 w-4 shrink-0 text-primary" />
                <span className="text-xs text-muted-foreground">
                  Moving{" "}
                  <span className="font-semibold text-foreground">
                    {employee.name}
                  </span>{" "}
                  from{" "}
                  <span className="font-semibold text-foreground">
                    {currentHouseNumber ?? "current house"}
                  </span>
                  {currentHid ? ` (${currentHid})` : ""} to an open house. This
                  is handled as a Reassign: one atomic action, full audit trail,
                  and the vacated house returns to the pool immediately.
                </span>
              </div>

              {category ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Destination — free{" "}
                      <HouseCategoryBadge category={category} /> houses, ranked
                      by Engine B for grade {employee.jobGrade}
                    </Label>
                  </div>
                  {housesError ? (
                    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-muted/20 px-6 py-8 text-center">
                      <p className="text-xs text-muted-foreground">
                        {housesError}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void loadHouses()}
                      >
                        <Loader2 className="mr-1.5 h-3.5 w-3.5" />
                        Retry
                      </Button>
                    </div>
                  ) : (
                    <EngineHousePicker
                      houses={houses}
                      loading={housesLoading}
                      selectedId={targetChoice}
                      onSelect={setTargetChoice}
                      maxHeightClass="max-h-[min(420px,45vh)]"
                      emptyAction={
                        <p className="text-[11px] text-muted-foreground">
                          Check the House Queue configuration to widen the
                          eligible pool, or choose another reason to vacate the
                          house for inspection.
                        </p>
                      }
                    />
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-muted/20 px-6 py-8 text-center">
                  <p className="text-xs text-muted-foreground">
                    No house category is configured for grade{" "}
                    {employee.jobGrade}, so no transfer target can be
                    recommended. Choose another reason, or configure the grade
                    in House Queue settings.
                  </p>
                </div>
              )}

              {selectedTargetHouse && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
                  <span className="font-semibold text-primary">
                    Selected destination
                  </span>{" "}
                  — {selectedTargetHouse.houseNumber} (
                  {selectedTargetHouse.hid}) ·{" "}
                  <HouseCategoryBadge category={selectedTargetHouse.houseType} />{" "}
                  · {selectedTargetHouse.rgType}
                  {selectedTargetHouse.locationName
                    ? ` · ${selectedTargetHouse.locationName}`
                    : ""}
                </div>
              )}

              {execError && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                  {execError}
                </p>
              )}
            </div>
          )}

          {/* ─── Step 2: Release (inspection-gated reasons) ─── */}
          {step === 2 && branch && branch !== "TRANSFER" && initResult && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-semibold">
                    {RELEASE_BRANCH_LABELS[branch]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Vacating{" "}
                    <span className="font-semibold text-foreground">
                      {initResult.houseNumber ?? "current house"}
                    </span>
                    {initResult.hid ? ` (${initResult.hid})` : ""}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  The house is held for a handback inspection before it re-enters
                  the pool. The allocation is archived with reason{" "}
                  <span className="font-semibold">
                    &ldquo;{RELEASE_BRANCH_LABELS[branch]}&rdquo;
                  </span>
                  .
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border bg-muted/40 p-3">
                  <div className="text-xs font-semibold text-muted-foreground">
                    Allocation
                  </div>
                  <p className="mt-1 font-semibold">
                    Terminated under {RELEASE_BRANCH_LABELS[branch]}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/40 p-3">
                  <div className="text-xs font-semibold text-muted-foreground">
                    House state
                  </div>
                  <p className="mt-1 font-semibold">Pending inspection</p>
                </div>
              </div>

              {execError && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                  {execError}
                </p>
              )}
            </div>
          )}

          {/* ─── Step 3: Inspection ─── */}
          {step === 3 && execResult && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                <span className="font-semibold">
                  House {execResult.houseNumber ?? "vacated"} is pending a
                  handback inspection.
                </span>{" "}
                It stays out of the pool until Facilities inspects it and
                resolves it (Active → back in pool, Under Maintenance → stays
                out).
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Inspector <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={inspectorId}
                    onValueChange={setInspectorId}
                    disabled={inspectorsLoading}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="Select an inspector" />
                    </SelectTrigger>
                    <SelectContent>
                      {inspectors.map((ins) => (
                        <SelectItem key={ins.userid} value={ins.userid}>
                          {`${ins.firstname ?? ""} ${ins.lastname ?? ""}`.trim() ||
                            ins.userid}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {inspectorsLoading && (
                    <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading inspectors…
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Scheduled date <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border bg-muted/40 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <User className="h-3.5 w-3.5" />
                    Assigned inspector
                  </div>
                  <p className="mt-1">
                    {inspectorId
                      ? inspectors.find((i) => i.userid === inspectorId)
                          ? `${inspectors.find((i) => i.userid === inspectorId)?.firstname ?? ""} ${inspectors.find((i) => i.userid === inspectorId)?.lastname ?? ""}`.trim()
                          : "—"
                      : "—"}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/40 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Scheduled date
                  </div>
                  <p className="mt-1">{scheduledDate || "—"}</p>
                </div>
              </div>

              {scheduleError && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                  {scheduleError}
                </p>
              )}
            </div>
          )}

          {/* ─── Step 4: Done (TRANSFER → reassigned) ─── */}
          {step === 4 && transferResult && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div className="text-sm">
                  <p className="font-semibold text-emerald-800 dark:text-emerald-200">
                    Employee transferred — allocation reassigned
                  </p>
                  <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                    {employee.name} moved from{" "}
                    {currentHouseNumber ?? "—"} ({currentHid ?? "—"}) to{" "}
                    <span className="font-semibold">
                      {transferResult.houseNumber} ({transferResult.hid})
                    </span>{" "}
                    · {transferResult.rgType}
                    {transferResult.locationName
                      ? ` · ${transferResult.locationName}`
                      : ""}.
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                This used the standard Reassign path — a single audited action,
                no handback inspection required for the vacated house. The move
                shows instantly on the Queue and Allocated Houses pages, and in
                the employee&apos;s queue audit history.
              </p>
            </div>
          )}

          {/* ─── Step 4: Done (release path) ─── */}
          {step === 4 && execResult && !transferResult && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div className="text-sm">
                  <p className="font-semibold text-emerald-800 dark:text-emerald-200">
                    Release recorded and inspection scheduled
                  </p>
                  <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                    {employee.name} last held house{" "}
                    {execResult.houseNumber ?? "—"} ({execResult.hid ?? "—"}){" "}
                    {branch ? `under ${RELEASE_BRANCH_LABELS[branch]}` : ""}.
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                The pending inspection appears in the Facilities worklist
                (Houses → Inspections). Completing it re-enters the house into
                the Active pool or takes it under maintenance. The full decision
                trail is in {employee.name}&apos;s queue audit history.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {step === 2 && (
            <Button
              variant="outline"
              onClick={resetToReason}
              disabled={executing || initiating}
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
          )}
          {(step === 1 || (step === 3 && execResult)) && (
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={initiating || scheduling}
            >
              Cancel
            </Button>
          )}
          {step === 2 && (
            <Button
              onClick={() =>
                branch === "TRANSFER"
                  ? void submitTransfer()
                  : void submitExecute()
              }
              disabled={
                branch === "TRANSFER"
                  ? !canContinueTransfer
                  : !canContinueRelease
              }
              className="gap-1.5"
            >
              {executing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
              {branch === "TRANSFER" ? (
                <span className="flex items-center gap-1.5">
                  <CornerDownRight className="h-4 w-4" />
                  Transfer to{" "}
                  {selectedTargetHouse?.houseNumber ?? "a selected house"}
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  Release house — vacate to inspection
                </span>
              )}
            </Button>
          )}
          {step === 3 && (
            <Button
              onClick={() => void submitSchedule()}
              disabled={!canContinueSchedule}
              className="gap-1.5"
            >
              {scheduling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
              Schedule inspection
            </Button>
          )}
          {step === 1 && (
            <Button
              onClick={continueFromReason}
              disabled={!canContinueReason}
              className="gap-1.5"
            >
              {initiating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
              Continue
            </Button>
          )}
          {step === 4 && (
            <Button onClick={closeCompleted} className="gap-1.5">
              <Check className="h-4 w-4" />
              Finish — refresh the pages
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}