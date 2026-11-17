"use client";

/**
 * Employee import wizard for the `/import` page.
 *
 * Built to the same shape as the other two wizards on that page
 * (`AssetImportWizard`, `HouseholdImportWizard`): a step indicator, a drag-and-
 * drop upload, a full validation preview before anything is written, an explicit
 * confirmation, and a results step. The difference is the data model, not the
 * interaction.
 *
 * The validation itself is not here. It lives in `lib/employees/import.ts` and
 * runs server-side in `POST /api/employees/import`, which maps the workbook's
 * headers onto the eight canonical employee columns, rejects anything
 * ambiguous rather than guessing, and flags an Emp ID that already exists as a
 * duplicate instead of overwriting it. This component only presents what that
 * endpoint decided.
 *
 * Two-phase by design: the preview writes nothing, and the commit replays the
 * exact rows the user saw and approved. The server re-validates them, so a
 * tampered preview cannot inject a row that was never shown.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { notify } from "@/lib/feedback/notify";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Info,
  Loader2,
  ShieldAlert,
  Upload,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FileDropZone } from "@/components/FileDropZone";
import { Label } from "@/components/ui/label";
import HelpTooltip from "@/components/HelpTooltip";

import { MAX_IMPORT_ROWS } from "@/lib/employees/constants";
import type {
  BulkResponse,
  EmployeeImportPreviewResponse,
} from "@/lib/employees/types";

// ---------------------------------------------------------------------------
// Types (mirrors /api/employees/import)
// ---------------------------------------------------------------------------

type Step = "upload" | "preview" | "importing" | "results";

const STEP_LABELS: Record<Step, string> = {
  upload: "Select File",
  preview: "Validate & Preview",
  importing: "Importing",
  results: "Import Complete",
};

/** The row-preview and error-table page sizes. */
const ROWS_PER_PAGE = 50;
const ERRORS_PER_PAGE = 20;

/**
 * Where the blank employee template is generated.
 *
 * Exported because the `/import` page's own "Download Sample Template" button
 * needs the same URL, and two hand-written copies of a template URL is how they
 * drift apart.
 */
export const EMPLOYEE_IMPORT_TEMPLATE_URL = "/api/employees/import?format=xlsx";

/** The spreadsheet types the upload accepts. */
const ACCEPTED_UPLOAD =
  ".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
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

/**
 * Flatten a row's validation errors into one string per row.
 *
 * A row can fail several ways at once (a malformed Emp ID AND an out-of-range
 * job grade), and the point of the preview is to fix the file rather than
 * guess, so every reason is shown rather than just the first.
 */
function rowErrorText(
  row: EmployeeImportPreviewResponse["rows"][number],
): string {
  return row.errors.map((e) => e.message).join(" ");
}

/**
 * Render one canonical cell for the preview, showing an em dash when the
 * source workbook left the cell blank rather than inventing a value.
 */
