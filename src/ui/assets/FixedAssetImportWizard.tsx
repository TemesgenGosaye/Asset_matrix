"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PreviewRow {
  rowNumber: number;
  parsed: {
    sourceDepartment: string;
    assetname: string;
    propertyNo: string;
    categoryCode: string | null;
    condition1: string | null;
    condition2Raw: string | null;
    warnings: string[];
    errors: string[];
  };
}

interface PreviewData {
  sheets: string[];
  sheetName: string;
  headers: string[];
  mappings: Record<string, number | null>;
  summary: {
    totalRows: number;
    errorRows: number;
    warningRows: number;
    duplicatePropertyNumbers: number;
  };
  preview: PreviewRow[];
}

interface CommitResult {
  batchId: string | null;
  totalRows: number;
  successCount: number;
  errorCount: number;
  skippedCount: number;
  results: {
    rowNumber: number;
    status: string;
    warnings: string[];
    errors: string[];
  }[];
}

interface HistoryItem {
  id: string;
  fileName: string;
  status: string;
  totalRows: number;
  successCount: number;
  errorCount: number;
  finishedAt: string | null;
}

export default function FixedAssetImportWizard() {
  const [file, setFile] = useState<File | null>(null);
  const [sheetName, setSheetName] = useState("Master List");
  const [headerRow, setHeaderRow] = useState("1");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = () => {
    const data = new FormData();
    if (file) data.set("file", file);
    data.set("sheetName", sheetName);
    data.set("headerRow", headerRow);
    return data;
  };

  const downloadTemplate = async () => {
    const response = await fetch("/api/fixed-assets/import/template");
    if (!response.ok) throw new Error("Failed to download template");
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "fixed-asset-master-list-template.xlsx";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const runPreview = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/fixed-assets/import/preview", {
        method: "POST",
        body: form(),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Preview failed");
      setPreview(payload as PreviewData);
      if (payload.sheetName) setSheetName(payload.sheetName);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runCommit = async (mode: "dry-run" | "commit") => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const data = form();
      data.set("mode", mode);
      const response = await fetch("/api/fixed-assets/import/commit", {
        method: "POST",
        body: data,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Import failed");
      if (mode === "commit") setResult(payload as CommitResult);
      await loadHistory();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const loadHistory = useCallback(async () => {
    const response = await fetch("/api/fixed-assets/import/history");
    if (response.ok) {
      const payload = await response.json();
      setHistory(payload.items as HistoryItem[]);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const rollback = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/fixed-assets/import/${id}/rollback`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Rollback failed");
      await loadHistory();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-brass-400 text-2xl font-bold">
            Import Fixed Asset Master List
          </h1>
          <p className="text-muted-foreground text-sm">
            Preview, validate, and commit the 17-column department register
            without changing the legacy importer.
          </p>
        </div>
        <Button variant="ghost" asChild>
          <Link href="/assets">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        </Button>
      </div>
      {error && (
        <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border p-3 text-sm">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">1. Choose workbook</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="min-w-[260px] flex-1 space-y-1">
            <label className="text-muted-foreground text-xs">
              Excel workbook
            </label>
            <Input
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-muted-foreground text-xs">Sheet</label>
            <Input
              value={sheetName}
              onChange={(event) => setSheetName(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-muted-foreground text-xs">Header row</label>
            <Input
              value={headerRow}
              onChange={(event) => setHeaderRow(event.target.value)}
            />
          </div>
          <Button
            variant="outline"
            onClick={() => void runPreview()}
            disabled={!file || busy}
          >
            <FileSpreadsheet className="h-4 w-4" /> Preview
          </Button>
          <Button variant="outline" onClick={() => void downloadTemplate()}>
            <Download className="h-4 w-4" /> Template
          </Button>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">2. Validation preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Rows", preview.summary.totalRows],
                ["Errors", preview.summary.errorRows],
                ["Warnings", preview.summary.warningRows],
                [
                  "Duplicate Property No",
                  preview.summary.duplicatePropertyNumbers,
                ],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-lg border p-3">
                  <div className="text-muted-foreground text-xs uppercase">
                    {label}
                  </div>
                  <div className="text-xl font-semibold">{value}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void runCommit("dry-run")}
                disabled={busy}
                variant="outline"
              >
                Validate all rows
              </Button>
              <Button
                onClick={() => void runCommit("commit")}
                disabled={busy || preview.summary.errorRows > 0}
              >
                <Upload className="h-4 w-4" /> Commit import
              </Button>
            </div>
            <div className="max-h-80 overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Property No</TableHead>
                    <TableHead>Condition 1st / 2nd</TableHead>
                    <TableHead>Issues</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.preview.map((row) => (
                    <TableRow key={row.rowNumber}>
                      <TableCell>{row.rowNumber}</TableCell>
                      <TableCell>
                        {row.parsed.sourceDepartment || "—"}
                      </TableCell>
                      <TableCell>{row.parsed.assetname || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.parsed.propertyNo}
                      </TableCell>
                      <TableCell>
                        {row.parsed.condition1 || "—"} /{" "}
                        {row.parsed.condition2Raw || "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {[...row.parsed.errors, ...row.parsed.warnings].join(
                          "; ",
                        ) || "OK"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">3. Import result</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              Batch {result.batchId} · {result.successCount} saved ·{" "}
              {result.errorCount} errors · {result.skippedCount} skipped
            </p>
            <div className="max-h-64 overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Issues</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.results
                    .filter(
                      (row) => row.status === "error" || row.warnings.length,
                    )
                    .slice(0, 200)
                    .map((row) => (
                      <TableRow key={row.rowNumber}>
                        <TableCell>{row.rowNumber}</TableCell>
                        <TableCell>{row.status}</TableCell>
                        <TableCell className="text-xs">
                          {[...row.errors, ...row.warnings].join("; ")}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Import history</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Rows</TableHead>
                <TableHead>Saved</TableHead>
                <TableHead>Errors</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.fileName}</TableCell>
                  <TableCell>{item.status}</TableCell>
                  <TableCell>{item.totalRows}</TableCell>
                  <TableCell>{item.successCount}</TableCell>
                  <TableCell>{item.errorCount}</TableCell>
                  <TableCell>
                    {item.status !== "rolled_back" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void rollback(item.id)}
                        disabled={busy}
                      >
                        Rollback
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!history.length && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-muted-foreground text-center"
                  >
                    No imports yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
