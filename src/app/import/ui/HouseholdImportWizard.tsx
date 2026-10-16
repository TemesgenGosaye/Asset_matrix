"use client";

import React, { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileDropZone } from "@/components/FileDropZone";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { notify } from "@/lib/feedback/notify";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Home,
  Info,
  Loader2,
  ShieldAlert,
  Upload,
} from "lucide-react";
import {
  HOUSEHOLD_IMPORT_MODES,
  type HouseholdImportMode,
} from "@/lib/household-constants";
import HelpTooltip from "@/components/HelpTooltip";

// ---------------------------------------------------------------------------
// Types (mirrors the /api/import/household* response shapes)
// ---------------------------------------------------------------------------

type Step = "upload" | "preview" | "importing" | "results";

type Classification =
  | "new"
  | "update"
  | "existing"
  | "not_found"
  | "duplicate"
  | "conflict"
  | "invalid";

interface HouseholdSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  newRows: number;
  updateRows: number;
  existingSkipped: number;
  notFoundSkipped: number;
  duplicateRows: number;
  conflictRows: number;
  actionableRows: number;
}

interface PreviewRow {
  excelRow: number;
  hid: string;
  houseNumber: string;
  houseType: string;
  staffCategory?: string | null;
  rgType: string;
  status: string;
  classification: Classification;
  action: "create" | "update" | "skip";
  message: string;
  hasChanges?: boolean;
}

interface ImportError {
  excelRow: number;
  houseNumber: string;
  message: string;
}

interface HouseholdPreviewResponse {
  fileName: string;
  fileSize: number;
  sheetName: string;
  sheetNames: string[];
  headerRow: number;
  dataRowCount: number;
  mode: HouseholdImportMode;
  summary: HouseholdSummary;
  rows: PreviewRow[];
  errors: ImportError[];
  truncated: boolean;
}

interface HouseholdImportResult {
  jobId: string;
  mode: HouseholdImportMode;
  fileName: string;
  totalRows: number;
  created: number;
  updated: number;
  unchangedSkipped: number;
  failedCount: number;
  errors: ImportError[];
  status: string;
  rolledBack?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STEP_LABELS: Record<Step, string> = {
  upload: "Select File",
  preview: "Validate & Preview",
  importing: "Importing",
  results: "Import Complete",
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ROWS_PER_PAGE = 50;
const ERRORS_PER_PAGE = 20;

const CLASSIFICATION_BADGE: Record<
  Classification,
  { label: string; className: string }
> = {
  new: {
    label: "New",
    className: "bg-green-100 text-green-700 hover:bg-green-100",
  },
  update: {
    label: "Will Update",
    className: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  },
  existing: {
    label: "Already Exists",
    className: "bg-gray-100 text-gray-600 hover:bg-gray-100",
  },
  not_found: {
    label: "Not in Register",
    className: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  },
  duplicate: {
    label: "Duplicate",
    className: "bg-red-100 text-red-700 hover:bg-red-100",
  },
  conflict: {
    label: "Conflict",
    className: "bg-red-100 text-red-700 hover:bg-red-100",
  },
  invalid: {
    label: "Invalid",
    className: "bg-red-100 text-red-700 hover:bg-red-100",
  },
};

function ClassificationBadge({
  classification,
}: {
  classification: Classification;
}) {
  const meta = CLASSIFICATION_BADGE[classification];
  return <Badge className={meta.className}>{meta.label}</Badge>;
}

function PaginationControls({
  page,
  pageCount,
  total,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPage: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <div className="text-muted-foreground flex items-center justify-between gap-3 pt-3 text-xs">
      <span>
        Page {page} of {pageCount}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
      <span className="hidden sm:block">{total.toLocaleString()} total</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HouseholdImportWizard({
  onComplete,
}: {
  onComplete?: () => void;
}) {
  const [step, setStep] = useState<Step>("upload");
  const [mode, setMode] = useState<HouseholdImportMode>("add");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<HouseholdPreviewResponse | null>(
    null,
  );
  const [result, setResult] = useState<HouseholdImportResult | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [errorPage, setErrorPage] = useState(1);

  const rowPageCount = useMemo(
    () => Math.max(1, Math.ceil((analysis?.rows.length ?? 0) / ROWS_PER_PAGE)),
    [analysis],
  );
  const errorPageCount = useMemo(
    () =>
      Math.max(1, Math.ceil((analysis?.errors.length ?? 0) / ERRORS_PER_PAGE)),
    [analysis],
  );

  const visibleRows = useMemo(() => {
    const rows = analysis?.rows ?? [];
    const start = (page - 1) * ROWS_PER_PAGE;
    return rows.slice(start, start + ROWS_PER_PAGE);
  }, [analysis, page]);

  const visibleErrors = useMemo(() => {
    const errors = analysis?.errors ?? [];
    const start = (errorPage - 1) * ERRORS_PER_PAGE;
    return errors.slice(start, start + ERRORS_PER_PAGE);
  }, [analysis, errorPage]);

  // ---- Upload: parse & validate ----

  const handleFileSelected = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;

      setSelectedFile(file);
      setResult(null);
      setParseError(null);
      setForbidden(false);
      setPage(1);
      setErrorPage(1);
      setIsParsing(true);

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("mode", mode);

        const res = await fetch("/api/import/household/preview", {
          method: "POST",
          body: formData,
        });

        if (res.status === 403) {
          setForbidden(true);
          return;
        }

        const body = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(
            body.error ||
              `Preview failed (${res.status}). Upload a valid House Register file.`,
          );
        }

        setAnalysis(body as HouseholdPreviewResponse);
        setStep("preview");
      } catch (err) {
        setParseError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsParsing(false);
      }
    },
    [mode],
  );

