"use client";

/**
 * Step 4 · Queued — the official voucher.
 *
 * WHY THE LAST STEP IS A DOCUMENT AND NOT A TOAST
 * A toast disappears. What this panel has to be is something an officer can hand
 * across a counter and the employee can take home: a named request, a reference
 * the applicant has no other copy of, the reason exactly as filed, and a link
 * into the queue. So the reference is the largest thing on the panel and it is
 * printed at display size, and everything else on it is either the filed record
 * or a way into the thing that happens next.
 *
 * WHY IT PRINTS
 * The housing module's other two documents — the allocation receipt and the rent
 * receipt — are printed, and this is the third document in the same set. The
 * stylesheet was already in the build (`.house-request-receipt-print`, A4, 12mm,
 * hidden-shell-at-print-time) with nothing rendering into it, so the voucher now
 * portals its print copy into `<body>` and hands the page to the browser's print
 * dialog. The print copy is inline `React.CSSProperties` rather than Tailwind,
 * because the same document is rasterised through html2canvas and inline styles
 * are the only ones html2canvas reproduces faithfully.
 *
 * WHY THE STATUS TONE IS SUCCESS AND NOT PRIMARY
 * Filing is the outcome the reader came for, so it wears the success token — the
 * same one the gate chain wears when all four requirements held. The reader does
 * not have to learn a second colour to know the request was accepted.
 */

import Link from "next/link";
import { createPortal } from "react-dom";
import {
  ArrowUpRight,
  BadgeCheck,
  Printer,
  RotateCcw,
  ScrollText,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Confirmation } from "./useHouseRequestFlow";
import { humaniseEnum } from "./format";
import { Sheet } from "./table-kit";

export interface RequestVoucherProps {
  confirmation: Confirmation;
  onFileAnother: () => void;
}

/**
 * Split an ISO timestamp into a date and a time, in the reader's locale.
 *
 * Deferred until after mount: `toLocaleString` resolves differently between a
 * Node server and a browser, and rendering it on the server would hand React a
 * string to reconcile against a different one on the client.
 */
