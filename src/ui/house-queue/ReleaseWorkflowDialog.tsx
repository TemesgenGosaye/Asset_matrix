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
  ArrowRight,
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  CornerDownRight,
  Loader2,
  Clock,
} from "lucide-react";
import { houseCategoryForJobGrade } from "@/lib/house-queue/eligibility";
import { notify } from "@/lib/feedback/notify";
import { HouseCategoryBadge } from "@/ui/household/house-status";
import EngineHousePicker, {
  type PickerHouse,
} from "@/ui/house-queue/EngineHousePicker";

export type ReleaseBranch = "TRANSFER" | "EMPLOYEE_LEAVE" | "RETIREMENT";

export const RELEASE_BRANCH_OPTIONS: Array<{
  value: ReleaseBranch;
  label: string;
  description: string;
}> = [
  {
    value: "TRANSFER",
    label: "Transfer to another house",
    description:
      "Choose a replacement house matching the employee's grade band. The house goes under inspection first, and the transfer completes once the inspection is completed and confirmed.",
  },
  {
    value: "EMPLOYEE_LEAVE",
    label: "Employee leaving the factory",
    description:
      "The house is held under inspection. Once the handback inspection is completed, the release can be finalized to move the occupant to Terminated Houses.",
  },
  {
    value: "RETIREMENT",
    label: "Employee retirement",
    description:
      "The house is held under inspection. Once the handback inspection is completed, the release can be finalized to move the occupant to Terminated Houses.",
  },
];

export const RELEASE_BRANCH_LABELS: Record<ReleaseBranch, string> = {
  TRANSFER: "Transfer",
  EMPLOYEE_LEAVE: "Employee Leave",
  RETIREMENT: "Retirement",
};

const STEPS = [
  "Reason & Date",
  "Details & Destination",
  "Awaiting Inspection",
] as const;

interface ExecuteResult {
  inspectionId: string;
  allocationId: string;
  householdId: string | null;
  houseNumber: string | null;
  hid: string | null;
  scheduledDate?: string;
  branch: ReleaseBranch;
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
  initialStep?: 1 | 2 | 3;
}

