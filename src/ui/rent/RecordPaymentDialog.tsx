"use client";

/**
 * Confirm and record a rent payment for one month.
 *
 * Deliberately small, as specified: date paid (defaults to today), payment
 * method, optional reference and note. The submit button shows a loading state
 * and disables on submit so a double-click cannot produce two receipts - and the
 * server enforces that too with a conditional update.
 *
 * The form body is a separate component mounted ONLY while the dialog is open.
 * That is how the field state gets its "today" default on every open without a
 * reset-in-effect (which the React Compiler lint rules reject, and which causes
 * an extra render on open in any case).
 */

import { useCallback, useId, useState } from "react";
import { Loader2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  NOTE_MAX,
  REFERENCE_NUMBER_MAX,
  RENT_PAYMENT_METHOD_OPTIONS,
} from "@/lib/rent/constants";
import { recordPaymentSchema } from "@/lib/rent/schemas";
import { todayDateOnly, type RentInstallmentDto } from "@/lib/rent/types";
import { formatEtb, formatRentDate } from "./format";

interface PaymentFormProps {
  renterId: string;
  installment: RentInstallmentDto;
  renterName: string;
  onCancel: () => void;
  onRecorded: (receiptNumber: string) => Promise<void> | void;
}

function PaymentForm({
  renterId,
  installment,
  renterName,
  onCancel,
  onRecorded,
}: PaymentFormProps) {
  const [paidOn, setPaidOn] = useState(() => todayDateOnly());
  const [method, setMethod] = useState<string>("Cash");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [note, setNote] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formId = useId();

  const submit = useCallback(async () => {
    if (isSubmitting) return;
    setFormError(null);
    setFieldErrors({});

    const payload = {
      installmentId: installment.id,
      paidOn,
      method,
      referenceNumber,
      note,
    };

    // Same schema the API runs, so a bad date is caught before the round trip.
    const parsed = recordPaymentSchema.safeParse(payload);
    if (!parsed.success) {
      const mapped: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".") || "_root";
        if (!mapped[key]) mapped[key] = issue.message;
      }
      setFieldErrors(mapped);
      // Also state the failure in the banner: a `_root` issue has no field to
      // highlight, and a silent rejection would look like nothing happened.
      setFormError("Please correct the highlighted fields.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/rent/${renterId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setFormError(String(body?.error ?? "Could not record the payment."));
        return;
      }
      await onRecorded(String(body?.receiptNumber ?? ""));
    } catch {
      setFormError(
        "Could not reach the server. Check your connection and retry.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    installment.id,
    isSubmitting,
    method,
    note,
    onRecorded,
    paidOn,
    renterId,
    referenceNumber,
  ]);

  return (
    <>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="space-y-4"
      >
        {formError ? (
          <div
            role="alert"
            className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border p-3 text-sm"
          >
            {formError}
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor={`${formId}-paidOn`}>Date paid</Label>
          <Input
            id={`${formId}-paidOn`}
            type="date"
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
            aria-invalid={Boolean(fieldErrors.paidOn)}
            aria-describedby={
              fieldErrors.paidOn ? `${formId}-paidOn-err` : undefined
            }
            required
          />
          {fieldErrors.paidOn ? (
            <p id={`${formId}-paidOn-err`} className="text-destructive text-xs">
              {fieldErrors.paidOn}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-method`}>Payment method</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger
              id={`${formId}-method`}
              aria-invalid={Boolean(fieldErrors.method)}
              aria-describedby={
                fieldErrors.method ? `${formId}-method-err` : undefined
              }
            >
              <SelectValue placeholder="Select method" />
            </SelectTrigger>
            <SelectContent>
              {RENT_PAYMENT_METHOD_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fieldErrors.method ? (
            <p id={`${formId}-method-err`} className="text-destructive text-xs">
              {fieldErrors.method}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-reference`}>
            Reference number{" "}
            <span className="text-muted-foreground text-xs">(optional)</span>
          </Label>
          <Input
            id={`${formId}-reference`}
            value={referenceNumber}
            onChange={(e) => setReferenceNumber(e.target.value)}
            maxLength={REFERENCE_NUMBER_MAX}
            placeholder="Bank transfer / telebirr reference"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-note`}>
            Note{" "}
            <span className="text-muted-foreground text-xs">(optional)</span>
          </Label>
          <Textarea
            id={`${formId}-note`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={NOTE_MAX}
          />
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
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Recording...
              </>
            ) : (
              "Confirm payment"
            )}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

interface RecordPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  renterId: string;
  renterName: string;
  installment: RentInstallmentDto | null;
  onRecorded: (receiptNumber: string) => Promise<void> | void;
}

export default function RecordPaymentDialog({
  open,
  onOpenChange,
  renterId,
  renterName,
  installment,
  onRecorded,
}: RecordPaymentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record Rent Payment</DialogTitle>
          <DialogDescription>
            {installment
              ? `${renterName} - month ${installment.monthNumber}, due ${formatRentDate(
                  installment.dueDate,
                )}, ${formatEtb(installment.amountDue)}.`
              : "Select a month to settle."}
          </DialogDescription>
        </DialogHeader>

        {open && installment ? (
          <PaymentForm
            key={installment.id}
            renterId={renterId}
            installment={installment}
            renterName={renterName}
            onCancel={() => onOpenChange(false)}
            onRecorded={async (receipt) => {
              await onRecorded(receipt);
              onOpenChange(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
