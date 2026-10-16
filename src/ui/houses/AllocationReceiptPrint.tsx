"use client";

import React, {
  useCallback,
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
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fullName, formatDate } from "@/ui/household/house-format";
import { RECEIPT_COPY, wrapNoteForPrint } from "@/lib/house-queue/damage";

/**
 * Structural subset of the allocation views (AllocationDetailView and
 * TerminatedHouseView both satisfy it) required to print a receipt.
 */
export interface ReceiptDetail {
  allocationId: string;
  status?: string;
  decidedAt?: string | null;
  terminatedAt?: string | null;
  /** Relocation history — populated once the employee moved house. */
  transferred?: boolean;
  previousHouseNumber?: string | null;
  movedAt?: string | null;
  moveCount?: number;
  house?: { houseNumber: string } | null;
  employee: {
    firstname: string;
    lastname: string;
    employeeNumber: string;
    department?: { name: string } | null;
  };
  /**
   * The frozen termination-receipt snapshot, for the handback variant only.
   *
   * Supplied by the caller from `HouseTerminationReceipt`, never rebuilt here:
   * this component formats a document, it does not decide what the document says.
   * A reprint therefore renders exactly the bytes the first print captured, which
   * is the whole point of snapshotting at print time.
   */
  terminationReceipt?: ReceiptPrintDetail | null;
}

/** The receipt snapshot, as the print component needs it. */
export interface ReceiptPrintDetail {
  receiptNo: string;
  damageLines: { key: string; label: string; labelAm: string; cost: string }[];
  /** Fixed-2 string, e.g. `"1,250.00"`. */
  totalDamageCost: string;
  conditionNote: string | null;
  completedAt: string;
  printedAt: string;
  printCount: number;
  /** False on a reprint — printed as such so a copy is never passed off as the original. */
  isOriginal: boolean;
}

interface Props {
  detail: ReceiptDetail;
  open?: boolean;
  onClose?: () => void;
  /** Which template to print. Defaults to "auto" (chosen from the allocation state). */
  variant?: "auto" | "handover" | "handback" | "move";
}

const LANG_FONT =
  "'Source Serif 4', 'Noto Serif Ethiopic', 'Noto Sans Ethiopic', 'Nyala', 'Ethiopia Jiret', Georgia, 'Times New Roman', serif";

const NAVY = "#1f2d3d";
const BRASS = "#9a7a32";
const GUNMETAL = "#454d56";
const RULE = "#aeb5bc";
const PALE_NAVY = "#f1f4f7";
const PALE_BRASS = "#f7f4ed";

const DOCUMENT_FRAME_STYLE: React.CSSProperties = {
  fontFamily: LANG_FONT,
  fontSize: "9.5pt",
  lineHeight: "1.25",
  color: "#000",
  background: "#fff",
  border: `1px solid ${NAVY}`,
  boxShadow: `inset 0 3px 0 0 ${BRASS}`,
  padding: 0,
  position: "relative",
  width: "100%",
  boxSizing: "border-box",
};

const DOCUMENT_TABLE_STYLE: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "fixed",
  boxSizing: "border-box",
};

const HEADER_BRAND_CELL: React.CSSProperties = {
  width: "68%",
  padding: "6px 10px",
  verticalAlign: "middle",
  borderRight: `1px solid ${RULE}`,
};

const HEADER_META_CELL: React.CSSProperties = {
  width: "32%",
  padding: "5px 10px",
  verticalAlign: "middle",
  textAlign: "right",
  lineHeight: "1.3",
};

const FORM_TITLE_CELL: React.CSSProperties = {
  width: "68%",
  padding: "5px 10px",
  verticalAlign: "middle",
  borderTop: `1px solid ${NAVY}`,
  borderRight: `1px solid ${RULE}`,
  borderBottom: `2px solid ${BRASS}`,
  background: PALE_NAVY,
};

const FORM_PAGE_CELL: React.CSSProperties = {
  width: "32%",
  padding: "5px 10px",
  verticalAlign: "middle",
  borderTop: `1px solid ${NAVY}`,
  borderBottom: `2px solid ${BRASS}`,
  background: PALE_NAVY,
  textAlign: "right",
  lineHeight: "1.25",
};

const META_LABEL_STYLE: React.CSSProperties = {
  fontWeight: 700,
  color: NAVY,
  whiteSpace: "nowrap",
};

const META_CAPTION_STYLE: React.CSSProperties = {
  fontSize: "7.5pt",
  letterSpacing: "0.3px",
  color: GUNMETAL,
};

const FORM_TITLE_STYLE: React.CSSProperties = {
  fontWeight: 700,
  fontSize: "11.5pt",
  lineHeight: "1.15",
  color: NAVY,
};

const FORM_LABEL_CELL: React.CSSProperties = {
  width: "72px",
  padding: "3px 6px",
  borderRight: `1px solid ${RULE}`,
  background: PALE_BRASS,
  color: NAVY,
  fontWeight: 700,
  fontSize: "9pt",
  verticalAlign: "middle",
};

const FORM_VALUE_CELL: React.CSSProperties = {
  padding: "3px 6px",
  fontSize: "9.2pt",
  verticalAlign: "middle",
};

const FORM_BODY_CELL: React.CSSProperties = {
  padding: "5px 8px",
  border: `1px solid ${RULE}`,
  background: "#fafbfc",
  textAlign: "justify",
  fontSize: "9.2pt",
  lineHeight: "1.35",
};

const NESTED_TABLE_STYLE: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "auto",
};

/**
 * Damaged-items schedule — the section that lists what the handback inspection
 * found and what it costs.
 *
 * Built as one ruled table (titled band → column heads → rows → total band)
 * rather than a heading over a loose grid, because it is the part of the form a
 * reader checks against the signature block: it needs a stable column order, an
 * addressable row number, hairline rules that survive a mono printer, and one
 * figure they can add the rows up to.
 *
 * Deliberately tighter than `FORM_BODY_CELL` (3px/6px vs 5px/8px): this is the
 * one part of the form whose length varies with the data, so every row it does
 * not spend is a row the signature block keeps.
 */
const DAMAGE_BAND_CELL: React.CSSProperties = {
  padding: "4px 6px",
  background: PALE_NAVY,
  color: NAVY,
  borderBottom: `1px solid ${BRASS}`,
  fontWeight: 700,
  fontSize: "9pt",
  letterSpacing: "0.25px",
  verticalAlign: "middle",
};

/** Right-hand count in the section band, quiet enough not to read as a heading. */
const DAMAGE_BAND_META: React.CSSProperties = {
  marginLeft: "10px",
  fontWeight: 400,
  fontSize: "7.5pt",
  color: GUNMETAL,
  letterSpacing: "0.2px",
};

