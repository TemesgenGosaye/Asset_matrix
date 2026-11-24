import ExcelJS from "exceljs";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  MASTER_LIST_COLUMNS,
  mapMasterListRow,
  normalizeDepartmentAlias,
  normalizeText,
  type CellValue,
  type MasterListColumn,
  type MasterListRow,
  type ParsedMasterListRow,
} from "@/lib/fixed-asset-register";

export const MAX_FIXED_ASSET_IMPORT_BYTES = 20 * 1024 * 1024;
export const MAX_FIXED_ASSET_IMPORT_ROWS = 25_000;
const PREVIEW_ROW_LIMIT = 8;

interface FixedAssetWorkbookRow {
  rowNumber: number;
  parsed: ParsedMasterListRow;
  raw: MasterListRow;
}

interface FixedAssetWorkbook {
  sheets: string[];
  sheetName: string;
  headers: string[];
  rows: FixedAssetWorkbookRow[];
  preview: FixedAssetWorkbookRow[];
  summary: {
    totalRows: number;
    errorRows: number;
    warningRows: number;
    duplicatePropertyNumbers: number;
  };
}

interface FixedAssetLookups {
  aliasMap: Map<string, string>;
  departmentByName: Map<string, string>;
  statusByName: Map<string, string>;
  locationByName: Map<string, string>;
  categoryByCode: Map<string, string>;
}

export interface FixedAssetImportOptions {
  organizationId: string;
  userId: string;
  fileName: string;
  fileSize: number;
  sheetName: string;
  headerRow: number;
  mode: "dry-run" | "commit";
}

export interface FixedAssetImportResult {
  batchId: string | null;
  totalRows: number;
  successCount: number;
  errorCount: number;
  skippedCount: number;
  results: {
    rowNumber: number;
    status: string;
    action: string | null;
    propertyKey: string | null;
    warnings: string[];
    errors: string[];
  }[];
}

const HEADER_ALIASES: Record<string, MasterListColumn> = {
  no: "No.",
  department: "Department",
  categorycode: "Category Code",
  sno: "S.No",
  description: "Description",
  propertyno: "Property No",
  propertynumber: "Property No",
  financeno1st: "Finance No (1st)",
  condition1st: "Condition (1st)",
  location1st: "Location (1st)",
  reviewdate1st: "Review Date (1st)",
  financeno2nd: "Finance No (2nd)",
  condition2nd: "Condition (2nd)",
  location2nd: "Location (2nd)",
  reviewdate2nd: "Review Date (2nd)",
  additionaldata: "Additional Data",
  sourcerow: "Source Row",
  hiddeninsource: "Hidden in Source",
};

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function cellToValue(value: unknown): CellValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value !== "object") return value as CellValue;
  const candidate = value as {
    text?: unknown;
    result?: unknown;
    richText?: { text?: string }[];
  };
  if (typeof candidate.text === "string") return candidate.text;
  if (candidate.result !== undefined) return cellToValue(candidate.result);
  if (Array.isArray(candidate.richText)) {
    return candidate.richText.map((part) => part.text ?? "").join("");
  }
  return String(value);
}

export function suggestFixedAssetMappings(
  headers: string[],
): Record<MasterListColumn, number | null> {
  const mappings = Object.fromEntries(
    MASTER_LIST_COLUMNS.map((column) => [column, null]),
  ) as Record<MasterListColumn, number | null>;
  headers.forEach((header, index) => {
    const mapped = HEADER_ALIASES[normalizeHeader(header)];
    if (mapped && mappings[mapped] === null) mappings[mapped] = index;
  });
  return mappings;
}

export async function parseFixedAssetWorkbook(
  buffer: Buffer,
  sheetName?: string | null,
  headerRow = 1,
): Promise<FixedAssetWorkbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );
  const sheets = workbook.worksheets.map((sheet) => sheet.name);
  const selected =
    (sheetName && workbook.getWorksheet(sheetName)) ||
    workbook.getWorksheet("Master List") ||
    workbook.worksheets[0];
  if (!selected) throw new Error("Workbook has no worksheets");

  const headerValues: string[] = [];
  selected
    .getRow(headerRow)
    .eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      headerValues[columnNumber - 1] = normalizeText(cellToValue(cell.value));
    });
  const headers = headerValues.map(
    (value, index) => value || `Column ${index + 1}`,
  );
  const columnMap: Map<MasterListColumn, number> = new Map();
  headers.forEach((header, index) => {
    const mapped = HEADER_ALIASES[normalizeHeader(header)];
    if (mapped && !columnMap.has(mapped)) columnMap.set(mapped, index);
  });

  const rows: FixedAssetWorkbookRow[] = [];
  let duplicatePropertyNumbers = 0;
  const seenKeys = new Set<string>();
  selected.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= headerRow || rows.length >= MAX_FIXED_ASSET_IMPORT_ROWS)
      return;
    const raw: MasterListRow = {};
    for (const [column, index] of columnMap) {
      raw[column] = cellToValue(row.getCell(index + 1).value);
    }
    const parsed = mapMasterListRow(raw, rowNumber);
    if (parsed.propertyKey) {
      if (seenKeys.has(parsed.propertyKey)) {
        duplicatePropertyNumbers += 1;
        parsed.errors.push("Duplicate Property No in file");
      } else {
        seenKeys.add(parsed.propertyKey);
      }
    }
    rows.push({ rowNumber, parsed, raw });
  });

  return {
    sheets,
    sheetName: selected.name,
    headers,
    rows,
    preview: rows.slice(0, PREVIEW_ROW_LIMIT),
    summary: {
      totalRows: rows.length,
      errorRows: rows.filter((row) => row.parsed.errors.length > 0).length,
      warningRows: rows.filter((row) => row.parsed.warnings.length > 0).length,
      duplicatePropertyNumbers,
    },
  };
}

