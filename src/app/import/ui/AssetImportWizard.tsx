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
import { notify } from "@/lib/feedback/notify";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  TableProperties,
  XCircle,
} from "lucide-react";
import HelpTooltip from "@/components/HelpTooltip";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = "upload" | "sheet" | "mapping" | "importing" | "results";

interface SheetPreview {
  name: string;
  rowCount: number;
  dataRowCount: number;
  headers: string[];
  previewRows: { rowNumber: number; values: string[] }[];
  autoMapping: Record<string, number>;
  mergedMapping: Record<string, number>;
}

interface FieldDef {
  id: string;
  label: string;
  required: boolean;
  kind: string;
}

interface PreviewResponse {
  fileName: string;
  fileSize: number;
  sheets: SheetPreview[];
  fieldDefs: FieldDef[];
}

interface ImportResult {
  id: string;
  successCount: number;
  errorCount: number;
  totalRows: number;
  errors?: { row: number; error: string }[] | null;
  status: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEP_ORDER: Step[] = [
  "upload",
  "sheet",
  "mapping",
  "importing",
  "results",
];

const STEP_LABELS: Record<Step, string> = {
  upload: "Upload",
  sheet: "Sheet",
  mapping: "Map Columns",
  importing: "Importing",
  results: "Results",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return (
        <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
          Completed
        </Badge>
      );
    case "failed":
      return <Badge variant="destructive">Failed</Badge>;
    case "processing":
      return (
        <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">
          Processing
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AssetImportWizard({
  onComplete,
}: {
  onComplete?: () => void;
}) {
  const [step, setStep] = useState<Step>("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [headerRow, setHeaderRow] = useState<number>(1);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // ---- Derived values ----

  const currentSheet = previewData?.sheets.find(
    (s) => s.name === selectedSheet,
  );
  const headers: string[] = currentSheet?.headers ?? [];
  const previewRows = currentSheet?.previewRows ?? [];
  const fieldDefs: FieldDef[] = useMemo(
    () => previewData?.fieldDefs ?? [],
    [previewData],
  );

  const requiredFieldDefs = useMemo(
    () => fieldDefs.filter((f) => f.required),
    [fieldDefs],
  );
  const optionalFieldDefs = useMemo(
    () => fieldDefs.filter((f) => !f.required),
    [fieldDefs],
  );
  const requiredMapped = useMemo(
    () =>
      requiredFieldDefs.length > 0 &&
      requiredFieldDefs.every((f) => (mapping[f.id] ?? -1) >= 0),
    [requiredFieldDefs, mapping],
  );
  const missingRequiredLabels = useMemo(
    () =>
      requiredFieldDefs
        .filter((f) => (mapping[f.id] ?? -1) < 0)
        .map((f) => f.label),
    [requiredFieldDefs, mapping],
  );

  // ---- Navigation helpers ----

  const stepIndex = STEP_ORDER.indexOf(step);
  const canGoBack = step === "sheet" || step === "mapping";
  const canSkipSheet = (previewData?.sheets.length ?? 0) <= 1;

  const goBack = useCallback(() => {
    if (step === "mapping") setStep("sheet");
    else if (step === "sheet") setStep("upload");
  }, [step]);

  const resetWizard = useCallback(() => {
    setStep("upload");
    setSelectedFile(null);
    setPreviewData(null);
    setSelectedSheet("");
    setHeaderRow(1);
    setMapping({});
    setResult(null);
    setParseError(null);
  }, []);

  // ---- Handlers ----

  const handleFileSelected = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setSelectedFile(file);
    setResult(null);
    setParseError(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/import/preview", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Preview failed (${res.status})`);
      }

      const data: PreviewResponse = await res.json();
      setPreviewData(data);

      // Auto-select if single sheet
      if (data.sheets.length === 1) {
        setSelectedSheet(data.sheets[0].name);
        setMapping(data.sheets[0].mergedMapping as Record<string, number>);
        setStep("mapping");
      } else if (data.sheets.length > 1) {
        setSelectedSheet(data.sheets[0].name);
        setMapping(data.sheets[0].mergedMapping as Record<string, number>);
        setStep("sheet");
      } else {
        setParseError("File contains no readable sheets.");
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }, []);

  const handleSelectSheet = useCallback(
    (sheetName: string) => {
      setSelectedSheet(sheetName);
      const sheet = previewData?.sheets.find((s) => s.name === sheetName);
      if (sheet) {
        setMapping(sheet.mergedMapping as Record<string, number>);
        setHeaderRow(1);
      }
    },
    [previewData],
  );

  const handleProceedFromSheet = useCallback(() => {
    if (!selectedSheet) {
      notify.error("Please select a sheet first.");
      return;
    }
    setStep("mapping");
  }, [selectedSheet]);

  const handleMappingChange = useCallback(
    (fieldId: string, colIndex: number) => {
      setMapping((prev) => {
        const next = { ...prev };
        if (colIndex < 0) {
          delete next[fieldId];
        } else {
          next[fieldId] = colIndex;
        }
        return next;
      });
    },
    [],
  );

  const handleImport = useCallback(async () => {
    if (!selectedFile || !selectedSheet) return;
    if (!requiredMapped) {
      notify.error({
        title: "All required fields must be mapped before importing.",
        description:
          missingRequiredLabels.length > 0
            ? `Missing: ${missingRequiredLabels.join(", ")}`
            : undefined,
      });
      return;
    }

    setImporting(true);
    setStep("importing");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("sheetName", selectedSheet);
      formData.append("headerRow", String(headerRow));
      formData.append("columnMapping", JSON.stringify(mapping));

      const res = await fetch("/api/import/asset", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Import failed");
      }

      setResult(data);
      setStep("results");

      if (data.errorCount === 0 && data.successCount > 0) {
        notify.success(`Imported ${data.successCount} asset(s) successfully.`);
      } else if (data.successCount > 0) {
        notify.warning(
          `Imported ${data.successCount} asset(s) with ${data.errorCount} error(s).`,
        );
      } else {
        notify.error("Import failed — no assets were created.");
      }

      onComplete?.();
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
      setStep("mapping");
      notify.error({
        title: "Import failed",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setImporting(false);
    }
  }, [
    selectedFile,
    selectedSheet,
    headerRow,
    mapping,
    requiredMapped,
    missingRequiredLabels,
    onComplete,
  ]);

  // ---- Render: Step indicators ----

  const renderStepIndicator = () => {
    const visibleSteps: Step[] = ["upload", "sheet", "mapping", "results"];
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

  // ---- Render: Upload step ----

  const renderUpload = () => (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileSpreadsheet className="h-5 w-5" />
            Upload Asset Data
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              window.open("/api/import/template?entityType=asset", "_blank");
            }}
          >
            <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
            Download Template
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          Upload an Excel (.xlsx) or CSV file. Required columns: Asset Type, PID
          (Asset ID). If your file has multiple sheets, you will be prompted to
          select one.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <FileDropZone
          onFilesSelected={handleFileSelected}
          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
          uploading={uploading}
          maxSizeMb={20}
          label="Drag & drop your Excel or CSV file here, or click to browse"
        />

        {parseError && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400">
            {parseError}
          </div>
        )}

        {selectedFile && (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <FileSpreadsheet className="h-4 w-4" />
            {selectedFile.name} ({formatFileSize(selectedFile.size)})
          </div>
        )}
      </CardContent>
    </Card>
  );

  // ---- Render: Sheet selection step ----

  const renderSheetSelection = () => (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <TableProperties className="h-5 w-5" />
            Select Sheet
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={goBack}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          This file contains {previewData?.sheets.length} sheet(s). Select which
          sheet contains your asset data.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {selectedFile && (
          <div className="bg-muted flex items-center gap-2 rounded-md px-3 py-2 text-sm">
            <FileSpreadsheet className="h-4 w-4" />
            <span className="font-medium">{selectedFile.name}</span>
            <span className="text-muted-foreground">
              ({formatFileSize(selectedFile.size)})
            </span>
          </div>
        )}

        <div className="space-y-2">
          {previewData?.sheets.map((sheet) => (
            <button
              key={sheet.name}
              onClick={() => handleSelectSheet(sheet.name)}
              className={`flex w-full items-center justify-between rounded-md border px-4 py-3 text-left text-sm transition-colors ${
                selectedSheet === sheet.name
                  ? "border-primary bg-primary/5"
                  : "hover:bg-muted"
              }`}
            >
              <div>
                <div className="font-medium">{sheet.name}</div>
                <div className="text-muted-foreground text-xs">
                  {sheet.dataRowCount} data row(s) &middot;{" "}
                  {sheet.headers.length} column(s)
                </div>
              </div>
              {selectedSheet === sheet.name && (
                <CheckCircle2 className="text-primary h-4 w-4" />
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button onClick={handleProceedFromSheet} disabled={!selectedSheet}>
            Continue
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  // ---- Render: Mapping step ----

  const renderMapping = () => (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <TableProperties className="h-5 w-5" />
            Map Columns
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">
              {selectedFile?.name}
              {selectedSheet && ` / ${selectedSheet}`}
            </span>
            {canGoBack && (
              <Button variant="ghost" size="sm" onClick={goBack}>
                <ArrowLeft className="mr-1 h-4 w-4" />
                Back
              </Button>
            )}
          </div>
        </div>
        <p className="text-muted-foreground text-sm">
          Match your file columns to asset fields. All required fields — Sr.
          No., Asset Type, PID (Asset ID), Condition, Location, Brand, Review
          Date, and Remark — must be mapped to a column.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Header row selector */}
        {headers.length > 0 && (
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium">
              Header Row:
              <HelpTooltip text="The row number that contains your column headers (usually 1)." />
            </label>
            <Select
              value={String(headerRow)}
              onValueChange={(v) => setHeaderRow(parseInt(v, 10) || 1)}
            >
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    Row {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Required fields */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Required Fields</p>
          {requiredFieldDefs.map((field) => (
            <MappingRow
              key={field.id}
              field={field}
              headers={headers}
              mapping={mapping}
              previewRows={previewRows}
              onChange={handleMappingChange}
              required
            />
          ))}
        </div>

        {/* Optional fields */}
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm font-medium">
            Optional Fields
          </p>
          {optionalFieldDefs.map((field) => (
            <MappingRow
              key={field.id}
              field={field}
              headers={headers}
              mapping={mapping}
              previewRows={previewRows}
              onChange={handleMappingChange}
            />
          ))}
        </div>

        {!requiredMapped && (
          <p className="text-sm text-amber-600">
            {missingRequiredLabels.length > 0
              ? `Not mapped yet: ${missingRequiredLabels.join(", ")}. These are required and must be mapped to a column.`
              : "All required fields must be mapped to proceed."}
          </p>
        )}

        {parseError && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400">
            {parseError}
          </div>
        )}

        {/* Import button */}
        <div className="flex items-center gap-3 pt-2">
          <Button
            onClick={handleImport}
            disabled={importing || !requiredMapped}
          >
            <Upload className="mr-1.5 h-4 w-4" />
            {importing ? "Importing..." : "Import Assets"}
          </Button>
        </div>

        {/* Data preview */}
        {previewRows.length > 0 && (
          <div className="space-y-2 pt-2">
            <p className="text-muted-foreground text-sm font-medium">
              Data Preview (first {previewRows.length} rows)
            </p>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="px-2 py-1.5 text-left font-medium">Row</th>
                    {Object.entries(mapping)
                      .filter(([, idx]) => idx >= 0)
                      .map(([fieldId, colIdx]) => {
                        const field = fieldDefs.find((f) => f.id === fieldId);
                        return (
                          <th
                            key={fieldId}
                            className="px-2 py-1.5 text-left font-medium"
                          >
                            {field?.label ?? fieldId}
                          </th>
                        );
                      })}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={row.rowNumber} className="border-b last:border-0">
                      <td className="text-muted-foreground px-2 py-1.5">
                        {row.rowNumber}
                      </td>
                      {Object.entries(mapping)
                        .filter(([, idx]) => idx >= 0)
                        .map(([fieldId, colIdx]) => (
                          <td key={fieldId} className="px-2 py-1.5">
                            {row.values[colIdx] || (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  // ---- Render: Importing ----

  const renderImporting = () => (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12">
        <Loader2 className="text-primary mb-4 h-8 w-8 animate-spin" />
        <p className="text-lg font-medium">Importing assets...</p>
        <p className="text-muted-foreground text-sm">
          This may take a moment for large files.
        </p>
      </CardContent>
    </Card>
  );

  // ---- Render: Results ----

  const renderResults = () => {
    if (!result) return null;
    const hasSuccess = result.successCount > 0;
    const hasErrors = result.errorCount > 0;

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            {hasSuccess && !hasErrors ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : hasErrors ? (
              <XCircle className="h-5 w-5 text-red-600" />
            ) : (
              <XCircle className="h-5 w-5 text-red-600" />
            )}
            Import Results
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Summary badges */}
          <div className="flex flex-wrap gap-3">
            <StatusBadge status={result.status} />
            {hasSuccess && (
              <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                {result.successCount} imported
              </Badge>
            )}
            {hasErrors && (
              <Badge variant="destructive">{result.errorCount} error(s)</Badge>
            )}
            <Badge variant="secondary">{result.totalRows} total rows</Badge>
          </div>

          {/* Errors list */}
          {hasErrors && result.errors && result.errors.length > 0 && (
            <div className="bg-background max-h-64 overflow-y-auto rounded-md border p-4">
              <p className="mb-2 text-sm font-medium">Errors:</p>
              <ul className="space-y-1">
                {result.errors.map((err, i) => (
                  <li key={i} className="text-destructive text-sm">
                    {err.error}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Button onClick={resetWizard} variant="outline">
              Import Another File
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  // ---- Main render ----

  return (
    <div className="space-y-4">
      {step !== "importing" && renderStepIndicator()}
      {step === "upload" && renderUpload()}
      {step === "sheet" && renderSheetSelection()}
      {step === "mapping" && renderMapping()}
      {step === "importing" && renderImporting()}
      {step === "results" && renderResults()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MappingRow sub-component
// ---------------------------------------------------------------------------

function MappingRow({
  field,
  headers,
  mapping,
  previewRows,
  onChange,
  required,
}: {
  field: FieldDef;
  headers: string[];
  mapping: Record<string, number>;
  previewRows: { rowNumber: number; values: string[] }[];
  onChange: (fieldId: string, colIndex: number) => void;
  required?: boolean;
}) {
  const mappedIdx = mapping[field.id] ?? -1;
  const firstPreview =
    mappedIdx >= 0 && previewRows[0] ? previewRows[0].values[mappedIdx] : null;

  return (
    <div className="grid grid-cols-[1fr_1fr_1fr] items-center gap-3 sm:grid-cols-[180px_1fr_1fr]">
      <span className="text-sm font-medium">
        {field.label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
        {!required && (
          <span className="text-muted-foreground ml-1 text-xs">(opt)</span>
        )}
      </span>
      <Select
        value={String(mappedIdx)}
        onValueChange={(v) => onChange(field.id, parseInt(v, 10))}
      >
        <SelectTrigger className="h-9">
          <SelectValue placeholder="— Skip —" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="-1" disabled={required}>
            — Skip —
          </SelectItem>
          {headers.map((header, idx) => (
            <SelectItem key={idx} value={String(idx)}>
              {header}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-muted-foreground truncate text-xs">
        {firstPreview && firstPreview !== ""
          ? `e.g. "${firstPreview}"`
          : "\u00A0"}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload icon (inline for the import button)
// ---------------------------------------------------------------------------

function Upload({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
