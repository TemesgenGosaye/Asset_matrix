"use client";

/**
 * Printable rent receipt and lease statement.
 *
 * Follows the print architecture established by this codebase's house
 * allocation receipts (`src/ui/houses/AllocationReceiptPrint.tsx`): a preview
 * dialog plus a print-only copy portalled into `<body>`, so `window.print()`
 * sees only the document. Every visual token - frame, palette, rubber stamp,
 * issuer name seal - comes from the shared house style in
 * `src/ui/receipt/house-style.tsx`, so a rent receipt on paper is
 * indistinguishable from a house handover form.
 *
 * Two documents:
 *  - "receipt"  - one settled month, with the payment detail behind it.
 *  - "statement" - the whole lease, one line per month plus a reconciliation
 *    block (invoiced / received / outstanding) and signature lines.
 *
 * PDF generation rasterises with html2canvas and then slices the canvas into
 * A4-height bands, so a 120-month statement paginates across as many pages as
 * it needs instead of being shrunk onto one.
 *
 * Design rules this document follows, which are the reason it reads as an
 * official record rather than a screen dump:
 *  - The amount appears twice: as figures, and written out in words in both
 *    Amharic and English (`lib/rent/amount-words`). A figure written only in
 *    digits can be altered by hand without the alteration being visible.
 *  - Sections are titled bilingually, so a reader can find the part they need
 *    without reading the whole page.
 *  - The stamp sits in whitespace, never over a column a reader has to verify.
 *  - The page counter reflects the real paginated height of the content, not a
 *    hard-coded `1/1`.
 *  - Nothing about who signed is asserted unless the ledger records it. The
 *    cashier and the rent admin sign on dotted rules because `rent_payments` has
 *    no `recordedBy` column; printing a session user's name next to a signature
 *    line would attribute a payment to whoever happened to open the dialog.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { Download, Loader2, Printer } from "lucide-react";
import { notify } from "@/lib/feedback/notify";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  RENT_DISPLAY_STATUS_LABELS,
  RENT_PAYMENT_METHOD_LABELS,
  RENT_TYPE_LABELS,
  GENDER_LABELS,
} from "@/lib/rent/constants";
import { formatPhoneForDisplay } from "@/lib/rent/validators";
import {
  amountInAmharicWords,
  amountInEnglishWords,
} from "@/lib/rent/amount-words";
import type { RentInstallmentDto, RentRenterDto } from "@/lib/rent/types";
import {
  BRAND_LOGO_SRC,
  BRASS,
  Dots,
  GUNMETAL,
  MONO_FONT,
  Mono,
  NameStamp,
  NAVY,
  OVERDUE,
  PAID,
  PALE_NAVY,
  PAPER_SOFT,
  RULE,
  StampOverlay,
  VOIDED,
  FRAME_WIDTH_MM,
  captionStyle,
  formFooterCellStyle,
  frameStyle,
  headerBrandCellStyle,
  headerMetaCellStyle,
  subscribeToNothing,
  tableStyle,
  tdCenterStyle,
  tdRightStyle,
  tdStyle,
  thStyle,
} from "@/ui/receipt/house-style";
import { DocumentQrCode } from "@/ui/receipt/document-qr";
import {
  formatEtb,
  formatRentDate,
  formatRentDateNumeric,
  toEthiopianDate,
} from "./format";

/**
 * CSS millimetres per pixel at 96dpi.
 *
 * Used to turn the frame's measured pixel width back into millimetres, so the
 * page count is derived from the same physical size the printer will use rather
 * than from a hard-coded pixel figure.
 */
const PX_PER_MM_CORRECTION = 96 / 25.4;

/**
 * The factory's own form reference for this document.
 *
 * Named in the same `OF/MSF/<dept>/<n>` shape as the house handover forms
 * (`OF/MSF/HRSM/293`, `OF/MSF/HRMS/291`), so the paper in a renter's hand is
 * traceable to a stationery item the office actually stocks.
 */
const RENT_RECEIPT_FORM_NO = "OF/MSF/PHA/RENT-01";

