/**
 * The printed-document house style.
 *
 * Every official form this portal prints - the house allocation / handback /
 * transfer forms (`src/ui/houses/AllocationReceiptPrint.tsx`) and the rent
 * receipt and lease statement (`src/ui/rent/RentReceiptPrint.tsx`) - is a
 * reproduction of a Metahara Sugar Factory paper form. That means they are
 * supposed to be typographically identical: same frame, same navy/brass
 * palette, same bilingual caption sizes, same rubber stamp, same issuer name
 * seal.
 *
 * Those tokens used to be copy-pasted between the two receipt components, which
 * meant a change to the stamp or the palette had to be made twice and could
 * silently drift. They live here instead. Nothing in this module is
 * domain-specific: it knows about a *form*, not about houses or rent.
 *
 * Everything is a plain inline `React.CSSProperties` object rather than
 * Tailwind classes. The documents are rasterised with html2canvas before being
 * written into a PDF, and inline styles are the only styling html2canvas is
 * guaranteed to reproduce faithfully.
 *
 * House rules for anything built on this module:
 *  - Amharic first, English second, never English alone.
 *  - A figure that matters is also written in words (see `./amount-in-words`).
 *  - The stamp must never sit over a column a reader has to check. Place it in
 *    the whitespace a document actually has - `StampOverlay` takes placement
 *    rather than hard-coding one.
 *  - Print CSS forces `[data-print-overlay]` to `position: absolute` so the
 *    stamp cannot repeat on every page of a paginating document.
 */

import type { CSSProperties, ReactNode } from "react";

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

/** Ink colour for headings and labels. */
export const NAVY = "#1f2d3d";
/** The accent rule under the title strip and around the page foot. */
export const BRASS = "#9a7a32";
/** Secondary ink: captions, hairlines under written entries. */
export const GUNMETAL = "#454d56";
/** Table gridlines. */
export const RULE = "#aeb5bc";
/** Table header and section-band fill. */
export const PALE_NAVY = "#f1f4f7";
/** Label-cell fill. */
export const PALE_BRASS = "#f7f4ed";
/** Prose block fill, a half-step lighter than the header band. */
export const PAPER_SOFT = "#fafbfc";
/** An unsettled balance. */
export const OVERDUE = "#b45309";
/** A settled month. */
export const PAID = "#15803d";
/** A voided month or an unlabelled status. */
export const VOIDED = GUNMETAL;
/** The ink of the rubber stamp and the issuer name seal. */
export const STAMP_INK = "#174ea6";

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

/**
 * One stack for the whole document.
 *
 * `Source Serif 4` carries the Latin text, the Noto/Nyala faces carry the
 * Ethiopic, and the serif fallbacks matter because printing happens from
 * whatever machine the office happens to be sitting at.
 */
export const LANG_FONT =
  "'Source Serif 4', 'Noto Serif Ethiopic', 'Noto Sans Ethiopic', 'Nyala', 'Ethiopia Jiret', Georgia, 'Times New Roman', serif";

/**
 * Monospace for anything a person has to read character by character or copy
 * out: receipt numbers, national IDs, bank references.
 */
export const MONO_FONT = "'Courier New', 'Liberation Mono', monospace";

/** Bilingual small caption: label above, glossed value underneath. */
export const captionStyle: CSSProperties = {
  fontSize: "7.4pt",
  letterSpacing: "0.3px",
  color: GUNMETAL,
};

/** Bold ink label, used in a two-column meta table. */
export const metaLabelStyle: CSSProperties = {
  fontWeight: 700,
  color: NAVY,
  whiteSpace: "nowrap",
};

/** The document's own name, in the title strip. */
export const formTitleStyle: CSSProperties = {
  fontWeight: 700,
  fontSize: "11.5pt",
  lineHeight: "1.15",
  color: NAVY,
};

/** Layout of the table-based form grid. */
export const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "fixed",
  boxSizing: "border-box",
};

/** A table nested inside a header cell, where the grid must size to content. */
export const nestedTableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "auto",
};

