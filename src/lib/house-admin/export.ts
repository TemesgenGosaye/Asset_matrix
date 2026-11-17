"use client";

/**
 * Branded Excel/PDF export for the house-admin tables.
 *
 * Every page exports what is on screen: the caller passes the already-filtered
 * rows plus the columns the table renders, so an exported file is a faithful
 * record of what an administrator saw — not a lossy re-projection.
 *
 * Both formats are generated in the browser:
 *  - Excel (ExcelJS): a styled worksheet — letterhead with the MSF seal,
 *    coloured header band, frozen header row, autofilter and print setup.
 *  - PDF (jsPDF): a landscape A4 report — letterhead with the MSF seal, the
 *    coloured table header repeated across pages, and page footers.
 *
 * The heavy libraries are imported dynamically so they never touch the initial
 * bundle; a page only pays for them when someone exports.
 */

import { BRAND } from "@/lib/brand";

export type BrandedTableFormat = "excel" | "pdf";

type Align = "left" | "center" | "right";

export interface BrandedTableColumn<T> {
  header: string;
  align?: Align;
  /** Relative column width shared between the PDF and Excel renderers. */
  width?: number;
  /**
   * Renders one cell as plain text. `index` is the row's zero-based position,
   * for columns like "#" that number the listed records.
   */
  value: (row: T, index: number) => string;
}

export interface BrandedTableExportOptions<T> {
  /** Document title, e.g. "Allocated Houses". */
  title: string;
  /** Sub-line under the title, e.g. "House Hold · Allocated Houses". */
  subtitle: string;
  /** Small meta line, e.g. "42 records · generated 2026-11-03 10:00". */
  summary: string;
  /** 6-digit hex header/accent colour. */
  accentHex: string;
  columns: BrandedTableColumn<T>[];
  rows: T[];
  format: BrandedTableFormat;
  /** Filename stem without extension or date, e.g. "allocated-houses". */
  fileStem: string;
  /** Noun used in the document footer, e.g. "allocated houses report". */
  footerLabel: string;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** Excel wants 8-digit ARGB; the palette is 6-digit hex. */
function toArgb(hex: string): string {
  return `FF${hex.replace("#", "").toUpperCase()}`;
}

/** 1-based column index → spreadsheet letter (1→A, 27→AA). */
function colLetter(index: number): string {
  let n = index;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// MSF seal — fetched once from /public and reused (Excel wants a data URI,
// jsPDF wants the same, so one cached promise serves both).
// ---------------------------------------------------------------------------

let logoPromise: Promise<string | null> | null = null;

function arrayBufferToDataUrl(buffer: ArrayBuffer, mime: string): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

function loadLogoDataUrl(): Promise<string | null> {
  if (!logoPromise) {
    logoPromise = fetch("/icons/msf-logo.png")
      .then((res) => {
        if (!res.ok) throw new Error(`logo ${res.status}`);
        return res.arrayBuffer();
      })
      .then((buf) => arrayBufferToDataUrl(buf, "image/png"))
      .catch(() => null);
  }
  return logoPromise;
}

// ---------------------------------------------------------------------------
// Excel (ExcelJS)
// ---------------------------------------------------------------------------

async function buildExcel<T>(
  options: BrandedTableExportOptions<T>,
): Promise<Blob> {
  const { title, subtitle, summary, accentHex, columns, rows, footerLabel } =
    options;
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = BRAND.factoryEn;
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(title.slice(0, 31), {
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
    },
    views: [{ state: "frozen", ySplit: 4 }],
  });

  sheet.columns = columns.map((c, i) => ({
    key: `c${i}`,
    width: Math.max((c.width ?? 1) * 8, 9),
  }));

  const lastCol = colLetter(Math.max(columns.length, 3));
  const argb = toArgb(accentHex);
  const thin = (): { style: "thin"; color: { argb: string } } => ({
    style: "thin",
    color: { argb: "FFE2E8F0" },
  });

  // ── Letterhead (rows 1–3), logo floats over column A/B ────────────────────
  sheet.mergeCells(`C1:${lastCol}1`);
  const titleCell = sheet.getCell("C1");
  titleCell.value = title;
  titleCell.font = { bold: true, size: 14, color: { argb: "FF1F2937" } };
  titleCell.alignment = { vertical: "middle" };
  sheet.getRow(1).height = 22;

  sheet.mergeCells(`C2:${lastCol}2`);
  const subtitleCell = sheet.getCell("C2");
  subtitleCell.value = subtitle;
  subtitleCell.font = { size: 10, color: { argb: "FF6B7280" } };
  subtitleCell.alignment = { vertical: "middle" };
  sheet.getRow(2).height = 16;

  sheet.mergeCells(`C3:${lastCol}3`);
  const metaCell = sheet.getCell("C3");
  metaCell.value = summary;
  metaCell.font = { size: 9, color: { argb: "FF6B7280" } };
  metaCell.alignment = { vertical: "middle" };
  sheet.getRow(3).height = 14;

  const logo = await loadLogoDataUrl();
  if (logo) {
    const imageId = workbook.addImage({ base64: logo, extension: "png" });
    sheet.addImage(imageId, {
      tl: { col: 0.15, row: 0.1 },
      ext: { width: 46, height: 46 },
    });
  }

  // ── Table header (row 4) ──────────────────────────────────────────────────
  const headerRow = sheet.getRow(4);
  columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
    cell.border = { top: thin(), left: thin(), bottom: thin(), right: thin() };
  });
  headerRow.height = 28;

  // ── Data rows ─────────────────────────────────────────────────────────────
  rows.forEach((row, idx) => {
    const excelRow = sheet.getRow(5 + idx);
    columns.forEach((c, i) => {
      const cell = excelRow.getCell(i + 1);
      cell.value = c.value(row, idx);
      cell.font = { size: 10 };
      cell.alignment = { horizontal: c.align ?? "left", vertical: "middle" };
      cell.border = {
        top: thin(),
        left: thin(),
        bottom: thin(),
        right: thin(),
      };
      if (idx % 2 === 1) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF8FAFC" },
        };
      }
    });
  });

  // ── Autofilter over the data range ────────────────────────────────────────
  if (rows.length > 0) {
    sheet.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: 4 + rows.length, column: columns.length },
    };
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const footerRow = 5 + rows.length + 1;
  sheet.mergeCells(`A${footerRow}:${lastCol}${footerRow}`);
  const footer = sheet.getCell(`A${footerRow}`);
  footer.value = `${BRAND.factoryEn} · ${BRAND.portalEn} — confidential ${footerLabel}`;
  footer.font = { italic: true, size: 8, color: { argb: "FF9CA3AF" } };

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// ---------------------------------------------------------------------------
// PDF (jsPDF)
// ---------------------------------------------------------------------------