async function buildLookups(
  organizationId: string,
): Promise<FixedAssetLookups> {
  const [aliases, departments, statuses, locations, categories] =
    await Promise.all([
      prisma.departmentAlias.findMany({
        where: { organizationId },
        select: { normalizedAlias: true, departmentId: true },
      }),
      prisma.department.findMany({
        where: { organizationId },
        select: { id: true, name: true, code: true },
      }),
      prisma.statusType.findMany({
        where: { OR: [{ organizationId }, { organizationId: null }] },
        select: { statustypeid: true, statustypename: true },
      }),
      prisma.location.findMany({
        where: { OR: [{ organizationId }, { organizationId: null }] },
        select: { locationid: true, locationname: true },
      }),
      prisma.assetCategoryType.findMany({
        where: { OR: [{ organizationId }, { organizationId: null }] },
        select: {
          assetcategorytypeid: true,
          assetTypeCode: true,
          assetcategorytypename: true,
        },
      }),
    ]);

  return {
    aliasMap: new Map(
      aliases
        .filter((alias) => alias.departmentId)
        .map((alias) => [alias.normalizedAlias, alias.departmentId as string]),
    ),
    departmentByName: new Map(
      departments.flatMap((department) => {
        const entries: [string, string][] = [
          [department.name.toLowerCase(), department.id],
        ];
        if (department.code)
          entries.push([department.code.toLowerCase(), department.id]);
        return entries;
      }),
    ),
    statusByName: new Map(
      statuses.map((status) => [
        status.statustypename.toLowerCase(),
        status.statustypeid,
      ]),
    ),
    locationByName: new Map(
      locations.map((location) => [
        location.locationname.toLowerCase(),
        location.locationid,
      ]),
    ),
    categoryByCode: new Map(
      categories.flatMap((category) => {
        const entries: [string, string][] = [
          [
            category.assetcategorytypename.toLowerCase(),
            category.assetcategorytypeid,
          ],
        ];
        if (category.assetTypeCode) {
          entries.push([
            category.assetTypeCode.toLowerCase(),
            category.assetcategorytypeid,
          ]);
        }
        return entries;
      }),
    ),
  };
}

function resolveRelations(
  parsed: ParsedMasterListRow,
  lookups: FixedAssetLookups,
  warnings: string[],
) {
  const normalizedDepartment = parsed.normalizedDepartment;
  const departmentId =
    lookups.aliasMap.get(normalizedDepartment) ??
    lookups.departmentByName.get(normalizedDepartment) ??
    lookups.departmentByName.get(parsed.sourceDepartment.toLowerCase());
  if (!departmentId && parsed.sourceDepartment) {
    warnings.push(`Department not mapped: ${parsed.sourceDepartment}`);
  }

  const condition2 = normalizeText(
    parsed.condition2Raw || parsed.condition1Raw || parsed.condition1,
  );
  const statustypeid = condition2
    ? lookups.statusByName.get(condition2.toLowerCase())
    : undefined;

  const locationText = normalizeText(parsed.location2Raw || parsed.location1);
  const locationid = locationText
    ? lookups.locationByName.get(locationText.toLowerCase())
    : undefined;

  const assetcategorytypeid = parsed.categoryCode
    ? lookups.categoryByCode.get(parsed.categoryCode.toLowerCase())
    : undefined;

  return { departmentId, statustypeid, locationid, assetcategorytypeid };
}

