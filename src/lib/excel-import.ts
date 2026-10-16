import ExcelJS from "exceljs";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

export const MAX_IMPORT_FILE_SIZE = 20 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 25_000;
export const PREVIEW_ROW_LIMIT = 8;
export const SAMPLE_VALIDATION_ROWS = 5;
export const MAX_REPORTED_ERRORS = 500;

// ---------------------------------------------------------------------------
// Field metadata
// ---------------------------------------------------------------------------

export type AssetImportFieldId =
  | "srNo"
  | "assetType"
  | "pid"
  | "condition"
  | "location"
  | "brand"
  | "reviewDate"
  | "assetname"
  | "assettag"
  | "purchaseprice"
  | "purchasedate"
  | "department"
  | "mobile"
  | "requestable"
  | "specs"
  | "notes";

interface AssetImportField {
  id: AssetImportFieldId;
  label: string;
  required: boolean;
  kind: "text" | "reference" | "date" | "number" | "boolean";
}

export const ASSET_IMPORT_FIELDS: readonly AssetImportField[] = [
  { id: "srNo", label: "Sr. No.", required: true, kind: "text" },
  { id: "assetType", label: "Asset Type", required: true, kind: "reference" },
  { id: "pid", label: "PID (Asset ID)", required: true, kind: "text" },
  { id: "condition", label: "Condition", required: true, kind: "reference" },
  { id: "location", label: "Location", required: true, kind: "reference" },
  { id: "brand", label: "Brand", required: true, kind: "reference" },
  { id: "reviewDate", label: "Review Date", required: true, kind: "date" },
  { id: "assetname", label: "Asset Name", required: false, kind: "text" },
  { id: "assettag", label: "Tag", required: false, kind: "text" },
  {
    id: "purchaseprice",
    label: "Purchase Price",
    required: false,
    kind: "number",
  },
  { id: "purchasedate", label: "Purchase Date", required: false, kind: "date" },
  { id: "department", label: "Department", required: false, kind: "reference" },
  { id: "mobile", label: "Mobile", required: false, kind: "boolean" },
  { id: "requestable", label: "Requestable", required: false, kind: "boolean" },
  { id: "specs", label: "Specifications", required: false, kind: "text" },
  { id: "notes", label: "Remark", required: true, kind: "text" },
] as const;

export const ASSET_IMPORT_FIELD_IDS: ReadonlySet<string> = new Set(
  ASSET_IMPORT_FIELDS.map((f) => f.id),
);

// Required import columns: Sr. No., Asset Type, PID (Asset ID), Condition,
// Location, Brand, Review Date, and Remark. These must all be mapped.
export const REQUIRED_IMPORT_FIELD_IDS: readonly AssetImportFieldId[] =
  ASSET_IMPORT_FIELDS.filter((f) => f.required).map((f) => f.id);

// Core fields that users specifically expect in the import spec
export const ASSET_CORE_FIELD_IDS: readonly AssetImportFieldId[] = [
  "srNo",
  "assetType",
  "pid",
  "condition",
  "location",
  "brand",
  "reviewDate",
  "notes",
];

// ---------------------------------------------------------------------------
// Auto-map aliases (header string → field id)
// ---------------------------------------------------------------------------