const DAMAGE_COLUMN_HEAD: React.CSSProperties = {
  padding: "3px 6px",
  background: PALE_BRASS,
  color: NAVY,
  borderBottom: `1px solid ${RULE}`,
  fontSize: "8pt",
  fontWeight: 700,
  verticalAlign: "bottom",
};

const DAMAGE_ROW_CELL: React.CSSProperties = {
  padding: "3px 6px",
  borderBottom: `1px solid #e3e7eb`,
  fontSize: "8.6pt",
  lineHeight: "1.2",
  verticalAlign: "top",
};

/** Row number: quoted so a reader can cite "item 2" while arguing about it. */
const DAMAGE_ROW_INDEX: React.CSSProperties = {
  ...DAMAGE_ROW_CELL,
  width: "9%",
  textAlign: "center",
  color: GUNMETAL,
  fontSize: "8pt",
  fontVariantNumeric: "tabular-nums",
};

const DAMAGE_ROW_LABEL: React.CSSProperties = {
  ...DAMAGE_ROW_CELL,
  width: "61%",
};

/** The Amharic half of a bilingual label, set smaller and quieter. */
const DAMAGE_ROW_LABEL_AM: React.CSSProperties = {
  marginLeft: "5px",
  fontSize: "8pt",
  color: GUNMETAL,
};

/** Money column: right-aligned, monospaced digits, never wrapped. */
const DAMAGE_ROW_COST: React.CSSProperties = {
  ...DAMAGE_ROW_CELL,
  width: "30%",
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
};

/** Hairline rule between the schedule and the single total band under it. */
const DAMAGE_TOTAL_CELL: React.CSSProperties = {
  padding: "4px 6px",
  background: PALE_NAVY,
  color: NAVY,
  borderTop: `1px solid ${NAVY}`,
  fontWeight: 700,
  fontSize: "9pt",
  verticalAlign: "middle",
};

const DAMAGE_TOTAL_VALUE: React.CSSProperties = {
  ...DAMAGE_TOTAL_CELL,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
  fontSize: "9.4pt",
};

/** Vertical rule between schedule columns. */
const DAMAGE_COLUMN_RULE: React.CSSProperties = {
  borderRight: `1px solid ${RULE}`,
};

