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
import { Label } from "@/components/ui/label";
import {
  ArrowRight,
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  CornerDownRight,
  Loader2,
} from "lucide-react";
import { houseCategoryForJobGrade } from "@/lib/house-queue/eligibility";
import { notify } from "@/lib/feedback/notify";
import { useT } from "@/lib/i18n/react";
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

const STEPS = [
  "Reason",
  "Transfer / Release",
  "Awaiting Inspection",
  "Done",
] as const;

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
  scheduledDate?: string;
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
  /**
   * Where to open. The dialog only offers step 3 after a release has executed,
   * which cannot have happened before it opened, so this is 1 or 2 in practice.
   */
  initialStep?: 1 | 2 | 3;
}

function Stepper({ step, skipped = [] }: { step: number; skipped?: number[] }) {
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
                ? "text-foreground font-semibold"
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
                      ? "border-border bg-muted text-muted-foreground/50 border-dashed"
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
  initialStep = 1,
}: ReleaseWorkflowDialogProps) {
  const t = useT();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(initialStep);
  const [branch, setBranch] = useState<ReleaseBranch | null>(null);
  const [note, setNote] = useState("");

  const [initiating, setInitiating] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [initResult, setInitResult] = useState<InitResult | null>(null);

  const [houses, setHouses] = useState<PickerHouse[]>([]);
  const [eligibleCategory, setEligibleCategory] = useState<string | null>(null);
  const [housesLoading, setHousesLoading] = useState(false);
  const [housesError, setHousesError] = useState<string | null>(null);
  const [targetChoice, setTargetChoice] = useState<string>("");

  const [executing, setExecuting] = useState(false);
  const [execError, setExecError] = useState<string | null>(null);
  const [execResult, setExecResult] = useState<ExecuteResult | null>(null);
  const [transferResult, setTransferResult] = useState<TransferResult | null>(
    null,
  );

  // Reset or prime the workflow state every time the dialog (re)opens.
  /* eslint-disable react-hooks/set-state-in-effect -- intentional: batch-reset all dialog state when `open` flips to true */
  useEffect(() => {
    if (open) {
      setStep(initialStep);
      setBranch(null);
      setNote("");
      setInitResult(null);
      setHouses([]);
      setEligibleCategory(null);
      setTargetChoice("");
      setTransferResult(null);
      setExecResult(null);
      setInitError(null);
      setHousesError(null);
      setExecError(null);
    }
  }, [open, initialStep]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const fallbackCategory = houseCategoryForJobGrade(employee.jobGrade);
  const displayCategory = eligibleCategory ?? fallbackCategory;

  const loadHouses = useCallback(async () => {
    setHousesLoading(true);
    setHousesError(null);
    try {
      // Server-side eligibility-enforced candidate lookup
      const res = await fetch(
        `/api/house-queue/transfer/candidates?employeeId=${encodeURIComponent(employee.id)}`,
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHousesError(body.error ?? "Failed to load houses for transfer");
        return;
      }
      setEligibleCategory(body.eligibleCategory ?? null);
      setHouses((body.houses as PickerHouse[]) ?? []);
    } catch {
      setHousesError("Network error while loading houses");
    } finally {
      setHousesLoading(false);
    }
  }, [employee.id]);

  // Prime step data when the transfer step is entered.
  /* eslint-disable react-hooks/set-state-in-effect -- intentional: reactive data-fetch on step/branch change */
  useEffect(() => {
    if (open && step === 2 && branch === "TRANSFER") void loadHouses();
  }, [open, step, branch, loadHouses]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
      setInitResult(null);
      setExecResult(null);
      setStep(2);
      return;
    }
    void submitInitiate();
  };

  /**
   * Report a refusal twice, because the workflow is multi-step.
   *
   * The inline banner keeps the operator inside the dialog — it says what to do
   * about THIS step, which is what they need to make the next decision. The
   * toast is the same words for someone who has stepped away, or who is working
   * from the Allocated Houses page where the release was deep-linked and no
   * banner is waiting for them.
   */
  const fail = (step: "initiate" | "execute" | "transfer", message: string) => {
    if (step === "initiate") setInitError(message);
    else setExecError(message);

    // A dropped connection is an infrastructure problem, not a decision the
    // operator got wrong, so it says so rather than blaming their input.
    notify.error(
      message === "Network error"
        ? t("feedback.networkError.description")
        : message,
    );
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
        fail("initiate", body.error ?? "Failed to start the release");
        return;
      }
      const result = body.result as InitResult;
      setInitResult(result);
      setStep(2);

      // Step 1 writes no ledger state — it records the reason branch. So this is
      // info, not a success: nothing has changed about the employee's house yet,
      // and a green card here would overstate what just happened.
      notify.operation("releaseInitiated", {
        values: {
          name: result.employeeName || employee.name,
          employeeNumber: result.employeeNumber || employee.employeeNumber,
          branch: t(`feedback.branch.${branch.toLowerCase()}`),
        },
        dedupeKey: `release-initiate-${employee.id}`,
      });
    } catch {
      fail("initiate", "Network error");
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
        fail("transfer", body.error ?? "Failed to transfer the employee");
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

      notify.operation("transferStarted", {
        values: {
          name: employee.name,
          employeeNumber: employee.employeeNumber,
          houseNumber: target?.houseNumber ?? "—",
        },
        dedupeKey: `transfer-${employee.id}-${targetChoice}`,
      });
    } catch {
      fail("transfer", "Network error");
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
        fail("execute", body.error ?? "Failed to execute the release");
        return;
      }
      const result = body.result as ExecuteResult;
      setExecResult(result);
      setStep(3);

      // This one IS a commit: the allocation is terminated and the house has
      // left the pool. The meta row carries the two facts that make the record
      // useful three months from now — which house, and when the inspection that
      // finalises it is due — and the action goes straight to that inspection.
      notify.operation("releaseExecuted", {
        values: {
          name: employee.name,
          employeeNumber: employee.employeeNumber,
          houseNumber: result.houseNumber ?? currentHouseNumber ?? "—",
        },
        meta: [
          ...(result.houseNumber
            ? [
                t("feedback.releaseExecutedMeta.house", {
                  houseNumber: result.houseNumber,
                }),
              ]
            : []),
          t("feedback.releaseExecutedMeta.inspection", {
            date: result.scheduledDate,
          }),
        ],
        action: {
          label: t("feedback.releaseExecutedAction"),
          href: "/houses/inspections",
          onClick: () => {},
        },
        dedupeKey: `release-execute-${result.allocationId ?? employee.id}`,
      });
    } catch {
      fail("execute", "Network error");
    } finally {
      setExecuting(false);
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

        <div className="-mr-1 max-h-[min(60vh,560px)] overflow-y-auto pr-1">
          {/* ─── Step 1: Reason ─── */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm">
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
                        <span className="text-muted-foreground mt-0.5 block text-xs">
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
                  className="text-muted-foreground text-xs font-medium"
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
              <div className="bg-muted/40 flex items-center gap-3 rounded-lg border p-3 text-sm">
                <CornerDownRight className="text-primary h-4 w-4 shrink-0" />
                <span className="text-muted-foreground text-xs">
                  Moving{" "}
                  <span className="text-foreground font-semibold">
                    {employee.name}
                  </span>{" "}
                  from{" "}
                  <span className="text-foreground font-semibold">
                    {currentHouseNumber ?? "current house"}
                  </span>
                  {currentHid ? ` (${currentHid})` : ""} to an open house. This
                  is handled as a Reassign: one atomic action, full audit trail,
                  and the vacated house returns to the pool immediately.
                </span>
              </div>

              {displayCategory ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-muted-foreground text-xs font-medium">
                      Destination — free{" "}
                      <HouseCategoryBadge category={displayCategory} /> houses,
                      ranked by Engine B for grade {employee.jobGrade}
                    </Label>
                  </div>
                  {housesError ? (
                    <div className="bg-muted/20 flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-8 text-center">
                      <p className="text-muted-foreground text-xs">
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
                        <p className="text-muted-foreground text-[11px]">
                          Check the House Queue configuration to widen the
                          eligible pool, or choose another reason to vacate the
                          house for inspection.
                        </p>
                      }
                    />
                  )}
                </div>
              ) : (
                <div className="bg-muted/20 flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-8 text-center">
                  <p className="text-muted-foreground text-xs">
                    No house category is configured for grade{" "}
                    {employee.jobGrade}, so no transfer target can be
                    recommended. Choose another reason, or configure the grade
                    in House Queue settings.
                  </p>
                </div>
              )}

              {selectedTargetHouse && (
                <div className="border-primary/30 bg-primary/5 rounded-lg border px-3 py-2 text-xs">
                  <span className="text-primary font-semibold">
                    Selected destination
                  </span>{" "}
                  — {selectedTargetHouse.houseNumber} ({selectedTargetHouse.hid}
                  ) ·{" "}
                  <HouseCategoryBadge
                    category={selectedTargetHouse.houseType}
                  />{" "}
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
              <div className="bg-muted/40 rounded-lg border p-3 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-semibold">
                    {RELEASE_BRANCH_LABELS[branch]}
                  </Badge>
                  <span className="text-muted-foreground text-xs">
                    Vacating{" "}
                    <span className="text-foreground font-semibold">
                      {initResult.houseNumber ?? "current house"}
                    </span>
                    {initResult.hid ? ` (${initResult.hid})` : ""}
                  </span>
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  The house will be vacated to Pending Inspection and the
                  handback inspection is automatically scheduled for the next
                  working day. The house stays out of the pool until that
                  inspection is completed — completing it finalises the release
                  and files the allocation on the Terminated Houses page.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-muted/40 rounded-lg border p-3">
                  <div className="text-muted-foreground text-xs font-semibold">
                    Allocation
                  </div>
                  <p className="mt-1 font-semibold text-amber-600 dark:text-amber-400">
                    RELEASE_PENDING
                  </p>
                </div>
                <div className="bg-muted/40 rounded-lg border p-3">
                  <div className="text-muted-foreground text-xs font-semibold">
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

          {/* ─── Step 3: Awaiting inspection ─── */}
          {step === 3 && execResult && (
            <div className="space-y-4">
              <div className="space-y-1 rounded-lg border border-amber-50 p-3.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                <div className="flex items-center gap-2 font-semibold">
                  <CalendarDays className="h-4 w-4 shrink-0" />
                  <span>
                    Handback inspection auto-scheduled
                    {execResult?.scheduledDate
                      ? ` for ${execResult.scheduledDate}`
                      : ""}
                    .
                  </span>
                </div>
                <p className="text-muted-foreground">
                  House{" "}
                  <strong>
                    {execResult?.houseNumber ?? currentHouseNumber ?? "vacated"}
                  </strong>{" "}
                  is parked in{" "}
                  <span className="font-semibold">Pending Inspection</span> and
                  its allocation is{" "}
                  <span className="font-semibold">RELEASE_PENDING</span>.
                </p>
              </div>

              <div className="bg-muted/40 flex items-start gap-3 rounded-lg border p-4">
                <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div className="space-y-1.5 text-sm">
                  <p className="font-semibold">
                    The handback inspection is what completes this release
                  </p>
                  <p className="text-muted-foreground text-xs">
                    The release is parked until a Facility inspector completes
                    the handback inspection. That single step records the
                    damage, returns the house to the pool, and files the
                    allocation on the Terminated Houses page — so there is
                    nothing further to enter here.
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Close this dialog and continue on the{" "}
                    <a
                      href="/houses/inspections"
                      className="text-primary font-medium underline underline-offset-2"
                    >
                      Inspections
                    </a>{" "}
                    page.
                  </p>
                </div>
              </div>
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
                    {employee.name} moved from {currentHouseNumber ?? "—"} (
                    {currentHid ?? "—"}) to{" "}
                    <span className="font-semibold">
                      {transferResult.houseNumber} ({transferResult.hid})
                    </span>{" "}
                    · {transferResult.rgType}
                    {transferResult.locationName
                      ? ` · ${transferResult.locationName}`
                      : ""}
                    .
                  </p>
                </div>
              </div>
              <p className="text-muted-foreground text-xs">
                This used the standard Reassign path — a single audited action.
                The move shows instantly on the Queue and Allocated Houses
                pages.
              </p>
            </div>
          )}

          {/* A release never reaches step 4. Once the release executes, step 3
              explains that the handback inspection is scheduled and must be
              completed on the Inspections page. Step 4 is the transfer
              outcome only, rendered above. */}
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
          {step === 1 && (
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={initiating}
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
          {step === 3 && execResult && (
            <Button onClick={closeCompleted} className="gap-1.5">
              <Check className="h-4 w-4" />
              Close — finish on the Inspections page
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
              Finish — refresh pages
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
