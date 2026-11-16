import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildExportResponse, type ExportFormat } from "@/lib/export";
import prisma from "@/lib/prisma";
import {
  mapErrorToResponse,
  parseJsonBody,
  withEmployeeContext,
  withEmployeeMutationContext,
} from "@/lib/employees/api";
import {
  bulkCreateEmployees,
  invalidateEmployeeCache,
} from "@/lib/employees/service";
import {
  EMPLOYEE_IMPORT_COLUMNS,
  findExistingEmployeeNumbers,
  mapEmployeeHeaders,
  previewEmployeeImport,
  rowsFromSheet,
  type EmployeeSpreadsheetRow,
} from "@/lib/employees/import";
import { createEmployeeSchema } from "@/lib/employees/schemas";
import { createAuditLog, AUDIT_ACTIONS, AUDIT_ENTITIES } from "@/lib/audit-log";
import {
  MAX_IMPORT_FILE_SIZE,
  MAX_REPORTED_ERRORS,
  PREVIEW_ROW_LIMIT,
  parseWorkbook,
  type SheetData,
} from "@/lib/excel-import";
import {
  CANONICAL_EMPLOYEE_COLUMNS,
  MAX_IMPORT_ROWS,
  REQUIRED_CANONICAL_EMPLOYEE_COLUMNS,
} from "@/lib/employees/constants";
import {
  buildEmployeeTemplateRows,
  EMPLOYEE_TEMPLATE_COLUMNS,
} from "@/lib/employees/export";

/**
 * MIME types a spreadsheet upload may declare.
 *
 * Browsers are inconsistent about what they report for a spreadsheet — Chrome
 * sends the precise OOXML type, Safari sends `application/vnd.ms-excel` for a
 * CSV, and some clients send nothing at all — so an empty type is accepted and
 * only a clearly wrong type (an image, a PDF) is refused. The file extension is
 * the authoritative check and is enforced by `parseWorkbook`.
 */
function isSupportedSpreadsheetMime(type: string): boolean {
  const value = type.trim().toLowerCase();
  if (value.length === 0) return true;
  return [
    "excel",
    "spreadsheet",
    "csv",
    "octet-stream",
    "plain",
    "zip",
  ].some((token) => value.includes(token));
}

/**
 * POST /api/employees/import
 *
 * Parse a workbook and validate every row WITHOUT writing. Returns a per-row
 * plan (valid rows, rejected rows and the reason for each) plus a bounded
 * sample for the preview table. The commit step is `PUT /api/employees/import`.
 */
export async function POST(req: NextRequest) {
  try {
    const { response, context } =
      await withEmployeeMutationContext("employee:import");
    if (response) return response;
    const { organizationId } = context!;

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json(
        { error: "Expected a multipart/form-data upload." },
        { status: 400 },
      );
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'Attach a .xlsx, .xls or .csv file under the "file" field.' },
        { status: 400 },
      );
    }
    if (file.size === 0) {
      return NextResponse.json(
        { error: "The uploaded file is empty." },
        { status: 400 },
      );
    }
    if (file.size > MAX_IMPORT_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `File is too large. The maximum is ${Math.floor(
            MAX_IMPORT_FILE_SIZE / (1024 * 1024),
          )} MB.`,
        },
        { status: 413 },
      );
    }
    if (!isSupportedSpreadsheetMime(file.type)) {
      return NextResponse.json(
        {
          error:
            "Unsupported file type. Upload an Excel (.xlsx / .xls) or CSV file.",
        },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let sheets: SheetData[];
    try {
      sheets = await parseWorkbook(buffer, file.name, {
        keepDisplayText: true,
      });
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "The file could not be read as a spreadsheet.",
        },
        { status: 400 },
      );
    }

    /**
     * The header row is the first row with content in each sheet. A workbook
     * may open with a title row, so every sheet is tried and the first one
     * whose headers match a canonical column wins.
     */
    let selected: {
      sheet: SheetData;
      mapping: ReturnType<typeof mapEmployeeHeaders>;
      rows: EmployeeSpreadsheetRow[];
      rowNumbers: number[];
    } | null = null;

    for (const sheet of sheets) {
      const mapping = mapEmployeeHeaders(sheet.headers);
      if (Object.keys(mapping.mapping).length === 0) continue;
      const extracted = rowsFromSheet(
        sheet.headers,
        sheet.rows,
        sheet.headerRowIndex,
        sheet.displayRows,
      );
      selected = {
        sheet,
        mapping,
        rows: extracted.rows,
        rowNumbers: extracted.rowNumbers,
      };
      break;
    }

    if (!selected) {
      return NextResponse.json(
        {
          error:
            "None of the column headers were recognised. The workbook must contain at least " +
            `${REQUIRED_CANONICAL_EMPLOYEE_COLUMNS.join(", ")}. Download the template to see the expected format.`,
        },
        { status: 400 },
      );
    }

    const { sheet, mapping, rows, rowNumbers } = selected;

    if (mapping.ambiguous.length > 0) {
      return NextResponse.json(
        {
          error: "The workbook's column headers are ambiguous.",
          details: mapping.ambiguous.map((entry) => entry.reason),
        },
        { status: 400 },
      );
    }

    if (mapping.missing.length > 0) {
      return NextResponse.json(
        {
          error: `The workbook is missing required column(s): ${mapping.missing.join(", ")}.`,
          details: `Required columns: ${REQUIRED_CANONICAL_EMPLOYEE_COLUMNS.join(", ")}. Download the template to see the expected format.`,
        },
        { status: 400 },
      );
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No data rows were found below the header row." },
        { status: 400 },
      );
    }

    const preview = await previewEmployeeImport({
      organizationId,
      rows,
      rowNumbers,
    });

    const notes = [...preview.notes];
    if (mapping.unmapped.length > 0) {
      notes.push(
        `Ignored ${mapping.unmapped.length} column(s) that are not part of the employee schema: ${mapping.unmapped.join(", ")}.`,
      );
    }

    return NextResponse.json(
      {
        fileName: file.name,
        sheetName: sheet.name,
        recognisedColumns: CANONICAL_EMPLOYEE_COLUMNS.filter(
          (column) => mapping.mapping[column] !== undefined,
        ),
        unmappedColumns: mapping.unmapped,
        missingColumns: mapping.missing,
        totalRows: preview.totalRows,
        validRows: preview.validRows,
        invalidRows: preview.invalidRows,
        duplicateRows: preview.duplicateRows,
        ignoredRows: preview.ignoredRows,
        rows: preview.rows,
        notes,
        /** Bounded sample so the UI can render a preview table. */
        sample: preview.rows.slice(0, PREVIEW_ROW_LIMIT),
      },
      { status: 200 },
    );
  } catch (error) {
    return mapErrorToResponse(error, "POST /api/employees/import error");
  }
}

