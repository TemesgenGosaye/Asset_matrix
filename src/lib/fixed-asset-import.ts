import ExcelJS from "exceljs";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  MASTER_LIST_COLUMNS,
  mapMasterListRow,
  normalizeDepartmentAlias,
  normalizePropertyKey,
  normalizeText,
  type CellValue,
  type MasterListColumn,
  type MasterListRow,
  type ParsedMasterListRow,
} from "@/lib/fixed-asset-register";

export const MAX_FIXED_ASSET_IMPORT_BYTES = 20 * 1024 * 1024;
export const MAX_FIXED_ASSET_IMPORT_ROWS = 25_000;
const PREVIEW_ROW_LIMIT = 8;
const DUPLICATE_WARNING = "Duplicate Property No in file";
const CHUNK_SIZE = 500;

export type FixedAssetErrorHandling = "skip" | "abort" | "flag";
export type FixedAssetDuplicatePolicy = "flag" | "skip" | "update";

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
  errorHandling?: FixedAssetErrorHandling;
  duplicatePolicy?: FixedAssetDuplicatePolicy;
  fileHash?: string | null;
}

export interface FixedAssetImportPlan {
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

export interface FixedAssetImportProgress {
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
  plan: FixedAssetImportPlan;
}

export interface FixedAssetImportResult extends FixedAssetImportProgress {
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

const HEADER_ALIASES: Record<string, MasterListColumn> = {
  no: "No.",
  department: "Department",
  dept: "Dept",
  categorycode: "Category Code",
  sno: "S.No",
  sn0: "S/N0",
  description: "Description",
  propertyno: "Property No",
  propertynumber: "Property No",
  financeno: "Finance No",
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
        parsed.warnings.push(DUPLICATE_WARNING);
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

export function normalizeErrorHandling(
  value: unknown,
): FixedAssetErrorHandling {
  return value === "abort" || value === "flag" ? value : "skip";
}

export function normalizeDuplicatePolicy(
  value: unknown,
): FixedAssetDuplicatePolicy {
  return value === "skip" || value === "update" ? value : "flag";
}

const existingAssetSelect = {
  assetid: true,
  assetname: true,
  serialnumber: true,
  assettag: true,
  sourceDepartment: true,
  departmentId: true,
  categoryCode: true,
  serialNo: true,
  assetnameRaw: true,
  propertyKey: true,
  financeNo: true,
  condition1: true,
  condition1Raw: true,
  location1: true,
  reviewDate1: true,
  reviewDate1Raw: true,
  reviewDate1Ambiguous: true,
  condition2Raw: true,
  location2Raw: true,
  reviewDate2Raw: true,
  reviewDate2Ambiguous: true,
  additionalData: true,
  additionalDataJson: true,
  sourceRow: true,
  hiddenInSource: true,
} satisfies Prisma.assetSelect;

async function findExistingAssets(
  organizationId: string,
  keys: string[],
): Promise<
  Map<string, Prisma.assetGetPayload<{ select: typeof existingAssetSelect }>>
> {
  const uniqueKeys = [...new Set(keys.filter(Boolean))];
  const found = new Map<
    string,
    Prisma.assetGetPayload<{ select: typeof existingAssetSelect }>
  >();
  for (let index = 0; index < uniqueKeys.length; index += 1000) {
    const slice = uniqueKeys.slice(index, index + 1000);
    const assets = await prisma.asset.findMany({
      where: {
        organizationId,
        OR: [{ serialnumber: { in: slice } }, { propertyKey: { in: slice } }],
      },
      select: existingAssetSelect,
    });
    for (const asset of assets) {
      found.set(normalizePropertyKey(asset.serialnumber), asset);
      if (asset.propertyKey) found.set(asset.propertyKey.toUpperCase(), asset);
    }
  }
  return found;
}

function comparableValue(value: unknown): unknown {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const candidate = value as {
      toNumber?: () => number;
      toJSON?: () => unknown;
    };
    if (typeof candidate.toNumber === "function") return candidate.toNumber();
    return JSON.stringify(jsonSafe(value));
  }
  return value;
}

function isUnchanged(
  existing: Record<string, unknown>,
  updateData: Record<string, unknown>,
): boolean {
  return Object.entries(updateData).every(([key, value]) => {
    if (key === "change_date") return true;
    return comparableValue(existing[key]) === comparableValue(value);
  });
}

export async function buildFixedAssetImportPlan(
  workbook: FixedAssetWorkbook,
  options: Pick<
    FixedAssetImportOptions,
    "organizationId" | "errorHandling" | "duplicatePolicy"
  >,
): Promise<FixedAssetImportPlan> {
  const errorHandling = normalizeErrorHandling(options.errorHandling);
  const duplicatePolicy = normalizeDuplicatePolicy(options.duplicatePolicy);
  const plan: FixedAssetImportPlan = {
    total: workbook.rows.length,
    create: 0,
    update: 0,
    unchanged: 0,
    skip: 0,
    flag: 0,
    failed: 0,
    duplicate: workbook.summary.duplicatePropertyNumbers,
    importable: 0,
  };

  if (errorHandling === "abort" && workbook.summary.errorRows > 0) {
    plan.failed = workbook.summary.errorRows;
    return plan;
  }

  const lookups = await buildLookups(options.organizationId);
  const existing = await findExistingAssets(
    options.organizationId,
    workbook.rows.flatMap((row) => [
      row.parsed.propertyKey,
      row.parsed.propertyNo,
    ]),
  );

  for (const row of workbook.rows) {
    if (row.parsed.errors.length > 0) {
      if (errorHandling === "flag") plan.flag += 1;
      else plan.skip += 1;
      continue;
    }
    const duplicate = row.parsed.warnings.includes(DUPLICATE_WARNING);
    if (duplicate && duplicatePolicy === "skip") {
      plan.skip += 1;
      continue;
    }
    if (duplicate && duplicatePolicy === "flag") {
      plan.flag += 1;
      continue;
    }
    const match =
      existing.get(row.parsed.propertyKey.toUpperCase()) ??
      existing.get(normalizePropertyKey(row.parsed.propertyNo));
    if (!match) {
      plan.create += 1;
      continue;
    }
    const updateData = toUpdateData(
      row.parsed,
      resolveRelations(row.parsed, lookups, []),
    );
    if (isUnchanged(match as unknown as Record<string, unknown>, updateData)) {
      plan.unchanged += 1;
    } else {
      plan.update += 1;
    }
  }

  plan.importable = plan.create + plan.update + plan.unchanged + plan.flag;
  return plan;
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

  const condition1Text = normalizeText(
    parsed.condition1Raw || parsed.condition1,
  );
  const condition1StatusId = condition1Text
    ? lookups.statusByName.get(condition1Text.toLowerCase())
    : undefined;
  if (!condition1StatusId && condition1Text) {
    warnings.push(`Condition (1st) not in master list: ${condition1Text}`);
  }

  const condition2 = normalizeText(parsed.condition2Raw);
  const statustypeid = condition2
    ? lookups.statusByName.get(condition2.toLowerCase())
    : undefined;
  if (!statustypeid && condition2) {
    warnings.push(`Condition (2nd) not in master list: ${condition2}`);
  }

  const location1Text = normalizeText(parsed.location1);
  const location1Id = location1Text
    ? lookups.locationByName.get(location1Text.toLowerCase())
    : undefined;
  if (!location1Id && location1Text) {
    warnings.push(`Location (1st) not in master list: ${location1Text}`);
  }

  const location2Text = normalizeText(parsed.location2Raw);
  const locationid = location2Text
    ? lookups.locationByName.get(location2Text.toLowerCase())
    : undefined;
  if (!locationid && location2Text) {
    warnings.push(`Location (2nd) not in master list: ${location2Text}`);
  }

  const assetcategorytypeid = parsed.categoryCode
    ? lookups.categoryByCode.get(parsed.categoryCode.toLowerCase())
    : undefined;
  if (!assetcategorytypeid && parsed.categoryCode) {
    warnings.push(`Category code not in master list: ${parsed.categoryCode}`);
  }

  return {
    departmentId,
    condition1StatusId,
    statustypeid,
    location1Id,
    locationid,
    assetcategorytypeid,
  };
}

function toCreateData(
  parsed: ParsedMasterListRow,
  relations: ReturnType<typeof resolveRelations>,
  organizationId: string,
  storageKey = parsed.propertyNo,
): Prisma.assetUncheckedCreateInput {
  return {
    assetname: parsed.assetname,
    assettag: storageKey,
    serialnumber: storageKey,
    organizationId,
    creation_date: new Date(),
    sourceDepartment: parsed.sourceDepartment || null,
    departmentId: relations.departmentId ?? null,
    departmentCode: null,
    assetcategorytypeid: relations.assetcategorytypeid ?? null,
    statustypeid: relations.statustypeid ?? null,
    condition1StatusId: relations.condition1StatusId ?? null,
    locationid: relations.locationid ?? null,
    location1Id: relations.location1Id ?? null,
    categoryCode: parsed.categoryCode,
    serialNo: parsed.serialNo,
    assetnameRaw: parsed.assetnameRaw,
    propertyKey: parsed.propertyKey,
    financeNo: parsed.financeNo,
    condition1: parsed.condition1,
    condition1Raw: parsed.condition1Raw,
    location1: parsed.location1,
    reviewDate1: parsed.reviewDate1,
    reviewDate1Raw: parsed.reviewDate1Raw,
    reviewDate1Ambiguous: parsed.reviewDate1Ambiguous,
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
  const data: Prisma.assetUncheckedUpdateInput = {
    sourceDepartment: parsed.sourceDepartment || null,
    departmentId: relations.departmentId ?? null,
    assetcategorytypeid: relations.assetcategorytypeid ?? null,
    statustypeid: relations.statustypeid ?? null,
    condition1StatusId: relations.condition1StatusId ?? null,
    locationid: relations.locationid ?? null,
    location1Id: relations.location1Id ?? null,
    categoryCode: parsed.categoryCode,
    serialNo: parsed.serialNo,
    assetnameRaw: parsed.assetnameRaw,
    propertyKey: parsed.propertyKey,
    financeNo: parsed.financeNo,
    condition1: parsed.condition1,
    condition1Raw: parsed.condition1Raw,
    location1: parsed.location1,
    reviewDate1: parsed.reviewDate1,
    reviewDate1Raw: parsed.reviewDate1Raw,
    reviewDate1Ambiguous: parsed.reviewDate1Ambiguous,
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
  return Object.fromEntries(
    Object.entries(data).filter(
      ([key, value]) =>
        key === "change_date" ||
        (value !== null && value !== undefined && value !== ""),
    ),
  ) as Prisma.assetUncheckedUpdateInput;
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

interface StoredImportCounts {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  flagged: number;
  failed: number;
}

interface StoredImportState {
  sheetName: string;
  headerRow: number;
  fileHash: string | null;
  errorHandling: FixedAssetErrorHandling;
  duplicatePolicy: FixedAssetDuplicatePolicy;
  plan: FixedAssetImportPlan;
  counts: StoredImportCounts;
}

function emptyCounts(): StoredImportCounts {
  return {
    created: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    flagged: 0,
    failed: 0,
  };
}

function storedState(value: unknown): StoredImportState {
  const state = value as Partial<StoredImportState>;
  return {
    sheetName: state.sheetName ?? "Master List",
    headerRow: state.headerRow ?? 1,
    fileHash: state.fileHash ?? null,
    errorHandling: normalizeErrorHandling(state.errorHandling),
    duplicatePolicy: normalizeDuplicatePolicy(state.duplicatePolicy),
    plan: state.plan ?? {
      total: 0,
      create: 0,
      update: 0,
      unchanged: 0,
      skip: 0,
      flag: 0,
      failed: 0,
      duplicate: 0,
      importable: 0,
    },
    counts: { ...emptyCounts(), ...(state.counts ?? {}) },
  };
}

function progressFromJob(job: {
  id: string;
  status: string;
  totalRows: number;
  processedRows: number;
  successCount: number;
  errorCount: number;
  startedAt: Date | null;
  options: unknown;
}): FixedAssetImportProgress {
  const state = storedState(job.options);
  const elapsed = job.startedAt
    ? Math.max((Date.now() - job.startedAt.getTime()) / 1000, 0.001)
    : 0.001;
  const rowsPerSecond = Math.round(job.processedRows / elapsed);
  const remaining = Math.max(job.totalRows - job.processedRows, 0);
  return {
    batchId: job.id,
    status: job.status,
    totalRows: job.totalRows,
    processedRows: job.processedRows,
    createdCount: state.counts.created,
    updatedCount: state.counts.updated,
    unchangedCount: state.counts.unchanged,
    skippedCount: state.counts.skipped,
    flaggedCount: state.counts.flagged,
    failedCount: state.counts.failed,
    rowsPerSecond,
    etaSeconds: rowsPerSecond > 0 ? Math.ceil(remaining / rowsPerSecond) : null,
    done: [
      "completed",
      "completed_with_errors",
      "cancelled",
      "rolled_back",
      "aborted",
    ].includes(job.status),
    plan: state.plan,
  };
}

export async function createFixedAssetImportJob(
  workbook: FixedAssetWorkbook,
  options: FixedAssetImportOptions,
): Promise<{
  batchId: string;
  plan: FixedAssetImportPlan;
  reused: boolean;
  progress: FixedAssetImportProgress;
}> {
  const errorHandling = normalizeErrorHandling(options.errorHandling);
  const duplicatePolicy = normalizeDuplicatePolicy(options.duplicatePolicy);
  const fileHash = options.fileHash ?? null;

  if (fileHash) {
    const existing = await prisma.importJob.findFirst({
      where: {
        entityType: "fixed_asset_register",
        organizationId: options.organizationId,
        fileHash,
        status: {
          in: ["pending", "running", "completed", "completed_with_errors"],
        },
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      return {
        batchId: existing.id,
        plan: storedState(existing.options).plan,
        reused: true,
        progress: progressFromJob(existing),
      };
    }
  }

  const plan = await buildFixedAssetImportPlan(workbook, {
    organizationId: options.organizationId,
    errorHandling,
    duplicatePolicy,
  });
  const job = await prisma.importJob.create({
    data: {
      userId: options.userId,
      entityType: "fixed_asset_register",
      fileName: options.fileName,
      fileSize: options.fileSize,
      totalRows: workbook.rows.length,
      status: plan.importable > 0 ? "pending" : "completed",
      startedAt: plan.importable > 0 ? new Date() : null,
      organizationId: options.organizationId,
      fileHash,
      mode: options.mode,
      options: jsonSafe({
        sheetName: workbook.sheetName,
        headerRow: options.headerRow,
        fileHash,
        errorHandling,
        duplicatePolicy,
        plan,
        counts: emptyCounts(),
      } satisfies StoredImportState) as Prisma.InputJsonValue,
    },
  });

  await prisma.importRowResult.createMany({
    data: workbook.rows.map((row) => ({
      batchId: job.id,
      organizationId: options.organizationId,
      sheet: workbook.sheetName,
      rowNumber: row.rowNumber,
      status: "pending",
      action: null,
      matchKey: "propertyNo",
      propertyKey: row.parsed.propertyKey,
      warnings: jsonSafe(row.parsed.warnings) as Prisma.InputJsonValue,
      errors: jsonSafe(row.parsed.errors) as Prisma.InputJsonValue,
      diff: jsonSafe(row.parsed) as Prisma.InputJsonValue,
      raw: jsonSafe(row.raw) as Prisma.InputJsonValue,
    })),
  });

  return {
    batchId: job.id,
    plan,
    reused: false,
    progress: progressFromJob(job),
  };
}

export async function processFixedAssetImportChunk(
  batchId: string,
  organizationId: string,
): Promise<FixedAssetImportProgress> {
  const job = await prisma.importJob.findFirst({
    where: {
      id: batchId,
      entityType: "fixed_asset_register",
      organizationId,
    },
  });
  if (!job) throw new Error("Import batch not found");
  if (["cancelled", "rolled_back", "aborted"].includes(job.status)) {
    return progressFromJob(job);
  }

  const state = storedState(job.options);
  const rows = await prisma.importRowResult.findMany({
    where: { batchId, status: "pending" },
    orderBy: { rowNumber: "asc" },
    take: CHUNK_SIZE,
  });

  const counts = { ...state.counts };
  let aborted = false;

  if (!rows.length) {
    const finished = await prisma.importJob.update({
      where: { id: batchId },
      data: {
        status: aborted
          ? "aborted"
          : counts.failed > 0
            ? "completed_with_errors"
            : "completed",
        completedAt: new Date(),
        finishedAt: new Date(),
      },
    });
    return progressFromJob(finished);
  }

  const lookups = await buildLookups(organizationId);

  await prisma.$transaction(
    async (tx) => {
      for (const row of rows) {
        if (aborted) {
          await tx.importRowResult.update({
            where: { id: row.id },
            data: {
              status: "skipped",
              action: null,
              warnings: jsonSafe([
                "Import aborted due to an earlier error",
              ]) as Prisma.InputJsonValue,
            },
          });
          counts.skipped += 1;
          continue;
        }
        const parsed = mapMasterListRow(
          (row.raw ?? {}) as MasterListRow,
          row.rowNumber,
        );
        parsed.warnings = (row.warnings as string[]) ?? [];
        parsed.errors = (row.errors as string[]) ?? [];
        const warnings = [...parsed.warnings];
        const relations = resolveRelations(parsed, lookups, warnings);
        const duplicate = warnings.includes(DUPLICATE_WARNING);
        const hasErrors = parsed.errors.length > 0;
        let status = "new";
        let action: string | null = "create";
        let assetId: string | null = null;
        let previousValues: Record<string, unknown> | null = null;
        let storageKey = parsed.propertyNo;

        if (hasErrors && state.errorHandling === "abort") {
          status = "failed";
          action = null;
          aborted = true;
        } else if (hasErrors && state.errorHandling === "skip") {
          status = "skipped";
          action = null;
        } else if (duplicate && state.duplicatePolicy === "skip") {
          status = "skipped";
          action = null;
        } else {
          const duplicateFlag = duplicate && state.duplicatePolicy === "flag";
          if (duplicateFlag) {
            storageKey = `${parsed.propertyNo}~DUP${parsed.sourceRow}~${batchId.slice(0, 8)}`;
          }
          const existing = await tx.asset.findFirst({
            where: {
              organizationId,
              OR: [
                { serialnumber: parsed.propertyNo },
                { propertyKey: parsed.propertyKey },
              ],
            },
            select: existingAssetSelect,
          });

          if (duplicateFlag || !existing) {
            const created = await tx.asset.create({
              data: toCreateData(parsed, relations, organizationId, storageKey),
              select: { assetid: true },
            });
            assetId = created.assetid;
            status = duplicateFlag || hasErrors ? "flagged" : "new";
          } else {
            assetId = existing.assetid;
            const updateData = toUpdateData(parsed, relations);
            if (
              isUnchanged(
                existing as unknown as Record<string, unknown>,
                updateData,
              )
            ) {
              status = hasErrors ? "flagged" : "unchanged";
              action = null;
            } else {
              previousValues = Object.fromEntries(
                Object.entries(existing).map(([key, value]) => [
                  key,
                  jsonSafe(value),
                ]),
              );
              await tx.asset.update({
                where: { assetid: existing.assetid },
                data: updateData,
              });
              status = hasErrors ? "flagged" : "update";
            }
          }
          if (status === "new") action = "create";
          else if (status === "unchanged") action = null;
        }

        if (status === "created" || status === "new") counts.created += 1;
        else if (status === "update") counts.updated += 1;
        else if (status === "unchanged") counts.unchanged += 1;
        else if (status === "skipped") counts.skipped += 1;
        else if (status === "flagged") counts.flagged += 1;
        else counts.failed += 1;

        await tx.importRowResult.update({
          where: { id: row.id },
          data: {
            status,
            action,
            assetId,
            warnings: jsonSafe(warnings) as Prisma.InputJsonValue,
            errors: jsonSafe(parsed.errors) as Prisma.InputJsonValue,
            previousValues: previousValues
              ? (jsonSafe(previousValues) as Prisma.InputJsonValue)
              : null,
          },
        });
      }

      await tx.importJob.update({
        where: { id: batchId },
        data: {
          processedRows: { increment: rows.length },
          successCount: counts.created + counts.updated,
          errorCount: counts.failed,
          status: aborted ? "aborted" : undefined,
          finishedAt: aborted ? new Date() : undefined,
          options: jsonSafe({
            ...state,
            counts,
          } satisfies StoredImportState) as Prisma.InputJsonValue,
        },
      });
    },
    { maxWait: 10_000, timeout: 600_000 },
  );

  const updated = await prisma.importJob.findUniqueOrThrow({
    where: { id: batchId },
  });
  return progressFromJob(updated);
}

export async function getFixedAssetImportProgress(
  batchId: string,
  organizationId: string,
): Promise<FixedAssetImportProgress> {
  const job = await prisma.importJob.findFirst({
    where: {
      id: batchId,
      entityType: "fixed_asset_register",
      organizationId,
    },
  });
  if (!job) throw new Error("Import batch not found");
  return progressFromJob(job);
}

export async function getFixedAssetImportResult(
  batchId: string,
  organizationId: string,
): Promise<FixedAssetImportResult> {
  const progress = await getFixedAssetImportProgress(batchId, organizationId);
  const rows = await prisma.importRowResult.findMany({
    where: { batchId, organizationId },
    orderBy: { rowNumber: "asc" },
    take: 500,
    select: {
      rowNumber: true,
      status: true,
      action: true,
      propertyKey: true,
      warnings: true,
      errors: true,
    },
  });
  return {
    ...progress,
    reused: false,
    results: rows.map((row) => ({
      rowNumber: row.rowNumber,
      status: row.status,
      action: row.action,
      propertyKey: row.propertyKey,
      warnings: (row.warnings as string[]) ?? [],
      errors: (row.errors as string[]) ?? [],
    })),
  };
}

export async function cancelFixedAssetImport(
  batchId: string,
  organizationId: string,
): Promise<FixedAssetImportProgress> {
  const job = await prisma.importJob.findFirst({
    where: {
      id: batchId,
      entityType: "fixed_asset_register",
      organizationId,
    },
  });
  if (!job) throw new Error("Import batch not found");
  const updated = await prisma.importJob.update({
    where: { id: batchId },
    data: { status: "cancelled", finishedAt: new Date() },
  });
  return progressFromJob(updated);
}

export async function commitFixedAssetImport(
  workbook: FixedAssetWorkbook,
  options: FixedAssetImportOptions,
): Promise<FixedAssetImportResult> {
  const started = await createFixedAssetImportJob(workbook, options);
  let progress = started.progress;
  while (!progress.done) {
    progress = await processFixedAssetImportChunk(
      started.batchId,
      options.organizationId,
    );
  }
  const result = await getFixedAssetImportResult(
    started.batchId,
    options.organizationId,
  );
  return { ...result, reused: started.reused };
}

export async function generateFixedAssetImportReport(
  batchId: string,
  organizationId: string,
): Promise<Buffer> {
  const rows = await prisma.importRowResult.findMany({
    where: { batchId, organizationId },
    orderBy: { rowNumber: "asc" },
    select: {
      rowNumber: true,
      status: true,
      action: true,
      propertyKey: true,
      warnings: true,
      errors: true,
      raw: true,
    },
  });
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Import Result");
  sheet.addRow([
    "Row",
    "Status",
    "Action",
    "Source Department",
    "Property Key",
    "Warnings",
    "Errors",
  ]);
  for (const row of rows) {
    const raw = row.raw as MasterListRow | null;
    sheet.addRow([
      row.rowNumber,
      row.status,
      row.action,
      raw?.Department ?? null,
      row.propertyKey,
      ((row.warnings as string[]) ?? []).join("; "),
      ((row.errors as string[]) ?? []).join("; "),
    ]);
  }
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((column) => {
    column.width = 28;
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
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
    where: { batchId, assetId: { not: null } },
    select: { assetId: true, previousValues: true, action: true, status: true },
  });

  await prisma.$transaction(
    async (tx) => {
      for (const row of rows) {
        if (!row.assetId) continue;
        if (!row.previousValues) {
          if (row.action === "create" || row.status === "flagged") {
            await tx.asset.delete({ where: { assetid: row.assetId } });
          }
          continue;
        }
        const previous = row.previousValues as Record<string, unknown>;
        const data: Record<string, unknown> = {};
        for (const field of [
          "assetname",
          "serialnumber",
          "assettag",
          "sourceDepartment",
          "departmentId",
          "categoryCode",
          "serialNo",
          "assetnameRaw",
          "propertyKey",
          "condition1",
          "condition1Raw",
          "location1",
          "reviewDate1",
          "reviewDate1Raw",
          "financeNo",
          "condition2Raw",
          "location2Raw",
          "reviewDate2Raw",
          "additionalData",
          "additionalDataJson",
          "sourceRow",
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
    "1",
    "Sample asset",
    "PROP-0001",
    "Department",
    "8.3.5-883",
    "Good",
    "Store",
    "01/01/2025",
    "Good",
    "Store",
    "01/01/2026",
  ]);
  sheet.columns.forEach((column) => {
    column.width = 18;
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
