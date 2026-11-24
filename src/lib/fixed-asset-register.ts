import type { Prisma } from "@prisma/client";

export const MASTER_LIST_COLUMNS = [
  "No.",
  "Department",
  "Category Code",
  "S.No",
  "Description",
  "Property No",
  "Finance No (1st)",
  "Condition (1st)",
  "Location (1st)",
  "Review Date (1st)",
  "Finance No (2nd)",
  "Condition (2nd)",
  "Location (2nd)",
  "Review Date (2nd)",
  "Additional Data",
  "Source Row",
  "Hidden in Source",
] as const;

export type MasterListColumn = (typeof MASTER_LIST_COLUMNS)[number];

export type CellValue = string | number | boolean | Date | null | undefined;

export type MasterListRow = Record<string, CellValue>;

export interface ParsedMasterListRow {
  sourceDepartment: string;
  normalizedDepartment: string;
  categoryCode: string | null;
  serialNo: string | null;
  assetname: string;
  assetnameRaw: string;
  propertyNo: string;
  propertyKey: string;
  financeNo1: string | null;
  condition1: string | null;
  condition1Raw: string | null;
  location1: string | null;
  reviewDate1: Date | null;
  reviewDate1Raw: string | null;
  reviewDate1Ambiguous: boolean;
  financeNo2: string | null;
  condition2Raw: string | null;
  location2Raw: string | null;
  reviewDate2Raw: string | null;
  reviewDate2Ambiguous: boolean;
  additionalData: string | null;
  additionalDataJson: Record<string, string> | null;
  sourceRow: number | null;
  hiddenInSource: boolean;
  warnings: string[];
  errors: string[];
}

export interface FixedAssetListParams {
  search?: string;
  departments?: string[];
  categoryCodes?: string[];
  conditions?: string[];
  locations?: string;
  reviewFrom?: string;
  reviewTo?: string;
  missingProperty?: boolean;
  hidden?: boolean;
  needsReview?: boolean;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  page?: number;
  pageSize?: number;
  groupBy?: "none" | "department" | "categoryCode" | "condition1";
}

export function normalizeText(value: CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).replace(/\s+/g, " ").trim();
}

export function normalizePropertyKey(value: CellValue): string {
  return normalizeText(value)
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s*([./-])\s*/g, "$1")
    .toUpperCase();
}

export function normalizeDepartmentAlias(value: CellValue): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function normalizeCondition(value: CellValue): {
  value: string | null;
  warning: string | null;
} {
  const raw = normalizeText(value);
  if (!raw) return { value: null, warning: null };
  const key = raw.toLowerCase().replace(/[.\s_/-]+/g, "");
  const map: Record<string, string> = {
    good: "Good",
    nf: "N/F",
    scrap: "Scrap",
    demonshed: "Demolished",
    demolished: "Demolished",
    demolision: "Demolished",
  };
  if (map[key]) return { value: map[key], warning: null };
  return { value: raw, warning: `Unrecognized condition: ${raw}` };
}

function normalizeDateText(value: CellValue): string {
  return normalizeText(value)
    .replace(/\/{2,}/g, "/")
    .replace(/-{2,}/g, "-");
}

export function parseExcelDate(value: CellValue): {
  date: Date | null;
  raw: string | null;
  ambiguous: boolean;
  warning: string | null;
} {
  if (value === null || value === undefined) {
    return { date: null, raw: null, ambiguous: false, warning: null };
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return {
        date: null,
        raw: String(value),
        ambiguous: false,
        warning: "Invalid date value",
      };
    }
    return {
      date: value,
      raw: value.toISOString(),
      ambiguous: false,
      warning: null,
    };
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const epoch = Date.UTC(1899, 11, 30) + value * 24 * 60 * 60 * 1000;
    return {
      date: new Date(epoch),
      raw: String(value),
      ambiguous: false,
      warning: null,
    };
  }
  const raw = normalizeDateText(value);
  if (!raw) return { date: null, raw: null, ambiguous: false, warning: null };

  let match = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match) {
    const [, y, m, d] = match;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    return {
      date: Number.isNaN(date.getTime()) ? null : date,
      raw,
      ambiguous: false,
      warning: Number.isNaN(date.getTime()) ? `Impossible date: ${raw}` : null,
    };
  }

  match = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (match) {
    const [, a, b, y] = match;
    const first = Number(a);
    const second = Number(b);
    let year = Number(y);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    const day = first > 12 || second <= 12 ? first : second;
    const month = day === first ? second : first;
    const ambiguous = first <= 12 && second <= 12;
    const date = new Date(Date.UTC(year, month - 1, day));
    const invalid =
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31 ||
      Number.isNaN(date.getTime());
    return {
      date: invalid ? null : date,
      raw,
      ambiguous,
      warning: invalid ? `Impossible date: ${raw}` : null,
    };
  }

  const fallback = new Date(raw);
  if (!Number.isNaN(fallback.getTime())) {
    return {
      date: fallback,
      raw,
      ambiguous: true,
      warning: `Ambiguous date: ${raw}`,
    };
  }
  return {
    date: null,
    raw,
    ambiguous: false,
    warning: `Unparseable date: ${raw}`,
  };
}

