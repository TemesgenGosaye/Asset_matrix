"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
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
import { filterSelectClass } from "@/lib/select-styles";

type ErrorHandling = "skip" | "abort" | "flag";
type DuplicatePolicy = "flag" | "skip" | "update";

interface ImportPlan {
  total: number;
  create: number;
  update: number;
  unchanged: number;
  skip: number;
  flag: number;
  failed: number;
  duplicate: number;
  importable: number;
}

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
  plan: ImportPlan;
  preview: PreviewRow[];
}

interface ImportProgress {
  batchId: string;
  status: string;
  totalRows: number;
  processedRows: number;
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  skippedCount: number;
  flaggedCount: number;
  failedCount: number;
  rowsPerSecond: number;
  etaSeconds: number | null;
  done: boolean;
  plan: ImportPlan;
}

interface ImportResult extends ImportProgress {
  reused: boolean;
  results: {
    rowNumber: number;
    status: string;
    action: string | null;
    propertyKey: string | null;
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

interface FixedAssetImportWizardProps {
  initialHistory: HistoryItem[];
}

const emptyPlan: ImportPlan = {
  total: 0,
  create: 0,
  update: 0,
  unchanged: 0,
  skip: 0,
  flag: 0,
  failed: 0,
  duplicate: 0,
  importable: 0,
};

export default function FixedAssetImportWizard({
  initialHistory,
}: FixedAssetImportWizardProps) {
  const mounted = useRef(true);
  const [file, setFile] = useState<File | null>(null);
  const [sheetName, setSheetName] = useState("Master List");
  const [headerRow, setHeaderRow] = useState("1");
  const [errorHandling, setErrorHandling] = useState<ErrorHandling>("skip");
  const [duplicatePolicy, setDuplicatePolicy] =
    useState<DuplicatePolicy>("flag");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>(initialHistory);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [confirmImportOpen, setConfirmImportOpen] = useState(false);
  const [rollbackId, setRollbackId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const withOptions = (data: FormData) => {
    data.set("errorHandling", errorHandling);
    data.set("duplicatePolicy", duplicatePolicy);
    return data;
  };

  const form = () => {
    const data = new FormData();
    if (file) data.set("file", file);
    data.set("sheetName", sheetName);
    data.set("headerRow", headerRow);
    return withOptions(data);
  };

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/fixed-assets/import/history");
      if (!response.ok) return;
      const payload = await response.json();
      if (mounted.current) setHistory(payload.items as HistoryItem[]);
    } catch {
      if (mounted.current) setError("Could not load import history");
    }
  }, []);

