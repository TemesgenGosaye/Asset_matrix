"use client";

import React, { useCallback, useRef, useState } from "react";
import { notify } from "@/lib/feedback/notify";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ResponsiveTable, type Column } from "@/components/ui/responsive-table";

import type {
  BulkResponse,
  EmployeeImportPreviewResponse,
} from "@/lib/employees/types";
import { MAX_IMPORT_ROWS } from "@/lib/employees/constants";

interface EmployeeImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

type Phase = "choose" | "preview" | "committing" | "done";

const PREVIEW_COLUMNS: Column[] = [
  { key: "rowNumber", label: "Row", align: "right" },
  { key: "employeeNumber", label: "Emp ID" },
  { key: "fullName", label: "Name" },
  { key: "department", label: "Department" },
  { key: "status", label: "Status" },
];

export function EmployeeImportDialog({
  open,
  onOpenChange,
  onImported,
}: EmployeeImportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import employees</DialogTitle>
          <DialogDescription>
            Upload a spreadsheet using the provided template. Rows are created
            as new employee records; an employee whose Emp ID already exists is
            rejected rather than overwritten.
          </DialogDescription>
        </DialogHeader>

        {open ? (
          <EmployeeImportFields
            onClose={() => onOpenChange(false)}
            onImported={onImported}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Owns all import state. Mounted only while the dialog is open, so the wizard
 * always starts at the file-picker step with blank state — no reset effect
 * needed to clear a previous run.
 */
function EmployeeImportFields({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("choose");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<EmployeeImportPreviewResponse | null>(
    null,
  );
  const [skipInvalid, setSkipInvalid] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkResponse | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setPhase("choose");
    setFile(null);
    setPreview(null);
    setSkipInvalid(true);
    setError(null);
    setResult(null);
    setIsBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const downloadTemplate = useCallback(() => {
    window.location.href = "/api/employees/import?format=xlsx";
  }, []);

  const requestPreview = useCallback(async (selected: File) => {
    setIsBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", selected);
      const res = await fetch("/api/employees/import", {
        method: "POST",
        body,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error ?? "Could not read the file.");
      }
      setPreview(payload as EmployeeImportPreviewResponse);
      setPhase("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the file.");
    } finally {
      setIsBusy(false);
    }
  }, []);

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (!selected) return;

      if (!/\.(xlsx|xls|csv)$/i.test(selected.name)) {
        setError("Upload an .xlsx, .xls or .csv file.");
        return;
      }
      if (selected.size > 20 * 1024 * 1024) {
        setError("File is larger than 20 MB.");
        return;
      }
      setFile(selected);
      void requestPreview(selected);
    },
    [requestPreview],
  );

  const commit = useCallback(async () => {
    if (!preview) return;
    const rows = preview.rows.filter(
      (r) => r.errors.length === 0 || !skipInvalid,
    );
    if (rows.length === 0) {
      setError("No rows are eligible for import.");
      return;
    }

    setIsBusy(true);
    setError(null);
    setPhase("committing");
    try {
      // The server re-validates every row and re-resolves references, so the
      // approved values can be replayed verbatim.
      const res = await fetch("/api/employees/import", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: rows.map((r) => r.values) }),
      });
      const payload: BulkResponse & { error?: string } = await res
        .json()
        .catch(() => ({}) as BulkResponse);
      if (!res.ok && res.status !== 207) {
        throw new Error(payload?.error ?? "Import failed.");
      }
      setResult(payload);
      setPhase("done");
      if (payload.imported) {
        notify.success(`Imported ${payload.imported} employee(s).`);
      }
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
      setPhase("preview");
    } finally {
      setIsBusy(false);
    }
  }, [preview, skipInvalid, onImported]);

  const renderPreviewCell = useCallback(
    (row: EmployeeImportPreviewResponse["rows"][number], key: string) => {
      switch (key) {
        case "rowNumber":
          return <span className="tabular-nums">{row.rowNumber}</span>;
        case "employeeNumber":
          return (
            <span className="font-mono text-xs">
              {row.employeeNumber || "—"}
            </span>
          );
        case "fullName":
          return row.fullName || "—";
        case "department":
          return String(row.values.departmentName ?? "—") || "—";
        case "status":
          return row.errors.length === 0 ? (
            <Badge variant="success">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Ready
            </Badge>
          ) : (
            <Badge variant="destructive">
              <AlertTriangle className="mr-1 h-3 w-3" />
              {row.errors.length} error(s)
            </Badge>
          );
        default:
          return null;
      }
    },
    [],
  );

  const importable = preview
    ? preview.rows.filter((r) => r.errors.length === 0).length
    : 0;

  return (
    <>
      {phase === "choose" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-md border border-dashed px-4 py-3">
            <div className="flex items-center gap-2 text-sm">
              <FileSpreadsheet className="text-muted-foreground h-4 w-4" />
              <span>Start from the official template</span>
            </div>
            <Button size="sm" variant="outline" onClick={downloadTemplate}>
              <Download className="mr-2 h-4 w-4" />
              Template
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="employee-import-file">Spreadsheet</Label>
            <Input2
              id="employee-import-file"
              ref={inputRef}
              onChange={onFileChange}
            />
            <p className="text-muted-foreground text-xs">
              .xlsx, .xls or .csv. Up to {MAX_IMPORT_ROWS.toLocaleString()} data
              rows and 20 MB.
            </p>
          </div>

          {isBusy ? (
            <div className="flex items-center gap-2 text-sm">
              <Progress value={undefined} className="h-1.5" />
              <span className="text-muted-foreground">Reading file…</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {phase === "preview" && preview ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="rounded-md border px-3 py-2">
              <div className="text-muted-foreground text-xs">Total rows</div>
              <div className="text-lg font-semibold">{preview.totalRows}</div>
            </div>
            <div className="rounded-md border px-3 py-2">
              <div className="text-muted-foreground text-xs">Ready</div>
              <div className="text-lg font-semibold text-emerald-600">
                {preview.validRows}
              </div>
            </div>
            <div className="rounded-md border px-3 py-2">
              <div className="text-muted-foreground text-xs">With errors</div>
              <div className="text-destructive text-lg font-semibold">
                {preview.invalidRows}
              </div>
            </div>
          </div>

          {preview.notes.length > 0 ? (
            <ul className="bg-muted/50 text-muted-foreground space-y-1 rounded-md px-3 py-2 text-xs">
              {preview.notes.map((note) => (
                <li key={note}>• {note}</li>
              ))}
            </ul>
          ) : null}

          {preview.unmappedColumns.length > 0 ? (
            <p className="text-muted-foreground text-xs">
              Ignored columns: {preview.unmappedColumns.join(", ")}
            </p>
          ) : null}

          <div className="max-h-72 overflow-auto rounded-md border">
            <ResponsiveTable
              columns={PREVIEW_COLUMNS}
              data={preview.sample}
              renderCell={renderPreviewCell}
              keyExtractor={(row) => `row-${row.rowNumber}`}
              emptyMessage="No rows detected"
            />
          </div>

          {preview.sample.length < preview.totalRows ? (
            <p className="text-muted-foreground text-xs">
              Showing the first {preview.sample.length} of{" "}
              {preview.totalRows.toLocaleString()} rows. All validated rows are
              imported, not just the ones shown.
            </p>
          ) : null}

          {preview.invalidRows > 0 ? (
            <div className="flex items-center gap-2">
              <Checkbox
                id="skip-invalid"
                checked={skipInvalid}
                onCheckedChange={(v) => setSkipInvalid(v === true)}
              />
              <Label htmlFor="skip-invalid" className="text-sm font-normal">
                Skip rows with errors and import the {importable} valid row(s)
              </Label>
            </div>
          ) : null}
        </div>
      ) : null}

      {phase === "committing" ? (
        <div className="space-y-3 py-6 text-center">
          <Progress value={undefined} className="h-1.5" />
          <p className="text-muted-foreground text-sm">
            Importing employees… please do not close this dialog.
          </p>
        </div>
      ) : null}

      {phase === "done" && result ? (
        <div className="space-y-3 py-4 text-sm">
          <p>
            <strong>{result.imported ?? 0}</strong> employee(s) imported.
          </p>
          {result.failed?.length ? (
            <div className="space-y-1">
              <p className="text-destructive font-medium">
                {result.failed.length} row(s) failed:
              </p>
              <ul className="text-muted-foreground max-h-32 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs">
                {result.failed.map((f) => (
                  <li key={f.index}>
                    Row {f.index + 1}
                    {f.employeeNumber ? ` (${f.employeeNumber})` : ""}:{" "}
                    {f.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          {phase === "done" ? "Close" : "Cancel"}
        </Button>
        {phase === "preview" ? (
          <>
            <Button variant="outline" onClick={reset} disabled={isBusy}>
              Choose another file
            </Button>
            <Button
              onClick={() => void commit()}
              disabled={isBusy || importable === 0}
            >
              <Upload className="mr-2 h-4 w-4" />
              Import {importable} row(s)
            </Button>
          </>
        ) : null}
      </DialogFooter>
    </>
  );
}

/** Local file input; the shared `Input` renders a plain text control. */
function Input2({
  id,
  onChange,
  ref,
}: {
  id: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  ref: React.Ref<HTMLInputElement>;
}) {
  return (
    <input
      ref={ref}
      id={id}
      type="file"
      accept=".xlsx,.xls,.csv"
      onChange={onChange}
      className="border-input file:bg-muted/50 hover:file:bg-muted focus-visible:ring-ring/50 w-full cursor-pointer rounded-md border bg-transparent text-sm file:cursor-pointer file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-[3px] focus-visible:outline-none"
    />
  );
}