function previewCell(value: unknown): string {
  if (value == null) return "—";
  const text = String(value).trim();
  return text.length === 0 ? "—" : text;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EmployeeImportWizard({
  onComplete,
}: {
  onComplete?: () => void;
}) {
  const [step, setStep] = useState<Step>("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<EmployeeImportPreviewResponse | null>(
    null,
  );
  const [result, setResult] = useState<BulkResponse | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importElapsedSeconds, setImportElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [errorPage, setErrorPage] = useState(1);

  // Rows with at least one validation error, which is what the error table lists.
  const failedRows = useMemo(
    () => (preview?.rows ?? []).filter((r) => r.errors.length > 0),
    [preview],
  );

  const rowPageCount = useMemo(
    () => Math.max(1, Math.ceil((preview?.rows.length ?? 0) / ROWS_PER_PAGE)),
    [preview],
  );
  const errorPageCount = useMemo(
    () => Math.max(1, Math.ceil(failedRows.length / ERRORS_PER_PAGE)),
    [failedRows],
  );

  const visibleRows = useMemo(() => {
    const rows = preview?.rows ?? [];
    const start = (page - 1) * ROWS_PER_PAGE;
    return rows.slice(start, start + ROWS_PER_PAGE);
  }, [preview, page]);

  /**
   * Keep a running clock while the import is in flight.
   *
   * The commit is a single request that writes every row, so the wizard cannot
   * report a true percentage. It reports how long the write has been running,
   * which is the honest signal that the work is still going on.
   */
  useEffect(() => {
    if (step !== "importing") return;
    const startedAt = Date.now();
    setImportElapsedSeconds(0);
    const timer = window.setInterval(() => {
      setImportElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [step]);

  const visibleErrors = useMemo(() => {
    const start = (errorPage - 1) * ERRORS_PER_PAGE;
    return failedRows.slice(start, start + ERRORS_PER_PAGE);
  }, [failedRows, errorPage]);

  // ---- Upload: parse & validate (writes nothing) ----

  const handleFileSelected = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;

    setSelectedFile(file);
    setResult(null);
    setError(null);
    setForbidden(false);
    setPage(1);
    setErrorPage(1);
    setIsParsing(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/employees/import", {
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
            `Validation failed (${res.status}). Check the file against the template.`,
        );
      }

      setPreview(body as EmployeeImportPreviewResponse);
      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsParsing(false);
    }
  }, []);

  // ---- Preview: confirm & commit ----

  const handleConfirm = useCallback(async () => {
    if (!preview) return;

    setConfirmOpen(false);
    setIsImporting(true);
    setStep("importing");

    try {
      // Only the validated rows go up. The server re-validates each one and
      // re-checks every Emp ID against the register, so these exact values are
      // what gets written - nothing the user did not see, and nothing that
      // overwrites an existing employee.
      const res = await fetch("/api/employees/import", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Display metadata only, so the ImportJob records the source file.
          fileName: preview.fileName,
          rows: preview.rows
            .filter((r) => r.errors.length === 0 && !r.isIgnored)
            .map((r) => r.values),
        }),
      });

      const body = await res.json().catch(() => ({}));

      // 207 is a partial success: some rows landed, some did not. It is a
      // result, not a failure, so it is shown rather than thrown.
      if (!res.ok && res.status !== 207) {
        throw new Error(body.error || "Import failed");
      }

      setResult(body as BulkResponse);
      setStep("results");

      const imported = body.imported ?? 0;
      const failedCount = body.failed?.length ?? 0;
      if (imported > 0 && failedCount === 0) {
        notify.success(`Imported ${imported} employee(s).`);
      } else if (imported > 0) {
        notify.warning(
          `Imported ${imported} employee(s) with ${failedCount} row(s) failed.`,
        );
      } else {
        notify.error("Import failed — no employees were created.");
      }

      onComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("preview");
      notify.error({
        title: "Import failed",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsImporting(false);
    }
  }, [preview, onComplete]);

  const resetWizard = useCallback(() => {
    setStep("upload");
    setSelectedFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setForbidden(false);
    setPage(1);
    setErrorPage(1);
    setConfirmOpen(false);
  }, []);

  const goBackToUpload = useCallback(() => {
    setStep("upload");
    setSelectedFile(null);
    setPreview(null);
    setError(null);
    setForbidden(false);
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
            <Users className="h-5 w-5" />
            Import Employees
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(EMPLOYEE_IMPORT_TEMPLATE_URL, "_blank")}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Download Template
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          Upload an Excel (.xlsx / .xls) or CSV file with up to{" "}
          {MAX_IMPORT_ROWS.toLocaleString()} data rows. The first sheet is read
          and every row is validated here — nothing is written until you
          confirm. Only <span className="font-medium">Emp ID</span>,{" "}
          <span className="font-medium">First Name</span> and{" "}
          <span className="font-medium">Last Name</span> are required; the rest
          are optional.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <FileDropZone
          onFilesSelected={handleFileSelected}
          accept={ACCEPTED_UPLOAD}
          uploading={isParsing}
          maxSizeMb={20}
          label="Drag & drop your employee Excel or CSV file here, or click to browse"
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
                Importing employees requires the Bulk Import Employees
                permission. Ask an administrator to grant it if you need to
                import staff data.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 rounded-md bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>{error}</div>
          </div>
        )}

        <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p>
              Column headings are matched loosely, so an HR-authored file
              usually works without changes — &ldquo;Emp ID&rdquo;,
              &ldquo;Employee Number&rdquo; and &ldquo;EmployeeID&rdquo; all
              resolve to the same field. Anything unmatched is listed on the
              preview step so you can see it was ignored rather than assume it
              was read.
            </p>
            <p className="mt-1">
              The import reads exactly the eight employee columns — Emp ID,
              First Name, Last Name, Gender, Job Grade, Service Years, Marital
              Status and Disability. Any other column is ignored and listed on
              the preview step. Rows are always created as new records — an Emp
              ID that already exists is rejected rather than overwritten.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // ---- Render: preview ----

  const renderSummaryCards = () => {
    if (!preview) return null;
    const cards = [
      { label: "Total Rows", value: preview.totalRows },
      { label: "Ready", value: preview.validRows, tone: "text-green-600" },
      {
        label: "Ignored (Empty)",
        value: preview.ignoredRows ?? 0,
        tone: "text-muted-foreground",
      },
      {
        label: "With Errors",
        value: preview.invalidRows,
        tone: "text-red-600",
      },
      {
        label: "Columns Read",
        value: preview.recognisedColumns.length,
        tone: "text-blue-600",
      },
    ];
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {cards.map((c) => (
          <div
            key={c.label}
            className="bg-background rounded-md border p-3 text-center"
          >
            <div
              className={`text-2xl font-semibold ${c.tone ?? "text-foreground"}`}
            >
              {c.value.toLocaleString()}
            </div>
            <div className="text-muted-foreground text-xs">{c.label}</div>
          </div>
        ))}
      </div>
    );
  };

  const renderPreview = () => {
    if (!preview) return null;
    const canImport = preview.validRows > 0;

    return (
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Preview — {preview.fileName}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={goBackToUpload}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back
            </Button>
          </div>
          <p className="text-muted-foreground text-sm">
            Sheet <span className="font-medium">{preview.sheetName}</span> ·{" "}
            {preview.totalRows.toLocaleString()} data row(s) ·{" "}
            {preview.validRows.toLocaleString()} ready to import
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {renderSummaryCards()}

          {preview.notes.length > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <ul className="space-y-1">
                {preview.notes.map((note) => (
                  <li key={note}>• {note}</li>
                ))}
              </ul>
            </div>
          )}

          {preview.unmappedColumns.length > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <span className="font-medium">Ignored columns: </span>
                {preview.unmappedColumns.join(", ")}. These headers did not
                match any employee field, so their values were not read. Rename
                a column to one of the template headings if you need it.
              </div>
            </div>
          )}

          {preview.invalidRows > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                {preview.invalidRows.toLocaleString()} row(s) will be{" "}
                <span className="font-medium">skipped</span>. Fix them in your
                file and re-upload, or import the{" "}
                {preview.validRows.toLocaleString()} valid row(s) now and handle
                the rest separately.
              </div>
            </div>
          )}

          {/* Row preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Rows in this file</p>
              <span className="text-muted-foreground text-xs">
                {preview.rows.length.toLocaleString()} row(s) ready for review
              </span>
            </div>
            <div className="max-h-96 overflow-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="border-b">
                    <th className="px-2 py-2 text-left font-medium">Row</th>
                    <th className="px-2 py-2 text-left font-medium">Emp ID</th>
                    <th className="px-2 py-2 text-left font-medium">Name</th>
                    <th className="px-2 py-2 text-left font-medium">Gender</th>
                    <th className="px-2 py-2 text-left font-medium">Grade</th>
                    <th className="px-2 py-2 text-left font-medium">
                      Service Yrs
                    </th>
                    <th className="px-2 py-2 text-left font-medium">Marital</th>
                    <th className="px-2 py-2 text-left font-medium">
                      Disability
                    </th>
                    <th className="px-2 py-2 text-left font-medium">Score</th>
                    <th className="px-2 py-2 text-left font-medium">
                      Next References (House/MCDA)
                    </th>
                    <th className="px-2 py-2 text-left font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    if (row.isIgnored) {
                      return (
                        <tr
                          key={`row-${row.rowNumber}`}
                          className="bg-muted/20 border-b opacity-50 last:border-0"
                        >
                          <td className="text-muted-foreground px-2 py-1.5 tabular-nums">
                            {row.rowNumber}
                          </td>
                          <td className="text-muted-foreground px-2 py-1.5 font-mono italic">
                            (empty)
                          </td>
                          <td className="text-muted-foreground px-2 py-1.5">
                            —
                          </td>
                          <td className="text-muted-foreground px-2 py-1.5">
                            —
                          </td>
                          <td className="text-muted-foreground px-2 py-1.5">
                            —
                          </td>
                          <td className="text-muted-foreground px-2 py-1.5">
                            —
                          </td>
                          <td className="text-muted-foreground px-2 py-1.5">
                            —
                          </td>
                          <td className="text-muted-foreground px-2 py-1.5">
                            —
                          </td>
                          <td className="text-muted-foreground px-2 py-1.5">
                            —
                          </td>
                          <td className="text-muted-foreground px-2 py-1.5 text-xs">
                            Ignored empty Emp ID row
                          </td>
                          <td className="px-2 py-1.5">
                            <Badge
                              variant="outline"
                              className="text-muted-foreground border-dashed"
                            >
                              Ignored
                            </Badge>
                          </td>
                        </tr>
                      );
                    }

                    const ok = row.errors.length === 0;
                    const rec = row.recommendation;
                    const scoreDisplay =
                      row.score !== null && row.score !== undefined
                        ? `${Math.round(row.score * 100)}%`
                        : rec?.projectedScore !== undefined
                          ? `${Math.round(rec.projectedScore * 100)}%`
                          : "—";

                    return (
                      <tr
                        key={`row-${row.rowNumber}`}
                        className={`border-b last:border-0 ${
                          ok ? "" : "bg-destructive/5"
                        }`}
                      >
                        <td className="text-muted-foreground px-2 py-1.5 tabular-nums">
                          {row.rowNumber}
                        </td>
                        <td className="px-2 py-1.5 font-mono font-medium">
                          {row.employeeNumber || "—"}
                        </td>
                        <td className="px-2 py-1.5">{row.fullName || "—"}</td>
                        <td className="px-2 py-1.5">
                          {previewCell(row.values.gender)}
                        </td>
                        <td className="px-2 py-1.5 tabular-nums">
                          {previewCell(row.values.jobGrade)}
                        </td>
                        <td className="px-2 py-1.5 tabular-nums">
                          {previewCell(row.values.serviceYears)}
                        </td>
                        <td className="px-2 py-1.5">
                          {previewCell(row.values.maritalStatus)}
                        </td>
                        <td className="px-2 py-1.5">
                          {previewCell(row.values.disabilityStatus)}
                        </td>
                        <td className="px-2 py-1.5 font-semibold text-blue-600 dark:text-blue-400">
                          {scoreDisplay}
                        </td>
                        <td className="max-w-xs px-2 py-1.5">
                          {rec ? (
                            <div className="flex flex-col gap-0.5 text-[11px]">
                              <span className="text-foreground font-medium">
                                {rec.houseQueueEligible
                                  ? `House: Band ${rec.houseQueueBand}`
                                  : "House: Ineligible (no grade)"}
                              </span>
                              {rec.tips.length > 0 && (
                                <span
                                  className="text-muted-foreground truncate"
                                  title={rec.tips.join(" | ")}
                                >
                                  {rec.tips[0]}
                                </span>
                              )}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          {ok ? (
                            <Badge variant="success">Ready</Badge>
                          ) : (
                            <Badge variant="destructive">
                              {row.errors.length} error(s)
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {visibleRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={11}
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
              total={preview.rows.length}
              onPage={setPage}
            />
          </div>

          {/* Errors */}
          {failedRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-destructive text-sm font-medium">
                  {failedRows.length.toLocaleString()} row(s) with issues
                </p>
                <Label className="text-muted-foreground text-xs font-normal">
                  Fix these in your file, then re-upload
                </Label>
              </div>
              <div className="max-h-72 overflow-y-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr className="border-b">
                      <th className="px-2 py-1.5 text-left font-medium">Row</th>
                      <th className="px-2 py-1.5 text-left font-medium">
                        Emp ID
                      </th>
                      <th className="px-2 py-1.5 text-left font-medium">
                        Name
                      </th>
                      <th className="px-2 py-1.5 text-left font-medium">
                        Issue
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleErrors.map((row) => (
                      <tr
                        key={`err-${row.rowNumber}`}
                        className="border-b last:border-0"
                      >
                        <td className="text-muted-foreground px-2 py-1.5 tabular-nums">
                          {row.rowNumber}
                        </td>
                        <td className="px-2 py-1.5 font-mono">
                          {row.employeeNumber || "—"}
                        </td>
                        <td className="px-2 py-1.5">{row.fullName || "—"}</td>
                        <td className="px-2 py-1.5 text-red-700 dark:text-red-400">
                          {rowErrorText(row)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationControls
                page={errorPage}
                pageCount={errorPageCount}
                total={failedRows.length}
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
              Continue to Import ({preview.validRows.toLocaleString()}{" "}
              employee(s))
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

  const renderImporting = () => {
    const rowCount = preview?.validRows ?? 0;

    return (
      <Card>
        <CardContent className="space-y-5 py-12">
          <div className="flex flex-col items-center justify-center text-center">
            <Loader2 className="text-primary mb-4 h-8 w-8 animate-spin" />
            <p className="text-lg font-medium">
              Importing {rowCount.toLocaleString()} employee(s)…
            </p>
            <p className="text-muted-foreground text-sm">
              Every row is written in a single transaction. Nothing is reported
              as imported until the whole file has landed — keep this page open.
            </p>
          </div>

          <div className="bg-secondary relative h-1.5 w-full overflow-hidden rounded-full">
            <div className="bg-primary/70 animate-import-progress absolute inset-y-0 left-0 w-1/3 rounded-full" />
          </div>

          <div className="text-muted-foreground flex items-center justify-between text-xs">
            <span>
              {rowCount.toLocaleString()} row(s) queued
              {preview && preview.invalidRows > 0
                ? ` · ${preview.invalidRows.toLocaleString()} skipped at validation`
                : ""}
            </span>
            <span>{importElapsedSeconds}s elapsed</span>
          </div>
        </CardContent>
      </Card>
    );
  };

  // ---- Render: results ----

  const renderResults = () => {
    if (!result) return null;
    const imported = result.imported ?? 0;
    const failed = result.failed ?? [];

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            {imported > 0 && failed.length === 0 ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : failed.length > 0 ? (
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-red-600" />
            )}
            Import Complete
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="bg-background rounded-md border p-3 text-center">
              <div className="text-2xl font-semibold text-green-600">
                {imported}
              </div>
              <div className="text-muted-foreground text-xs">Imported</div>
            </div>
            <div className="bg-background rounded-md border p-3 text-center">
              <div className="text-2xl font-semibold text-red-600">
                {failed.length}
              </div>
              <div className="text-muted-foreground text-xs">Failed</div>
            </div>
            <div className="bg-background rounded-md border p-3 text-center">
              <div className="text-2xl font-semibold text-gray-500">
                {preview?.invalidRows ?? 0}
              </div>
              <div className="text-muted-foreground text-xs">
                Skipped at validation
              </div>
            </div>
          </div>

          {/*
            An imported row is a person, not a login. Sign-in lives on the
            separate `user` account linked by `userid`, so an employee record
            carrying no address is complete — and saying otherwise here would
            send the reader looking for a credential that was never created.
          */}
          <div className="text-muted-foreground flex items-start gap-2 rounded-md border p-3 text-xs">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              These records carry no sign-in. An employee can only log in once a{" "}
              <span className="font-medium">user</span> account exists and is
              linked to the employee by their user ID — link one from the
              employee&apos;s profile when you want portal access for them.
            </div>
          </div>

          {failed.length > 0 && (
            <div className="space-y-2">
              <p className="text-destructive text-sm font-medium">
                {failed.length.toLocaleString()} row(s) failed to write
              </p>
              <div className="max-h-64 overflow-y-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr className="border-b">
                      <th className="px-2 py-1.5 text-left font-medium">
                        Emp ID
                      </th>
                      <th className="px-2 py-1.5 text-left font-medium">
                        Issue
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {failed.slice(0, 200).map((f) => (
                      <tr key={f.index} className="border-b last:border-0">
                        <td className="px-2 py-1.5 font-mono">
                          {f.employeeNumber ?? "—"}
                        </td>
                        <td className="px-2 py-1.5 text-red-700 dark:text-red-400">
                          {f.message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {failed.length > 200 && (
                <p className="text-muted-foreground text-xs">
                  Showing the first 200 of {failed.length.toLocaleString()}{" "}
                  failures.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button asChild>
              <Link href="/employees">
                <Users className="mr-1.5 h-4 w-4" />
                View Employees
              </Link>
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

  const confirmDescription = preview
    ? `This will create ${preview.validRows.toLocaleString()} employee record(s) in your organization. ${
        preview.invalidRows > 0
          ? `${preview.invalidRows.toLocaleString()} row(s) failed validation and will be skipped. `
          : ""
      }Every row is created as a new employee record; an Emp ID that already exists is rejected rather than overwritten. Do you want to continue?`
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
        title="Confirm Employee Import"
        description={confirmDescription}
        confirmLabel={`Import ${preview?.validRows.toLocaleString() ?? 0} Employee(s)`}
        variant="default"
        onConfirm={handleConfirm}
        loading={isImporting}
      />
    </div>
  );
}