/**
 * A section heading: the bilingual title, and a hairline that runs out to the
 * right edge of the page.
 *
 * The rule is a sibling `span` rather than a `::after` pseudo-element because
 * inline styles are the only styling html2canvas reproduces, and a pseudo-element
 * is not in the markup it rasterises.
 */
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        fontSize: "9.5pt",
        fontWeight: 700,
        color: NAVY,
        marginBottom: "4px",
      }}
    >
      <span>{children}</span>
      <span
        style={{ flex: 1, height: "1px", background: RULE, marginLeft: "8px" }}
      />
    </div>
  );
}

/**
 * The label/value list used by the Renter and Payment blocks.
 *
 * A table with `tableLayout: auto` rather than a `dl`, and each pair a `<tr>` of
 * two cells rather than CSS grid: html2canvas, which rasterises the PDF copy of
 * this document, reproduces table layout faithfully but CSS grid only
 * partially. Built as tables, the downloaded PDF and the browser's own print
 * output come out identical.
 */
function DefList({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <table style={{ ...tableStyle, tableLayout: "auto", ...style }}>
      <tbody>{children}</tbody>
    </table>
  );
}

/** One label/value pair: the term on the left, the entry right-aligned. */
function DefRow({
  label,
  children,
  valueStyle,
}: {
  label: string;
  children: React.ReactNode;
  valueStyle?: React.CSSProperties;
}) {
  return (
    <tr>
      <td
        style={{
          color: GUNMETAL,
          fontSize: "8.3pt",
          padding: "3.5px 8px 3.5px 0",
          borderBottom: `1px solid ${RULE}`,
          whiteSpace: "nowrap",
          verticalAlign: "middle",
        }}
      >
        {label}
      </td>
      <td
        style={{
          fontWeight: 600,
          textAlign: "right",
          padding: "3.5px 0",
          borderBottom: `1px solid ${RULE}`,
          verticalAlign: "middle",
          ...valueStyle,
        }}
      >
        {children}
      </td>
    </tr>
  );
}

/** The status pill in the Payment block. */
function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0 5px",
        border: `1px solid ${NAVY}`,
        borderRadius: "3px",
        color: color === NAVY ? NAVY : color,
        fontWeight: 600,
        fontSize: "8pt",
      }}
    >
      {label}
    </span>
  );
}

/** The live (non-voided) receipt for a settled month. */
function livePaymentOf(row: RentInstallmentDto) {
  return row.payments.find((p) => p.voidedAt === null) ?? null;
}

/** Human label for a month's state. */
function monthStatusLabel(row: RentInstallmentDto): {
  label: string;
  color?: string;
} {
  if (row.status === "VOIDED") return { label: "Voided", color: VOIDED };
  if (row.status === "PAID") return { label: "Paid", color: PAID };
  if (row.overdue) return { label: "Overdue", color: OVERDUE };
  return { label: "Unpaid" };
}

/**
 * Estimate how many A4 pages the rendered sheet will occupy.
 *
 * The browser does the real pagination when printing, but the document still
 * has to *print* a page number, and a hard-coded `1/1` on a 120-month statement
 * is simply wrong. Measuring the sheet against the frame's printable height
 * gets it right for any term length.
 *
 * Measured rather than computed from a row count, because row height depends on
 * wrapped Amharic text and on the browser's font metrics, neither of which is
 * known before render.
 */
function useEstimatedPageCount(deps: unknown): number {
  const [pages, setPages] = useState(1);

  useEffect(() => {
    /**
     * Both the preview and the print copy render this document, and they are
     * the same width, so either measures correctly. The print copy is
     * `display: none` on screen, though, and a hidden element reports a zero
     * bounding box - so the first frame with a real width is used.
     */
    const frames = Array.from(
      document.querySelectorAll<HTMLElement>("[data-document-frame]"),
    );
    const frameEl = frames.find((el) => el.getBoundingClientRect().width > 0);
    if (!frameEl) return;

    const measure = () => {
      // One A4 sheet less the 8mm @page margin declared in globals.css.
      const printableMm = 297 - 16;
      const pxPerMm =
        frameEl.getBoundingClientRect().width /
        PX_PER_MM_CORRECTION /
        FRAME_WIDTH_MM;
      if (pxPerMm <= 0) return;
      setPages(
        Math.max(1, Math.ceil(frameEl.scrollHeight / (printableMm * pxPerMm))),
      );
    };

    // A ResizeObserver rather than a bare measurement, because the frame grows
    // as fonts settle and rows wrap; a one-shot read would print a stale count.
    const observer = new ResizeObserver(measure);
    observer.observe(frameEl);
    return () => observer.disconnect();
  }, [deps]);

  return pages;
}