/** Left cell of the masthead: the brand lockup. */
export const headerBrandCellStyle: CSSProperties = {
  padding: "6px 10px",
  verticalAlign: "middle",
  borderRight: `1px solid ${RULE}`,
};

/** Right cell of the masthead: document identity. */
export const headerMetaCellStyle: CSSProperties = {
  padding: "5px 10px",
  verticalAlign: "middle",
  textAlign: "right",
  lineHeight: "1.3",
};

/** Left cell of the title strip: the form's name. */
export const formTitleCellStyle: CSSProperties = {
  padding: "5px 10px",
  verticalAlign: "middle",
  borderTop: `1px solid ${NAVY}`,
  borderRight: `1px solid ${RULE}`,
  borderBottom: `2px solid ${BRASS}`,
  background: PALE_NAVY,
};

/** Right cell of the title strip: the page counter. */
export const formPageCellStyle: CSSProperties = {
  padding: "5px 10px",
  verticalAlign: "middle",
  borderTop: `1px solid ${NAVY}`,
  borderBottom: `2px solid ${BRASS}`,
  background: PALE_NAVY,
  textAlign: "right",
  lineHeight: "1.25",
};

/** A field label cell. */
export const formLabelCellStyle: CSSProperties = {
  padding: "3px 6px",
  borderRight: `1px solid ${RULE}`,
  background: PALE_BRASS,
  color: NAVY,
  fontWeight: 700,
  fontSize: "8.6pt",
  verticalAlign: "middle",
};

/** A field value cell. */
export const formValueCellStyle: CSSProperties = {
  padding: "3px 6px",
  fontSize: "9pt",
  verticalAlign: "middle",
};

/** A justified prose paragraph inside a bordered block. */
export const formBodyCellStyle: CSSProperties = {
  padding: "5px 8px",
  border: `1px solid ${RULE}`,
  background: PAPER_SOFT,
  textAlign: "justify",
  fontSize: "9pt",
  lineHeight: "1.35",
};

/** A banded sub-heading inside a table body. */
export const formSectionHeaderCellStyle: CSSProperties = {
  padding: "5px 8px",
  background: PALE_NAVY,
  color: NAVY,
  borderBottom: `1px solid ${BRASS}`,
  fontWeight: 700,
  fontSize: "8.8pt",
  letterSpacing: "0.25px",
  verticalAlign: "middle",
};

/** A column header in a data table. */
export const thStyle: CSSProperties = {
  border: `1px solid ${RULE}`,
  background: PALE_NAVY,
  color: NAVY,
  padding: "3.5px 5px",
  textAlign: "left",
  fontWeight: 700,
  fontSize: "8.2pt",
  letterSpacing: "0.2px",
  verticalAlign: "middle",
};

/** A data cell in a data table. */
export const tdStyle: CSSProperties = {
  border: `1px solid ${RULE}`,
  padding: "3px 5px",
  fontSize: "8.8pt",
  verticalAlign: "middle",
};

/** A money column, so digits line up down the page. */
export const tdRightStyle: CSSProperties = { ...tdStyle, textAlign: "right" };

/** A date, serial or status column. */
export const tdCenterStyle: CSSProperties = { ...tdStyle, textAlign: "center" };

/** A signature cell; the last one drops the internal divider. */
export const formSignatureCellStyle: CSSProperties = {
  padding: "7px 8px",
  verticalAlign: "top",
  borderRight: `1px solid ${RULE}`,
};

export const formSignatureLastCellStyle: CSSProperties = {
  ...formSignatureCellStyle,
  borderRight: "none",
};

