"use client";

/**
 * Terminate a lease.
 *
 * Requires a reason AND an effective date, both enforced by the server. Months
 * still unpaid on or after the effective date become VOIDED; paid months are
 * untouched. The dialog states that consequence in plain language before the
 * user commits, because it is not obviously reversible (the months are voided,
 * though nothing is deleted).
 *
 * The form body mounts only while the dialog is open, so its state starts fresh
 * (today's date, empty reason) without a reset-in-effect.
 */

import { useCallback, useId, useMemo, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { REASON_MAX } from "@/lib/rent/constants";
import { terminateLeaseSchema } from "@/lib/rent/schemas";
import {
  todayDateOnly,
  type RentInstallmentDto,
  type RentRenterDto,
} from "@/lib/rent/types";
import { formatRentDate } from "./format";

interface TerminateFormProps {
  renter: RentRenterDto;
  /** Unpaid months, so the impact can be stated per chosen effective date. */
  installments: RentInstallmentDto[];
  onCancel: () => void;
  onTerminated: (voidedMonths: number) => Promise<void> | void;
}

function TerminateForm({
  renter,
  installments,
  onCancel,
  onTerminated,
}: TerminateFormProps) {
  const [reason, setReason] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(() => todayDateOnly());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formId = useId();

  /**
   * Unpaid months on or after the CHOSEN effective date.
   *
   * Computed from the live input rather than passed in for "today", so the
   * warning below always describes the date actually selected. Mirrors the
   * server's rule: `status = UNPAID AND dueDate >= effectiveDate`.
   */
  const monthsThatWillVoid = useMemo(() => {
    if (!effectiveDate) return 0;
    return installments.filter(
      (i) => i.status === "UNPAID" && i.dueDate >= effectiveDate,
    ).length;
  }, [installments, effectiveDate]);

  const submit = useCallback(async () => {
    if (isSubmitting) return;
    setFormError(null);
    setFieldErrors({});

    const payload = { reason, effectiveDate };
    const parsed = terminateLeaseSchema.safeParse(payload);
    if (!parsed.success) {
      const mapped: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".") || "_root";
        if (!mapped[key]) mapped[key] = issue.message;
      }
      setFieldErrors(mapped);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/rent/${renter.id}/terminate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(String(body?.error ?? "Could not terminate the lease."));
        return;
      }
      await onTerminated(Number(body?.voidedMonths ?? 0));
    } catch {
      setFormError(
        "Could not reach the server. Check your connection and retry.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [effectiveDate, isSubmitting, onTerminated, reason, renter.id]);

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="space-y-4"
    >
      {/* Announces the revised count as the date changes - it is a live figure,
          not a static confirmation. */}
      <div
        role="status"
        aria-live="polite"
        className="border-warning/40 bg-warning/10 text-warning-foreground flex items-start gap-2 rounded-lg border p-3 text-sm"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          {monthsThatWillVoid === 0 ? (
            <>
              No unpaid month falls on or after that date, so no month will be
              voided. The lease will simply be marked terminated.
            </>
          ) : (
            <>
              {monthsThatWillVoid} unpaid month
              {monthsThatWillVoid === 1 ? "" : "s"} on or after the effective
              date will be marked <strong>Voided</strong> and will no longer be
              collectable. Months already paid keep their receipts. Nothing is
              deleted.
            </>
          )}
        </p>
      </div>

      {formError ? (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border p-3 text-sm"
        >
          {formError}
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor={`${formId}-effectiveDate`}>
          Effective date <span className="text-destructive">*</span>
        </Label>
        <Input
          id={`${formId}-effectiveDate`}
          type="date"
          value={effectiveDate}
          onChange={(e) => setEffectiveDate(e.target.value)}
          aria-invalid={Boolean(fieldErrors.effectiveDate)}
          aria-describedby={
            fieldErrors.effectiveDate
              ? `${formId}-effectiveDate-err`
              : undefined
          }
          required
        />
        {fieldErrors.effectiveDate ? (
          <p
            id={`${formId}-effectiveDate-err`}
            className="text-destructive text-xs"
          >
            {fieldErrors.effectiveDate}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${formId}-reason`}>
          Reason <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id={`${formId}-reason`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={REASON_MAX}
          placeholder="e.g. Premises vacated after notice; shop demolished for expansion."
          aria-invalid={Boolean(fieldErrors.reason)}
          aria-describedby={
            fieldErrors.reason ? `${formId}-reason-err` : undefined
          }
          required
        />
        {fieldErrors.reason ? (
          <p id={`${formId}-reason-err`} className="text-destructive text-xs">
            {fieldErrors.reason}
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            Recorded in the audit log.
          </p>
        )}
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" variant="destructive" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Terminating...
            </>
          ) : (
            "Terminate lease"
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface TerminateLeaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  renter: RentRenterDto | null;
  /** The schedule, so the void impact can be recomputed as the date changes. */
  installments: RentInstallmentDto[];
  onTerminated: (voidedMonths: number) => Promise<void> | void;
}

export default function TerminateLeaseDialog({
  open,
  onOpenChange,
  renter,
  installments,
  onTerminated,
}: TerminateLeaseDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Terminate Lease</DialogTitle>
          <DialogDescription>
            {renter
              ? `${renter.fullName} - lease started ${formatRentDate(
                  renter.startDate,
                )}, ${formatRentDate(renter.endDate)}.`
              : "Select a lease to terminate."}
          </DialogDescription>
        </DialogHeader>

        {open && renter ? (
          <TerminateForm
            key={renter.id}
            renter={renter}
            installments={installments}
            onCancel={() => onOpenChange(false)}
            onTerminated={async (voided) => {
              await onTerminated(voided);
              onOpenChange(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