const ALIASES: Record<AssetImportFieldId, string[]> = {
  srNo: [
    "sr no",
    "sr.no",
    "srno",
    "s.no",
    "sno",
    "row no",
    "row",
    "no",
    "#",
    "sl no",
    "sl.no",
  ],
  assetType: [
    "asset type",
    "type",
    "category",
    "asset category",
    "category type",
    "assettype",
    "equipment type",
    "equipment category",
    "fixed asset type",
    "asset class",
    "class",
  ],
  pid: [
    "pid",
    "asset id",
    "pid (asset id)",
    "serial number",
    "serial no",
    "serialno",
    "serial",
    "id",
    "assetid",
    "asset id.",
    "pid / asset id",
    "pid / assetid",
    "equipment id",
    "asset number",
    "fixed asset id",
    "equipment number",
    "equipment no",
    "asset no",
    "asset no.",
    "fixed asset no",
    "asset code",
    "equipment code",
  ],
  condition: [
    "condition",
    "status",
    "status type",
    "asset condition",
    "condition type",
    "asset status",
    "condition/status",
    "working condition",
  ],
  location: [
    "location",
    "location name",
    "site",
    "site name",
    "loc",
    "site/location",
    "location/site",
  ],
  brand: ["brand", "manufacturer", "make", "manufacturer name", "brand name"],
  reviewDate: [
    "review date",
    "review",
    "reviewed date",
    "reviews date",
    "reviewdate",
    "inspection date",
    "next review",
    "review due",
  ],
  assetname: [
    "asset name",
    "name",
    "asset",
    "assetname",
    "equipment name",
    "item name",
    "fixed asset name",
  ],
  assettag: [
    "tag",
    "asset tag",
    "assettag",
    "qrcode",
    "qr code",
    "barcode",
    "tag no",
    "asset tag no",
  ],
  purchaseprice: [
    "purchase price",
    "price",
    "cost",
    "purchase cost",
    "price paid",
    "original cost",
    "buying price",
  ],
  purchasedate: [
    "purchase date",
    "date purchased",
    "date of purchase",
    "purchasedate",
    "bought date",
    "acquisition date",
  ],
  department: [
    "department",
    "dept",
    "department name",
    "department code",
    "dept name",
    "division",
  ],
  mobile: ["mobile", "is mobile", "portable"],
  requestable: [
    "requestable",
    "can request",
    "can requestable",
    "allow request",
  ],
  specs: ["specs", "specifications", "spec", "specification"],
  notes: ["notes", "remark", "remarks", "comment", "comments", "remarks/notes"],
};

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const previewRequestSchema = z.object({
  headerRow: z.coerce
    .number()
    .int()
    .min(1, "Header row must be >= 1")
    .max(50, "Header row must be <= 50")
    .optional()
    .default(1),
  columnMapping: z
    .record(z.string(), z.number().int().min(0))
    .optional()
    .default({}),
  sheetName: z.string().optional(),
});

export const assetImportRequestSchema = z.object({
  sheetName: z.string().min(1, "Sheet name is required"),
  headerRow: z.coerce
    .number()
    .int()
    .min(1, "Header row must be >= 1")
    .max(50)
    .default(1),
  columnMapping: z
    .record(z.string(), z.number().int().min(0))
    .refine(
      (obj) => REQUIRED_IMPORT_FIELD_IDS.every((id) => id in obj),
      "All required columns must be mapped: Sr. No., Asset Type, PID (Asset ID), Condition, Location, Brand, Review Date, and Remark.",
    ),
});

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

export function isExcelFileName(name: string): boolean {
  return /\.(xlsx|xls)$/i.test(name);
}

export function isCsvFileName(name: string): boolean {
  return /\.csv$/i.test(name);
}

/** Convert a raw ExcelJS cell value to a trimmed string. */
export function cellToText(value: ExcelJS.CellValue): string {
  if (value == null) return "";

  // Date → ISO date fragment
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return "";
    return value.toISOString().slice(0, 10);
  }

  // Rich text
  if (
    typeof value === "object" &&
    "richText" in value &&
    Array.isArray(value.richText)
  ) {
    return value.richText
      .map((r: { text?: string }) => r.text ?? "")
      .join("")
      .trim();
  }

  // Formula / hyperlink result
  if (typeof value === "object" && value !== null && "result" in value) {
    return cellToText((value as { result: ExcelJS.CellValue }).result);
  }

  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.trim();
  return String(value);
}

/**
 * Parse a flexible date value: Date, Excel serial, ISO, or common formats.
 *
 * Every branch returns the date at **UTC midnight**, deliberately. Callers
 * persist the result with `.toISOString().slice(0, 10)`, which reads the UTC
 * calendar day - so a value built at local midnight comes back a day early
 * anywhere east of UTC. Ethiopia is UTC+3, so a hire date of `2026-03-01`
 * would otherwise be stored as `2026-02-28`.
 */