const SIGNATURE_LABEL_STYLE: React.CSSProperties = {
  color: NAVY,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const FORM_SECTION_HEADER_CELL: React.CSSProperties = {
  padding: "6px 8px",
  background: PALE_NAVY,
  color: NAVY,
  borderBottom: `1px solid ${BRASS}`,
  fontWeight: 700,
  fontSize: "9pt",
  letterSpacing: "0.25px",
  verticalAlign: "middle",
};

const FORM_SIGNATURE_CELL: React.CSSProperties = {
  padding: "7px 8px",
  verticalAlign: "top",
  borderRight: `1px solid ${RULE}`,
};

const FORM_SIGNATURE_LAST_CELL: React.CSSProperties = {
  ...FORM_SIGNATURE_CELL,
  borderRight: "none",
};

const FORM_FOOTER_CELL: React.CSSProperties = {
  padding: "6px 8px",
  background: PALE_NAVY,
  color: NAVY,
  borderTop: `1px solid ${BRASS}`,
  textAlign: "center",
  fontWeight: 700,
  fontSize: "8pt",
  letterSpacing: "0.45px",
};

/** Dotted fill line used across the form for hand-written entries. */
function Dots({ value, minWidth = 90 }: { value?: string; minWidth?: number }) {
  return (
    <span
      style={{
        display: "inline-block",
        borderBottom: `1px dotted ${GUNMETAL}`,
        minWidth,
        minHeight: "1em",
        marginLeft: "2px",
        marginRight: "2px",
        verticalAlign: "baseline",
        textAlign: "center",
        fontSize: "9pt",
        lineHeight: "1.1",
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {value ?? ""}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Facility & House Administration stamp — hovered over every printed copy.
// Verdebt "Metahara Sugar Factory - ፋሲሊቲ እና ቤት አስተዳደር" round stamp.
// ---------------------------------------------------------------------------

const STAMP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><defs><path id="topArc" d="M 170 470 A 330 330 0 0 1 830 470" fill="none"/><path id="bottomArc" d="M 170 590 A 330 330 0 0 0 830 590" fill="none"/></defs><circle cx="500" cy="500" r="455" fill="none" stroke="#174ea6" stroke-width="13"/><circle cx="500" cy="500" r="435" fill="none" stroke="#174ea6" stroke-width="4"/><circle cx="500" cy="500" r="340" fill="none" stroke="#174ea6" stroke-width="5"/><text fill="#174ea6" font-size="67" font-weight="800" letter-spacing="2" text-anchor="middle" font-family="Noto Sans Ethiopic, Nyala, Abyssinica SIL, sans-serif"><textPath href="#topArc" startOffset="50%">መተሐራ ስኳር ፋብሪካ</textPath></text><g fill="#174ea6" stroke="#174ea6" stroke-width="2"><path d="M 160 490 L 170 515 L 197 515 L 175 531 L 183 558 L 160 542 L 137 558 L 145 531 L 123 515 L 150 515 Z"/><path d="M 840 490 L 850 515 L 877 515 L 855 531 L 863 558 L 840 542 L 817 558 L 825 531 L 803 515 L 830 515 Z"/></g><text fill="#174ea6" font-size="48" font-weight="800" letter-spacing="1" text-anchor="middle" font-family="Noto Sans Ethiopic, Nyala, Abyssinica SIL, sans-serif"><textPath href="#bottomArc" startOffset="50%">- ፋሲሊቲ እና ቤት አስተዳደር -</textPath></text><g stroke="#174ea6" stroke-width="5" stroke-linecap="round"><line x1="340" y1="690" x2="455" y2="690"/><line x1="545" y1="690" x2="660" y2="690"/></g></svg>`;

const STAMP_DATA_URI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  STAMP_SVG,
)}`;

/** Rubber-stamp overlay hovered diagonally across the middle of a copy. */
function StampOverlay() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        width: "220px",
        height: "220px",
        transform: "translate(-50%, -50%) rotate(-14deg)",
        backgroundImage: `url("${STAMP_DATA_URI}")`,
        backgroundSize: "contain",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        opacity: 0.5,
        mixBlendMode: "multiply",
        pointerEvents: "none",
        zIndex: 5,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Official name seal — ለበታ ጃርሴ, የፋ.ሲ.ቲ ማኔጅመንት ቡድን መሪ. Hovered over the
// issuer's signature on both receipts.
// ---------------------------------------------------------------------------

const NAME_STAMP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 240"><rect x="12" y="12" width="676" height="216" rx="26" fill="none" stroke="#174ea6" stroke-width="9"/><rect x="30" y="30" width="640" height="180" rx="14" fill="none" stroke="#174ea6" stroke-width="2.5"/><text x="350" y="82" text-anchor="middle" fill="#174ea6" font-size="33" font-weight="700" font-family="Noto Sans Ethiopic, Nyala, Abyssinica SIL, sans-serif" letter-spacing="1">የፋ.ሲ.ቲ ማኔጅመንት ቡድን መሪ</text><line x1="130" y1="104" x2="570" y2="104" stroke="#174ea6" stroke-width="3"/><text x="350" y="182" text-anchor="middle" fill="#174ea6" font-size="74" font-weight="800" font-family="Noto Sans Ethiopic, Nyala, Abyssinica SIL, sans-serif" letter-spacing="2">ለበታ ጃርሴ</text></svg>`;

const NAME_STAMP_DATA_URI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  NAME_STAMP_SVG,
)}`;

/** Official name seal hovered across the issuer's signature line. */
function NameStamp() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        width: "190px",
        height: "65px",
        transform: "translate(-50%, -50%) rotate(-6deg)",
        backgroundImage: `url("${NAME_STAMP_DATA_URI}")`,
        backgroundSize: "contain",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        opacity: 0.7,
        mixBlendMode: "multiply",
        pointerEvents: "none",
        zIndex: 4,
      }}
    />
  );
}

function ReceiptFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="allocation-receipt-copy" style={DOCUMENT_FRAME_STYLE}>
      <StampOverlay />
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Checklist content — verbatim reproduction of the factory's handover form.
// ---------------------------------------------------------------------------

interface ChecklistRow {
  number: number;
  category: string;
  categoryRows: number;
  item: string;
}

const HANDOVER_CHECKLIST: ChecklistRow[] = [
  { number: 1, category: "መብራት", categoryRows: 5, item: "የሳሎን ማብሪያና ማጥፊያ" },
  { number: 2, category: "", categoryRows: 0, item: "የበርንዳ ማብሪያና ማጥፊያ" },
  { number: 3, category: "", categoryRows: 0, item: "የመኝታ ክፍል ማብሪያና ማጥፊያ" },
  { number: 4, category: "", categoryRows: 0, item: "የመመገቢያ ክፍል ማብሪያና ማጥፊያ" },
  { number: 5, category: "", categoryRows: 0, item: "የኩሽና ክፍል ማብሪያና ማጥፊያ" },
  { number: 6, category: "በሮች", categoryRows: 4, item: "የፊት በር መክፈቻ / ቁልፍ" },
  { number: 7, category: "", categoryRows: 0, item: "የኋላ በር" },
  { number: 8, category: "", categoryRows: 0, item: "የውስጥ በሮች" },
  { number: 9, category: "", categoryRows: 0, item: "የማዕድ ቤት በር" },
  { number: 10, category: "መስኮቶች", categoryRows: 6, item: "የሳሎን መቀርቀሪያ" },
  { number: 11, category: "", categoryRows: 0, item: "የመኝታ ክፍል መቀርቀሪያ" },
  { number: 12, category: "", categoryRows: 0, item: "የመመገቢያ ክፍል መስኮት" },
  { number: 13, category: "", categoryRows: 0, item: "የመስኮት ወንፊት" },
  { number: 14, category: "", categoryRows: 0, item: "የመስኮት መስተዋት / ብርጭቆዎች" },
  { number: 15, category: "", categoryRows: 0, item: "የመጋረጃ አንጓት" },
  { number: 16, category: "የመጽዳጃ ክፍል", categoryRows: 8, item: "የመድኃኒት ሳንቃ" },
  { number: 17, category: "", categoryRows: 0, item: "የጸዳይ ሠንጠረዥ" },
  { number: 18, category: "", categoryRows: 0, item: "የመታጠቢያ ክፍል መቀርቀሪያ" },
  { number: 19, category: "", categoryRows: 0, item: "የእንግዳ ቤት ሳህን" },
  { number: 20, category: "", categoryRows: 0, item: "የእንግዳ ቤት ሳህን አከን" },
  { number: 21, category: "", categoryRows: 0, item: "የፊት መለዋወጫ" },
  { number: 22, category: "", categoryRows: 0, item: "የዕቃ ማጠቢያ ሲንክ አከንደም" },
  { number: 23, category: "", categoryRows: 0, item: "የወጥ ቤት ዕቃ መደርደሪያ" },
  { number: 24, category: "የመሠረት ዕቃዎች", categoryRows: 3, item: "ዶልቲ" },
  { number: 25, category: "", categoryRows: 0, item: "የመሠረት ማቀፊያዎች" },
  { number: 26, category: "", categoryRows: 0, item: "አምፖል መሸፈኛ ቆዳ / ብርጭቆዎች" },
  { number: 27, category: "ሌሎች", categoryRows: 6, item: "የልብስ መስቀያ ኪን ሸክሙ" },
  { number: 28, category: "", categoryRows: 0, item: "የቴሌቪዥን አንቴና" },
  { number: 29, category: "", categoryRows: 0, item: "የሦስት ማዕዘን" },
  { number: 30, category: "", categoryRows: 0, item: "ባለሃ / የመሬት እና የመራያ" },
  { number: 31, category: "", categoryRows: 0, item: "የጎለል መስታወት እና የፈትና የኋላ" },
  { number: 32, category: "", categoryRows: 0, item: "ጣሪያ ፎርሮ" },
];

const HANDOVER_CHECKLIST_TABLE_STYLE: React.CSSProperties = {
  ...DOCUMENT_TABLE_STYLE,
  marginTop: "5px",
  border: `1px solid ${GUNMETAL}`,
  fontSize: "7.8pt",
};

const HANDOVER_CHECKLIST_HEADER_CELL: React.CSSProperties = {
  padding: "4px 3px",
  background: NAVY,
  color: "#fff",
  borderRight: "1px solid rgba(255,255,255,0.35)",
  fontWeight: 700,
  fontSize: "7.3pt",
  lineHeight: "1.15",
  textAlign: "center",
  verticalAlign: "middle",
};

const HANDOVER_CHECKLIST_CELL: React.CSSProperties = {
  padding: "3px 4px",
  borderRight: `1px solid ${RULE}`,
  borderBottom: `1px solid ${RULE}`,
  fontSize: "8pt",
  lineHeight: "1.2",
  verticalAlign: "middle",
};

const HANDOVER_CHECKLIST_CENTER_CELL: React.CSSProperties = {
  ...HANDOVER_CHECKLIST_CELL,
  textAlign: "center",
};

const HANDOVER_CHECKLIST_CATEGORY_CELL: React.CSSProperties = {
  ...HANDOVER_CHECKLIST_CELL,
  background: PALE_NAVY,
  color: NAVY,
  fontWeight: 700,
  fontSize: "8.2pt",
  textAlign: "center",
  verticalAlign: "middle",
};

function HandoverChecklistTable() {
  return (
    <table style={HANDOVER_CHECKLIST_TABLE_STYLE}>
      <colgroup>
        <col style={{ width: "5%" }} />
        <col style={{ width: "15%" }} />
        <col style={{ width: "40%" }} />
        <col style={{ width: "8%" }} />
        <col style={{ width: "10%" }} />
        <col style={{ width: "11%" }} />
        <col style={{ width: "11%" }} />
      </colgroup>
      <thead>
        <tr>
          <th scope="col" style={HANDOVER_CHECKLIST_HEADER_CELL}>
            ተ.ቁ
          </th>
          <th scope="col" style={HANDOVER_CHECKLIST_HEADER_CELL}>
            የምድብ ስም
          </th>
          <th scope="col" style={HANDOVER_CHECKLIST_HEADER_CELL}>
            የሚመረመረው ዕቃ / ክፍል
          </th>
          <th scope="col" style={HANDOVER_CHECKLIST_HEADER_CELL}>
            ብዛት
          </th>
          <th scope="col" style={HANDOVER_CHECKLIST_HEADER_CELL}>
            ጥሩ
          </th>
          <th scope="col" style={HANDOVER_CHECKLIST_HEADER_CELL}>
            የተበላሸ
          </th>
          <th scope="col" style={HANDOVER_CHECKLIST_HEADER_CELL}>
            ማስታወሻ
          </th>
        </tr>
      </thead>
      <tbody>
        {HANDOVER_CHECKLIST.map((row) => (
          <tr key={row.number}>
            <td style={HANDOVER_CHECKLIST_CENTER_CELL}>{row.number}</td>
            {row.category && (
              <td
                rowSpan={row.categoryRows}
                style={HANDOVER_CHECKLIST_CATEGORY_CELL}
              >
                {row.category}
              </td>
            )}
            <td style={HANDOVER_CHECKLIST_CELL}>{row.item}</td>
            <td style={HANDOVER_CHECKLIST_CENTER_CELL} />
            <td style={HANDOVER_CHECKLIST_CENTER_CELL}>☐</td>
            <td style={HANDOVER_CHECKLIST_CENTER_CELL}>☐</td>
            <td style={HANDOVER_CHECKLIST_CELL} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** One instance of the handover form (original or duplicate copy). */
function ReceiptCopy({
  detail,
  copyLabel,
  refNo,
  allocationDate,
}: {
  detail: ReceiptDetail;
  copyLabel: string;
  refNo: string;
  allocationDate: string;
}) {
  const employeeName = fullName(detail.employee);
  const employeeNumber = detail.employee.employeeNumber;
  const dept = detail.employee.department?.name ?? "";
  const houseNumber = detail.house?.houseNumber ?? "________";

  return (
    <ReceiptFrame>
      <table style={DOCUMENT_TABLE_STYLE}>
        <tbody>
          <tr>
            <td style={HEADER_BRAND_CELL}>
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/msflogo.jpg"
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
                  <div style={{ ...META_CAPTION_STYLE, marginTop: "2px" }}>
                    METAHARA SUGAR FACTORY
                  </div>
                </div>
              </div>
            </td>
            <td style={HEADER_META_CELL}>
              <table style={NESTED_TABLE_STYLE}>
                <tbody>
                  <tr>
                    <td
                      colSpan={2}
                      style={{
                        ...META_LABEL_STYLE,
                        padding: "2px 0",
                        textAlign: "right",
                      }}
                    >
                      {copyLabel}
                    </td>
                  </tr>
                  <tr>
                    <td style={META_LABEL_STYLE}>ቁጥር / Ref No</td>
                    <td style={{ ...FORM_VALUE_CELL, textAlign: "right" }}>
                      <Dots value={refNo} minWidth={82} />
                    </td>
                  </tr>
                  <tr>
                    <td style={META_LABEL_STYLE}>ቀን / Date</td>
                    <td style={{ ...FORM_VALUE_CELL, textAlign: "right" }}>
                      <Dots value={allocationDate} minWidth={82} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      <table
        style={{ ...DOCUMENT_TABLE_STYLE, borderTop: `1px solid ${NAVY}` }}
      >
        <tbody>
          <tr>
            <td style={FORM_TITLE_CELL}>
              <div style={META_CAPTION_STYLE}>ርዕስ / Form Title</div>
              <div style={{ ...FORM_TITLE_STYLE, marginTop: "2px" }}>
                በቤት ምደባ ወቅት የቤት ማረከቢያ ቅጽ
              </div>
            </td>
            <td style={FORM_PAGE_CELL}>
              <div style={{ fontWeight: 700 }}>ገጽ ቁጥር 1/1</div>
              <div style={META_CAPTION_STYLE}>Page No: 1/1</div>
            </td>
          </tr>
        </tbody>
      </table>

      <table
        style={{
          ...DOCUMENT_TABLE_STYLE,
          marginTop: "5px",
          border: `1px solid ${RULE}`,
        }}
      >
        <tbody>
          <tr>
            <td style={{ ...FORM_LABEL_CELL, width: "12%" }}>ማንነት፡</td>
            <td style={{ ...FORM_VALUE_CELL, width: "34%" }}>
              <Dots value={employeeName} minWidth={90} />
            </td>
            <td style={{ ...FORM_LABEL_CELL, width: "12%" }}>ሽፍንት፡</td>
            <td style={{ ...FORM_VALUE_CELL, width: "18%" }}>
              <Dots minWidth={64} />
            </td>
            <td style={{ ...FORM_LABEL_CELL, width: "10%" }}>ቀን፡</td>
            <td style={{ ...FORM_VALUE_CELL, width: "14%" }}>
              <Dots value={allocationDate} minWidth={68} />
            </td>
          </tr>
          <tr>
            <td colSpan={6} style={{ ...FORM_BODY_CELL, border: "none" }}>
              <p style={{ margin: 0, marginBottom: "4px" }}>
                እኔ <Dots value={employeeName} minWidth={110} /> መ/ቁ{" "}
                <Dots value={employeeNumber} minWidth={52} /> ክፍል{" "}
                <Dots value={dept} minWidth={82} /> ባለደርባ
              </p>
              <p style={{ margin: 0, marginBottom: "4px" }}>
                በድርጅቱ የተሰጠኝን መኖርያ ቤት ቁጥር:{" "}
                <Dots value={houseNumber} minWidth={54} /> በህብረት ስምምነት አንቀጽ{" "}
                <Dots minWidth={54} /> መሠረት
              </p>
              <p style={{ margin: 0 }}>
                የድርጅቱን ንብረት በግንባ ለመያዝና የቤቱንም ጽዳት ለመጠበቅ ተስማምቼ ከዚህ በተዘረዘሩትን ነገሮች
                በደህና ሁኔታ መረከቤን እገልጻለሁ::
              </p>
            </td>
          </tr>
        </tbody>
      </table>

      <HandoverChecklistTable />

      <table
        style={{
          ...DOCUMENT_TABLE_STYLE,
          marginTop: "5px",
          border: `1px solid ${RULE}`,
        }}
      >
        <tbody>
          <tr>
            <td style={FORM_SIGNATURE_CELL}>
              <div
                style={{ display: "flex", alignItems: "baseline", gap: "6px" }}
              >
                <span style={SIGNATURE_LABEL_STYLE}>ተረካቢ፡-</span>
                <span
                  style={{
                    flex: 1,
                    minWidth: "80px",
                    borderBottom: `1px solid ${GUNMETAL}`,
                  }}
                />
              </div>
            </td>
            <td style={FORM_SIGNATURE_LAST_CELL}>
              <div
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "baseline",
                  gap: "6px",
                }}
              >
                <span style={SIGNATURE_LABEL_STYLE}>አስረካቢ፡-</span>
                <span
                  style={{
                    flex: 1,
                    minWidth: "80px",
                    borderBottom: `1px solid ${GUNMETAL}`,
                  }}
                />
                <NameStamp />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </ReceiptFrame>
  );
}

/**
 * House handback confirmation letter (የቤት ርክክብ ማረጋገጫ ቅጽ) — printed when an
 * allocation ends by retirement / resignation / leave (terminated allocations).
 * Verbatim reproduction of factory form OF/MSF/HRSM/293.
 *
 * Exported so the printed document can be asserted on directly (see
 * `__tests__/AllocationReceiptPrint.termination.test.tsx`): what matters on a
 * legal form is the markup that comes out, not the dialog that wraps it.
 */
export function TerminationCopy({
  detail,
  formNo,
  date,
}: {
  detail: ReceiptDetail;
  formNo: string;
  date: string;
}) {
  const employeeName = fullName(detail.employee);
  const houseNumber = detail.house?.houseNumber ?? "________";
  const receipt = detail.terminationReceipt ?? null;
  // The intro paragraph promises a list of damaged / undamaged items. When no
  // snapshot has been supplied there is nothing truthful to print there, so the
  // section is omitted rather than filled with a guess.
  const damageLines = receipt?.damageLines ?? [];
  const note = wrapNoteForPrint(receipt?.conditionNote);

  return (
    <ReceiptFrame>
      <table style={DOCUMENT_TABLE_STYLE}>
        <tbody>
          <tr>
            <td style={HEADER_BRAND_CELL}>
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/msflogo.jpg"
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
                  <div style={{ ...META_CAPTION_STYLE, marginTop: "2px" }}>
                    METAHARA SUGAR FACTORY
                  </div>
                </div>
              </div>
            </td>
            <td style={HEADER_META_CELL}>
              <table style={NESTED_TABLE_STYLE}>
                <tbody>
                  <tr>
                    <td style={META_LABEL_STYLE}>ቅጽ ቁጥር፡ Form No.</td>
                    <td style={{ ...FORM_VALUE_CELL, textAlign: "right" }}>
                      <Dots value={formNo} minWidth={100} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      <table
        style={{ ...DOCUMENT_TABLE_STYLE, borderTop: `1px solid ${NAVY}` }}
      >
        <tbody>
          <tr>
            <td style={{ ...FORM_TITLE_CELL, width: "62%" }}>
              <div style={META_CAPTION_STYLE}>የቅጽ ርዕስ፡ Form Title</div>
              <div style={{ ...FORM_TITLE_STYLE, marginTop: "2px" }}>
                የቤት ርክክብ ማረጋገጫ ቅጽ
              </div>
            </td>
            <td
              style={{
                ...FORM_PAGE_CELL,
                width: "20%",
                textAlign: "center",
                borderRight: `1px solid ${RULE}`,
              }}
            >
              <div style={META_CAPTION_STYLE}>እትም ቁጥር፡ Issue No.</div>
              <div style={{ fontWeight: 700, fontSize: "10pt" }}>2</div>
            </td>
            <td
              style={{ ...FORM_PAGE_CELL, width: "18%", textAlign: "center" }}
            >
              <div style={META_CAPTION_STYLE}>ገጽ፡ Page No</div>
              <div style={{ fontWeight: 700, fontSize: "10pt" }}>
                Page 1 of 1
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <table
        style={{
          ...DOCUMENT_TABLE_STYLE,
          marginTop: "5px",
          border: `1px solid ${RULE}`,
        }}
      >
        <tbody>
          <tr>
            <td
              style={{
                ...FORM_BODY_CELL,
                width: "68%",
                background: "#fff",
                fontWeight: 700,
                color: NAVY,
                fontSize: "10pt",
              }}
            >
              ለሰው ሃብት ሥራ አመራር ቡድን
            </td>
            <td style={{ ...FORM_VALUE_CELL, width: "32%" }}>
              <span style={META_LABEL_STYLE}>መድረክ፡</span>{" "}
              <Dots minWidth={110} />
            </td>
          </tr>
        </tbody>
      </table>

      <table
        style={{
          ...DOCUMENT_TABLE_STYLE,
          marginTop: "5px",
          border: `1px solid ${RULE}`,
        }}
      >
        <tbody>
          <tr>
            <td style={{ ...FORM_BODY_CELL, border: "none" }}>
              <p style={{ margin: 0, marginBottom: "6px" }}>
                ይህ መረጃ የተሰጠው አቶ/ወ/ሮ <Dots value={employeeName} minWidth={125} />{" "}
                ከድርጅቱ ጋር የነበራቸው የሥራ ውል በመቋረጡ የድርጅቱ ቤት ቁጥር{" "}
                <Dots value={houseNumber} minWidth={70} /> ያስረከቡ መሆናቸውን
                እናረጋግጣለን።
              </p>
              <p style={{ margin: 0 }}>
                በመሆኑም ሲያስረክብ ከዚህ በታች ስማቸው ዋጋቸው የተጠቀሱ ንብረቶች የጸደቁ /ያልጸደቁ/ መሆኑን
                እንገልጻለን።
              </p>
            </td>
          </tr>
        </tbody>
      </table>

      {/*
        Damage + note. Sits between the recital and the signatures because that is
        what the recital promises, and because a reader checks the assessment
        before signing it.

        Both blocks are sized against the single-page budget: the note is wrapped
        to a fixed line width and clipped to a fixed number of lines, so this
        section grows to a known maximum rather than pushing the signature block
        onto page two of a form that says "Page 1 of 1".
      */}
      {receipt && (
        <table
          style={{
            ...DOCUMENT_TABLE_STYLE,
            marginTop: "5px",
            border: `1px solid ${RULE}`,
          }}
        >
          <colgroup>
            <col style={{ width: "9%" }} />
            <col style={{ width: "61%" }} />
            <col style={{ width: "30%" }} />
          </colgroup>

          {/* Section band. The count sits opposite the title because the first
              question a reader asks of a damage list is how big it is. */}
          <thead>
            <tr>
              <th colSpan={3} scope="colgroup" style={DAMAGE_BAND_CELL}>
                {RECEIPT_COPY.damageChecklistTitle}
                <span style={DAMAGE_BAND_META}>
                  {RECEIPT_COPY.partsCountLabel} {damageLines.length}
                </span>
              </th>
            </tr>
            <tr>
              <th scope="col" style={DAMAGE_COLUMN_HEAD}>
                №
              </th>
              <th
                scope="col"
                style={{ ...DAMAGE_COLUMN_HEAD, ...DAMAGE_COLUMN_RULE }}
              >
                የተጎዳው ክፍል · Damaged part
              </th>
              <th
                scope="col"
                style={{ ...DAMAGE_COLUMN_HEAD, textAlign: "right" }}
              >
                ወጪ · Cost (ETB)
              </th>
            </tr>
          </thead>

          <tbody>
            {damageLines.length === 0 ? (
              // Explicit rather than an empty table: "nothing here" and "nothing
              // was recorded" are different statements, and only the second one
              // is evidence. The total still prints below — a nil assessment is
              // stated as 0.00, not left blank.
              <tr>
                <td
                  colSpan={3}
                  style={{ ...DAMAGE_ROW_CELL, textAlign: "center" }}
                >
                  {RECEIPT_COPY.noDamage}
                </td>
              </tr>
            ) : (
              damageLines.map((line, index) => (
                <tr key={line.key}>
                  <td style={{ ...DAMAGE_ROW_INDEX, ...DAMAGE_COLUMN_RULE }}>
                    {index + 1}
                  </td>
                  <td style={{ ...DAMAGE_ROW_LABEL, ...DAMAGE_COLUMN_RULE }}>
                    {line.label}
                    <span style={DAMAGE_ROW_LABEL_AM}>{line.labelAm}</span>
                  </td>
                  <td style={DAMAGE_ROW_COST}>{line.cost}</td>
                </tr>
              ))
            )}
          </tbody>

          {/* The total is outside the branch above: a nil assessment still has to
              be totalled, and the reader needs one figure they can check the rows
              against. */}
          <tfoot>
            <tr>
              <td
                colSpan={2}
                style={{ ...DAMAGE_TOTAL_CELL, ...DAMAGE_COLUMN_RULE }}
              >
                {RECEIPT_COPY.totalDamage}
              </td>
              <td style={DAMAGE_TOTAL_VALUE}>{receipt.totalDamageCost}</td>
            </tr>
          </tfoot>
        </table>
      )}

      {receipt && (
        <table
          style={{
            ...DOCUMENT_TABLE_STYLE,
            marginTop: "5px",
            border: `1px solid ${RULE}`,
          }}
        >
          <tbody>
            <tr>
              <td style={{ ...FORM_BODY_CELL, border: "none" }}>
                <div style={{ fontWeight: 700, color: NAVY, fontSize: "9pt" }}>
                  {RECEIPT_COPY.conditionNoteTitle}
                </div>
                {note.lines.length === 0 ? (
                  <p style={{ margin: "3px 0 0" }}>{RECEIPT_COPY.noNote}</p>
                ) : (
                  <>
                    {note.lines.map((line, i) => (
                      <p key={i} style={{ margin: "3px 0 0" }}>
                        {line}
                      </p>
                    ))}
                    {note.truncated && (
                      <p
                        style={{
                          margin: "3px 0 0",
                          fontStyle: "italic",
                          color: GUNMETAL,
                        }}
                      >
                        {RECEIPT_COPY.continued}
                      </p>
                    )}
                  </>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      )}

      {/* Reprint marker. A copy filed at a counter must be identifiable as one,
          otherwise two documents with the same receipt number exist and only one
          of them is the original. */}
      {receipt && !receipt.isOriginal && (
        <table style={{ ...DOCUMENT_TABLE_STYLE, marginTop: "5px" }}>
          <tbody>
            <tr>
              <td style={{ ...FORM_FOOTER_CELL, textAlign: "right" }}>
                REPRINT · print #{receipt.printCount} ·{" "}
                {receipt.printedAt.slice(0, 10)}
              </td>
            </tr>
          </tbody>
        </table>
      )}

      <table
        style={{
          ...DOCUMENT_TABLE_STYLE,
          marginTop: "5px",
          border: `1px solid ${RULE}`,
        }}
      >
        <tbody>
          <tr>
            <td style={FORM_SIGNATURE_CELL}>
              <div style={{ fontWeight: 700, color: NAVY }}>ግልባጭ:-</div>
              <div>ለቤቶች አስተዳደር</div>
              <div
                style={{ display: "flex", alignItems: "baseline", gap: "5px" }}
              >
                <span style={META_LABEL_STYLE}>መድረክ፡</span>
                <Dots minWidth={80} />
              </div>
            </td>
            <td
              style={{
                ...FORM_SIGNATURE_LAST_CELL,
                position: "relative",
                textAlign: "right",
                lineHeight: "1.35",
              }}
            >
              <div style={{ fontWeight: 700, color: NAVY }}>ከሰላምታ ጋር</div>
              <div
                style={{
                  borderBottom: `1px solid ${GUNMETAL}`,
                  minWidth: "150px",
                  margin: "9px 0 3px auto",
                }}
              />
              <div style={{ fontWeight: 700 }}>ለበታ ጃርሴ</div>
              <div>የፋ.ሲ.ቲ ማኔጅመንት</div>
              <div>ቡድኑ መሪ</div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  alignItems: "baseline",
                  gap: "5px",
                  marginTop: "6px",
                }}
              >
                <span style={META_LABEL_STYLE}>ቀን፡</span>
                <Dots value={date} minWidth={82} />
              </div>
              <NameStamp />
            </td>
          </tr>
        </tbody>
      </table>

      <table style={{ ...DOCUMENT_TABLE_STYLE, marginTop: "5px" }}>
        <tbody>
          <tr>
            <td style={FORM_FOOTER_CELL}>
              PLEASE MAKE SURE THAT THIS IS THE CORRECT ISSUE BEFORE USE
            </td>
          </tr>
        </tbody>
      </table>
    </ReceiptFrame>
  );
}

/**
 * House move / transfer request — vehicle service request (በቤት ቃለ ወቅት
 * ተሽከርካሪ አገልግሎት መጠየቂያ ቅጽ, form OF/MSF/HRMS/291). Printed when an
 * employee relocates from the current house to a new one (transfer /
 * reassignment / any house change).
 */
function TransferMoveCopy({
  detail,
  refNo,
  requestDate,
  fromHouseNumber,
  newHouseNumber,
}: {
  detail: ReceiptDetail;
  refNo: string;
  requestDate: string;
  fromHouseNumber?: string;
  newHouseNumber?: string;
}) {
  const employeeName = fullName(detail.employee);
  const currentHouseNumber = detail.house?.houseNumber ?? "________";
  const fromHouse = fromHouseNumber || currentHouseNumber;
  const toHouse = newHouseNumber?.trim() || currentHouseNumber;

  return (
    <ReceiptFrame>
      <table style={DOCUMENT_TABLE_STYLE}>
        <tbody>
          <tr>
            <td style={HEADER_BRAND_CELL}>
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/msflogo.jpg"
                  alt="MSF Logo"
                  style={{
                    width: "42px",
                    height: "42px",
                    objectFit: "contain",
                  }}
                />
                <div style={{ lineHeight: "1.2" }}>
                  <div
                    style={{ fontWeight: 700, fontSize: "10.5pt", color: NAVY }}
                  >
                    Company Name: METAHARA SUGAR FACTORY
                  </div>
                  <div style={{ ...META_CAPTION_STYLE, marginTop: "2px" }}>
                    መተሐራ ስኳር ፋብሪካ
                  </div>
                </div>
              </div>
            </td>
            <td style={HEADER_META_CELL}>
              <table style={NESTED_TABLE_STYLE}>
                <tbody>
                  <tr>
                    <td style={META_LABEL_STYLE}>Form No:</td>
                    <td style={{ ...FORM_VALUE_CELL, textAlign: "right" }}>
                      <Dots value="OF/MSF/HRMS/291" minWidth={92} />
                    </td>
                  </tr>
                  <tr>
                    <td
                      colSpan={2}
                      style={{
                        ...FORM_VALUE_CELL,
                        fontSize: "8.4pt",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Ref No: <Dots value={refNo} minWidth={54} /> · ቀን / Date:{" "}
                      <Dots value={requestDate} minWidth={68} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      <table
        style={{ ...DOCUMENT_TABLE_STYLE, borderTop: `1px solid ${NAVY}` }}
      >
        <tbody>
          <tr>
            <td
              style={{ ...FORM_TITLE_CELL, width: "58%", textAlign: "center" }}
            >
              <div style={META_CAPTION_STYLE}>Form Title:</div>
              <div style={{ ...FORM_TITLE_STYLE, marginTop: "2px" }}>
                በቤት ቅያሬ ወቅት ተሽከርካሪ አገልግሎት መጠየቂያ ቅጽ
              </div>
            </td>
            <td
              style={{
                ...FORM_PAGE_CELL,
                width: "20%",
                textAlign: "center",
                borderRight: `1px solid ${RULE}`,
              }}
            >
              <div style={META_CAPTION_STYLE}>Issue No:</div>
              <div style={{ fontWeight: 700, fontSize: "10pt" }}>2</div>
            </td>
            <td
              style={{ ...FORM_PAGE_CELL, width: "22%", textAlign: "center" }}
            >
              <div style={META_CAPTION_STYLE}>Page No:</div>
              <div style={{ fontWeight: 700, fontSize: "10pt" }}>
                Page 1 of 1
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <table
        style={{
          ...DOCUMENT_TABLE_STYLE,
          marginTop: "5px",
          border: `1px solid ${RULE}`,
        }}
      >
        <tbody>
          <tr>
            <td colSpan={3} style={FORM_SECTION_HEADER_CELL}>
              የመጠየቂያ ዝርዝር / REQUEST DETAILS
            </td>
          </tr>
          <tr>
            <td style={{ ...FORM_LABEL_CELL, width: "28%" }}>የጠያቂው ስም</td>
            <td colSpan={2} style={FORM_VALUE_CELL}>
              <Dots value={employeeName} minWidth={120} />
            </td>
          </tr>
          <tr>
            <td style={{ ...FORM_LABEL_CELL, width: "28%" }}>የሚሄድበት ቦታ</td>
            <td colSpan={2} style={{ ...FORM_VALUE_CELL, padding: "4px 6px" }}>
              <table style={NESTED_TABLE_STYLE}>
                <tbody>
                  <tr>
                    <td
                      style={{
                        ...FORM_VALUE_CELL,
                        width: "42%",
                        borderRight: `1px solid ${RULE}`,
                      }}
                    >
                      <span>ከ</span>
                      <Dots value={fromHouse} minWidth={62} />
                    </td>
                    <td style={{ ...FORM_VALUE_CELL, width: "58%" }}>
                      <span>ወደ</span>
                      <Dots value={toHouse} minWidth={82} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
          <tr>
            <td style={{ ...FORM_LABEL_CELL, width: "28%" }}>ምክንያት</td>
            <td colSpan={2} style={FORM_VALUE_CELL}>
              <Dots minWidth={190} />
            </td>
          </tr>
          <tr>
            <td style={{ ...FORM_LABEL_CELL, width: "28%" }}>
              አገልግሎት የሚፈልግበት ጊዜ
            </td>
            <td
              colSpan={2}
              style={{ ...FORM_VALUE_CELL, borderBottom: "none" }}
            >
              <Dots minWidth={190} />
            </td>
          </tr>
        </tbody>
      </table>

      <table
        style={{
          ...DOCUMENT_TABLE_STYLE,
          marginTop: "5px",
          border: `1px solid ${RULE}`,
        }}
      >
        <tbody>
          <tr>
            <td colSpan={3} style={FORM_SECTION_HEADER_CELL}>
              የማጽደቅ ፊርማዎች / APPROVAL SIGNATURES
            </td>
          </tr>
          <tr>
            <td
              style={{
                ...FORM_SIGNATURE_CELL,
                width: "33.33%",
                textAlign: "center",
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: "10px" }}>ፊርማ</div>
              <div
                style={{ borderBottom: `1px solid ${GUNMETAL}`, height: "1px" }}
              />
            </td>
            <td
              style={{
                ...FORM_SIGNATURE_CELL,
                width: "33.33%",
                textAlign: "center",
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: "10px" }}>
                የጠያቂው ኃላፊ ፊርማ
              </div>
              <div
                style={{ borderBottom: `1px solid ${GUNMETAL}`, height: "1px" }}
              />
            </td>
            <td
              style={{
                ...FORM_SIGNATURE_LAST_CELL,
                width: "33.34%",
                textAlign: "center",
                position: "relative",
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: "10px" }}>
                የፈቀደው ክፍሉ ኃላፊ ፊርማ
              </div>
              <div
                style={{ borderBottom: `1px solid ${GUNMETAL}`, height: "1px" }}
              />
              <NameStamp />
            </td>
          </tr>
        </tbody>
      </table>

      <table style={{ ...DOCUMENT_TABLE_STYLE, marginTop: "5px" }}>
        <tbody>
          <tr>
            <td style={FORM_FOOTER_CELL}>
              PLEASE MAKE SURE THAT THIS IS THE CORRECT ISSUE BEFORE USE
            </td>
          </tr>
        </tbody>
      </table>
    </ReceiptFrame>
  );
}

/**
 * Allocation receipt preview + print/download dialog.
 *
 * Template is chosen from the `variant` prop (default "auto" → allocation
 * state):
 *  - "auto" (allocated) / "handover" → the factory's Amharic handover form
 *    (የቤት ማረከቢያ ቅጽ) as one original copy.
 *  - "auto" (terminated) / "handback" → house handback confirmation
 *    (የቤት ርክክብ ማረጋገጫ ቅጽ, form OF/MSF/HRSM/293) for retirement /
 *    resignation / leave, single page.
 *  - "move" → house move / transfer vehicle service request
 *    (በቤት ቃለ ወቅት ተሽከርካሪ አገልግሎት መጠየቂያ ቅጽ, form OF/MSF/HRMS/291)
 *    for relocations (transfer / reassignment / any house change), single page.
 *
 * Actions:
 *  - Print  → `window.print()`, global print CSS hides the app and shows the
 *    receipt portaled into <body> with class `.allocation-receipt-print`.
 *    Each receipt stays on one A4 page (never split mid-form).
 *  - Download → rasterizes the receipt via html2canvas and saves one A4 page
 *    through jsPDF.
 *
 * Every printed copy carries the Facility & House Administration stamp
 * (መተሐራ ስኳር ፋብሪካ - ፋሲሊቲ እና ቤት አስተዳደር) hovered diagonally across
 * its center, plus the official name seal of the issuer (ለበታ ጃርሴ,
 * የፋ.ሲ.ቲ ማኔጅመንት ቡድን መሪ) hovered over the signature line.
 */
export default function AllocationReceiptPrint({
  detail,
  open = false,
  onClose,
  variant = "auto",
}: Props) {
  const [downloading, setDownloading] = useState(false);
  const [moveTo, setMoveTo] = useState("");
  const sheetRef = useRef<HTMLDivElement>(null);

  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const isTerminated =
    variant === "handback" ||
    (variant === "auto" && detail.status === "terminated");
  const isMove = variant === "move";
  const allocationDate = formatDate(detail.decidedAt);
  const terminationDate = formatDate(detail.terminatedAt);
  const requestDate = formatDate(new Date().toISOString());
  const formNo = "OF/MSF/HRSM/293";
  const refNo = detail.allocationId.slice(0, 8).toUpperCase();
  const houseNumber = detail.house?.houseNumber ?? "receipt";

  const copies = isMove ? (
    <TransferMoveCopy
      detail={detail}
      refNo={refNo}
      requestDate={requestDate}
      fromHouseNumber={detail.previousHouseNumber || houseNumber}
      newHouseNumber={moveTo.trim()}
    />
  ) : isTerminated ? (
    <TerminationCopy detail={detail} formNo={formNo} date={terminationDate} />
  ) : (
    <ReceiptCopy
      detail={detail}
      copyLabel="ዋና / Original"
      refNo={refNo}
      allocationDate={allocationDate}
    />
  );

  const handleDownload = useCallback(async () => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    setDownloading(true);
    try {
      const copyEls = Array.from(
        sheet.querySelectorAll<HTMLElement>(".allocation-receipt-copy"),
      );
      if (copyEls.length === 0) return;

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      // Render the selected receipt on an A4 page, scaled to fit.
      for (let i = 0; i < copyEls.length; i++) {
        const canvas = await html2canvas(copyEls[i], {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          logging: false,
        });
        if (i > 0) pdf.addPage();
        const imgData = canvas.toDataURL("image/png");
        const ratio = Math.min(
          pageWidth / canvas.width,
          pageHeight / canvas.height,
        );
        const w = canvas.width * ratio;
        const h = canvas.height * ratio;
        pdf.addImage(
          imgData,
          "PNG",
          (pageWidth - w) / 2,
          (pageHeight - h) / 2,
          w,
          h,
        );
      }

      pdf.save(
        isMove
          ? `house-move-request-${houseNumber}.pdf`
          : isTerminated
            ? `house-handback-${houseNumber}.pdf`
            : `allocation-receipt-${houseNumber}.pdf`,
      );
      notify.success(
        isMove
          ? "Move request saved as PDF"
          : isTerminated
            ? "Confirmation saved as PDF"
            : "Receipt saved as PDF",
      );
    } catch {
      notify.error("Failed to generate the PDF");
    } finally {
      setDownloading(false);
    }
  }, [houseNumber, isTerminated, isMove]);

  // Print-only copy rendered into <body> so print CSS can hide the whole app
  // shell and show just the receipt without fighting scroll/overflow wrappers.
  const printCopy = (
    <div className="allocation-receipt-print" aria-hidden="true">
      {copies}
    </div>
  );

  if (!mounted) return null;

  return (
    <>
      {open && createPortal(printCopy, document.body)}

      <Dialog open={open} onOpenChange={(v) => !v && onClose?.()}>
        <DialogContent className="max-w-[860px]">
          <DialogHeader>
            <DialogTitle>
              {isMove
                ? "House Move / Transfer Request"
                : isTerminated
                  ? "House Handback Confirmation"
                  : "House Allocation Receipt"}
            </DialogTitle>
            <DialogDescription>
              {isMove
                ? "Preview the vehicle service request for house relocation (OF/MSF/HRMS/291). It prints on a single A4 page; download saves a one-page PDF."
                : isTerminated
                  ? "Preview the handback confirmation form (OF/MSF/HRSM/293). It prints on a single A4 page; download saves a one-page PDF."
                  : "Preview the house handover form (Original). It prints on a single A4 page; download saves a one-page PDF."}
            </DialogDescription>
          </DialogHeader>

          {isMove && (
            <div className="bg-background flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5">
              <span className="text-sm font-semibold">
                ከ{" "}
                <span className="text-brass-600 dark:text-brass-300">
                  {detail.previousHouseNumber || houseNumber}
                </span>
              </span>
              <span className="text-muted-foreground text-sm">→</span>
              <span className="text-sm font-medium whitespace-nowrap">
                ወደአዲስ ቤት / New house number
              </span>
              <Input
                value={moveTo}
                onChange={(e) => setMoveTo(e.target.value)}
                placeholder="e.g. B202"
                className="w-40 text-xs"
              />
            </div>
          )}

          <div
            style={{
              maxHeight: "62vh",
              overflow: "auto",
              border: "1px solid rgba(0,0,0,0.15)",
              borderRadius: "8px",
              background: "#f1f5f9",
              padding: "14px",
            }}
          >
            <div
              ref={sheetRef}
              style={{
                width: "210mm",
                margin: "0 auto",
                background: "#fff",
                boxShadow: "0 2px 12px rgba(0,0,0,0.18)",
              }}
            >
              {copies}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onClose?.()}>
              Close
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
            <Button onClick={handleDownload} disabled={downloading}>
              {downloading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
