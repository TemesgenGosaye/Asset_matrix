"use client";

import type { RefObject } from "react";
import { Download, ImageDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/feedback/notify";

type CsvValue = string | number | boolean | null | undefined;

interface ChartExportButtonsProps {
  targetRef: RefObject<HTMLElement | null>;
  csvData: ReadonlyArray<Record<string, CsvValue>>;
  filename: string;
}

function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export default function ChartExportButtons({
  targetRef,
  csvData,
  filename,
}: ChartExportButtonsProps) {
  const exportCsv = () => {
    if (!csvData.length) {
      notify.error("There is no data to export");
      return;
    }
    const columns = Array.from(
      new Set(csvData.flatMap((row) => Object.keys(row))),
    );
    const lines = [
      columns.map(csvCell).join(","),
      ...csvData.map((row) =>
        columns.map((column) => csvCell(row[column])).join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportPng = async () => {
    const element = targetRef.current;
    if (!element) return;
    try {
      const { default: html2canvas } = await import("html2canvas");
      const dark = document.documentElement.classList.contains("dark");
      const canvas = await html2canvas(element, {
        backgroundColor: dark ? "#0b1220" : "#ffffff",
        scale: 2,
        logging: false,
      });
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = `${filename}.png`;
      link.click();
    } catch {
      notify.error("PNG export failed");
    }
  };

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={exportCsv}
        aria-label={`Export ${filename} as CSV`}
        title="Export CSV"
      >
        <Download className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={exportPng}
        aria-label={`Export ${filename} as PNG`}
        title="Export PNG"
      >
        <ImageDown className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