/**
 * GET /api/employees/import?format=xlsx
 *
 * A blank, correctly-headed workbook with exactly the eight canonical columns.
 */
export async function GET(req: NextRequest) {
  try {
    const { response } = await withEmployeeContext("employee:import");
    if (response) return response;

    const formatParam = new URL(req.url).searchParams.get("format");
    const format: ExportFormat = formatParam === "csv" ? "csv" : "xlsx";

    return await buildExportResponse(
      buildEmployeeTemplateRows(),
      EMPLOYEE_TEMPLATE_COLUMNS,
      format,
      "employee-import-template",
      "Employees",
    );
  } catch (error) {
    return mapErrorToResponse(
      error,
      "GET /api/employees/import/template error",
    );
  }
}

/**
 * PUT /api/employees/import
 *
 * Write the rows the user approved. The payload is re-validated against the
 * create schema and every Emp ID is re-checked against the register, so a
 * tampered preview cannot write anything that was not shown and verified, and
 * an existing employee is never overwritten.
 */
const commitSchema = z.object({
  /**
   * Carried through from the preview purely so the ImportJob records which file
   * produced these rows. Never trusted for anything else - the rows themselves
   * are re-validated below.
   */
  fileName: z.string().max(255).optional(),
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(MAX_IMPORT_ROWS),
});