  // ---- Preview: confirm & import ----

  const handleConfirm = useCallback(async () => {
    if (!selectedFile || !analysis) return;

    setConfirmOpen(false);
    setIsImporting(true);
    setStep("importing");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("mode", analysis.mode);
      formData.append("sheetName", analysis.sheetName);

      const res = await fetch("/api/import/household", {
        method: "POST",
        body: formData,
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok && !(body && typeof body.jobId === "string")) {
        throw new Error(body.error || "Import failed");
      }

      setResult(body as HouseholdImportResult);
      setStep("results");

      const imported = (body.created ?? 0) + (body.updated ?? 0);
      if (body.status === "failed") {
        notify.error("Import failed — no houses were changed.");
      } else if (body.failedCount > 0) {
        notify.warning(
          `Imported ${imported} house(s) with ${body.failedCount} row(s) skipped.`,
        );
      } else if (imported > 0) {
        notify.success(
          `Imported ${imported} house(s) into the House Register.`,
        );
      } else {
        notify.info("Nothing to import — no changes were needed.");
      }

      onComplete?.();
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
      setStep("preview");
      notify.error({
        title: "Import failed",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsImporting(false);
    }
  }, [selectedFile, analysis, onComplete]);

  // ---- Error report download ----

  const downloadErrorReport = useCallback(async () => {
    const errors =
      step === "results" ? (result?.errors ?? []) : (analysis?.errors ?? []);
    if (errors.length === 0) return;

    try {
      const res = await fetch("/api/import/household/error-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: errors.map((e) => ({
            excelRow: e.excelRow,
            houseNumber: e.houseNumber,
            message: e.message,
          })),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not generate error report");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "House_Import_Errors.xlsx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      notify.error({
        title: "Could not download error report",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }, [analysis, result, step]);

  const resetWizard = useCallback(() => {
    setStep("upload");
    setSelectedFile(null);
    setAnalysis(null);
    setResult(null);
    setParseError(null);
    setForbidden(false);
    setPage(1);
    setErrorPage(1);
    setConfirmOpen(false);
  }, []);

  const goBackToUpload = useCallback(() => {
    setStep("upload");
    setParseError(null);
    setForbidden(false);
    setSelectedFile(null);
    setAnalysis(null);
  }, []);

  // ---- Render: step indicator ----

  const renderStepIndicator = () => {
    const visibleSteps: Step[] = ["upload", "preview", "results"];
    const currentIdx = visibleSteps.indexOf(step);
    return (
      <div className="flex items-center gap-2 text-sm">
        {visibleSteps.map((s, i) => (
          <React.Fragment key={s}>
            <span
              className={`flex items-center gap-1.5 ${
                i === currentIdx
                  ? "text-primary font-semibold"
                  : i < currentIdx
                    ? "text-green-600"
                    : "text-muted-foreground"
              }`}
            >
              {i < currentIdx ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : i === currentIdx ? (
                <span className="bg-primary flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold text-white">
                  {i + 1}
                </span>
              ) : (
                <span className="text-muted-foreground flex h-5 w-5 items-center justify-center rounded-full border text-xs">
                  {i + 1}
                </span>
              )}
              {STEP_LABELS[s]}
            </span>
            {i < visibleSteps.length - 1 && (
              <div className="bg-border mx-1 h-px w-4" />
            )}
          </React.Fragment>
        ))}
      </div>
    );
  };

  // ---- Render: upload ----

  const renderUpload = () => (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileSpreadsheet className="h-5 w-5" />
            Import House Register
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              window.open("/api/import/household/template", "_blank")
            }
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Download Template
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          Upload an Excel (.xlsx / .xls) or CSV file exactly matching the House
          Register columns. The file is fully validated here before anything is
          written to the register — nothing is imported until you confirm.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Import mode selector */}
        <div>
          <label className="mb-1.5 flex items-center text-sm font-medium">
            Import Mode
            <HelpTooltip text="Add creates only brand-new houses. Update edits existing houses only. Add + Update does both in one run (requires the Edit Houses permission). Nothing is ever silently overwritten." />
          </label>
          <div className="grid gap-2 sm:grid-cols-3">
            {HOUSEHOLD_IMPORT_MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMode(m.value)}
                className={`flex flex-col items-start gap-1 rounded-md border px-3 py-2.5 text-left text-sm transition-colors ${
                  mode === m.value
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted"
                }`}
              >
                <span className="font-medium">{m.label}</span>
                <span className="text-muted-foreground text-xs">
                  {m.description}
                </span>
              </button>
            ))}
          </div>
        </div>

        <FileDropZone
          onFilesSelected={handleFileSelected}
          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
          uploading={isParsing}
          maxSizeMb={20}
          label="Drag & drop your House Register Excel or CSV file here, or click to browse"
        />

        {selectedFile && (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <FileSpreadsheet className="h-4 w-4" />
            {selectedFile.name} ({formatFileSize(selectedFile.size)})
          </div>
        )}

        {forbidden && (
          <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium">
                You do not have permission to do this.
              </p>
              <p className="mt-1">
                Importing the House Register requires the Add Houses permission
                {mode !== "add" ? " and the Edit Houses permission" : ""}. Ask
                an administrator to grant it if you need to import house data.
              </p>
            </div>
          </div>
        )}

        {parseError && (
          <div className="flex items-start gap-3 rounded-md bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>{parseError}</div>
          </div>
        )}

        <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            House IDs (106-90-&lt;NNN&gt;) and SR numbers are always assigned by
            the system — the Sr. No. column is only for your reference. Imported
            houses enter the pool as Vacant Active houses and are picked up by
            the House Queue automatically.
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // ---- Render: preview ----

  const renderSummaryCards = () => {
    if (!analysis) return null;
    const s = analysis.summary;
    const cards = [
      { label: "Total Rows", value: s.totalRows },
      { label: "New Houses", value: s.newRows, tone: "text-green-600" },
      { label: "Will Update", value: s.updateRows, tone: "text-blue-600" },
      {
        label: "Already Exist",
        value: s.existingSkipped,
        tone: "text-gray-500",
      },
      { label: "Conflicts", value: s.conflictRows, tone: "text-red-600" },
      { label: "Errors", value: s.invalidRows, tone: "text-red-600" },
    ];
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <div
            key={c.label}
            className="bg-background rounded-md border p-3 text-center"
          >
            <div
              className={`text-2xl font-semibold ${c.tone ?? "text-foreground"}`}
            >
              {c.value}
            </div>
            <div className="text-muted-foreground text-xs">{c.label}</div>
          </div>
        ))}
      </div>
    );
  };

  const renderPreview = () => {
    if (!analysis) return null;
    const summary = analysis.summary;
    const canImport = summary.actionableRows > 0;

    return (
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Preview — {analysis.fileName}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={goBackToUpload}>
                <ArrowLeft className="mr-1 h-4 w-4" />
                Back
              </Button>
            </div>
          </div>
          <p className="text-muted-foreground text-sm">
            Sheet <span className="font-medium">{analysis.sheetName}</span> ·{" "}
            {analysis.dataRowCount.toLocaleString()} data row(s) · mode:{" "}
            <span className="font-medium">
              {HOUSEHOLD_IMPORT_MODES.find((m) => m.value === analysis.mode)
                ?.label ?? analysis.mode}
            </span>
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {renderSummaryCards()}

          {analysis.truncated && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                This preview shows the first 3,000 rows. The import itself still
                processes the entire file — the summary above reflects the full
                file.
              </div>
            </div>
          )}

          {/* Preview table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Houses in this file</p>
              <span className="text-muted-foreground text-xs">
                {analysis.rows.length.toLocaleString()} row(s) ready for review
              </span>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="px-2 py-2 text-left font-medium">
                      Excel Row
                    </th>
                    <th className="px-2 py-2 text-left font-medium">
                      House No.
                    </th>
                    <th className="px-2 py-2 text-left font-medium">HID</th>
                    <th className="px-2 py-2 text-left font-medium">Type</th>
                    <th className="px-2 py-2 text-left font-medium">
                      Category
                    </th>
                    <th className="px-2 py-2 text-left font-medium">R/G</th>
                    <th className="px-2 py-2 text-left font-medium">Status</th>
                    <th className="px-2 py-2 text-left font-medium">Result</th>
                    <th className="px-2 py-2 text-left font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr
                      key={`${row.excelRow}-${row.houseNumber}`}
                      className="border-b last:border-0"
                    >
                      <td className="text-muted-foreground px-2 py-1.5">
                        {row.excelRow}
                      </td>
                      <td className="px-2 py-1.5 font-medium">
                        {row.houseNumber}
                      </td>
                      <td className="text-muted-foreground px-2 py-1.5">
                        {row.hid || "—"}
                      </td>
                      <td className="px-2 py-1.5">
                        {row.houseType === "Staff" ? "Staff" : row.houseType}
                      </td>
                      <td className="text-muted-foreground px-2 py-1.5">
                        {row.houseType === "Staff"
                          ? (row.staffCategory ?? "—")
                          : "—"}
                      </td>
                      <td className="px-2 py-1.5">{row.rgType}</td>
                      <td className="px-2 py-1.5">{row.status}</td>
                      <td className="px-2 py-1.5">
                        <ClassificationBadge
                          classification={row.classification}
                        />
                      </td>
                      <td className="text-muted-foreground px-2 py-1.5">
                        {row.message}
                      </td>
                    </tr>
                  ))}
                  {visibleRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={9}
                        className="text-muted-foreground px-2 py-4 text-center"
                      >
                        No records parsed from this file.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <PaginationControls
              page={page}
              pageCount={rowPageCount}
              total={analysis.rows.length}
              onPage={setPage}
            />
          </div>

          {/* Errors */}
          {analysis.errors.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-destructive text-sm font-medium">
                  {analysis.errors.length.toLocaleString()} row(s) with issues
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadErrorReport}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Download Error Report (.xlsx)
                </Button>
              </div>
              <div className="max-h-72 overflow-y-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr className="border-b">
                      <th className="px-2 py-1.5 text-left font-medium">Row</th>
                      <th className="px-2 py-1.5 text-left font-medium">
                        House No.
                      </th>
                      <th className="px-2 py-1.5 text-left font-medium">
                        Issue
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleErrors.map((err, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="text-muted-foreground px-2 py-1.5">
                          {err.excelRow}
                        </td>
                        <td className="px-2 py-1.5">{err.houseNumber}</td>
                        <td className="px-2 py-1.5 text-red-700 dark:text-red-400">
                          {err.message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationControls
                page={errorPage}
                pageCount={errorPageCount}
                total={analysis.errors.length}
                onPage={setErrorPage}
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={!canImport || isImporting}
            >
              <Upload className="mr-1.5 h-4 w-4" />
              Continue to Import ({summary.actionableRows.toLocaleString()}{" "}
              house(s))
            </Button>
            <Button variant="outline" onClick={goBackToUpload}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  // ---- Render: importing ----

  const renderImporting = () => (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12">
        <Loader2 className="text-primary mb-4 h-8 w-8 animate-spin" />
        <p className="text-lg font-medium">Importing houses...</p>
        <p className="text-muted-foreground text-sm">
          Writing to the House Register. This may take a moment for large files.
        </p>
      </CardContent>
    </Card>
  );

  // ---- Render: results ----

  const renderResults = () => {
    if (!result) return null;
    const imported = result.created + result.updated;

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            {result.status === "failed" ? (
              <AlertTriangle className="h-5 w-5 text-red-600" />
            ) : imported > 0 || result.failedCount === 0 ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : (
              <Info className="h-5 w-5 text-amber-600" />
            )}
            Import Complete
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="bg-background rounded-md border p-3 text-center">
              <div className="text-2xl font-semibold text-green-600">
                {result.created}
              </div>
              <div className="text-muted-foreground text-xs">Created</div>
            </div>
            <div className="bg-background rounded-md border p-3 text-center">
              <div className="text-2xl font-semibold text-blue-600">
                {result.updated}
              </div>
              <div className="text-muted-foreground text-xs">Updated</div>
            </div>
            <div className="bg-background rounded-md border p-3 text-center">
              <div className="text-2xl font-semibold text-gray-500">
                {result.unchangedSkipped}
              </div>
              <div className="text-muted-foreground text-xs">Unchanged</div>
            </div>
            <div className="bg-background rounded-md border p-3 text-center">
              <div className="text-2xl font-semibold text-red-600">
                {result.failedCount}
              </div>
              <div className="text-muted-foreground text-xs">Skipped</div>
            </div>
          </div>

          {result.rolledBack && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400">
              The import was rolled back — no houses were changed.
            </div>
          )}

          {result.errors.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-destructive text-sm font-medium">
                  {result.errors.length.toLocaleString()} row(s) with issues
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadErrorReport}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Download Error Report (.xlsx)
                </Button>
              </div>
              <div className="max-h-64 overflow-y-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr className="border-b">
                      <th className="px-2 py-1.5 text-left font-medium">Row</th>
                      <th className="px-2 py-1.5 text-left font-medium">
                        House No.
                      </th>
                      <th className="px-2 py-1.5 text-left font-medium">
                        Issue
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.slice(0, 200).map((err, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="text-muted-foreground px-2 py-1.5">
                          {err.excelRow}
                        </td>
                        <td className="px-2 py-1.5">{err.houseNumber}</td>
                        <td className="px-2 py-1.5 text-red-700 dark:text-red-400">
                          {err.message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button asChild>
              <a href="/household/register">
                <Home className="mr-1.5 h-4 w-4" />
                View House Register
              </a>
            </Button>
            <Button variant="outline" onClick={resetWizard}>
              Import Another File
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  // ---- Main render ----

  const confirmDescription = analysis
    ? `This will create ${analysis.summary.newRows.toLocaleString()} new house(s) and update ${analysis.summary.updateRows.toLocaleString()} existing house(s) in the House Register. Rows with errors or conflicts are skipped automatically. Do you want to continue?`
    : "";

  return (
    <div className="space-y-4">
      {step !== "importing" && renderStepIndicator()}
      {step === "upload" && renderUpload()}
      {step === "preview" && renderPreview()}
      {step === "importing" && renderImporting()}
      {step === "results" && renderResults()}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirm House Register Import"
        description={confirmDescription}
        confirmLabel="Import Houses"
        variant="default"
        onConfirm={handleConfirm}
        loading={isImporting}
      />
    </div>
  );
}
