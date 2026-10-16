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
  bulkOperateEmployees,
  invalidateEmployeeCache,
} from "@/lib/employees/service";
import {
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
import { MAX_IMPORT_ROWS } from "@/lib/employees/constants";
import {
  buildEmployeeTemplateRows,
  EMPLOYEE_TEMPLATE_COLUMNS,
} from "@/lib/employees/export";

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

    const buffer = Buffer.from(await file.arrayBuffer());

    let sheets: SheetData[];
    try {
      sheets = await parseWorkbook(buffer, file.name);
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

    const sheet = sheets[0];
    if (!sheet) {
      return NextResponse.json(
        { error: "The workbook contains no readable sheet." },
        { status: 400 },
      );
    }

    const { rows, mapping } = rowsFromSheet(sheet.headers, sheet.rows);
    if (Object.keys(mapping).length === 0) {
      return NextResponse.json(
        {
          error:
            "None of the column headers were recognised. Download the template to see the expected format.",
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
      rows: rows as EmployeeSpreadsheetRow[],
    });

    return NextResponse.json(
      {
        fileName: file.name,
        sheetName: sheet.name,
        recognisedColumns: Object.keys(mapping),
        unmappedColumns: sheet.headers.filter(
          (_, index) => !Object.values(mapping).includes(index),
        ),
        ...preview,
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
 * A blank, correctly-headed workbook. Department cells are pre-filled with two
 * real department names so the template shows the exact spelling the importer
 * matches on.
 */
export async function GET(req: NextRequest) {
  try {
    const { response, context } = await withEmployeeContext("employee:import");
    if (response) return response;
    const { organizationId } = context!;

    const formatParam = new URL(req.url).searchParams.get("format");
    const format: ExportFormat = formatParam === "csv" ? "csv" : "xlsx";

    const departments = await prisma.department.findMany({
      where: { organizationId },
      select: { name: true },
      orderBy: { name: "asc" },
      take: 2,
    });

    return await buildExportResponse(
      buildEmployeeTemplateRows(departments),
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
 * create schema and every department / manager reference is re-resolved against
 * the caller's organization, so a tampered preview cannot write anything that
 * was not shown and verified.
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

    const [departments, managers] = await Promise.all([
      prisma.department.findMany({
        where: { organizationId },
        select: { id: true },
      }),
      prisma.employee.findMany({
        where: { organizationId, deletedAt: null },
        select: { id: true },
      }),
    ]);
    const deptIds = new Set(departments.map((d) => d.id));
    const managerIds = new Set(managers.map((m) => m.id));

    const validated: { input: Record<string, unknown> }[] = [];
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

    data.rows.forEach((row, index) => {
      const candidate = { ...row };

      const employeeNumber =
        typeof candidate.employeeNumber === "string"
          ? candidate.employeeNumber
          : undefined;

      if (
        typeof candidate.departmentId === "string" &&
        candidate.departmentId
      ) {
        if (!deptIds.has(candidate.departmentId)) {
          failures.push({
            index,
            employeeNumber,
            message: "Department no longer exists in this organization.",
            code: "UNKNOWN_DEPARTMENT",
          });
          return;
        }
      }

      if (typeof candidate.managerId === "string" && candidate.managerId) {
        if (!managerIds.has(candidate.managerId)) {
          failures.push({
            index,
            employeeNumber,
            message: "Reporting manager no longer exists in this organization.",
            code: "UNKNOWN_MANAGER",
          });
          return;
        }
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
            error: f.message,
          })),
          startedAt: new Date(),
          completedAt: new Date(),
        },
      });

      return NextResponse.json(
        {
          jobId: job.id,
          imported: 0,
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

    const result = await bulkOperateEmployees({
      organizationId,
      actorId: user.id ?? null,
      operation: "create",
      rows: validated,
    });

    invalidateEmployeeCache();

    const allFailures = [...failures, ...result.failed].sort(
      (a, b) => a.index - b.index,
    );
    const imported = result.succeeded.length;

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
        failed: allFailures,
      },
      { status: allFailures.length === 0 ? 200 : 207 },
    );
  } catch (error) {
    return mapErrorToResponse(error, "PUT /api/employees/import error");
  }
}

export const dynamic = "force-dynamic";