function toCreateData(
  parsed: ParsedMasterListRow,
  relations: ReturnType<typeof resolveRelations>,
  organizationId: string,
): Prisma.assetUncheckedCreateInput {
  return {
    assetname: parsed.assetname,
    assettag: parsed.propertyNo,
    serialnumber: parsed.propertyNo,
    organizationId,
    creation_date: new Date(),
    departmentId: relations.departmentId ?? null,
    departmentCode: null,
    assetcategorytypeid: relations.assetcategorytypeid ?? null,
    statustypeid: relations.statustypeid ?? null,
    locationid: relations.locationid ?? null,
    categoryCode: parsed.categoryCode,
    serialNo: parsed.serialNo,
    assetnameRaw: parsed.assetnameRaw,
    propertyKey: parsed.propertyKey,
    financeNo1: parsed.financeNo1,
    condition1: parsed.condition1,
    condition1Raw: parsed.condition1Raw,
    location1: parsed.location1,
    reviewDate1: parsed.reviewDate1,
    reviewDate1Raw: parsed.reviewDate1Raw,
    reviewDate1Ambiguous: parsed.reviewDate1Ambiguous,
    financeNo2: parsed.financeNo2,
    condition2Raw: parsed.condition2Raw,
    location2Raw: parsed.location2Raw,
    reviewDate2Raw: parsed.reviewDate2Raw,
    reviewDate2Ambiguous: parsed.reviewDate2Ambiguous,
    additionalData: parsed.additionalData,
    additionalDataJson: parsed.additionalDataJson,
    sourceRow: parsed.sourceRow,
    hiddenInSource: parsed.hiddenInSource,
  };
}

function toUpdateData(
  parsed: ParsedMasterListRow,
  relations: ReturnType<typeof resolveRelations>,
): Prisma.assetUncheckedUpdateInput {
  return {
    departmentId: relations.departmentId ?? null,
    assetcategorytypeid: relations.assetcategorytypeid ?? null,
    statustypeid: relations.statustypeid ?? null,
    locationid: relations.locationid ?? null,
    categoryCode: parsed.categoryCode,
    serialNo: parsed.serialNo,
    assetnameRaw: parsed.assetnameRaw,
    propertyKey: parsed.propertyKey,
    financeNo1: parsed.financeNo1,
    condition1: parsed.condition1,
    condition1Raw: parsed.condition1Raw,
    location1: parsed.location1,
    reviewDate1: parsed.reviewDate1,
    reviewDate1Raw: parsed.reviewDate1Raw,
    reviewDate1Ambiguous: parsed.reviewDate1Ambiguous,
    financeNo2: parsed.financeNo2,
    condition2Raw: parsed.condition2Raw,
    location2Raw: parsed.location2Raw,
    reviewDate2Raw: parsed.reviewDate2Raw,
    reviewDate2Ambiguous: parsed.reviewDate2Ambiguous,
    additionalData: parsed.additionalData,
    additionalDataJson: parsed.additionalDataJson,
    sourceRow: parsed.sourceRow,
    hiddenInSource: parsed.hiddenInSource,
    change_date: new Date(),
  };
}

function jsonSafe(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (typeof (value as { toJSON?: () => unknown }).toJSON === "function") {
    return jsonSafe((value as { toJSON: () => unknown }).toJSON());
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      jsonSafe(item),
    ]),
  );
}