/**
 * The printable document itself, without the dialog or the portal.
 *
 * Exported because it is the part that matters: the preview, the print copy and
 * the PDF all render this one component, and a render test can assert on its
 * output without a DOM portal in the way.
 *
 * Layout follows the rent receipt layout agreed for the Property & Housing
 * Administration office: masthead, a title bar carrying the document title
 * against its own receipt number, a full-width amount strip with the figure in
 * words beside the figure in digits, the renter's details beside the payment
 * detail, the schedule, the reconciliation, the attestation, and a foot carrying
 * the never-re-used notice and a QR of the receipt number.
 *
 * Every visual token - frame, palette, rubber stamp, issuer name seal - comes
 * from the shared house style in `@/ui/receipt/house-style`, so a rent receipt on
 * paper is indistinguishable from a house handover form.
 */
export function RentDocument({
  renter,
  installments,
  receiptMonth,
  ethiopianCalendar = false,
}: {
  renter: RentRenterDto;
  installments: RentInstallmentDto[];
  receiptMonth?: number | null;
  ethiopianCalendar: boolean;
}) {
  const dateText = (value: string | null | undefined) =>
    value ? formatRentDate(value) : "—";

  const calendarDate = (value: string | null | undefined) =>
    ethiopianCalendar
      ? (toEthiopianDate(value) ?? "—")
      : formatRentDateNumeric(value);

  const isReceipt = receiptMonth != null;
  const receiptRow =
    receiptMonth == null
      ? null
      : (installments.find((i) => i.monthNumber === receiptMonth) ?? null);
  const liveReceipt = receiptRow ? livePaymentOf(receiptRow) : null;

  /**
   * The statement lists every month; the receipt lists only its own.
   *
   * A receipt stays to one settled month rather than showing neighbouring rows
   * for context: the schedule is where a renter checks that *this* month is
   * settled, and a receipt that also listed unpaid neighbours reads as though
   * they were being paid too.
   */
  const rows = isReceipt ? (receiptRow ? [receiptRow] : []) : installments;

  const totalPaid = renter.totals.totalPaid;
  const outstanding = renter.totals.outstanding;
  const overdueMonths = renter.totals.overdueMonths;
  const calendarLabel = ethiopianCalendar ? "ዓ.ም" : "Gregorian";

  // The amount the strip describes: this month's rent on a receipt, everything
  // received so far on a statement.
  const amountPaid = isReceipt ? (receiptRow?.amountDue ?? "0") : totalPaid;

  // The same figure written out in both languages of the record.
  //
  // Derived from `amountPaid` rather than stated separately, and that is the
  // whole point of the block: words and digits describe ONE amount, so a hand
  // alteration of the digits shows up as a disagreement with the wording. The
  // moment these two can drift apart - a statement writing out the contract
  // value beside a figure of total received - the check a reader is relying on
  // no longer detects anything.
  const amharicWords = amountInAmharicWords(amountPaid);
  const englishWords = amountInEnglishWords(amountPaid);

  /**
   * The payment the "ክፍያ / Payment" block describes.
   *
   * On a receipt that is the month it is for. On a statement there is no single
   * subject, so it is the most recent live receipt - the one an office
   * reconciling the ledger actually has in front of them.
   */
  const paymentRow = isReceipt
    ? receiptRow
    : (rows.filter((r) => r.status === "PAID" && livePaymentOf(r)).at(-1) ??
      null);
  const payment = paymentRow ? livePaymentOf(paymentRow) : null;
  const paymentStatus = paymentRow ? monthStatusLabel(paymentRow) : null;

  const receiptNumber = payment?.receiptNumber ?? null;

  // Today, for the two cases where there is no payment to date the document
  // from: a statement, and a receipt requested for a month that is not settled.
  const today = new Date().toISOString().slice(0, 10);
  const issueDate = isReceipt ? (payment?.paidOn ?? today) : today;

  // The form is generated on demand rather than pulled off a pad, so the issue
  // number is always the first - and only - copy the office generates.
  const issueNo = "1";

  const issueCaption = isReceipt ? "የተሰጠበት / Issued" : "የተዘጋጀው / Generated";

  const ledgerNote = `${renter.totals.monthsPaid} / ${
    renter.totals.totalMonths
  } ወራት ተከፍለዋል። ከክፍያ መዝገብ የተሰላ።`;

  const pages = useEstimatedPageCount(
    `${isReceipt ? "receipt" : "statement"}:${receiptMonth ?? "all"}:${installments.length}`,
  );

  return (
    <div style={frameStyle} data-document-frame>
      {/* On a one-month receipt the lower half is blank paper, so the stamp
          lands there and reads as an inked impression. On a full-term statement
          the schedule fills the page, so it moves into the right-hand gutter
          rather than over a column of figures. */}
      <StampOverlay placement={isReceipt ? "lower-left" : "right-gutter"} />

      {/* ---- Masthead ---- */}
      <table style={tableStyle}>
        <tbody>
          <tr>
            <td style={{ ...headerBrandCellStyle, width: "62%" }}>
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={BRAND_LOGO_SRC}
                  alt="MSF Logo"
                  style={{
                    width: "42px",
                    height: "42px",
                    objectFit: "contain",
                  }}
                />
                <div style={{ lineHeight: "1.2" }}>
                  <div
                    style={{ fontWeight: 700, fontSize: "11pt", color: NAVY }}
                  >
                    መተሐራ ስኳር ፋብሪካ
                  </div>
                  <div style={{ ...captionStyle, marginTop: "2px" }}>
                    METAHARA SUGAR FACTORY
                  </div>
                  <div style={captionStyle}>የንብረትና የቤት አስተዳደር ክፍል</div>
                </div>
              </div>
            </td>
            <td style={{ ...headerMetaCellStyle, width: "38%" }}>
              <table style={{ ...tableStyle, tableLayout: "auto" }}>
                <tbody>
                  <tr>
                    <td style={{ ...captionStyle, textAlign: "right" }}>
                      ቅጽ / Form
                    </td>
                    <td
                      style={{
                        ...captionStyle,
                        textAlign: "right",
                        fontFamily: MONO_FONT,
                      }}
                    >
                      {RENT_RECEIPT_FORM_NO}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ ...captionStyle, textAlign: "right" }}>
                      እትም / Issue
                    </td>
                    <td style={{ ...captionStyle, textAlign: "right" }}>
                      {issueNo}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ ...captionStyle, textAlign: "right" }}>
                      ገጽ / Page
                    </td>
                    <td style={{ ...captionStyle, textAlign: "right" }}>
                      1 / {pages}
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ---- Title bar: the document's name against its own receipt number ---- */}
      <table
        style={{
          ...tableStyle,
          marginTop: "5px",
          borderTop: `1px solid ${NAVY}`,
          borderBottom: `2px solid ${BRASS}`,
        }}
      >
        <tbody>
          <tr>
            <td style={{ width: "62%", padding: "6px 2px 6px 0" }}>
              <div
                style={{
                  fontSize: "16pt",
                  fontWeight: 700,
                  color: NAVY,
                  lineHeight: "1.15",
                }}
              >
                {isReceipt ? "የኪራይ ደረሰኝ" : "የኪራይ የኪራ ሂሳብ ዝርዝር"}
                <div
                  style={{
                    fontSize: "10pt",
                    fontWeight: 500,
                    color: GUNMETAL,
                    marginTop: "1px",
                  }}
                >
                  {isReceipt
                    ? `Rent Receipt  (${RENT_TYPE_LABELS[renter.rentType]})`
                    : "Rent Lease Statement"}
                </div>
              </div>
            </td>
            <td style={{ padding: "6px 0 6px 2px", textAlign: "right" }}>
              {receiptNumber ? (
                <div
                  style={{
                    fontFamily: MONO_FONT,
                    fontSize: "13pt",
                    fontWeight: 700,
                    letterSpacing: "0.02em",
                  }}
                >
                  {receiptNumber}
                </div>
              ) : (
                <div
                  style={{
                    fontSize: "10pt",
                    fontWeight: 700,
                    color: GUNMETAL,
                  }}
                >
                  ጉምራ ሂሳብ / Lease account
                </div>
              )}
              <div style={{ ...captionStyle, marginTop: "1px" }}>
                {issueCaption}: {dateText(issueDate)}
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ---- Amount strip ----
          The figure in words on the left, the figure in digits inverted on the
          right. The pair is the whole point of the block: digits alone can be
          altered by hand without the alteration being visible, whereas a
          written-out figure cannot. */}
      <table
        style={{
          ...tableStyle,
          marginTop: "5px",
          border: `1px solid ${NAVY}`,
        }}
      >
        <tbody>
          <tr>
            <td
              style={{
                padding: "6px 8px",
                background: PAPER_SOFT,
                borderRight: `1px solid ${NAVY}`,
              }}
            >
              <div
                style={{
                  fontSize: "11pt",
                  fontWeight: 700,
                  color: NAVY,
                  lineHeight: "1.3",
                }}
              >
                {amharicWords}
              </div>
              <div
                style={{
                  fontSize: "9pt",
                  color: GUNMETAL,
                  fontStyle: "italic",
                  marginTop: "1px",
                }}
              >
                {englishWords}
              </div>
            </td>
            <td
              style={{
                padding: "6px 12px",
                background: NAVY,
                color: "#ffffff",
                textAlign: "right",
                width: "52mm",
                whiteSpace: "nowrap",
              }}
            >
              <div style={{ fontSize: "7.5pt", opacity: 0.85 }}>
                የተከፈለ / Amount paid
              </div>
              <div
                style={{
                  fontSize: "17pt",
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  lineHeight: "1.15",
                }}
              >
                {formatEtb(amountPaid).replace(" ETB", "")}
              </div>
              <div style={{ fontSize: "9pt", fontWeight: 500 }}>ETB</div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ---- Renter and Payment, side by side ---- */}
      <table style={{ ...tableStyle, marginTop: "5px" }}>
        <tbody>
          <tr>
            <td
              style={{
                width: "50%",
                paddingRight: "7px",
                verticalAlign: "top",
              }}
            >
              <SectionHeading>ተከራይ / Renter</SectionHeading>
              <DefList>
                <DefRow label="ስም / Name">{renter.fullName}</DefRow>
                <DefRow label="ፆታ / Sex">{GENDER_LABELS[renter.gender]}</DefRow>
                <DefRow
                  label="የምዝገባ ቁጥር / Reg. No."
                  valueStyle={{ fontFamily: MONO_FONT }}
                >
                  {renter.nationalId}
                </DefRow>
                <DefRow label="ስልክ / Phone">
                  {renter.phones
                    .map((p) => formatPhoneForDisplay(p.phone))
                    .join("   ") || "—"}
                </DefRow>
                <DefRow label="የምዋራ ኪራ / Monthly rent">
                  {formatEtb(renter.monthlyPrice)}
                </DefRow>
                <DefRow label="የውል ጊዜ / Term">
                  {renter.termMonths} ወር
                  <span style={captionStyle}>
                    {"  "}({dateText(renter.startDate)} –{" "}
                    {dateText(renter.endDate)})
                  </span>
                </DefRow>
                {/* Not on the agreed layout, but a receipt that cannot say
                    whether the lease is still running is not a record of
                    anything: a terminated lease's receipts get read as though
                    the rent were still due. */}
                <DefRow label="የቅጽ ሁኔታ / Lease status">
                  <span
                    style={{
                      fontWeight: 700,
                      color:
                        renter.displayStatus === "Terminated"
                          ? VOIDED
                          : renter.displayStatus === "Overdue"
                            ? OVERDUE
                            : NAVY,
                    }}
                  >
                    {RENT_DISPLAY_STATUS_LABELS[renter.displayStatus]}
                  </span>
                </DefRow>
              </DefList>
            </td>
            <td
              style={{ width: "50%", paddingLeft: "7px", verticalAlign: "top" }}
            >
              <SectionHeading>ክፍያ / Payment</SectionHeading>
              <DefList>
                <DefRow label="ለዓር / Month">
                  {paymentRow
                    ? `${paymentRow.monthNumber} / ${renter.termMonths}`
                    : "—"}
                </DefRow>
                <DefRow label="የመክፈያ ቀን / Due">
                  {calendarDate(paymentRow?.dueDate)}
                </DefRow>
                <DefRow label="የተከፈለበት / Paid on">
                  {calendarDate(paymentRow?.paidAt ?? null)}
                </DefRow>
                <DefRow label="ዘዴ / Method">
                  {paymentRow?.paymentMethod
                    ? RENT_PAYMENT_METHOD_LABELS[paymentRow.paymentMethod]
                    : "—"}
                </DefRow>
                <DefRow
                  label="ማጣቀሻ / Reference"
                  valueStyle={
                    payment?.referenceNumber
                      ? { fontFamily: MONO_FONT }
                      : undefined
                  }
                >
                  {payment?.referenceNumber ?? "—"}
                </DefRow>
                <DefRow label="ሁኔታ / Status">
                  {paymentStatus ? (
                    <StatusBadge
                      label={paymentStatus.label}
                      color={paymentStatus.color ?? NAVY}
                    />
                  ) : (
                    "—"
                  )}
                </DefRow>
              </DefList>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ---- Schedule ---- */}
      <div style={{ marginTop: "6px" }}>
        <SectionHeading>የክፍያ መርሃ ግብር / Schedule</SectionHeading>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: "9%" }} scope="col">
                ተ.ቁ
              </th>
              <th style={{ ...thStyle, width: "17%" }} scope="col">
                መክፈያ / Due ({calendarLabel})
              </th>
              <th
                style={{ ...thStyle, width: "18%", textAlign: "right" }}
                scope="col"
              >
                መጠን / Amount
              </th>
              <th style={{ ...thStyle, width: "14%" }} scope="col">
                ሁኔታ / Status
              </th>
              <th style={{ ...thStyle, width: "17%" }} scope="col">
                የተከፍለበት / Paid
              </th>
              <th style={thStyle} scope="col">
                ደረሰኝ / Receipt
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const { label, color } = monthStatusLabel(row);
              // The month this receipt is for is banded, so a renter reading a
              // multi-month statement finds their own line immediately.
              const isCurrent = isReceipt && row.monthNumber === receiptMonth;
              return (
                <tr
                  key={row.id}
                  style={isCurrent ? { background: PALE_NAVY } : undefined}
                >
                  <td
                    style={{
                      ...tdCenterStyle,
                      fontWeight: isCurrent ? 700 : undefined,
                    }}
                  >
                    {row.monthNumber}
                  </td>
                  <td style={tdCenterStyle}>{calendarDate(row.dueDate)}</td>
                  <td style={tdRightStyle}>
                    {formatEtb(row.amountDue).replace(" ETB", "")}
                  </td>
                  <td
                    style={{
                      ...tdCenterStyle,
                      color,
                      fontWeight: row.status === "PAID" ? 700 : 400,
                    }}
                  >
                    {label}
                    {row.status === "VOIDED" && row.voidReason ? (
                      <div style={{ ...captionStyle, color: GUNMETAL }}>
                        {row.voidReason}
                      </div>
                    ) : null}
                  </td>
                  <td style={tdCenterStyle}>
                    {row.paidAt ? calendarDate(row.paidAt) : "—"}
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      fontFamily: MONO_FONT,
                      fontSize: "8pt",
                    }}
                  >
                    {row.receiptNumber ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---- Reconciliation ---- */}
      <div style={{ marginTop: "6px" }}>
        <SectionHeading>ማጠቃለያ / Reconciliation</SectionHeading>
        <table style={{ ...tableStyle, border: `1px solid ${RULE}` }}>
          <tbody>
            <tr>
              <td
                style={{
                  width: "34%",
                  padding: "5px 8px",
                  borderRight: `1px solid ${RULE}`,
                }}
              >
                <span style={captionStyle}>የተከፈለ / Total paid</span>
                <div
                  style={{
                    fontSize: "11pt",
                    fontWeight: 700,
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {formatEtb(totalPaid)}
                </div>
              </td>
              <td
                style={{
                  width: "33%",
                  padding: "5px 8px",
                  borderRight: `1px solid ${RULE}`,
                }}
              >
                <span style={captionStyle}>የውል ዋጋ / Contract value</span>
                <div
                  style={{
                    fontSize: "11pt",
                    fontWeight: 700,
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {formatEtb(renter.totals.totalContractValue)}
                </div>
              </td>
              <td
                style={{
                  width: "33%",
                  padding: "5px 8px",
                  background: PALE_NAVY,
                }}
              >
                <span style={captionStyle}>ያልተከፈለ / Outstanding</span>
                <div
                  style={{
                    fontSize: "11pt",
                    fontWeight: 700,
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                    color: overdueMonths > 0 ? OVERDUE : NAVY,
                  }}
                >
                  {formatEtb(outstanding)}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div style={{ ...captionStyle, marginTop: "3px", lineHeight: "1.35" }}>
          {renter.totals.monthsPaid} / {renter.totals.totalMonths} ወራት ተከፍለዋል።
          ከክፍያ መዝገብ የተሰላ። / {renter.totals.monthsPaid} of{" "}
          {renter.totals.totalMonths} months settled, computed from the ledger.
          Amounts in ETB.
        </div>
      </div>

      {/* ---- Attestation ----
          Three signatories, not two. A receipt is a money document, so it has to
          name someone who received the cash as well as someone who confirmed it,
          and the renter has to be able to see their own acknowledgement before
          they sign.

          Only the renter's name is printed. `rent_payments` records no operator,
          so the cashier and the rent admin sign on blank rules rather than have
          a name filled in for them by whoever opened the dialog. */}
      <div style={{ marginTop: "6px" }}>
        <SectionHeading>ማረጋገጫና ፊርማ / Attestation</SectionHeading>
        <div
          style={{
            fontSize: "8.3pt",
            color: GUNMETAL,
            lineHeight: "1.35",
            textAlign: "justify",
            marginBottom: "5px",
          }}
        >
          እኔ{" "}
          <span
            style={{
              display: "inline-block",
              borderBottom: `1px dotted ${GUNMETAL}`,
              minWidth: "110px",
              fontWeight: 700,
            }}
          >
            {renter.fullName}
          </span>{" "}
          ይህ የኪራይ ሂሳብ መግለጫ ትክክል መሆኑን አረጋግጣለሁ። / I acknowledge this statement as
          a correct record of my rent account.
        </div>
        <table style={tableStyle}>
          <tbody>
            <tr>
              {(
                [
                  { role: "ተከራይ / Renter", name: renter.fullName },
                  { role: "ገንዘብ ያዥ / Cashier", name: null },
                  { role: "ኪራይ አስተዳደር / Rent Admin", name: null },
                ] as const
              ).map((party, index) => (
                <td
                  key={party.role}
                  style={{
                    width: "33.3%",
                    padding: index === 0 ? "0 8px 0 0" : "0 8px",
                    verticalAlign: "top",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      height: "25mm",
                      borderBottom: `1.5px solid #000`,
                      display: "flex",
                      alignItems: "flex-end",
                      justifyContent: "space-between",
                      paddingBottom: "3px",
                      fontSize: "7.5pt",
                      color: GUNMETAL,
                    }}
                  >
                    <span>ፊርማ / Signature</span>
                    <span>ቀን / Date</span>
                  </div>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: "8.5pt",
                      marginTop: "4px",
                      color: NAVY,
                    }}
                  >
                    {party.role}
                  </div>
                  <div style={{ fontSize: "8.3pt", color: GUNMETAL }}>
                    {party.name ?? <Dots minWidth={100} />}
                  </div>
                  {index === 2 ? (
                    <>
                      <div style={{ ...captionStyle, marginTop: "2px" }}>
                        የፋ.ሲ.ቲ ማኔጅመንት ቡድን መሪ
                      </div>
                      <NameStamp />
                    </>
                  ) : null}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* ---- Foot: the never-re-used notice, the ledger note, and the QR ----
          The QR carries the receipt number alone. Deliberate: that is the one
          field that identifies the document without also restating the renter's
          name and rent, so a photograph of the code discloses nothing the
          visible page does not already show. */}
      <table style={{ ...tableStyle, marginTop: "6px" }}>
        <tbody>
          <tr>
            <td
              style={{
                ...formFooterCellStyle,
                textAlign: "left",
                verticalAlign: "middle",
              }}
            >
              የደረሰኝ ቁጥር አንድ ጊዜ ብቻ ይሰጣል፣ ዳግም አይጠቀምም።
              <div
                style={{ ...captionStyle, fontWeight: 400, marginTop: "2px" }}
              >
                Receipt numbers are issued once and never re-used. {ledgerNote}
              </div>
            </td>
            <td
              style={{
                ...formFooterCellStyle,
                width: "72px",
                padding: "4px",
                textAlign: "center",
                verticalAlign: "middle",
              }}
            >
              <DocumentQrCode
                value={receiptNumber}
                size={54}
                caption={receiptNumber ?? undefined}
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export interface RentReceiptPrintProps {
  open: boolean;
  onClose: () => void;
  renter: RentRenterDto | null;
  installments: RentInstallmentDto[];
  /** A single month -> a one-page receipt. `null` -> the full lease statement. */
  receiptMonth?: number | null;
  /** Render the Ethiopian calendar on the printed copy. */
  ethiopianCalendar?: boolean;
}

export default function RentReceiptPrint({
  open,
  onClose,
  renter,
  installments,
  receiptMonth = null,
  ethiopianCalendar = false,
}: RentReceiptPrintProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  /**
   * SSR-safe mount gate for `createPortal`.
   *
   * `useSyncExternalStore` with a never-firing subscribe is the idiomatic way to
   * read "am I on the client?" during render: `false` while server-rendering,
   * `true` after hydration, with no state and no effect.
   */
  const isMounted = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

  /**
   * Rasterise the sheet and lay it out across as many A4 pages as it needs.
   *
   * The previous version scaled the whole canvas to fit one page, so a
   * 120-month statement came out at roughly 4pt type. Here the canvas is cut
   * into page-height bands at full resolution and each band becomes its own
   * page, so text stays legible and rows are never shrunk to fit.
   */
  const handleDownload = useCallback(async () => {
    const sheet = sheetRef.current;
    if (!sheet || !renter) return;
    setIsDownloading(true);
    try {
      // scale 2 is plenty for print resolution and keeps the peak canvas
      // allocation bounded - a 120-row sheet at scale 3 is a multi-hundred-MB
      // bitmap, which the Capacitor Android WebView cannot hold.
      const canvas = await html2canvas(sheet, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const ratio = pageWidth / canvas.width;
      const pageHeightPx = Math.floor(pageHeight / ratio);

      let page = 0;
      for (let offset = 0; offset < canvas.height; offset += pageHeightPx) {
        const band = document.createElement("canvas");
        band.width = canvas.width;
        band.height = Math.min(pageHeightPx, canvas.height - offset);
        const ctx = band.getContext("2d");
        if (!ctx) break;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, band.width, band.height);
        ctx.drawImage(
          canvas,
          0,
          offset,
          band.width,
          band.height,
          0,
          0,
          band.width,
          band.height,
        );

        if (page > 0) pdf.addPage();
        pdf.addImage(
          band.toDataURL("image/jpeg", 0.92),
          "JPEG",
          0,
          0,
          pageWidth,
          band.height * ratio,
        );
        page += 1;
      }

      const slug = renter.fullName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      pdf.save(
        `rent-${receiptMonth != null ? "receipt" : "statement"}-${slug || "renter"}.pdf`,
      );
      notify.success({
        title: "Rent document saved as PDF",
        description: page > 1 ? `Split across ${page} pages.` : "One page.",
      });
    } catch {
      notify.error("Failed to generate the PDF");
    } finally {
      setIsDownloading(false);
    }
  }, [renter, receiptMonth]);

  // The print-only copy: everything else on the page is hidden by the
  // `.rent-receipt-print` rules in globals.css while printing.
  const printCopy =
    open && renter && isMounted ? (
      <div className="rent-receipt-print" aria-hidden="true">
        <RentDocument
          renter={renter}
          installments={installments}
          receiptMonth={receiptMonth}
          ethiopianCalendar={ethiopianCalendar}
        />
      </div>
    ) : null;

  const isReceipt = receiptMonth != null;
  const monthCount = installments.length;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {isReceipt ? "Rent Receipt" : "Lease Statement"}
          </DialogTitle>
          <DialogDescription>
            {isReceipt
              ? "Official receipt for the month's payment, stamped and signed by the rent office."
              : `Full rent schedule for the lease term - ${monthCount} month${
                  monthCount === 1 ? "" : "s"
                }, one line each. The downloaded PDF paginates automatically.`}
          </DialogDescription>
        </DialogHeader>

        <div className="bg-muted/40 overflow-x-auto rounded-lg p-2">
          <div className="mx-auto w-fit" style={{ minWidth: "186mm" }}>
            <div ref={sheetRef}>
              <RentDocument
                renter={renter as RentRenterDto}
                installments={installments}
                receiptMonth={receiptMonth}
                ethiopianCalendar={ethiopianCalendar}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
          <Button onClick={handleDownload} disabled={isDownloading}>
            {isDownloading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Download PDF
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>

      {printCopy && createPortal(printCopy, document.body)}
    </Dialog>
  );
}