function stamp(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "—", time: "" };
  return {
    date: d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    time: d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

/** The one field, as a table row, on both the panel and the printed copy. */
function VoucherLine({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <tr className="border-border/60 border-b last:border-b-0">
      <th
        scope="row"
        className="text-muted-foreground w-[38%] px-4 py-2.5 text-left align-top text-[11px] font-semibold tracking-[0.08em] uppercase sm:w-[26%]"
      >
        {label}
      </th>
      <td
        className={
          mono
            ? "px-4 py-2.5 align-top font-mono text-[13px] font-medium"
            : "px-4 py-2.5 align-top text-sm font-medium text-pretty"
        }
      >
        {value}
      </td>
    </tr>
  );
}

export default function RequestVoucher({
  confirmation,
  onFileAnother,
}: RequestVoucherProps) {
  // The print copy portals into `<body>`, which does not exist on the server.
  //
  // A mount-flag state was the obvious answer here and it costs a second render
  // of the whole voucher for no benefit: this panel only exists after a
  // client-side POST, so the server render never reaches it and there is nothing
  // to hydrate. Guarding on the document being present is enough.
  const canPortal = typeof document !== "undefined";

  const { date, time } = stamp(confirmation.submittedAt);
  const type = confirmation.houseCategory;

  const printCopy = (
    <div className="house-request-receipt-print" aria-hidden="true">
      <div
        style={{
          fontFamily: '"Source Serif 4", Georgia, "Times New Roman", serif',
          color: "#000",
          background: "#fff",
          padding: "4mm",
          fontSize: "11pt",
          lineHeight: 1.45,
        }}
      >
        <div
          className="house-request-receipt-copy"
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "8mm",
            borderBottom: "2px solid #000",
            paddingBottom: "4mm",
            marginBottom: "5mm",
          }}
        >
          <div>
            <div style={{ fontSize: "8pt", letterSpacing: "0.14em" }}>
              METAHARA SUGAR FACTORY · HOUSING ALLOCATION MODULE
            </div>
            <div style={{ fontSize: "19pt", fontWeight: 700, lineHeight: 1.2 }}>
              House Request Voucher
            </div>
          </div>
          <div style={{ textAlign: "right", fontSize: "9pt" }}>
            <div style={{ fontSize: "8pt", letterSpacing: "0.12em" }}>
              REQUEST REFERENCE
            </div>
            <div style={{ fontSize: "16pt", fontWeight: 700 }}>
              {confirmation.requestId || "—"}
            </div>
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <th
                scope="row"
                style={{
                  width: "32%",
                  textAlign: "left",
                  fontSize: "8pt",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  padding: "2mm 3mm 2mm 0",
                  borderBottom: "1px solid #999",
                  verticalAlign: "top",
                }}
              >
                Employee
              </th>
              <td style={{ padding: "2mm 0", borderBottom: "1px solid #999" }}>
                <strong>{confirmation.fullName}</strong>
                <span style={{ fontFamily: "monospace", marginLeft: "3mm" }}>
                  {confirmation.employeeNumber}
                </span>
              </td>
            </tr>
            <tr>
              <th
                scope="row"
                style={{
                  textAlign: "left",
                  fontSize: "8pt",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  padding: "2mm 3mm 2mm 0",
                  borderBottom: "1px solid #999",
                  verticalAlign: "top",
                }}
              >
                House band applied
              </th>
              <td style={{ padding: "2mm 0", borderBottom: "1px solid #999" }}>
                {type ? `Type ${type}` : "Not mapped to a published band"}
              </td>
            </tr>
            <tr>
              <th
                scope="row"
                style={{
                  textAlign: "left",
                  fontSize: "8pt",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  padding: "2mm 3mm 2mm 0",
                  borderBottom: "1px solid #999",
                  verticalAlign: "top",
                }}
              >
                Filed
              </th>
              <td style={{ padding: "2mm 0", borderBottom: "1px solid #999" }}>
                {date}
                {time ? ` at ${time}` : ""}
              </td>
            </tr>
            <tr>
              <th
                scope="row"
                style={{
                  textAlign: "left",
                  fontSize: "8pt",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  padding: "2mm 3mm 2mm 0",
                  verticalAlign: "top",
                }}
              >
                Status
              </th>
              <td style={{ padding: "2mm 0" }}>
                {humaniseEnum(confirmation.status)}
              </td>
            </tr>
          </tbody>
        </table>

        <div
          className="house-request-receipt-copy"
          style={{
            marginTop: "6mm",
            border: "1px solid #000",
            padding: "4mm",
          }}
        >
          <div style={{ fontSize: "8pt", letterSpacing: "0.12em" }}>
            REASON AS FILED
          </div>
          <div style={{ marginTop: "2mm", whiteSpace: "pre-wrap" }}>
            {confirmation.remarks}
          </div>
        </div>

        <p style={{ marginTop: "6mm", fontSize: "9pt" }}>
          This request has been entered into the House Queue. Priority is
          calculated by the published multi-criteria allocation policy and not
          by the order requests are received. This voucher is the
          applicant&apos;s only written record of the application — keep it.
        </p>
      </div>
    </div>
  );

  return (
    <>
      {canPortal ? createPortal(printCopy, document.body) : null}

      <Sheet
        label="Request filed"
        tone="success"
        bodyClassName=""
        className="h-full"
      >
        {/* ── What just happened ──────────────────────────────────────────── */}
        <div className="border-success-foreground/25 bg-success-bg flex flex-wrap items-start justify-between gap-4 border-b px-5 py-5 sm:px-6">
          <div className="flex min-w-0 items-start gap-4">
            <span className="bg-card text-success-foreground ring-success-foreground/30 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1">
              <BadgeCheck className="h-6 w-6" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-muted-foreground text-[11px] font-bold tracking-[0.12em] uppercase">
                Step 4 · Filed to the queue
              </p>
              <h2 className="housing-serif mt-1 text-xl leading-tight font-bold tracking-tight text-balance sm:text-2xl">
                {confirmation.fullName} is in the House Queue
              </h2>
              <p className="text-muted-foreground mt-1.5 text-sm text-pretty">
                The allocator ranks it on the next calculation — not in the
                order requests arrive.
              </p>
            </div>
          </div>
        </div>

        {/* ── The reference, at the size of a thing you have to keep ──────── */}
        <div className="border-border/60 flex flex-col gap-4 border-b px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div className="min-w-0">
            <p className="text-muted-foreground text-[11px] font-bold tracking-[0.12em] uppercase">
              Request reference
            </p>
            <p className="text-foreground housing-serif mt-1.5 text-3xl leading-none font-bold tracking-tight break-all sm:text-4xl">
              {confirmation.requestId || "—"}
            </p>
            <p className="text-muted-foreground mt-2 text-xs text-pretty">
              This is the only written record of the application.
            </p>
          </div>

          <dl className="grid shrink-0 grid-cols-2 gap-x-6 gap-y-2 text-xs sm:text-right">
            <dt className="text-muted-foreground">Filed</dt>
            <dd className="text-foreground font-semibold">{date}</dd>
            <dt className="text-muted-foreground">Band</dt>
            <dd className="text-foreground font-semibold">
              {type ? `Type ${type}` : "—"}
            </dd>
          </dl>
        </div>

        {/* ── The filed record, verbatim ──────────────────────────────────── */}
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            The house request as filed for {confirmation.fullName}.
          </caption>
          <tbody>
            <VoucherLine label="Employee" value={confirmation.fullName} />
            <VoucherLine
              label="Employee ID"
              mono
              value={confirmation.employeeNumber}
            />
            <VoucherLine label="Filed" value={date} />
            <VoucherLine
              label="Reason"
              value={
                <span className="font-normal whitespace-pre-wrap">
                  {confirmation.remarks}
                </span>
              }
            />
          </tbody>
        </table>

        {/* ── What happens next ───────────────────────────────────────────── */}
        <div className="border-border/60 bg-secondary flex flex-wrap items-center gap-2 border-t px-5 py-3.5 sm:px-6">
          <ScrollText
            className="text-muted-foreground h-3.5 w-3.5 shrink-0"
            aria-hidden
          />
          <p className="text-muted-foreground mr-auto text-xs text-pretty">
            The allocator ranks filed requests by the published policy. Nothing
            further is needed from the counter.
          </p>

          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 font-medium"
            onClick={() => window.print()}
          >
            <Printer className="h-3.5 w-3.5" aria-hidden />
            Print voucher
          </Button>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="gap-1.5 font-medium"
          >
            <Link href="/house-queue">
              View in House Queue
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onFileAnother}
            className="gap-1.5 font-medium"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Search another
          </Button>
        </div>
      </Sheet>
    </>
  );
}