export async function PUT(req: NextRequest) {
  try {
    const { response, context } =
      await withEmployeeMutationContext("employee:import");
    if (response) return response;
    const { user, organizationId } = context!;

    const { data, response: parseError } = await parseJsonBody(
      req,
      commitSchema,
    );
    if (parseError) return parseError;

    /**
     * `employeeNumber` is carried through so a failure can be traced back to a
     * specific person in the user's file, not just a row offset.
     */
    const failures: {
      index: number;
      employeeNumber?: string;
      message: string;
      code: string;
    }[] = [];

    const validated: { input: Record<string, unknown> }[] = [];
    const employeeNumbers = data.rows
      .map((row) =>
        typeof row.employeeNumber === "string" ? row.employeeNumber : "",
      )
      .filter((value) => value.length > 0);

    const existingNumbers = await findExistingEmployeeNumbers(
      organizationId,
      employeeNumbers,
    );

    data.rows.forEach((row, index) => {
      const candidate = { ...row };
      const employeeNumber =
        typeof candidate.employeeNumber === "string"
          ? candidate.employeeNumber.trim()
          : undefined;

      // Skip empty Emp ID rows if any were submitted
      if (!employeeNumber) {
        return;
      }

      // Default missing or empty name fields to "-"
      if (
        typeof candidate.firstname !== "string" ||
        candidate.firstname.trim() === ""
      ) {
        candidate.firstname = "-";
      }
      if (
        typeof candidate.lastname !== "string" ||
        candidate.lastname.trim() === ""
      ) {
        candidate.lastname = "-";
      }

      // Remove non-persisted score before Zod strict validation
      delete candidate.score;

      // Duplicate policy: an Emp ID that already exists is rejected, never
      // overwritten. The unique index is the final backstop.
      if (
        employeeNumber &&
        existingNumbers.has(employeeNumber.toLowerCase())
      ) {
        failures.push({
          index,
          employeeNumber,
          message: `Emp ID "${employeeNumber}" already exists in the register. Existing records are never overwritten by an import.`,
          code: "DUPLICATE",
        });
        return;
      }

      const parsed = createEmployeeSchema.safeParse(candidate);
      if (!parsed.success) {
        failures.push({
          index,
          employeeNumber,
          message: parsed.error.issues
            .map((i) => `${i.path.join(".") || "row"}: ${i.message}`)
            .join("; "),
          code: "VALIDATION",
        });
        return;
      }
      validated.push({ input: parsed.data as Record<string, unknown> });
    });

    const duplicateCount = failures.filter(
      (failure) => failure.code === "DUPLICATE",
    ).length;

    if (validated.length === 0) {
      // Nothing passed re-validation. Still recorded, so a failed attempt is
      // visible in the history rather than looking like it never happened.
      const job = await prisma.importJob.create({
        data: {
          userId: user.id!,
          entityType: "employee",
          fileName: data.fileName ?? "employee-import",
          fileSize: 0,
          totalRows: data.rows.length,
          processedRows: data.rows.length,
          successCount: 0,
          errorCount: failures.length,
          status: "failed",
          errors: failures.slice(0, MAX_REPORTED_ERRORS).map((f) => ({
            row: f.index + 1,
            error: f.employeeNumber
              ? `${f.employeeNumber}: ${f.message}`
              : f.message,
          })),
          startedAt: new Date(),
          completedAt: new Date(),
        },
      });

      return NextResponse.json(
        {
          jobId: job.id,
          imported: 0,
          skipped: 0,
          duplicates: duplicateCount,
          failed: failures,
        },
        { status: 422 },
      );
    }

    // Recorded as an ImportJob so the run appears in the /import page's Import
    // History alongside assets and houses. `entityType` is free text, and the
    // history table reads it back verbatim.
    const job = await prisma.importJob.create({
      data: {
        userId: user.id!,
        entityType: "employee",
        fileName: data.fileName ?? "employee-import",
        fileSize: 0,
        totalRows: data.rows.length,
        status: "processing",
        startedAt: new Date(),
      },
    });

    /**
     * Every write happens inside one transaction, in chunks, so a 4,000-row
     * workbook costs a bounded number of statements instead of four per row.
     * Each row that could not be written is reported against its own row, and
     * nothing is reported as imported until the transaction has committed.
     */
    const result = await bulkCreateEmployees({
      organizationId,
      actorId: user.id ?? null,
      rows: validated,
    });

    invalidateEmployeeCache();

    const allFailures = [...failures, ...result.failed].sort(
      (a, b) => a.index - b.index,
    );
    const imported = result.succeeded.length;
    const totalDuplicates =
      duplicateCount +
      allFailures.filter((failure) => failure.code === "DUPLICATE").length;

    // A run where nothing landed is "failed"; anything else is "completed" even
    // with per-row failures, because the rows that succeeded did land.
    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        processedRows: data.rows.length,
        successCount: imported,
        errorCount: allFailures.length,
        status: imported > 0 ? "completed" : "failed",
        errors:
          allFailures.length > 0
            ? allFailures.slice(0, MAX_REPORTED_ERRORS).map((f) => ({
                row: f.index + 1,
                error: f.employeeNumber
                  ? `${f.employeeNumber}: ${f.message}`
                  : f.message,
              }))
            : null,
        completedAt: new Date(),
      },
    });

    await createAuditLog({
      userId: user.id ?? null,
      action: AUDIT_ACTIONS.IMPORT,
      entity: AUDIT_ENTITIES.EMPLOYEE,
      entityId: job.id,
      details: {
        entityType: "employee",
        fileName: data.fileName ?? "employee-import",
        totalRows: data.rows.length,
        imported,
        errorCount: allFailures.length,
      },
    });

    return NextResponse.json(
      {
        jobId: job.id,
        imported,
        skipped: 0,
        duplicates: totalDuplicates,
        failed: allFailures,
      },
      { status: allFailures.length === 0 ? 200 : 207 },
    );
  } catch (error) {
    return mapErrorToResponse(error, "PUT /api/employees/import error");
  }
}

export const dynamic = "force-dynamic";

/**
 * A 4,000-row import is one request that writes 4,000 employees, so the
 * function is given the platform's full budget rather than the default.
 */
export const maxDuration = 300;