/** Bold ink label beside a signature line. */
export const signatureLabelStyle: CSSProperties = {
  color: NAVY,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

/** The standing instruction at the foot of the form. */
export const formFooterCellStyle: CSSProperties = {
  padding: "6px 8px",
  background: PALE_NAVY,
  color: NAVY,
  borderTop: `1px solid ${BRASS}`,
  textAlign: "center",
  fontWeight: 700,
  fontSize: "8pt",
  letterSpacing: "0.4px",
};

/** Where the visible content of a block starts, between stacked tables. */
export const blockGap = 5;

/** A bordered block, separated from the one above it. */
export function blockStyle(extra?: CSSProperties): CSSProperties {
  return {
    ...tableStyle,
    marginTop: `${blockGap}px`,
    border: `1px solid ${RULE}`,
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------

/**
 * The A4 sheet.
 *
 * 186 x 258mm is the printable area inside the 8mm `@page` margin declared in
 * `globals.css`, so one frame is exactly one page - which is what lets a
 * document declare `break-inside: avoid` and be certain it will not split.
 *
 * `minHeight` rather than `height`: a short document still prints as a full
 * sheet, and a long one grows past it and paginates naturally.
 */
export const FRAME_WIDTH_MM = 186;
export const FRAME_HEIGHT_MM = 258;

/** Print base type size for a dense data table. */
export const FRAME_FONT_PT = "9.2pt";

export const frameStyle: CSSProperties = {
  width: `${FRAME_WIDTH_MM}mm`,
  minHeight: `${FRAME_HEIGHT_MM}mm`,
  margin: "0 auto",
  padding: "8mm 7mm",
  background: "#ffffff",
  color: "#000",
  fontFamily: LANG_FONT,
  fontSize: FRAME_FONT_PT,
  lineHeight: "1.25",
  border: `1px solid ${NAVY}`,
  // The brass rule inset along the top edge: the house's one piece of ornament.
  boxShadow: `inset 0 3px 0 0 ${BRASS}`,
  boxSizing: "border-box",
  position: "relative",
};

/**
 * A frame that fills whatever width it is given, for documents printed
 * directly rather than previewed in a fixed-width sheet.
 */
export function fluidFrameStyle(overrides?: CSSProperties): CSSProperties {
  return {
    fontFamily: LANG_FONT,
    fontSize: "9.5pt",
    lineHeight: "1.25",
    color: "#000",
    background: "#ffffff",
    border: `1px solid ${NAVY}`,
    boxShadow: `inset 0 3px 0 0 ${BRASS}`,
    padding: 0,
    position: "relative",
    width: "100%",
    boxSizing: "border-box",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Rubber stamp and issuer name seal
// ---------------------------------------------------------------------------

/**
 * Facility & House Administration rubber stamp.
 *
 * A single SVG, not an image file: the Amharic text has to scale with the
 * stamp, and a raster would blur the arcs on a 300dpi print. As a data URI it
 * is applied as a `background-image` so html2canvas composites it the same way
 * the browser does, including `mixBlendMode: multiply`, which is what makes the
 * ink look absorbed into the paper rather than pasted on top.
 */
export const STAMP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><defs><path id="topArc" d="M 170 470 A 330 330 0 0 1 830 470" fill="none"/><path id="bottomArc" d="M 170 590 A 330 330 0 0 0 830 590" fill="none"/></defs><circle cx="500" cy="500" r="455" fill="none" stroke="#174ea6" stroke-width="13"/><circle cx="500" cy="500" r="435" fill="none" stroke="#174ea6" stroke-width="4"/><circle cx="500" cy="500" r="340" fill="none" stroke="#174ea6" stroke-width="5"/><text fill="#174ea6" font-size="67" font-weight="800" letter-spacing="2" text-anchor="middle" font-family="Noto Sans Ethiopic, Nyala, Abyssinica SIL, sans-serif"><textPath href="#topArc" startOffset="50%">መተሐራ ስኳር ፋብሪካ</textPath></text><g fill="#174ea6" stroke="#174ea6" stroke-width="2"><path d="M 160 490 L 170 515 L 197 515 L 175 531 L 183 558 L 160 542 L 137 558 L 145 531 L 123 515 L 150 515 Z"/><path d="M 840 490 L 850 515 L 877 515 L 855 531 L 863 558 L 840 542 L 817 558 L 825 531 L 803 515 L 830 515 Z"/></g><text fill="#174ea6" font-size="48" font-weight="800" letter-spacing="1" text-anchor="middle" font-family="Noto Sans Ethiopic, Nyala, Abyssinica SIL, sans-serif"><textPath href="#bottomArc" startOffset="50%">- ፋሲሊቲ እና ቤት አስተዳደር -</textPath></text><g stroke="#174ea6" stroke-width="5" stroke-linecap="round"><line x1="340" y1="690" x2="455" y2="690"/><line x1="545" y1="690" x2="660" y2="690"/></g></svg>`;

export const STAMP_DATA_URI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  STAMP_SVG,
)}`;

/**
 * Official name seal of the issuer: `የፋ.ሲ.ቲ ማኔጅመንት ቡድን መሪ` over
 * `ለበታ ጃርሴ`. Goes on the signature line of whoever issued the form, which is
 * the only place on a receipt a person looks to establish authority.
 */
export const NAME_STAMP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 240"><rect x="12" y="12" width="676" height="216" rx="26" fill="none" stroke="#174ea6" stroke-width="9"/><rect x="30" y="30" width="640" height="180" rx="14" fill="none" stroke="#174ea6" stroke-width="2.5"/><text x="350" y="82" text-anchor="middle" fill="#174ea6" font-size="33" font-weight="700" font-family="Noto Sans Ethiopic, Nyala, Abyssinica SIL, sans-serif" letter-spacing="1">የፋ.ሲ.ቲ ማኔጅመንት ቡድን መሪ</text><line x1="130" y1="104" x2="570" y2="104" stroke="#174ea6" stroke-width="3"/><text x="350" y="182" text-anchor="middle" fill="#174ea6" font-size="74" font-weight="800" font-family="Noto Sans Ethiopic, Nyala, Abyssinica SIL, sans-serif" letter-spacing="2">ለበታ ጃርሴ</text></svg>`;

export const NAME_STAMP_DATA_URI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  NAME_STAMP_SVG,
)}`;

/** Marks an element the print CSS must pin, so it cannot repeat per page. */
export const PRINT_OVERLAY_ATTR = "data-print-overlay";

/**
 * Where the round stamp lands.
 *
 * `lower-left` is for a document whose lower half is short enough to leave
 * room - the stamp reads as an inked impression over blank paper. `right-gutter`
 * is for a dense document, where the only reliably empty space is the margin to
 * the right of a full-width table. Anything else risks a stamp across a column
 * of figures someone has to verify.
 */
export type StampPlacement = "centre" | "lower-left" | "right-gutter";

const STAMP_PLACEMENT: Record<
  StampPlacement,
  { top: string; left: string; size: number; opacity: number }
> = {
  centre: { top: "50%", left: "50%", size: 220, opacity: 0.5 },
  "lower-left": { top: "72%", left: "24%", size: 180, opacity: 0.55 },
  "right-gutter": { top: "50%", left: "88%", size: 170, opacity: 0.45 },
};

/**
 * The rubber stamp, hovered across the page.
 *
 * `data-print-overlay="true"` is not decoration: the global print CSS pins it to
 * `position: absolute`. Without that, a paginating document repeats the stamp
 * on every page and the second copy lands on top of schedule rows.
 */
export function StampOverlay({
  placement = "centre",
  size,
  opacity,
}: {
  placement?: StampPlacement;
  size?: number;
  opacity?: number;
}) {
  const preset = STAMP_PLACEMENT[placement];
  return (
    <div
      aria-hidden="true"
      {...{ [PRINT_OVERLAY_ATTR]: "true" }}
      style={{
        position: "absolute",
        top: preset.top,
        left: preset.left,
        width: `${size ?? preset.size}px`,
        height: `${size ?? preset.size}px`,
        transform: "translate(-50%, -50%) rotate(-14deg)",
        backgroundImage: `url("${STAMP_DATA_URI}")`,
        backgroundSize: "contain",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        opacity: opacity ?? preset.opacity,
        mixBlendMode: "multiply",
        pointerEvents: "none",
        zIndex: 5,
      }}
    />
  );
}

/** The issuer name seal, hovered over the issuer's signature. */
export function NameStamp({
  width = 180,
  height = 60,
  opacity = 0.7,
}: {
  width?: number;
  height?: number;
  opacity?: number;
}) {
  return (
    <div
      aria-hidden="true"
      {...{ [PRINT_OVERLAY_ATTR]: "true" }}
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        width: `${width}px`,
        height: `${height}px`,
        transform: "translate(-50%, -50%) rotate(-6deg)",
        backgroundImage: `url("${NAME_STAMP_DATA_URI}")`,
        backgroundSize: "contain",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        opacity,
        mixBlendMode: "multiply",
        pointerEvents: "none",
        zIndex: 4,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Masthead
// ---------------------------------------------------------------------------

/** The factory logo, the only photographic asset on any printed form. */
export const BRAND_LOGO_SRC = "/images/msflogo.jpg";

/**
 * Masthead brand lockup.
 *
 * `subtitle` is the department the form belongs to. It is optional because
 * not every form belongs to one department, and a blank line in the masthead
 * looks like an omission.
 */
export function BrandLockup({
  subtitle,
  englishFirst = false,
}: {
  subtitle?: string;
  englishFirst?: boolean;
}) {
  const amharic = "መተሐራ ስኳር ፋብሪካ";
  const english = "METAHARA SUGAR FACTORY";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={BRAND_LOGO_SRC}
        alt="MSF Logo"
        style={{ width: "42px", height: "42px", objectFit: "contain" }}
      />
      <div style={{ lineHeight: "1.2" }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: englishFirst ? "10.5pt" : "11pt",
            color: NAVY,
          }}
        >
          {englishFirst ? `Company Name: ${english}` : amharic}
        </div>
        <div style={{ ...captionStyle, marginTop: "2px" }}>
          {englishFirst ? amharic : english}
        </div>
        {subtitle ? <div style={captionStyle}>{subtitle}</div> : null}
      </div>
    </div>
  );
}

/** A title-strip cell pair, sized as a fraction of the frame. */
export function titleStripCells(titleWidth: string) {
  return {
    title: { ...formTitleCellStyle, width: titleWidth } as CSSProperties,
    page: {
      ...formPageCellStyle,
      width: `calc(${100}% - ${titleWidth})`,
    } as CSSProperties,
  };
}

// ---------------------------------------------------------------------------
// Filled-in and blank entries
// ---------------------------------------------------------------------------

/** A solid rule a person writes on, for a value already printed by the system. */
export function ruleLine(minWidth = 90): CSSProperties {
  return {
    display: "inline-block",
    borderBottom: `1px solid ${GUNMETAL}`,
    minWidth: `${minWidth}px`,
    margin: "2px 0 4px",
  };
}

/** A dotted rule, for a value a person is expected to complete by hand. */
export function fillLine(minWidth = 90): CSSProperties {
  return {
    display: "inline-block",
    borderBottom: `1px dotted ${GUNMETAL}`,
    minWidth: `${minWidth}px`,
    minHeight: "1em",
    verticalAlign: "baseline",
    textAlign: "center",
    fontSize: "9pt",
    lineHeight: "1.1",
    fontWeight: 700,
    whiteSpace: "nowrap",
  };
}

/** A dotted fill line with a pre-filled value, or blank when there is none. */
export function Dots({
  value,
  minWidth = 90,
}: {
  value?: string | null;
  minWidth?: number;
}) {
  return <span style={fillLine(minWidth)}>{value ?? ""}</span>;
}

/** A monospaced entry: receipt numbers, IDs, bank references. */
export function Mono({
  children,
  style,
  size = "9pt",
}: {
  children: ReactNode;
  style?: CSSProperties;
  size?: string;
}) {
  return (
    <span style={{ fontFamily: MONO_FONT, fontSize: size, ...style }}>
      {children}
    </span>
  );
}

/** A bilingual caption label, e.g. `ቁጥር / Ref No`. */
export function Label({ children }: { children: ReactNode }) {
  return <span style={metaLabelStyle}>{children}</span>;
}

/** A caption above a value, the bilingual gloss form. */
export function Caption({ children }: { children: ReactNode }) {
  return <span style={captionStyle}>{children}</span>;
}

/** No-op subscription, for the `useSyncExternalStore` mount gate. */
export function subscribeToNothing(): () => void {
  return () => undefined;
}