export function parseFlexibleDate(value: unknown): Date | null {
  if (value == null) return null;
  const str = String(value).trim();
  if (str === "") return null;

  // Date instance. A cell that Excel handed us as a date arrives as a Date at
  // UTC midnight already; anything else is taken at face value.
  if (value instanceof Date && !isNaN(value.getTime())) {
    return new Date(value.getTime());
  }

  // Excel serial number (days since 1899-12-30)
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 1 && value <= 80_000) {
      const d = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
      if (!isNaN(d.getTime())) return d;
    }
    // Non-serial numbers that aren't in valid date range → not a date
    return null;
  }

  // Reject a value the engine would "helpfully" roll over rather than accept it.
  // `new Date(2024, 14, 1)` is a perfectly valid Date for 2025-03-01, so a
  // month of 15 or a day of 45 has to be caught before it silently becomes a
  // different, plausible-looking date.
  const utc = (y: number, m: number, d: number): Date | null => {
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const date = new Date(Date.UTC(y, m - 1, d));
    // Reject 31 April and friends: the overflow lands in the next month.
    if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
    return date;
  };

  // YYYY-MM-DD
  let m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const d = utc(Number(m[1]), Number(m[2]), Number(m[3]));
    if (d) return d;
  }

  // Numeric dates. `15/01/2024` is day-first and `01/15/2024` month-first, and
  // the two are told apart by which number can only be a day: a first component
  // above 12 cannot be a month. Anything genuinely ambiguous (`03/04/2024`) is
  // read as day-first, which is the Ethiopian and European convention.
  m = str.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const year = Number(m[3]);
    const dayFirst = a > 12 || b <= 12;
    const d = dayFirst ? utc(year, b, a) : utc(year, a, b);
    if (d) return d;
  }

  // Month-name formats: "15 Jan 2024", "January 15, 2024". Parsed as UTC so the
  // calendar day survives the round trip.
  const dayFirstNamed = /^(\d{1,2})[ ,-]+([A-Za-z]{3,})[ ,-]+(\d{4})$/.exec(
    str,
  );
  const monthFirstNamed = /^([A-Za-z]{3,})[ ,-]+(\d{1,2})[ ,-]+(\d{4})$/.exec(
    str,
  );
  if (dayFirstNamed || monthFirstNamed) {
    const [, a, b, year] = dayFirstNamed ?? monthFirstNamed!;
    // In the day-first form (a, b) is (day, month); in the month-first form it
    // is (month, day).
    const [day, monthWord] = dayFirstNamed ? [a, b] : [b, a];
    // Accept a full name or any unambiguous 3+ letter prefix.
    const month = MONTH_NAMES.findIndex(
      (name) =>
        name === monthWord.toLowerCase() ||
        name.startsWith(monthWord.toLowerCase()),
    );
    if (month !== -1) {
      const d = utc(Number(year), month + 1, Number(day));
      if (d) return d;
    }
  }

  return null;
}

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

/**
 * Short month name for a 1-based month, for error messages.
 *
 * Kept local rather than pulled from `Intl` so the wording of an error is the
 * same on every server, regardless of the machine's locale.
 */
export function monthName(month: number): string {
  const index = MONTH_NAMES.findIndex(
    (name) => name.slice(0, 3) === String(month).toLowerCase(),
  );
  return index === -1 ? String(month) : MONTH_NAMES[index];
}

/** Parse a string to boolean. Returns null if not recognized. */
export function parseBool(value: unknown): boolean | null {
  if (value == null) return null;
  const s = String(value).trim().toLowerCase();
  if (s === "") return null;
  if (s === "0" || s === "false" || s === "no" || s === "n") return false;
  if (s === "1" || s === "true" || s === "yes" || s === "y" || s === "active")
    return true;
  return null;
}

// ---------------------------------------------------------------------------
// Reference resolution
// ---------------------------------------------------------------------------

export interface ReferenceRecord {
  id: string;
  name: string;
  code?: string | null;
  isDefault?: boolean | null;
}

