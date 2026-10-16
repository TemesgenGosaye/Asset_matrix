"use client";

/**
 * Renter detail: lease terms, the full monthly schedule and payment history.
 *
 * The schedule opens STARTING FROM THE DAY THE RENT STARTED and lists every month
 * of the lease in order, each row showing month number, due date, amount, a
 * status badge and a working "Paid" button.
 *
 * Chronological payment order is enforced server-side (only the earliest unpaid
 * month may be settled). This view mirrors that rule so the UI never offers an
 * action the API will reject: only the earliest unpaid month gets an enabled
 * Paid button; later months are disabled with an explanatory tooltip.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Lock, Pencil, Printer, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { notify } from "@/lib/feedback/notify";
import {
  GENDER_LABELS,
  RENT_LEASE_STATUS_LABELS,
  RENT_PAYMENT_METHOD_LABELS,
  RENT_TYPE_LABELS,
} from "@/lib/rent/constants";
import { formatPhoneForDisplay } from "@/lib/rent/validators";
import type { RentCapabilities } from "@/lib/rent/access";
import type {
  RentInstallmentDto,
  RentPaymentDto,
  RentRenterDetailResponse,
} from "@/lib/rent/types";
import RentReceiptPrint from "./RentReceiptPrint";
import RecordPaymentDialog from "./RecordPaymentDialog";
import TerminateLeaseDialog from "./TerminateLeaseDialog";
import VoidPaymentDialog from "./VoidPaymentDialog";
import {
  formatEtb,
  formatEtbNumber,
  formatRentDate,
  toEthiopianDate,
  weekdayShort,
} from "./format";
import {
  MonthsPaidIndicator,
  RentInstallmentStatusBadge,
  RentStatusBadge,
} from "./status-badges";

interface RenterDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  renterId: string | null;
  capabilities: RentCapabilities;
  ethiopianCalendar: boolean;
  onChanged: () => Promise<void> | void;
  onEdit: (renter: RentRenterDetailResponse["renter"]) => void;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium">{value}</dd>
    </div>
  );
}

export default function RenterDetailDialog({
  open,
  onOpenChange,
  renterId,
  capabilities,
  ethiopianCalendar,
  onChanged,
  onEdit,
}: RenterDetailDialogProps) {
  /**
   * The last fetched payload, tagged with the renter it belongs to.
   *
   * Tagging rather than holding a bare payload is what makes a renter switch
   * safe. The tag is the authority for "is what I am about to render actually
   * the renter in the header?", and it is DERIVED during render - no state has
   * to be synchronously reset from inside the effect, which is both a
   * React anti-pattern and the thing that previously let renter A's name,
   * National ID, phones, receipts and live Paid buttons render under renter B's
   * header until B's fetch landed.
   */
  const [loaded, setLoaded] = useState<{
    renterId: string;
    payload: RentRenterDetailResponse | null;
    error: string | null;
  } | null>(null);
  /**
   * Bumped to refetch. The effect keys off it, so a reload is just a state
   * change rather than a second code path that has to be kept in sync.
   */
  const [reloadToken, setReloadToken] = useState(0);

  const [paymentTarget, setPaymentTarget] = useState<RentInstallmentDto | null>(
    null,
  );
  const [voidTarget, setVoidTarget] = useState<RentPaymentDto | null>(null);
  const [terminateOpen, setTerminateOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [receiptMonth, setReceiptMonth] = useState<number | null>(null);

  /**
   * Load the renter and its schedule.
   *
   * Every `setState` sits AFTER an `await`, so this is a genuine data fetch
   * rather than a synchronous state write in an effect. A `cancelled` flag drops
   * a response that arrives after the dialog closed or the renter changed, so a
   * slow reply can never overwrite fresher data.
   */
  useEffect(() => {
    if (!open || !renterId) return;

    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(`/api/rent/${renterId}`, { cache: "no-store" });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setLoaded({
            renterId,
            payload: null,
            error: String(body?.error ?? "Failed to load the renter."),
          });
          return;
        }
        setLoaded({
          renterId,
          payload: body as RentRenterDetailResponse,
          error: null,
        });
      } catch {
        if (cancelled) return;
        setLoaded({
          renterId,
          payload: null,
          error: "Could not reach the server.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, renterId, reloadToken]);

  /** Refetch the detail payload. */
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  /**
   * Only what belongs to the renter currently in the header.
   *
   * `loaded` outlives `open` and is reused across a renter switch, so the tag is
   * checked on every render rather than cleared imperatively.
   */
  const current = loaded && loaded.renterId === renterId ? loaded : null;
  const data = current?.payload ?? null;
  const loadError = current?.error ?? null;

  /** True while the current renter has no payload and no error yet. */
  const isLoading = open && current === null;

  const renter = data?.renter ?? null;
  // Memoised so the derived `useMemo`s below keep a stable dependency even
  // before the first response lands (`?? []` would otherwise be a new array on
  // every render).
  const installments = useMemo(() => data?.installments ?? [], [data]);

  /**
   * The earliest unpaid month. Mirrors the server's chronological-order rule so
   * only that row offers an enabled Paid button.
   */
  const earliestUnpaidId = useMemo(() => {
    const unpaid = installments.filter(
      (i) => i.status === "UNPAID" && i.voidedAt === null,
    );
    return unpaid.length > 0 ? unpaid[0].id : null;
  }, [installments]);

  const isTerminated = renter?.status === "Terminated";

  const afterPayment = useCallback(
    async (receiptNumber: string) => {
      reload();
      await onChanged();
      notify.success({
        title: `Payment recorded - ${receiptNumber}`,
        description:
          "Months paid, total paid and outstanding have been updated.",
      });
    },
    [onChanged, reload],
  );

  const afterVoid = useCallback(
    async (receiptNumber: string) => {
      reload();
      await onChanged();
      notify.success({
        title: `Receipt ${receiptNumber} voided`,
        description: "That month is payable again.",
      });
    },
    [onChanged, reload],
  );

  const afterTerminate = useCallback(
    async (voidedMonths: number) => {
      reload();
      await onChanged();
      notify.success({
        title: "Lease terminated",
        description: `${voidedMonths} unpaid month${
          voidedMonths === 1 ? "" : "s"
        } marked voided.`,
      });
    },
    [onChanged, reload],
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              {renter?.fullName ?? "Renter"}
              {renter ? (
                <RentStatusBadge status={renter.displayStatus} />
              ) : null}
            </DialogTitle>
            <DialogDescription>
              {renter
                ? `${RENT_TYPE_LABELS[renter.rentType]}${
                    renter.rentTypeDetail ? ` — ${renter.rentTypeDetail}` : ""
                  } · started ${formatRentDate(renter.startDate)} · ${renter.termMonths} months`
                : "Loading lease details..."}
            </DialogDescription>
          </DialogHeader>

          {loadError ? (
            <div
              role="alert"
              className="border-destructive/40 bg-destructive/10 text-destructive flex items-center justify-between rounded-lg border p-3 text-sm"
            >
              <span>{loadError}</span>
              <Button size="sm" variant="outline" onClick={reload}>
                Retry
              </Button>
            </div>
          ) : null}

          {isLoading && !renter ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-40 w-full rounded-lg" />
            </div>
          ) : null}

          {renter ? (
            <div className="space-y-5">
              <dl className="grid grid-cols-2 gap-4 rounded-lg border p-4 lg:grid-cols-4">
                <Field
                  label="National ID"
                  value={
                    <span className="font-mono">
                      {renter.nationalId}
                      {renter.nationalIdMasked ? (
                        <Badge variant="muted" className="ml-2">
                          Masked
                        </Badge>
                      ) : null}
                    </span>
                  }
                />
                <Field label="Gender" value={GENDER_LABELS[renter.gender]} />
                <Field
                  label="Phone(s)"
                  value={
                    renter.phones.length > 0
                      ? renter.phones
                          .map(
                            (p) =>
                              `${formatPhoneForDisplay(p.phone)}${
                                p.isPrimary ? " (primary)" : ""
                              }`,
                          )
                          .join(", ")
                      : "—"
                  }
                />
                <Field
                  label="Monthly price"
                  value={formatEtb(renter.monthlyPrice)}
                />
                <Field
                  label="Start date"
                  value={
                    ethiopianCalendar
                      ? (toEthiopianDate(renter.startDate) ?? "—")
                      : formatRentDate(renter.startDate)
                  }
                />
                <Field
                  label="End date"
                  value={
                    ethiopianCalendar
                      ? (toEthiopianDate(renter.endDate) ?? "—")
                      : formatRentDate(renter.endDate)
                  }
                />
                <Field
                  label="Lease status"
                  value={RENT_LEASE_STATUS_LABELS[renter.status]}
                />
                <Field
                  label="Next due"
                  value={
                    renter.totals.nextDueDate
                      ? ethiopianCalendar
                        ? (toEthiopianDate(renter.totals.nextDueDate) ?? "—")
                        : formatRentDate(renter.totals.nextDueDate)
                      : "Nothing outstanding"
                  }
                />
              </dl>

              {isTerminated && renter.terminationReason ? (
                <div className="border-destructive/40 bg-destructive/10 rounded-lg border p-3 text-sm">
                  <p className="font-medium">
                    Lease terminated
                    {renter.terminatedAt
                      ? ` on ${formatRentDate(renter.terminatedAt.slice(0, 10))}`
                      : ""}
                  </p>
                  <p className="text-muted-foreground mt-0.5">
                    {renter.terminationReason}
                  </p>
                </div>
              ) : null}

              {renter.deletedAt ? (
                <div className="rounded-lg border border-dashed p-3 text-sm">
                  <p className="font-medium">
                    Archived on {formatRentDate(renter.deletedAt.slice(0, 10))}.
                  </p>
                  {renter.archivedReason ? (
                    <p className="text-muted-foreground mt-0.5">
                      {renter.archivedReason}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <Tabs defaultValue="schedule">
                <TabsList>
                  <TabsTrigger value="schedule">
                    Schedule ({installments.length})
                  </TabsTrigger>
                  <TabsTrigger value="receipts">
                    Receipts (
                    {installments.reduce((n, i) => n + i.payments.length, 0)})
                  </TabsTrigger>
                </TabsList>

                {/* ---- Schedule ---- */}
                <TabsContent value="schedule" className="mt-3 space-y-3">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div className="w-40">
                      <MonthsPaidIndicator
                        monthsPaid={renter.totals.monthsPaid}
                        totalMonths={renter.totals.totalMonths}
                      />
                    </div>
                    <dl className="flex flex-wrap gap-4 text-sm">
                      <div>
                        <dt className="text-muted-foreground text-xs">
                          Total paid
                        </dt>
                        <dd className="font-medium">
                          {formatEtb(renter.totals.totalPaid)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground text-xs">
                          Contract value
                        </dt>
                        <dd className="font-medium">
                          {formatEtb(renter.totals.totalContractValue)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground text-xs">
                          Outstanding
                        </dt>
                        <dd className="font-medium">
                          {formatEtb(renter.totals.outstanding)}
                        </dd>
                      </div>
                      {renter.totals.overdueMonths > 0 ? (
                        <div>
                          <dt className="text-muted-foreground text-xs">
                            Overdue
                          </dt>
                          <dd className="text-warning-foreground font-medium">
                            {renter.totals.overdueMonths} month
                            {renter.totals.overdueMonths === 1 ? "" : "s"}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  </div>

                  {/* The schedule opens at the rent start date and lists every
                      month of the term in chronological order. */}
                  <div className="max-h-[45vh] overflow-y-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <caption className="sr-only">
                        Monthly rent schedule for {renter.fullName}, from{" "}
                        {formatRentDate(renter.startDate)} to{" "}
                        {formatRentDate(renter.endDate)}
                      </caption>
                      <thead className="bg-muted sticky top-0 z-10">
                        <tr>
                          <th
                            scope="col"
                            className="px-3 py-2 text-left text-xs font-semibold"
                          >
                            Month
                          </th>
                          <th
                            scope="col"
                            className="px-3 py-2 text-left text-xs font-semibold"
                          >
                            Due date
                          </th>
                          <th
                            scope="col"
                            className="px-3 py-2 text-right text-xs font-semibold"
                          >
                            Amount
                          </th>
                          <th
                            scope="col"
                            className="px-3 py-2 text-left text-xs font-semibold"
                          >
                            Status
                          </th>
                          <th
                            scope="col"
                            className="px-3 py-2 text-left text-xs font-semibold"
                          >
                            Receipt / Method
                          </th>
                          <th
                            scope="col"
                            className="px-3 py-2 text-right text-xs font-semibold"
                          >
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {installments.map((row) => {
                          const isEarliestUnpaid = row.id === earliestUnpaidId;
                          const canPay =
                            capabilities.pay &&
                            !isTerminated &&
                            row.status === "UNPAID" &&
                            isEarliestUnpaid;

                          return (
                            <tr key={row.id} className="border-t">
                              <td className="px-3 py-2 font-medium tabular-nums">
                                {row.monthNumber}
                                <span className="text-muted-foreground text-xs">
                                  /{renter.termMonths}
                                </span>
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                {ethiopianCalendar
                                  ? (toEthiopianDate(row.dueDate) ?? "—")
                                  : formatRentDate(row.dueDate)}
                                <span className="text-muted-foreground ml-1 text-xs">
                                  {weekdayShort(row.dueDate)}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {formatEtbNumber(row.amountDue)}
                              </td>
                              <td className="px-3 py-2">
                                <RentInstallmentStatusBadge installment={row} />
                                {row.overdue ? (
                                  <span className="text-muted-foreground ml-1 text-xs">
                                    {row.daysOverdue}d
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-3 py-2">
                                {row.receiptNumber ? (
                                  <>
                                    <span className="font-mono text-xs">
                                      {row.receiptNumber}
                                    </span>
                                    {row.paymentMethod ? (
                                      <span className="text-muted-foreground ml-1 text-xs">
                                        {
                                          RENT_PAYMENT_METHOD_LABELS[
                                            row.paymentMethod
                                          ]
                                        }
                                      </span>
                                    ) : null}
                                    {row.referenceNumber ? (
                                      <span className="text-muted-foreground ml-1 font-mono text-xs">
                                        {row.referenceNumber}
                                      </span>
                                    ) : null}
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="ml-1 h-6 px-1.5"
                                      onClick={() => {
                                        setReceiptMonth(row.monthNumber);
                                        setPrintOpen(true);
                                      }}
                                    >
                                      <Printer className="h-3 w-3" />
                                      <span className="sr-only">
                                        Print receipt for month{" "}
                                        {row.monthNumber}
                                      </span>
                                    </Button>
                                  </>
                                ) : row.status === "VOIDED" ? (
                                  <span
                                    className="text-muted-foreground text-xs"
                                    title={row.voidReason ?? undefined}
                                  >
                                    {row.voidReason ?? "Voided"}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">
                                    —
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {row.status === "UNPAID" ? (
                                  canPay ? (
                                    <Button
                                      size="sm"
                                      onClick={() => setPaymentTarget(row)}
                                    >
                                      <Receipt className="mr-1.5 h-3.5 w-3.5" />
                                      Paid
                                    </Button>
                                  ) : (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span>
                                          {/* `title` as well as the tooltip: the
                                              reason a month cannot be paid is
                                              otherwise hover-only, so keyboard
                                              and touch users get nothing. */}
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            disabled
                                            title={
                                              isTerminated
                                                ? "This lease has been terminated."
                                                : !capabilities.pay
                                                  ? "You do not have permission to record payments."
                                                  : "Settle the earliest unpaid month first."
                                            }
                                          >
                                            {isTerminated ? (
                                              <Lock className="mr-1.5 h-3.5 w-3.5" />
                                            ) : null}
                                            Paid
                                          </Button>
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        {isTerminated
                                          ? "This lease has been terminated."
                                          : !capabilities.pay
                                            ? "You do not have permission to record payments."
                                            : "Settle the earliest unpaid month first."}
                                      </TooltipContent>
                                    </Tooltip>
                                  )
                                ) : (
                                  <span className="text-muted-foreground text-xs">
                                    {row.status === "PAID" && row.paidAt
                                      ? `Paid ${formatRentDate(row.paidAt)}`
                                      : "Voided"}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>

                {/* ---- Receipts ---- */}
                <TabsContent value="receipts" className="mt-3">
                  <ReceiptList
                    installments={installments}
                    capabilities={capabilities}
                    ethiopianCalendar={ethiopianCalendar}
                    onPrintReceipt={(monthNumber) => {
                      setReceiptMonth(monthNumber);
                      setPrintOpen(true);
                    }}
                    onVoid={setVoidTarget}
                  />
                </TabsContent>
              </Tabs>
            </div>
          ) : null}

          <Separator />

          <DialogFooter className="flex-wrap gap-2">
            {capabilities.update && renter ? (
              <Button variant="outline" onClick={() => onEdit(renter)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
            ) : null}
            {capabilities.terminate && renter && !isTerminated ? (
              <Button variant="outline" onClick={() => setTerminateOpen(true)}>
                <Ban className="mr-2 h-4 w-4" />
                Terminate lease
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setPrintOpen(true)}>
              <Printer className="mr-2 h-4 w-4" />
              Print statement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {renter ? (
        <RecordPaymentDialog
          open={paymentTarget !== null}
          onOpenChange={(next) => {
            if (!next) setPaymentTarget(null);
          }}
          renterId={renter.id}
          renterName={renter.fullName}
          installment={paymentTarget}
          onRecorded={afterPayment}
        />
      ) : null}

      <VoidPaymentDialog
        open={voidTarget !== null}
        onOpenChange={(next) => {
          if (!next) setVoidTarget(null);
        }}
        payment={voidTarget}
        renterName={renter?.fullName ?? ""}
        onVoided={afterVoid}
      />

      {renter ? (
        <TerminateLeaseDialog
          open={terminateOpen}
          onOpenChange={setTerminateOpen}
          renter={renter}
          installments={installments}
          onTerminated={afterTerminate}
        />
      ) : null}

      <RentReceiptPrint
        open={printOpen}
        // Reset the target too: `receiptMonth` is what selects a receipt vs the
        // full statement, so leaving it set would print a stale month's receipt
        // when the next renter asked for their statement.
        onClose={() => {
          setPrintOpen(false);
          setReceiptMonth(null);
        }}
        renter={renter}
        installments={installments}
        receiptMonth={receiptMonth}
        ethiopianCalendar={ethiopianCalendar}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Receipt list
// ---------------------------------------------------------------------------

function ReceiptList({
  installments,
  capabilities,
  ethiopianCalendar,
  onPrintReceipt,
  onVoid,
}: {
  installments: RentInstallmentDto[];
  capabilities: RentCapabilities;
  ethiopianCalendar: boolean;
  onPrintReceipt: (monthNumber: number) => void;
  onVoid: (payment: RentPaymentDto) => void;
}) {
  const payments = useMemo(
    () =>
      installments
        .flatMap((i) => i.payments)
        .sort((a, b) => (a.paidOn < b.paidOn ? 1 : -1)),
    [installments],
  );

  if (payments.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
        No receipts have been issued for this lease yet.
      </p>
    );
  }

  return (
    <div className="max-h-[45vh] overflow-y-auto rounded-lg border">
      <table className="w-full text-sm">
        <caption className="sr-only">Rent payment receipts</caption>
        <thead className="bg-muted sticky top-0 z-10">
          <tr>
            <th
              scope="col"
              className="px-3 py-2 text-left text-xs font-semibold"
            >
              Receipt
            </th>
            <th
              scope="col"
              className="px-3 py-2 text-left text-xs font-semibold"
            >
              Month
            </th>
            <th
              scope="col"
              className="px-3 py-2 text-left text-xs font-semibold"
            >
              Paid on
            </th>
            <th
              scope="col"
              className="px-3 py-2 text-left text-xs font-semibold"
            >
              Method
            </th>
            <th
              scope="col"
              className="px-3 py-2 text-right text-xs font-semibold"
            >
              Amount
            </th>
            <th
              scope="col"
              className="px-3 py-2 text-right text-xs font-semibold"
            >
              Action
            </th>
          </tr>
        </thead>
        <tbody>
          {payments.map((payment) => {
            const isVoided = payment.voidedAt !== null;
            return (
              <tr
                key={payment.id}
                className={`border-t ${isVoided ? "text-muted-foreground" : ""}`}
              >
                <td className="px-3 py-2 font-mono text-xs">
                  {payment.receiptNumber}
                  {isVoided ? (
                    <Badge variant="muted" className="ml-2">
                      Voided
                    </Badge>
                  ) : null}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {payment.monthNumber}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {ethiopianCalendar
                    ? (toEthiopianDate(payment.paidOn) ?? "—")
                    : formatRentDate(payment.paidOn)}
                </td>
                <td className="px-3 py-2">
                  {RENT_PAYMENT_METHOD_LABELS[payment.method]}
                  {payment.referenceNumber ? (
                    <span className="text-muted-foreground ml-1 font-mono text-xs">
                      {payment.referenceNumber}
                    </span>
                  ) : null}
                  {payment.note ? (
                    <span className="text-muted-foreground block text-xs">
                      {payment.note}
                    </span>
                  ) : null}
                  {isVoided && payment.voidReason ? (
                    <span className="block text-xs">
                      Reason: {payment.voidReason}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatEtbNumber(payment.amount)}
                </td>
                <td className="px-3 py-2 text-right">
                  {!isVoided && capabilities.void ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onVoid(payment)}
                      title="Void this payment"
                    >
                      <Ban className="mr-1.5 h-3.5 w-3.5" />
                      Void
                    </Button>
                  ) : !isVoided ? null : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onPrintReceipt(payment.monthNumber)}
                      title="Print receipt"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      <span className="sr-only">
                        Print receipt {payment.receiptNumber}
                      </span>
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