async function buildPdf<T>(
  options: BrandedTableExportOptions<T>,
): Promise<Blob> {
  const { title, subtitle, summary, accentHex, columns, rows, footerLabel } =
    options;
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 34;
  const contentW = pageW - margin * 2;
  const rowH = 15;
  const band = hexToRgb(accentHex);
  const logo = await loadLogoDataUrl();

  const totalWeight = columns.reduce((sum, c) => sum + (c.width ?? 1), 0);
  const colWidths = columns.map(
    (c) => ((c.width ?? 1) / totalWeight) * contentW,
  );

  const clip = (text: string, maxWidth: number): string => {
    if (doc.getTextWidth(text) <= maxWidth) return text;
    let t = text;
    while (t.length > 1 && doc.getTextWidth(`${t}…`) > maxWidth) {
      t = t.slice(0, -1);
    }
    return `${t}…`;
  };

  /** Draws the letterhead at the top of the current page; returns the y cursor. */
  const drawLetterhead = (): number => {
    const top = margin;
    if (logo) doc.addImage(logo, "PNG", margin, top, 42, 42);
    const textX = margin + (logo ? 52 : 0);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(31, 41, 55);
    doc.text(title, textX, top + 14);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(107, 114, 128);
    doc.text(subtitle, textX, top + 29);

    doc.setFontSize(8.5);
    doc.text(BRAND.factoryEn, pageW - margin, top + 14, { align: "right" });
    doc.text(summary, pageW - margin, top + 29, { align: "right" });

    const ruleY = top + 52;
    doc.setDrawColor(band.r, band.g, band.b);
    doc.setLineWidth(1.5);
    doc.line(margin, ruleY, pageW - margin, ruleY);
    return ruleY + 20;
  };

  /** Draws the coloured table header row; returns the y cursor below it. */
  const drawTableHeader = (top: number): number => {
    doc.setFillColor(band.r, band.g, band.b);
    doc.rect(margin, top - 11, contentW, 17, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    let x = margin;
    columns.forEach((c, i) => {
      const w = colWidths[i];
      const align = c.align ?? "left";
      const tx =
        align === "center" ? x + w / 2 : align === "right" ? x + w - 3 : x + 3;
      doc.text(clip(c.header, w - 6), tx, top + 1, { align });
      x += w;
    });
    return top + 13;
  };

  const drawDataRow = (
    values: string[],
    top: number,
    striped: boolean,
  ): number => {
    if (striped) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, top - 11, contentW, rowH, "F");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(31, 41, 55);
    let x = margin;
    columns.forEach((c, i) => {
      const w = colWidths[i];
      const align = c.align ?? "left";
      const tx =
        align === "center" ? x + w / 2 : align === "right" ? x + w - 3 : x + 3;
      doc.text(clip(values[i], w - 6), tx, top + 1, { align });
      x += w;
    });
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(margin, top + 5, pageW - margin, top + 5);
    return top + rowH;
  };

  let y = drawLetterhead();
  y = drawTableHeader(y);

  rows.forEach((row, idx) => {
    if (y > pageH - margin - 26) {
      doc.addPage();
      y = drawLetterhead();
      y = drawTableHeader(y);
    }
    y = drawDataRow(
      columns.map((c) => c.value(row, idx)),
      y,
      idx % 2 === 1,
    );
  });

  // ── Footers: brand line + page numbers, on every page ─────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(156, 163, 175);
    doc.text(
      `${BRAND.factoryEn} · ${BRAND.portalEn} — confidential ${footerLabel}`,
      margin,
      pageH - 16,
    );
    doc.text(`Page ${page} of ${pageCount}`, pageW - margin, pageH - 16, {
      align: "right",
    });
  }

  return doc.output("blob");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Build and download a branded Excel or PDF document for the given table. */
export async function exportBrandedTable<T>(
  options: BrandedTableExportOptions<T>,
): Promise<void> {
  const blob =
    options.format === "excel"
      ? await buildExcel(options)
      : await buildPdf(options);
  const ext = options.format === "excel" ? "xlsx" : "pdf";
  const date = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `${options.fileStem}-${date}.${ext}`);
}