export async function commitFixedAssetImport(
  workbook: FixedAssetWorkbook,
  options: FixedAssetImportOptions,
): Promise<FixedAssetImportResult> {
  const lookups = await buildLookups(options.organizationId);
  const result: FixedAssetImportResult = {
    batchId: null,
    totalRows: workbook.rows.length,
    successCount: 0,
    errorCount: 0,
    skippedCount: 0,
    results: [],
  };

  await prisma.$transaction(
    async (tx) => {
      const job = await tx.importJob.create({
        data: {
          userId: options.userId,
          entityType: "fixed_asset_register",
          fileName: options.fileName,
          fileSize: options.fileSize,
          totalRows: workbook.rows.length,
          status: "running",
          startedAt: new Date(),
          organizationId: options.organizationId,
          fileHash: null,
          mode: options.mode,
          options: {
            sheetName: workbook.sheetName,
            headerRow: options.headerRow,
          },
        },
      });
      result.batchId = job.id;

      for (const row of workbook.rows) {
        const parsed = row.parsed;
        const warnings = [...parsed.warnings];
        const relations = resolveRelations(parsed, lookups, warnings);
        let status = "new";
        let action: string | null = "create";
        let assetId: string | null = null;
        let previousValues: Record<string, unknown> | null = null;

        if (parsed.errors.length) {
          status = "error";
          action = null;
        } else {
          const existing = await tx.asset.findFirst({
            where: {
              organizationId: options.organizationId,
              OR: [
                { serialnumber: parsed.propertyNo },
                { propertyKey: parsed.propertyKey },
              ],
            },
            select: {
              assetid: true,
              assetname: true,
              serialnumber: true,
              propertyKey: true,
              departmentId: true,
              categoryCode: true,
              condition1: true,
              location1: true,
              reviewDate1: true,
              financeNo1: true,
              financeNo2: true,
              additionalData: true,
              hiddenInSource: true,
            },
          });
          if (existing && existing.serialnumber !== parsed.propertyNo) {
            status = "error";
            action = null;
            parsed.errors.push("Property No conflicts with an existing asset");
          } else if (existing) {
            status = "update";
            action = "update";
            assetId = existing.assetid;
            previousValues = Object.fromEntries(
              Object.entries(existing).map(([key, value]) => [
                key,
                jsonSafe(value),
              ]),
            );
            await tx.asset.update({
              where: { assetid: existing.assetid },
              data: toUpdateData(parsed, relations),
            });
          } else {
            const created = await tx.asset.create({
              data: toCreateData(parsed, relations, options.organizationId),
              select: { assetid: true },
            });
            assetId = created.assetid;
          }
        }

        if (status === "error") result.errorCount += 1;
        else if (status === "update") result.successCount += 1;
        else if (status === "new") result.successCount += 1;
        else result.skippedCount += 1;

        await tx.importRowResult.create({
          data: {
            batchId: job.id,
            organizationId: options.organizationId,
            sheet: workbook.sheetName,
            rowNumber: row.rowNumber,
            status,
            action,
            matchKey: "propertyNo",
            assetId,
            propertyKey: parsed.propertyKey,
            warnings,
            errors: parsed.errors,
            diff: parsed.errors.length
              ? undefined
              : (jsonSafe(parsed) as Prisma.InputJsonValue),
            previousValues: previousValues
              ? (jsonSafe(previousValues) as Prisma.InputJsonValue)
              : null,
            raw: jsonSafe(row.raw) as Prisma.InputJsonValue,
          },
        });
        result.results.push({
          rowNumber: row.rowNumber,
          status,
          action,
          propertyKey: parsed.propertyKey,
          warnings,
          errors: parsed.errors,
        });
      }

      await tx.importJob.update({
        where: { id: job.id },
        data: {
          status: result.errorCount ? "completed_with_errors" : "completed",
          processedRows: workbook.rows.length,
          successCount: result.successCount,
          errorCount: result.errorCount,
          completedAt: new Date(),
          finishedAt: new Date(),
        },
      });
    },
    { maxWait: 10_000, timeout: 600_000 },
  );

  return result;
}

export async function rollbackFixedAssetImport(
  batchId: string,
  organizationId: string,
  userId: string,
): Promise<{ restored: number }> {
  const job = await prisma.importJob.findFirst({
    where: { id: batchId, entityType: "fixed_asset_register", organizationId },
    select: { id: true, status: true },
  });
  if (!job) throw new Error("Import batch not found");
  if (job.status === "rolled_back")
    throw new Error("Import batch already rolled back");

  const rows = await prisma.importRowResult.findMany({
    where: { batchId, previousValues: { not: null } },
    select: { assetId: true, previousValues: true },
  });

  await prisma.$transaction(
    async (tx) => {
      for (const row of rows) {
        if (!row.assetId || !row.previousValues) continue;
        const previous = row.previousValues as Record<string, unknown>;
        const data: Record<string, unknown> = {};
        for (const field of [
          "assetname",
          "serialnumber",
          "departmentId",
          "categoryCode",
          "condition1",
          "location1",
          "reviewDate1",
          "financeNo1",
          "financeNo2",
          "additionalData",
          "hiddenInSource",
        ]) {
          if (previous[field] !== undefined) data[field] = previous[field];
        }
        await tx.asset.update({
          where: { assetid: row.assetId },
          data: data as Prisma.assetUncheckedUpdateInput,
        });
      }
      await tx.importJob.update({
        where: { id: batchId },
        data: { status: "rolled_back", finishedAt: new Date() },
      });
      await tx.audit_logs.create({
        data: {
          userId,
          action: "asset.register.rollback",
          entity: "import_job",
          entityId: batchId,
          details: JSON.stringify({ restored: rows.length }),
        },
      });
    },
    { maxWait: 10_000, timeout: 600_000 },
  );

  return { restored: rows.length };
}

export async function generateFixedAssetTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Master List");
  sheet.addRow([...MASTER_LIST_COLUMNS]);
  sheet.getRow(1).font = { bold: true };
  sheet.addRow([
    1,
    "Department",
    "6.1",
    "1",
    "Sample asset",
    "PROP-0001",
    "old.ma",
    "Good",
    "Store",
    "01/01/2025",
    "8.3.5-883",
    "Good",
    "Store",
    "01/01/2026",
    "[House No] 12",
    2,
    "No",
  ]);
  sheet.columns.forEach((column) => {
    column.width = 18;
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
