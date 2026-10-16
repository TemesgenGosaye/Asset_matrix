"use client";

import React, { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileText, Loader2 } from "lucide-react";
import { notify } from "@/lib/feedback/notify";

import AllocationReceiptPrint, {
  type ReceiptDetail,
  type ReceiptPrintDetail,
} from "./AllocationReceiptPrint";

/**
 * The minimum a row needs to carry for its receipt to be printed.
 *
 * Structural on purpose: the inspections worklist row and a terminated-archive
 * row are different views of the same release, but both name the same inspection,
 * so both can drive the same document through the same endpoint. There is exactly
 * one receipt implementation in the app — two buttons that each hand-rolled their
 * own preview would drift, and the archive's would drift first, because nothing on
 * that page would be asserting against it.
 */
export interface TerminationReceiptTarget {
  /** The handback inspection the receipt is snapshotted from. */
  inspectionId: string;
  allocationId: string;
  houseNumber: string;
  hid: string;
  vacatedAt: string | null;
  employee: {
    firstname: string;
    lastname: string;
    employeeNumber: string;
    department?: { name: string } | null;
  } | null;
}

/**
 * Print a termination receipt for a completed handback inspection.
 *
 * The dialog is the receipt's only entry point, and it has no damage, cost or
 * note inputs of its own: it asks the API for the snapshot and prints whatever
 * comes back. That is deliberate — a receipt whose figures could be typed in
 * would be a receipt that can disagree with the inspection it claims to report,
 * and the person signing it has no way to tell which one they are holding.
 *
 * The API enforces the print gate (completed handback inspection)
 * and refuses before writing anything, so a blocked receipt leaves no trace and
 * the reason is shown here rather than as a silent no-op.
 *
 * `inspection: null` is a termination with no handback inspection at all — it has
 * nothing to print from, so the button is withheld and says why, rather than
 * being opened onto a refusal.
 */
export function TerminationReceiptButton({
  inspection,
  disabled,
  blockedReason,
  className,
}: {
  inspection: TerminationReceiptTarget | null;
  disabled?: boolean;
  /**
   * Why the button is withheld, shown as its tooltip. Supplied by the caller so
   * the page's own gate wording (which knows its row) is what the user reads,
   * rather than a second, vaguer explanation invented here.
   */
  blockedReason?: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptPrintDetail | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  const unavailableReason =
    blockedReason ??
    (inspection
      ? null
      : "No handback inspection has been recorded for this house, so there is nothing to print a receipt from.");
  const isDisabled = disabled || !inspection || Boolean(blockedReason);

  const reset = useCallback(() => {
    setReceipt(null);
    setBlocked(null);
  }, []);

  /** Fetch (first print) or re-read (reprint) the frozen snapshot. */
  const openReceipt = useCallback(async () => {
    if (!inspection) return;
    setOpen(true);
    reset();
    setLoading(true);
    try {
      const res = await fetch(
        `/api/house-queue/receipts/${inspection.inspectionId}`,
        {
          method: "POST",
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBlocked(body.error ?? "This receipt cannot be printed yet.");
        return;
      }
      setReceipt(body.receipt as ReceiptPrintDetail);
      if (body.receipt?.isOriginal === false) {
        // Worth saying out loud: the document on screen is a copy, and the file
        // copy is not it.
        notify.info("Reprint — the snapshot of the original print is shown.");
      }
    } catch {
      setBlocked("Network error while loading the receipt.");
    } finally {
      setLoading(false);
    }
  }, [inspection, reset]);

  // The employee's name comes from the allocation, so it is whatever the ledger
  // says — not a field this dialog could edit. A terminated allocation always has
  // an employee row; the null-safe reads only stop a malformed row from taking
  // the page down mid-print.
  const employee = inspection?.employee;
  const detail: ReceiptDetail = {
    allocationId: inspection?.allocationId ?? "",
    status: "terminated",
    terminatedAt: inspection?.vacatedAt ?? null,
    house: { houseNumber: inspection?.houseNumber ?? "" },
    employee: {
      firstname: employee?.firstname ?? "",
      lastname: employee?.lastname ?? "",
      employeeNumber: employee?.employeeNumber ?? "",
      department: employee?.department ?? null,
    },
    terminationReceipt: receipt,
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={className ?? "h-8 gap-1"}
        onClick={() => void openReceipt()}
        disabled={isDisabled}
        title={unavailableReason ?? "Print the termination receipt"}
        aria-label={unavailableReason ?? "Print the termination receipt"}
      >
        <FileText className="h-3.5 w-3.5" />
        Receipt
      </Button>

      <Dialog
        open={open && Boolean(inspection)}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Termination receipt — house {inspection?.houseNumber}
            </DialogTitle>
            <DialogDescription>
              Populated from the completed handback inspection (
              {inspection?.hid}). The figures are snapshotted on first print and
              frozen, so a reprint matches the original.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading receipt…
            </div>
          ) : blocked ? (
            <div className="border-destructive/40 bg-destructive/5 rounded-lg border p-4 text-sm">
              <p className="text-destructive font-medium">
                Receipt not available
              </p>
              <p className="text-muted-foreground mt-1">{blocked}</p>
            </div>
          ) : receipt ? (
            <AllocationReceiptPrint
              detail={detail}
              variant="handback"
              open
              onClose={() => setOpen(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