function Stepper({ step }: { step: number }) {
  return (
    <ol className="flex items-center gap-1.5 pb-1">
      {STEPS.map((label, idx) => {
        const n = idx + 1;
        const active = n === step;
        const done = n < step;
        return (
          <li
            key={label}
            className={`flex items-center gap-1.5 text-xs ${
              active
                ? "text-foreground font-semibold"
                : done
                  ? "text-primary"
                  : "text-muted-foreground"
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : done
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-muted"
              }`}
            >
              {done ? <Check className="h-3 w-3" /> : n}
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
  const [step, setStep] = useState<1 | 2 | 3>(initialStep);
  const [branch, setBranch] = useState<ReleaseBranch | null>(null);
  const [note, setNote] = useState("");
  const [effectiveDate, setEffectiveDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );

  const [houses, setHouses] = useState<PickerHouse[]>([]);
  const [eligibleCategory, setEligibleCategory] = useState<string | null>(null);
  const [housesLoading, setHousesLoading] = useState(false);
  const [housesError, setHousesError] = useState<string | null>(null);
  const [targetChoice, setTargetChoice] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [execResult, setExecResult] = useState<ExecuteResult | null>(null);

  useEffect(() => {
    if (open) {
      setStep(initialStep);
      setBranch(null);
      setNote("");
      setEffectiveDate(new Date().toISOString().slice(0, 10));
      setHouses([]);
      setEligibleCategory(null);
      setTargetChoice("");
      setExecResult(null);
      setHousesError(null);
      setSubmitError(null);
    }
  }, [open, initialStep]);

  const fallbackCategory = houseCategoryForJobGrade(employee.jobGrade);
  const displayCategory = eligibleCategory ?? fallbackCategory;

  const loadHouses = useCallback(async () => {
    setHousesLoading(true);
    setHousesError(null);
    try {
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

  useEffect(() => {
    if (open && step === 2 && branch === "TRANSFER") {
      void loadHouses();
    }
  }, [open, step, branch, loadHouses]);

  const selectedTargetHouse = houses.find((h) => h.id === targetChoice);

  const submitReleaseRequest = async () => {
    if (!branch) return;
    if (branch === "TRANSFER" && !targetChoice) {
      setSubmitError("Please select a replacement house for the transfer.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/house-queue/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "request",
          employeeId: employee.id,
          branch,
          reason: note.trim() || undefined,
          effectiveDate: effectiveDate || undefined,
          transferHouseholdId: branch === "TRANSFER" ? targetChoice : undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = body.error ?? "Failed to submit release request";
        setSubmitError(msg);
        notify.error(msg);
        return;
      }
      const result = body.result as ExecuteResult;
      setExecResult(result);
      setStep(3);
      notify.success("Release requested. Inspection record created (Pending).");
    } catch {
      setSubmitError("Network error while submitting release request");
      notify.error("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinish = () => {
    onComplete();
    onOpenChange(false);
  };

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
            {currentHouseNumber ?? "No house"}{" "}
            {currentHid ? `(${currentHid})` : ""}
          </DialogDescription>
          <Stepper step={step} />
        </DialogHeader>

        <div className="-mr-1 max-h-[min(60vh,560px)] space-y-4 overflow-y-auto pr-1">
          {/* ─── Step 1: Reason, Date, Notes ─── */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm">
                Choose the release reason and effective date. Clicking submit
                will place the house <strong>Under Inspection</strong> and
                create an inspection record. Final release occurs once
                inspection is completed.
              </p>
              <div className="space-y-2">
                {RELEASE_BRANCH_OPTIONS.map((opt) => {
                  const selected = branch === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setBranch(opt.value);
                        setSubmitError(null);
                      }}
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

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="rw-effective-date"
                    className="text-muted-foreground text-xs font-medium"
                  >
                    Effective Date
                  </Label>
                  <Input
                    id="rw-effective-date"
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="rw-note"
                  className="text-muted-foreground text-xs font-medium"
                >
                  Reason Note <span className="font-normal">(optional)</span>
                </Label>
                <Textarea
                  id="rw-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Additional context (e.g. transfer station, exit notice reference)"
                  className="min-h-16 text-sm"
                />
              </div>

              {submitError && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                  {submitError}
                </p>
              )}
            </div>
          )}

          {/* ─── Step 2: Destination House (for TRANSFER) or Review (for Leave/Retirement) ─── */}
          {step === 2 && branch === "TRANSFER" && (
            <div className="space-y-4">
              <div className="bg-muted/40 flex items-center gap-3 rounded-lg border p-3 text-sm">
                <CornerDownRight className="text-primary h-4 w-4 shrink-0" />
                <span className="text-muted-foreground text-xs">
                  Select a replacement house for{" "}
                  <span className="text-foreground font-semibold">
                    {employee.name}
                  </span>
                  . This house will be allocated when the release is finalized.
                </span>
              </div>

              {displayCategory ? (
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs font-medium">
                    Available <HouseCategoryBadge category={displayCategory} />{" "}
                    houses, matching grade {employee.jobGrade}
                  </Label>
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
                      onSelect={(id) => {
                        setTargetChoice(id);
                        setSubmitError(null);
                      }}
                      maxHeightClass="max-h-[min(380px,40vh)]"
                    />
                  )}
                </div>
              ) : (
                <div className="bg-muted/20 text-muted-foreground rounded-lg border border-dashed p-6 text-center text-xs">
                  No compatible house category configured for grade{" "}
                  {employee.jobGrade}.
                </div>
              )}

              {selectedTargetHouse && (
                <div className="border-primary/30 bg-primary/5 rounded-lg border px-3 py-2 text-xs">
                  <span className="text-primary font-semibold">
                    Chosen replacement house:
                  </span>{" "}
                  {selectedTargetHouse.houseNumber} ({selectedTargetHouse.hid})
                  ·{" "}
                  <HouseCategoryBadge
                    category={selectedTargetHouse.houseType}
                  />{" "}
                  · {selectedTargetHouse.rgType}
                  {selectedTargetHouse.locationName
                    ? ` · ${selectedTargetHouse.locationName}`
                    : ""}
                </div>
              )}

              {submitError && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                  {submitError}
                </p>
              )}
            </div>
          )}

          {step === 2 && branch && branch !== "TRANSFER" && (
            <div className="space-y-4">
              <div className="bg-muted/40 rounded-lg border p-4 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-semibold">
                    {RELEASE_BRANCH_LABELS[branch]}
                  </Badge>
                  <span className="text-muted-foreground text-xs">
                    Vacating House{" "}
                    <span className="text-foreground font-semibold">
                      {currentHouseNumber ?? "—"}
                    </span>
                    {currentHid ? ` (${currentHid})` : ""}
                  </span>
                </div>
                <p className="text-muted-foreground mt-2 text-xs">
                  Submitting will set the house to{" "}
                  <strong>UNDER_INSPECTION</strong> and create a pending
                  inspection. The occupant stays on Allocated Houses until
                  inspection is completed and release is confirmed.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-muted/40 rounded-lg border p-3">
                  <div className="text-muted-foreground text-[11px] font-semibold">
                    Effective date
                  </div>
                  <p className="mt-1 font-semibold">
                    {effectiveDate || "Today"}
                  </p>
                </div>
                <div className="bg-muted/40 rounded-lg border p-3">
                  <div className="text-muted-foreground text-[11px] font-semibold">
                    Allocation target state
                  </div>
                  <p className="mt-1 font-semibold text-amber-600 dark:text-amber-400">
                    RELEASE_PENDING_INSPECTION
                  </p>
                </div>
              </div>

              {submitError && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                  {submitError}
                </p>
              )}
            </div>
          )}

          {/* ─── Step 3: Confirmation & Next Steps ─── */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div className="text-sm">
                  <p className="font-semibold text-amber-900 dark:text-amber-200">
                    Release Requested — Awaiting Inspection
                  </p>
                  <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                    House{" "}
                    <strong>
                      {execResult?.houseNumber ?? currentHouseNumber ?? "—"}
                    </strong>{" "}
                    is now set to <strong>UNDER_INSPECTION</strong>. An
                    inspection record with status <strong>PENDING</strong> has
                    been registered.
                  </p>
                </div>
              </div>

              <div className="bg-muted/40 text-muted-foreground space-y-2 rounded-lg border p-4 text-xs">
                <p className="text-foreground text-sm font-semibold">
                  Next steps:
                </p>
                <ol className="list-inside list-decimal space-y-1">
                  <li>
                    The facility inspector will conduct the handback inspection
                    on the Inspections page.
                  </li>
                  <li>
                    Completing the handback inspection atomically finalises the
                    release and returns the house to stock.
                  </li>
                  <li>
                    The archived record will be available under Terminated
                    Houses.
                  </li>
                </ol>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {step === 1 && (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!branch) return;
                  setStep(2);
                }}
                disabled={!branch || submitting}
                className="gap-1.5"
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          )}

          {step === 2 && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setStep(1);
                  setSubmitError(null);
                }}
                disabled={submitting}
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={() => void submitReleaseRequest()}
                disabled={
                  submitting || (branch === "TRANSFER" && !targetChoice)
                }
                className="gap-1.5"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                <ClipboardCheck className="h-4 w-4" />
                Submit Release Request
              </Button>
            </>
          )}

          {step === 3 && (
            <Button onClick={handleFinish} className="gap-1.5">
              <Check className="h-4 w-4" />
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