export function parseAdditionalData(value: CellValue): {
  text: string | null;
  json: Record<string, string> | null;
} {
  const text = normalizeText(value);
  if (!text) return { text: null, json: null };
  const json: Record<string, string> = {};
  for (const part of text.split("|")) {
    const match = part.trim().match(/^\[([^\]]+)\]\s*(.*)$/);
    if (match) json[match[1].trim()] = match[2].trim();
  }
  return { text, json: Object.keys(json).length ? json : null };
}

function cell(row: MasterListRow, column: MasterListColumn): CellValue {
  return row[column];
}

function firstCell(
  row: MasterListRow,
  columns: readonly MasterListColumn[],
): CellValue {
  for (const column of columns) {
    const value = cell(row, column);
    if (normalizeText(value)) return value;
  }
  return null;
}

export function mapMasterListRow(
  row: MasterListRow,
  rowNumber: number,
): ParsedMasterListRow {
  const warnings: string[] = [];
  const errors: string[] = [];
  const descriptionRaw = normalizeText(cell(row, "Description"));
  const rawPropertyNo = normalizeText(cell(row, "Property No"));
  const sourceDepartment = normalizeText(cell(row, "Department"));
  const sourceRowValue = cell(row, "Source Row");
  const sourceRow =
    typeof sourceRowValue === "number"
      ? sourceRowValue
      : /^\d+$/.test(normalizeText(sourceRowValue))
        ? Number(normalizeText(sourceRowValue))
        : rowNumber;

  if (!descriptionRaw) errors.push("Description is missing");
  if (!sourceDepartment) warnings.push("Department is missing");

  const propertyNo =
    rawPropertyNo ||
    `UNKNOWN-${(normalizeDepartmentAlias(sourceDepartment) || "dept").toUpperCase()}-${sourceRow}`;
  if (!rawPropertyNo) {
    warnings.push(`Property No is missing; generated ${propertyNo}`);
  }

  const condition1 = normalizeCondition(cell(row, "Condition (1st)"));
  const condition2 = normalizeCondition(
    firstCell(row, ["Condition (2nd)", "Condition (1st)"]),
  );
  if (condition1.warning) warnings.push(condition1.warning);
  if (condition2.warning) warnings.push(condition2.warning);

  const reviewDate1 = parseExcelDate(cell(row, "Review Date (1st)"));
  const reviewDate2 = parseExcelDate(
    firstCell(row, ["Review Date (2nd)", "Review Date (1st)"]),
  );
  if (reviewDate1.warning) warnings.push(reviewDate1.warning);
  if (reviewDate2.warning) warnings.push(reviewDate2.warning);

  const additional = parseAdditionalData(cell(row, "Additional Data"));
  const hiddenRaw = normalizeText(cell(row, "Hidden in Source")).toLowerCase();

  return {
    sourceDepartment,
    normalizedDepartment: normalizeDepartmentAlias(sourceDepartment),
    categoryCode: normalizeText(cell(row, "Category Code")) || null,
    serialNo: normalizeText(cell(row, "S.No")) || null,
    assetname: descriptionRaw,
    assetnameRaw: descriptionRaw,
    propertyNo,
    propertyKey: normalizePropertyKey(propertyNo),
    financeNo1: normalizeText(cell(row, "Finance No (1st)")) || null,
    condition1: condition1.value,
    condition1Raw: normalizeText(cell(row, "Condition (1st)")) || null,
    location1: normalizeText(cell(row, "Location (1st)")) || null,
    reviewDate1: reviewDate1.date,
    reviewDate1Raw: reviewDate1.raw,
    reviewDate1Ambiguous: reviewDate1.ambiguous,
    financeNo2: normalizeText(cell(row, "Finance No (2nd)")) || null,
    condition2Raw: normalizeText(cell(row, "Condition (2nd)")) || null,
    location2Raw: normalizeText(cell(row, "Location (2nd)")) || null,
    reviewDate2Raw: reviewDate2.raw,
    reviewDate2Ambiguous: reviewDate2.ambiguous,
    additionalData: additional.text,
    additionalDataJson: additional.json,
    sourceRow,
    hiddenInSource: ["yes", "true", "1", "y"].includes(hiddenRaw),
    warnings,
    errors,
  };
}