/** Normalize a string for case-insensitive, whitespace-collapsed comparison. */
export function normalizeRef(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Build a lookup map: normalized name/code → record.
 * Multiple keys map to the same id.
 */
export function buildReferenceLookup(
  records: ReferenceRecord[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of records) {
    const normalName = normalizeRef(r.name);
    if (normalName && !map.has(normalName)) map.set(normalName, r.id);
    if (r.code) {
      const normalCode = normalizeRef(r.code);
      if (normalCode && !map.has(normalCode)) map.set(normalCode, r.id);
    }
    // Also allow the raw id as a fallback (already a UUID)
  }
  return map;
}

/**
 * Get all available names from a reference list, for helpful error messages.
 */
export function referenceNames(records: ReferenceRecord[]): string[] {
  return records
    .map((r) => r.name)
    .filter(Boolean)
    .sort();
}

// ---------------------------------------------------------------------------
// Asset import lookups (built once per import)
// ---------------------------------------------------------------------------

export interface AssetLookups {
  categoryLookup: Map<string, string>;
  statusLookup: Map<string, string>;
  locationLookup: Map<string, string>;
  manufacturerLookup: Map<string, string>;
  departmentLookup: Map<string, string>;
  defaultStatusId: string | null;
  categories: ReferenceRecord[];
  statuses: ReferenceRecord[];
  locations: ReferenceRecord[];
  manufacturers: ReferenceRecord[];
  departments: ReferenceRecord[];
}

export function buildAssetLookups(
  categories: ReferenceRecord[],
  statuses: ReferenceRecord[],
  locations: ReferenceRecord[],
  manufacturers: ReferenceRecord[],
  departments: ReferenceRecord[],
): AssetLookups {
  const defaultStatus =
    statuses.find((s) => s.isDefault) ?? statuses[0] ?? null;
  return {
    categoryLookup: buildReferenceLookup(categories),
    statusLookup: buildReferenceLookup(statuses),
    locationLookup: buildReferenceLookup(locations),
    manufacturerLookup: buildReferenceLookup(manufacturers),
    departmentLookup: buildReferenceLookup(departments),
    defaultStatusId: defaultStatus?.id ?? null,
    categories,
    statuses,
    locations,
    manufacturers,
    departments,
  };
}

// ---------------------------------------------------------------------------
// Row validation (pure)
// ---------------------------------------------------------------------------

export interface ParsedAssetRow {
  rowNumber: number;
  pid: string;
  assetname: string;
  assettag: string;
  assetcategorytypeid: string;
  statustypeid: string;
  locationid?: string | null;
  manufacturerid?: string | null;
  departmentId?: string | null;
  departmentCode?: string | null;
  reviewsDate?: Date | null;
  purchasedate?: Date | null;
  purchaseprice?: number | null;
  mobile?: boolean | null;
  requestable?: boolean | null;
  specs?: string | null;
  notes?: string | null;
}

export type RowValidation =
  { status: "ok"; row: ParsedAssetRow } | { status: "error"; error: string };

/** Map a raw cell string to an asset field, applying parsing. */
function parseRawField(
  fieldId: AssetImportFieldId,
  raw: string,
): { value: string; valid: boolean; parsed?: unknown } {
  const trimmed = raw.trim();
  switch (fieldId) {
    case "srNo":
      return { value: trimmed, valid: true };
    case "assetType":
      return { value: trimmed, valid: trimmed !== "" };
    case "pid":
      return { value: trimmed, valid: trimmed !== "" };
    case "condition":
      return { value: trimmed, valid: true };
    case "location":
      return { value: trimmed, valid: true };
    case "brand":
      return { value: trimmed, valid: true };
    case "reviewDate": {
      const d = parseFlexibleDate(trimmed);
      return { value: trimmed, valid: true, parsed: d };
    }
    case "assetname":
      return { value: trimmed, valid: true };
    case "assettag":
      return { value: trimmed, valid: true };
    case "purchaseprice": {
      if (trimmed === "") return { value: "", valid: true, parsed: null };
      const n = Number(trimmed);
      const valid = Number.isFinite(n) && n >= 0;
      return { value: trimmed, valid, parsed: valid ? n : null };
    }
    case "purchasedate": {
      const d = parseFlexibleDate(trimmed);
      return { value: trimmed, valid: true, parsed: d };
    }
    case "department":
      return { value: trimmed, valid: trimmed !== "" };
    case "mobile": {
      const b = parseBool(trimmed);
      return { value: trimmed, valid: true, parsed: b };
    }
    case "requestable": {
      const b = parseBool(trimmed);
      return { value: trimmed, valid: true, parsed: b };
    }
    case "specs":
      return { value: trimmed, valid: true };
    case "notes":
      return { value: trimmed, valid: true };
    default:
      return { value: trimmed, valid: true };
  }
}

/**
 * Validate and resolve a single raw import row into a ParsedAssetRow.
 *
 * @param raw         Map of field IDs → raw cell strings (already extracted via column mapping)
 * @param lookups     Pre-built reference lookup maps
 * @param fileSeen    Running in-file duplicate tracking { pids, tags }
 * @param rowNumber   1-based row number in the sheet (header=1)
 */
export function validateAssetImportRow(
  raw: Record<AssetImportFieldId, string>,
  lookups: AssetLookups,
  fileSeen: { pids: Map<string, number>; tags: Map<string, number> },
  rowNumber: number,
): RowValidation {
  const err = (msg: string): RowValidation => ({
    status: "error",
    error: `Row ${rowNumber}: ${msg}`,
  });

  // ---- PID (Asset ID) ----
  const pidRaw = parseRawField("pid", raw.pid ?? "");
  if (!pidRaw.valid)
    return err("PID (Asset ID) is required and cannot be empty.");
  const pid = pidRaw.value;
  if (pid.length > 100)
    return err("PID (Asset ID) must be 100 characters or fewer.");
  if (fileSeen.pids.has(pid)) {
    return err(
      `Duplicate PID "${pid}" — first seen on row ${fileSeen.pids.get(pid)}. Each PID must be unique within the file.`,
    );
  }
  if (fileSeen.tags.has(pid)) {
    return err(
      `PID "${pid}" collides with a Tag already used on row ${fileSeen.tags.get(pid)}.`,
    );
  }

  // ---- Asset Type (required reference) ----
  const assetTypeRaw = parseRawField("assetType", raw.assetType ?? "");
  if (!assetTypeRaw.valid || assetTypeRaw.value === "") {
    return err(
      "Asset Type is required. Enter a name or code that exists in your organization.",
    );
  }
  const assetCategoryId = lookups.categoryLookup.get(
    normalizeRef(assetTypeRaw.value),
  );
  if (!assetCategoryId) {
    const available = referenceNames(lookups.categories).slice(0, 8).join(", ");
    return err(
      `Asset Type "${assetTypeRaw.value}" was not found. Use a type that exists in your organization (available: ${available || "none"}).`,
    );
  }

  // ---- Condition (optional reference, default from DB) ----
  const conditionRaw = parseRawField("condition", raw.condition ?? "");
  let statustypeid: string;
  if (conditionRaw.value === "") {
    if (!lookups.defaultStatusId) {
      return err(
        "No default Condition/Status is configured. Create at least one Status Type in your organization, then re-import.",
      );
    }
    statustypeid = lookups.defaultStatusId;
  } else {
    const sid = lookups.statusLookup.get(normalizeRef(conditionRaw.value));
    if (!sid) {
      const available = referenceNames(lookups.statuses).slice(0, 8).join(", ");
      return err(
        `Condition "${conditionRaw.value}" was not found. Use a status that exists (available: ${available || "none"}).`,
      );
    }
    statustypeid = sid;
  }

  // ---- Location (optional reference) ----
  let locationid: string | null | undefined = undefined;
  if (raw.location?.trim()) {
    const locationRaw = parseRawField("location", raw.location);
    const lid = lookups.locationLookup.get(normalizeRef(locationRaw.value));
    if (!lid) {
      const available = referenceNames(lookups.locations)
        .slice(0, 8)
        .join(", ");
      return err(
        `Location "${locationRaw.value}" was not found. Use a location that exists (available: ${available || "none"}).`,
      );
    }
    locationid = lid;
  } else {
    locationid = null;
  }

  // ---- Brand (optional reference) ----
  let manufacturerid: string | null | undefined = undefined;
  if (raw.brand?.trim()) {
    const brandRaw = parseRawField("brand", raw.brand);
    const mid = lookups.manufacturerLookup.get(normalizeRef(brandRaw.value));
    if (!mid) {
      const available = referenceNames(lookups.manufacturers)
        .slice(0, 8)
        .join(", ");
      return err(
        `Brand "${brandRaw.value}" was not found. Use a manufacturer that exists (available: ${available || "none"}).`,
      );
    }
    manufacturerid = mid;
  } else {
    manufacturerid = null;
  }

  // ---- Department (optional reference) ----
  let departmentId: string | null | undefined = undefined;
  let departmentCode: string | null | undefined = undefined;
  if (raw.department?.trim()) {
    const deptRaw = parseRawField("department", raw.department);
    const did = lookups.departmentLookup.get(normalizeRef(deptRaw.value));
    if (!did) {
      const available = lookups.departments
        .map((d) => d.name)
        .filter(Boolean)
        .slice(0, 8)
        .join(", ");
      return err(
        `Department "${deptRaw.value}" was not found. Use a department that exists in your organization (available: ${available || "none"}).`,
      );
    }
    departmentId = did;
    // Find matching dept record to set departmentCode if available
    const deptRecord = lookups.departments.find((d) => d.id === did);
    departmentCode = deptRecord?.code ?? null;
  } else {
    departmentId = null;
    departmentCode = null;
  }

  // ---- Review Date (optional) ----
  let reviewsDate: Date | null = null;
  if (raw.reviewDate?.trim()) {
    const dateParsed = parseRawField("reviewDate", raw.reviewDate);
    const d = dateParsed.parsed as Date | null;
    if (!d) {
      return err(
        `Review Date "${raw.reviewDate.trim()}" is not a valid date. Use YYYY-MM-DD or M/D/YYYY.`,
      );
    }
    reviewsDate = d;
  }

  // ---- Purchase Price (optional) ----
  let purchaseprice: number | null = null;
  if (raw.purchaseprice?.trim()) {
    const priceParsed = parseRawField("purchaseprice", raw.purchaseprice);
    if (priceParsed.parsed === null && priceParsed.value !== "") {
      return err(
        `Purchase Price "${raw.purchaseprice.trim()}" is not a valid number.`,
      );
    }
    purchaseprice = priceParsed.parsed as number | null;
  }

  // ---- Purchase Date (optional) ----
  let purchasedate: Date | null = null;
  if (raw.purchasedate?.trim()) {
    const dateParsed = parseRawField("purchasedate", raw.purchasedate);
    const d = dateParsed.parsed as Date | null;
    if (!d) {
      return err(
        `Purchase Date "${raw.purchasedate.trim()}" is not a valid date.`,
      );
    }
    purchasedate = d;
  }

  // ---- Mobile (optional) ----
  let mobile: boolean | null = null;
  if (raw.mobile?.trim()) {
    const b = parseBool(raw.mobile);
    if (b === null) {
      return err(
        `Mobile "${raw.mobile.trim()}" is not valid. Use Yes/No, True/False, or 1/0.`,
      );
    }
    mobile = b;
  }

  // ---- Requestable (optional) ----
  let requestable: boolean | null = null;
  if (raw.requestable?.trim()) {
    const b = parseBool(raw.requestable);
    if (b === null) {
      return err(
        `Requestable "${raw.requestable.trim()}" is not valid. Use Yes/No, True/False, or 1/0.`,
      );
    }
    requestable = b;
  }

  // ---- Asset Name (defaults to PID if empty) ----
  const assetname = (raw.assetname?.trim() || pid).slice(0, 255);

  // ---- Asset Tag (defaults to PID if empty) ----
  const assettag = (raw.assettag?.trim() || pid).slice(0, 50);
  if (fileSeen.tags.has(assettag)) {
    return err(
      `Duplicate Tag "${assettag}" — first seen on row ${fileSeen.tags.get(assettag)}. Each tag must be unique within the file.`,
    );
  }
  if (fileSeen.pids.has(assettag) && assettag !== pid) {
    return err(
      `Tag "${assettag}" collides with a PID already used on row ${fileSeen.pids.get(assettag)}.`,
    );
  }

  // ---- Specs / Notes (optional text) ----
  const specs = raw.specs?.trim() || null;
  const notes = raw.notes?.trim() || null;

  // ---- Track in-file duplicates BEFORE returning success ----
  fileSeen.pids.set(pid, rowNumber);
  fileSeen.tags.set(assettag, rowNumber);

  return {
    status: "ok" as const,
    row: {
      rowNumber,
      pid,
      assetname,
      assettag,
      assetcategorytypeid: assetCategoryId,
      statustypeid,
      locationid,
      manufacturerid,
      departmentId,
      departmentCode,
      reviewsDate,
      purchasedate,
      purchaseprice,
      mobile,
      requestable,
      specs,
      notes,
    },
  };
}

// ---------------------------------------------------------------------------
// Batch row processing
// ---------------------------------------------------------------------------

export interface AssetImportProcessingResult {
  validRows: ParsedAssetRow[];
  errors: { row: number; error: string }[];
}

/**
 * Validate a sheet of rows against column mapping and reference lookups.
 * @param rows         Raw 2D array of cell strings (as returned by parseWorkbook/sheet)
 * @param headerRow    1-based index of the header row (first row = 1)
 * @param mapping      Map of AssetImportFieldId → 0-based column index
 * @param lookups      Pre-built reference lookups
 */
export function processAssetImportRows(
  rows: string[][],
  headerRow: number,
  mapping: Partial<Record<AssetImportFieldId, number>>,
  lookups: AssetLookups,
): AssetImportProcessingResult {
  const validRows: ParsedAssetRow[] = [];
  const errors: { row: number; error: string }[] = [];
  const fileSeen: { pids: Map<string, number>; tags: Map<string, number> } = {
    pids: new Map(),
    tags: new Map(),
  };

  // headerRow is 1-based; data starts at headerRow (0-based index = headerRow)
  // Row 1 in the sheet is at index 0 in our rows array
  const dataStartIndex = headerRow; // 0-based index after the header row
  const totalRows = rows.length;

  if (totalRows <= dataStartIndex) {
    return {
      validRows,
      errors: [
        { row: headerRow, error: "No data rows found after the header row." },
      ],
    };
  }

  if (totalRows - dataStartIndex > MAX_IMPORT_ROWS) {
    return {
      validRows,
      errors: [
        {
          row: headerRow,
          error: `File contains ${totalRows - dataStartIndex} data rows. Maximum allowed is ${MAX_IMPORT_ROWS}.`,
        },
      ],
    };
  }

  for (let i = dataStartIndex; i < totalRows; i++) {
    const rowNum = i + 1; // 1-based row number
    const rowCells = rows[i] ?? [];

    // Skip completely empty rows
    const hasContent = rowCells.some((c) => c.trim() !== "");
    if (!hasContent) continue;

    // Extract raw field values from mapped columns
    const raw: Record<AssetImportFieldId, string> = {} as Record<
      AssetImportFieldId,
      string
    >;
    for (const [fieldId, colIndex] of Object.entries(mapping)) {
      if (!ASSET_IMPORT_FIELD_IDS.has(fieldId)) continue;
      raw[fieldId as AssetImportFieldId] = rowCells[colIndex] ?? "";
    }

    const result = validateAssetImportRow(raw, lookups, fileSeen, rowNum);
    if (result.status === "ok") {
      validRows.push(result.row);
    } else {
      errors.push({ row: rowNum, error: result.error });
    }
  }

  return { validRows, errors };
}

// ---------------------------------------------------------------------------
// Workbook parsing (server-only — uses ExcelJS)
// ---------------------------------------------------------------------------

export interface SheetData {
  name: string;
  rowCount: number;
  headers: string[];
  rows: string[][]; // 2D array of cell text values
}

/**
 * Parse an uploaded .xlsx/.xls or .csv buffer into SheetData.
 * For CSV, returns a single virtual sheet named "Sheet1".
 */
export async function parseWorkbook(
  buffer: Buffer,
  fileName: string,
): Promise<SheetData[]> {
  if (isExcelFileName(fileName)) {
    return parseExcelBuffer(buffer);
  }
  if (isCsvFileName(fileName)) {
    return parseCsvBuffer(buffer);
  }
  throw new Error(`Unsupported file type: ${fileName}`);
}

async function parseExcelBuffer(buffer: Buffer): Promise<SheetData[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const sheets: SheetData[] = [];
  for (const ws of wb.worksheets) {
    if (!ws || ws.actualRowCount === 0) continue;

    const maxCol = ws.actualColumnCount || 1;
    const rows: string[][] = [];
    let foundFirstRow = false;

    ws.eachRow({ includeEmpty: true }, (row) => {
      const rowValues: string[] = [];
      for (let c = 1; c <= maxCol; c++) {
        const cell = row.getCell(c);
        rowValues.push(cellToText(cell.value));
      }
      rows.push(rowValues);
      foundFirstRow = true;
    });

    if (!foundFirstRow) continue;

    // Determine headers from first non-empty row
    let headerRowIdx = 0;
    while (headerRowIdx < rows.length) {
      const nonEmptyCount = rows[headerRowIdx].filter(
        (c) => c.trim() !== "",
      ).length;
      if (nonEmptyCount > 0) break;
      headerRowIdx++;
    }

    const headers = rows[headerRowIdx] ?? [];

    sheets.push({
      name: ws.name || "Sheet1",
      rowCount: rows.length,
      headers,
      rows,
    });
  }

  if (sheets.length === 0) {
    sheets.push({ name: "Sheet1", rowCount: 0, headers: [], rows: [] });
  }

  return sheets;
}

/**
 * Detect delimiter from a line (comma, semicolon, tab).
 */
function detectDelimiter(line: string): string {
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && char in counts) {
      counts[char]++;
    }
  }
  let best = ",";
  let bestCount = 0;
  for (const [delim, count] of Object.entries(counts)) {
    if (count > bestCount) {
      best = delim;
      bestCount = count;
    }
  }
  return best;
}