  const downloadTemplate = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/fixed-assets/import/template");
      if (!response.ok) throw new Error("Failed to download template");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "fixed-asset-master-list-template.xlsx";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
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
      if (mounted.current) {
        setPreview(payload as PreviewData);
        if (payload.sheetName) setSheetName(payload.sheetName);
        setProgress(null);
        setResult(null);
      }
    } catch (caught) {
      if (mounted.current) setError((caught as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const fetchProgress = async (batchId: string): Promise<ImportResult> => {
    const response = await fetch(
      `/api/fixed-assets/import/${batchId}/progress`,
    );
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Progress failed");
    return payload as ImportResult;
  };

  const processUntilDone = async (batchId: string, initial: ImportProgress) => {
    let current = initial;
    while (!current.done) {
      const response = await fetch(
        `/api/fixed-assets/import/${batchId}/process`,
        { method: "POST" },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Import failed");
      current = payload as ImportProgress;
      if (mounted.current) setProgress(current);
      if (current.status === "cancelled" || current.status === "aborted") break;
    }
    const finished = await fetchProgress(batchId);
    if (mounted.current) {
      setProgress(finished);
      setResult(finished);
    }
    await loadHistory();
  };

  const confirmImport = async () => {
    if (!file || !preview) return;
    setConfirmImportOpen(false);
    setImporting(true);
    setBusy(false);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/fixed-assets/import/start", {
        method: "POST",
        body: form(),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Import failed");
      const started = payload as ImportProgress & {
        plan: ImportPlan;
        reused: boolean;
        progress: ImportProgress;
      };
      if (mounted.current) setProgress(started.progress);
      await processUntilDone(started.batchId, started.progress);
    } catch (caught) {
      if (mounted.current) setError((caught as Error).message);
    } finally {
      if (mounted.current) setImporting(false);
    }
  };

  const cancelImport = async () => {
    if (!progress) return;
    setError(null);
    try {
      const response = await fetch(
        `/api/fixed-assets/import/${progress.batchId}/cancel`,
        { method: "POST" },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Cancel failed");
      const finished = await fetchProgress(progress.batchId);
      if (mounted.current) {
        setProgress(payload as ImportProgress);
        setResult(finished);
      }
      await loadHistory();
    } catch (caught) {
      if (mounted.current) setError((caught as Error).message);
    }
  };

  const downloadReport = async (batchId: string) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/fixed-assets/import/${batchId}/report`,
      );
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || "Report download failed");
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `fixed-asset-import-${batchId}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      if (mounted.current) setError((caught as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const confirmRollback = async () => {
    if (!rollbackId) return;
    const batchId = rollbackId;
    setRollbackId(null);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/fixed-assets/import/${batchId}/rollback`,
        { method: "POST" },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Rollback failed");
      await loadHistory();
    } catch (caught) {
      if (mounted.current) setError((caught as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const plan = preview?.plan ?? result?.plan ?? emptyPlan;
  const blockingErrors =
    errorHandling === "abort" && preview && preview.plan.failed > 0;
  const progressPercent =
    progress && progress.totalRows > 0
      ? Math.min(
          Math.round((progress.processedRows / progress.totalRows) * 100),
          100,
        )
      : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-foreground text-2xl font-bold">
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
          <CardTitle className="text-lg">
            1. Choose workbook and rules
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[260px] flex-1 space-y-1">
              <label className="text-muted-foreground text-xs">
                Excel workbook
              </label>
              <Input
                type="file"
                accept=".xlsx,.xls"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setPreview(null);
                  setResult(null);
                }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-muted-foreground block text-xs">
                Sheet
              </label>
              <Input
                value={sheetName}
                onChange={(event) => setSheetName(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-muted-foreground block text-xs">
                Header row
              </label>
              <Input
                value={headerRow}
                onChange={(event) => setHeaderRow(event.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1 space-y-1">
              <label className="text-muted-foreground block text-xs">
                Invalid rows
              </label>
              <select
                className={filterSelectClass}
                value={errorHandling}
                onChange={(event) => {
                  setErrorHandling(event.target.value as ErrorHandling);
                  setPreview(null);
                }}
              >
                <option value="skip">Skip invalid rows (default)</option>
                <option value="flag">Import and flag invalid rows</option>
                <option value="abort">Abort on first invalid row</option>
              </select>
            </div>
            <div className="min-w-[220px] flex-1 space-y-1">
              <label className="text-muted-foreground block text-xs">
                Duplicate Property No
              </label>
              <select
                className={filterSelectClass}
                value={duplicatePolicy}
                onChange={(event) => {
                  setDuplicatePolicy(event.target.value as DuplicatePolicy);
                  setPreview(null);
                }}
              >
                <option value="flag">
                  Import all + flag duplicates (default)
                </option>
                <option value="skip">Skip duplicate Property No rows</option>
                <option value="update">
                  Update matched asset instead of creating a duplicate
                </option>
              </select>
            </div>
            <Button
              variant="outline"
              onClick={() => void runPreview()}
              disabled={!file || busy || importing}
            >
              <RefreshCw className="h-4 w-4" /> Preview all rows
            </Button>
            <Button
              variant="outline"
              onClick={() => void downloadTemplate()}
              disabled={busy}
            >
              <Download className="h-4 w-4" /> Template
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Duplicates are stored with a unique database key while keeping the
            original Property No visible and flagged. No schema changes are
            required.
          </p>
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
                ["File rows", plan.total],
                ["Create", plan.create],
                ["Update", plan.update],
                ["Unchanged", plan.unchanged],
                ["Flagged", plan.flag],
                ["Skipped", plan.skip],
                ["Failed", plan.failed],
                ["Duplicate IDs", plan.duplicate],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-lg border p-3">
                  <div className="text-muted-foreground text-xs uppercase">
                    {label}
                  </div>
                  <div className="text-xl font-semibold">{value}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => setConfirmImportOpen(true)}
                disabled={Boolean(blockingErrors) || busy || importing}
              >
                <Upload className="h-4 w-4" /> Commit import
              </Button>
              <span className="text-muted-foreground text-xs">
                {plan.importable.toLocaleString()} rows will be processed.
                {preview.summary.errorRows > 0 &&
                  ` ${preview.summary.errorRows} file rows have issues.`}
              </span>
              {blockingErrors && (
                <span className="text-destructive text-xs">
                  Abort mode is active and validation found failing rows.
                </span>
              )}
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

      {progress && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {progress.done ? "Import finished" : "3. Import progress"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-mono text-xs">{progress.batchId}</span>
              <span className="text-muted-foreground">
                {progress.processedRows.toLocaleString()} /{" "}
                {progress.totalRows.toLocaleString()} rows · {progress.status}
              </span>
            </div>
            <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
              <div
                className="bg-primary h-full transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
              {[
                ["Created", progress.createdCount],
                ["Updated", progress.updatedCount],
                ["Unchanged", progress.unchangedCount],
                ["Flagged", progress.flaggedCount],
                ["Skipped", progress.skippedCount],
                ["Failed", progress.failedCount],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-lg border p-3">
                  <div className="text-muted-foreground text-xs uppercase">
                    {label}
                  </div>
                  <div className="text-lg font-semibold">{value}</div>
                </div>
              ))}
            </div>
            <div className="text-muted-foreground text-xs">
              {progress.rowsPerSecond.toLocaleString()} rows/sec
              {progress.etaSeconds !== null &&
                ` · ~${progress.etaSeconds}s remaining`}
            </div>
            {!progress.done && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => void cancelImport()}
                disabled={!importing}
              >
                <X className="h-4 w-4" /> Cancel import
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">4. Import result</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              Batch {result.batchId} · {result.createdCount} created ·{" "}
              {result.updatedCount} updated · {result.flaggedCount} flagged ·{" "}
              {result.failedCount} failed · {result.skippedCount} skipped
              {result.reused && " · resumed existing batch"}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/assets?batch=${result.batchId}`}>
                  View imported rows
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void downloadReport(result.batchId)}
                disabled={busy}
              >
                <Download className="h-4 w-4" /> Download report
              </Button>
            </div>
            <div className="max-h-64 overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Property No</TableHead>
                    <TableHead>Issues</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.results
                    .filter(
                      (row) =>
                        row.status !== "new" &&
                        row.status !== "update" &&
                        row.status !== "unchanged",
                    )
                    .slice(0, 200)
                    .map((row) => (
                      <TableRow key={row.rowNumber}>
                        <TableCell>{row.rowNumber}</TableCell>
                        <TableCell>{row.status}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {row.propertyKey || "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {[...row.errors, ...row.warnings].join("; ") || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  {!result.results.some(
                    (row) =>
                      row.status !== "new" &&
                      row.status !== "update" &&
                      row.status !== "unchanged",
                  ) && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-muted-foreground text-center"
                      >
                        All rows imported without issues
                      </TableCell>
                    </TableRow>
                  )}
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
                    <div className="flex flex-wrap gap-1">
                      <Button variant="ghost" size="sm" asChild disabled={busy}>
                        <Link href={`/assets?batch=${item.id}`}>View</Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void downloadReport(item.id)}
                        disabled={busy}
                      >
                        Report
                      </Button>
                      {item.status !== "rolled_back" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRollbackId(item.id)}
                          disabled={busy || importing}
                        >
                          Rollback
                        </Button>
                      )}
                    </div>
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

      {confirmImportOpen && preview && (
        <div className="bg-background/80 fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-lg rounded-xl border p-5 shadow-xl">
            <h2 className="text-lg font-semibold">
              Confirm fixed asset import
            </h2>
            <p className="text-muted-foreground mt-2 text-sm">
              {preview.summary.totalRows.toLocaleString()} workbook rows will be
              processed in batches. {plan.importable.toLocaleString()} rows are
              importable; {plan.duplicate.toLocaleString()} duplicate Property
              Nos will be flagged, not rejected.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setConfirmImportOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={() => void confirmImport()}>
                <Upload className="h-4 w-4" /> Start import
              </Button>
            </div>
          </div>
        </div>
      )}

      {rollbackId && (
        <div className="bg-background/80 fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-lg rounded-xl border p-5 shadow-xl">
            <h2 className="text-lg font-semibold">Rollback import batch?</h2>
            <p className="text-muted-foreground mt-2 text-sm">
              This restores updated rows and removes rows created by batch{" "}
              <span className="font-mono text-xs">{rollbackId}</span>.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRollbackId(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => void confirmRollback()}
              >
                Rollback
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