export function excelDateToCell(value: Date | null): string {
  if (!value) return "";
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${day}/${month}/${year}`;
}

export function additionalDataToCell(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `[${key}] ${String(item ?? "")}`)
      .join(" | ");
  }
  return String(value);
}

export function buildFixedAssetWhere(
  params: FixedAssetListParams,
  organizationId: string,
  isAdmin: boolean,
  assignedAssetIds: string[] = [],
  availableStatusIds: string[] = [],
): Prisma.assetWhereInput {
  const where: Prisma.assetWhereInput = { organizationId };
  if (!isAdmin) {
    where.OR = [
      { assetid: { in: assignedAssetIds } },
      { statustypeid: { in: availableStatusIds } },
    ];
  }
  const and: Prisma.assetWhereInput[] = [];
  if (params.search) {
    const q = params.search.trim();
    and.push({
      OR: [
        { assetname: { contains: q, mode: "insensitive" } },
        { assetnameRaw: { contains: q, mode: "insensitive" } },
        { serialnumber: { contains: q, mode: "insensitive" } },
        { serialNo: { contains: q, mode: "insensitive" } },
        { financeNo1: { contains: q, mode: "insensitive" } },
        { financeNo2: { contains: q, mode: "insensitive" } },
        { additionalData: { contains: q, mode: "insensitive" } },
        { location1: { contains: q, mode: "insensitive" } },
        { location2Raw: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (params.departments?.length) {
    and.push({
      OR: [
        { departmentId: { in: params.departments } },
        { sourceDepartment: { in: params.departments } },
      ],
    });
  }
  if (params.categoryCodes?.length) {
    and.push({ categoryCode: { in: params.categoryCodes } });
  }
  if (params.conditions?.length) {
    and.push({
      OR: [
        { condition1: { in: params.conditions } },
        { condition1Raw: { in: params.conditions } },
        { statusType: { statustypename: { in: params.conditions } } },
        { condition2Raw: { in: params.conditions } },
      ],
    });
  }
  if (params.locations) {
    and.push({
      OR: [
        { location1: { contains: params.locations, mode: "insensitive" } },
        { location2Raw: { contains: params.locations, mode: "insensitive" } },
        {
          location: {
            locationname: { contains: params.locations, mode: "insensitive" },
          },
        },
      ],
    });
  }
  if (params.reviewFrom || params.reviewTo) {
    and.push({
      OR: [
        {
          reviewDate1: {
            gte: params.reviewFrom ? new Date(params.reviewFrom) : undefined,
            lte: params.reviewTo ? new Date(params.reviewTo) : undefined,
          },
        },
        {
          reviewsDate: {
            gte: params.reviewFrom ? new Date(params.reviewFrom) : undefined,
            lte: params.reviewTo ? new Date(params.reviewTo) : undefined,
          },
        },
      ],
    });
  }
  if (params.missingProperty) {
    and.push({ OR: [{ serialnumber: "" }, { propertyKey: null }] });
  }
  if (params.hidden) and.push({ hiddenInSource: true });
  if (params.needsReview) {
    and.push({
      OR: [
        { reviewDate1Ambiguous: true },
        { reviewDate2Ambiguous: true },
        { condition1: null },
      ],
    });
  }
  if (and.length) where.AND = and;
  return where;
}

export function buildFixedAssetOrderBy(
  params: FixedAssetListParams,
): Prisma.assetOrderByWithRelationInput[] {
  const direction = params.sortOrder === "desc" ? "desc" : "asc";
  const field = params.sortBy ?? "department";
  const primary: Prisma.assetOrderByWithRelationInput =
    field === "description"
      ? { assetname: direction }
      : field === "categoryCode"
        ? { categoryCode: direction }
        : field === "propertyNo"
          ? { serialnumber: direction }
          : field === "condition1"
            ? { condition1: direction }
            : field === "reviewDate1"
              ? { reviewDate1: direction }
              : field === "reviewDate2"
                ? { reviewsDate: direction }
                : field === "created"
                  ? { creation_date: direction }
                  : { sourceDepartment: direction };
  return [primary, { assetid: "asc" }];
}