function parseCsvLine(line: string, delimiter = ","): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

async function parseCsvBuffer(buffer: Buffer): Promise<SheetData[]> {
  const text = buffer.toString("utf-8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) {
    return [{ name: "Sheet1", rowCount: 0, headers: [], rows: [] }];
  }
  const delimiter = detectDelimiter(lines[0]);
  const rows = lines.map((l) => parseCsvLine(l, delimiter));
  const headers = rows[0] ?? [];
  return [
    {
      name: "Sheet1",
      rowCount: rows.length,
      headers,
      rows,
    },
  ];
}

// ---------------------------------------------------------------------------
// Auto-mapping
// ---------------------------------------------------------------------------

/** Strip all non-alphanumeric chars and normalize whitespace for matching. */
function normalizeHeader(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Attempt to automatically map column headers to asset import fields.
 * Returns a mapping of fieldId → column index.
 */
export function autoMapAssetColumns(
  headers: string[],
): Partial<Record<AssetImportFieldId, number>> {
  const mapping: Partial<Record<AssetImportFieldId, number>> = {};
  const normalized = headers.map((h) => normalizeHeader(h));

  // Pass 1: exact alias match
  for (let i = 0; i < normalized.length; i++) {
    const cell = normalized[i];
    if (!cell) continue;

    for (const [fieldId, aliases] of Object.entries(ALIASES) as [
      AssetImportFieldId,
      string[],
    ][]) {
      if (mapping[fieldId] !== undefined) continue;
      for (const alias of aliases) {
        if (cell === normalizeHeader(alias)) {
          mapping[fieldId] = i;
          break;
        }
      }
    }
  }

  // Pass 2: partial "contains" fallback so real-world headers
  // (e.g. "Asset Tag Number", "Cat #", "Serial Number / PID")
  // still resolve to the right field. Only unmatched fields are considered.
  for (let i = 0; i < normalized.length; i++) {
    const cell = normalized[i];
    if (!cell) continue;

    for (const [fieldId, aliases] of Object.entries(ALIASES) as [
      AssetImportFieldId,
      string[],
    ][]) {
      if (mapping[fieldId] !== undefined) continue;
      for (const alias of aliases) {
        const a = normalizeHeader(alias);
        // Skip overly-generic short aliases and single letters to avoid bad guesses.
        if (a.length < 3 || a.replace(/\s/g, "").length < 4) continue;
        if (cell.includes(a) || a.includes(cell)) {
          mapping[fieldId] = i;
          break;
        }
      }
      // Iteration order over aliases means the most-specific (first-listed) alias wins.
      if (mapping[fieldId] !== undefined) break;
    }
  }

  return mapping;
}

/**
 * Validate and clean a user-supplied column mapping.
 * Removes invalid entries and maps column indices to field IDs.
 */
export function cleanColumnMapping(
  mapping: Record<string, number>,
  maxColumns: number,
): Partial<Record<AssetImportFieldId, number>> {
  const cleaned: Partial<Record<AssetImportFieldId, number>> = {};
  for (const [fieldId, colIndex] of Object.entries(mapping)) {
    if (!ASSET_IMPORT_FIELD_IDS.has(fieldId)) continue;
    if (typeof colIndex !== "number" || colIndex < 0 || colIndex >= maxColumns)
      continue;
    cleaned[fieldId as AssetImportFieldId] = colIndex;
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// Friendly error message for Prisma unique violations
// ---------------------------------------------------------------------------

export function friendlyUniqueError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes("Unique constraint failed on the fields: (`assettag`)")) {
    return "A Tag already exists in the system with this value.";
  }
  if (
    msg.includes("Unique constraint failed on the fields: (`serialnumber`)")
  ) {
    return "A PID (Asset ID) already exists in the system with this value.";
  }
  if (msg.includes("Unique constraint failed")) {
    return "A unique constraint was violated — this asset already exists in the system.";
  }
  return msg;
}
