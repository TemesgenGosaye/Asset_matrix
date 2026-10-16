"use client";

/**
 * Confirm and void a recorded payment.
 *
 * Voiding is the reversal path, so it is deliberately a two-step destructive
 * action with a mandatory reason. The dialog states the consequence in plain
 * language: the receipt is kept and marked voided, and the month becomes payable
 * again with a NEW receipt number.
 *
 * The form body mounts only while the dialog is open so its state starts clean.
 */

import { useCallback, useId, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { REASON_MAX, RENT_PAYMENT_METHOD_LABELS } from "@/lib/rent/constants";
import type { RentPaymentDto } from "@/lib/rent/types";
import { formatEtb, formatRentDate } from "./format";

interface VoidFormProps {
  payment: RentPaymentDto;
  renterName: string;
  onCancel: () => void;
  onVoided: (receiptNumber: string) => Promise<void> | void;
}

function VoidForm({ payment, renterName, onCancel, onVoided }: VoidFormProps) {
  const [reason, setReason] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formId = useId();

  const submit = useCallback(async () => {
    if (isSubmitting) return;
    setFormError(null);
    setFieldError(null);

    const trimmed = reason.trim();
    if (trimmed.length === 0) {
      setFieldError("A reason is required to void a payment.");
      return;
    }
    if (trimmed.length > REASON_MAX) {
      setFieldError(`Reason must be at most ${REASON_MAX} characters.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/rent/payments/${payment.id}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: trimmed }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(String(body?.error ?? "Could not void the payment."));
        return;
      }
      await onVoided(payment.receiptNumber);
    } catch {
      setFormError(
        "Could not reach the server. Check your connection and retry.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, onVoided, payment.id, payment.receiptNumber, reason]);

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="space-y-4"
    >
      <div
        role="note"
        className="border-warning/40 bg-warning/10 text-warning-foreground flex items-start gap-2 rounded-lg border p-3 text-sm"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          Receipt <strong>{payment.receiptNumber}</strong> is kept and marked
          voided, and month {payment.monthNumber} becomes payable again. If it
          is paid later it will receive a <strong>new</strong> receipt number.
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
        <Label htmlFor={`${formId}-reason`}>
          Reason <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id={`${formId}-reason`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={REASON_MAX}
          placeholder="e.g. Entered against the wrong month; reversed in error."
          aria-invalid={Boolean(fieldError)}
          aria-describedby={fieldError ? `${formId}-reason-err` : undefined}
          required
        />
        {fieldError ? (
          <p id={`${formId}-reason-err`} className="text-destructive text-xs">
            {fieldError}
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            Recorded in the audit log. {renterName}
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
              Voiding...
            </>
          ) : (
            "Void payment"
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface VoidPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: RentPaymentDto | null;
  renterName: string;
  onVoided: (receiptNumber: string) => Promise<void> | void;
}

export default function VoidPaymentDialog({
  open,
  onOpenChange,
  payment,
  renterName,
  onVoided,
}: VoidPaymentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Void Payment</DialogTitle>
          <DialogDescription>
            {payment
              ? `Receipt ${payment.receiptNumber}, month ${payment.monthNumber}, ${formatEtb(
                  payment.amount,
                )} paid on ${formatRentDate(payment.paidOn)} by ${
                  RENT_PAYMENT_METHOD_LABELS[payment.method]
                }.`
              : "Select a payment to void."}
          </DialogDescription>
        </DialogHeader>

        {open && payment ? (
          <VoidForm
            key={payment.id}
            payment={payment}
            renterName={renterName}
            onCancel={() => onOpenChange(false)}
            onVoided={async (receipt) => {
              await onVoided(receipt);
              onOpenChange(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
