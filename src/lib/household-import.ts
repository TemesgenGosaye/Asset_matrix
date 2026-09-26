import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  parseWorkbook,
  parseBool,
  MAX_IMPORT_ROWS,
  type SheetData,
} from "@/lib/excel-import";
import {
  HOUSE_TYPES,
  STAFF_CATEGORIES,
  RG_TYPES,
  HOUSEHOLD_IMPORT_MODES,
  getExpectedHouseNumberPrefix,
  HOUSE_NUMBER_FAMILY_REGEX,
  HOUSEHOLD_HID_REGEX,
  type HouseholdImportMode,
} from "@/lib/household-constants";
import { createHouseholdSchema } from "@/lib/validation";
import { validateHouseIdFormat } from "@/lib/household";

/**
 * House Register Excel import domain service.
 *
 * Single source of truth for the import pipeline:
 *   parse → normalize → validate → classify → confirm → persist
 *
 * All validation reuses the exact same rules as the House Register UI
 * (`createHouseholdSchema`, `validateHouseIdFormat`, house-number regexes),
 * so the UI, Excel import, House Queue and allocation engine never drift.
 *
 * Imports write real `household` rows only. HID is server-generated (same
 * `106-90-NNN` scheme used by `POST /api/household`), `srNo` is never written
 * (Postgres serial), and `occupancyStatus` defaults to `Vacant` so imported
 * houses never appear assigned. The House Queue reads `household` live and
 * therefore recognises imported houses immediately — no separate dataset.
 */

// ---------------------------------------------------------------------------
// Field metadata (the exact template contract)
// ---------------------------------------------------------------------------

export type HouseholdImportFieldId =
  | "srNo"
  | "hid"
  | "houseNumber"
  | "houseType"
  | "staffCategory"
  | "rgType"
  | "locationName"
  | "status"
  | "bedCount"
  | "chairsCount"
  | "lockerCount"
  | "tablesCount"
  | "damageWindow"
  | "damageDoor"
  | "damageWaterPanel"
  | "damageRoof"
  | "damageWall"
  | "damageElectricity"
  | "damageNotes";

export interface HouseholdImportField {
  id: HouseholdImportFieldId;
  label: string;
  required: boolean;
  /** True when the column is only required under a condition (e.g. Staff category). */
  conditional?: boolean;
  hint: string;
}

export const HOUSEHOLD_IMPORT_FIELDS: readonly HouseholdImportField[] = [
  { id: "srNo", label: "Sr. No.", required: true, hint: "REQUIRED column. Row number, e.g. 1, 2, 3... Just for your reference — not saved (the system assigns SR numbers automatically)." },
  { id: "houseNumber", label: "House Number", required: true, hint: "REQUIRED. Must use a valid family: Staff SA1-SE999 or categories A1-E999 (e.g. SA1, SB2, A1, E5). Case-insensitive; stored in capitals." },
  { id: "houseType", label: "House Type", required: true, hint: "REQUIRED. One of: Staff, A, B, C, D, E." },
  { id: "staffCategory", label: "Staff Category", required: false, conditional: true, hint: "Required ONLY when House Type is Staff. One of: A, B, C, D, E (e.g. Staff + A → SA1). Leave blank for category houses A-E." },
  { id: "rgType", label: "R/G Type", required: true, hint: "REQUIRED. One of: Regular, Guest (Guest House and Guest are both accepted)." },
  { id: "hid", label: "House ID (HID)", required: false, hint: "Optional. Canonical format 106-90-001. Leave blank to let the system generate the next HID automatically." },
  { id: "locationName", label: "Location Name", required: false, hint: "Optional. Free-text location, e.g. Main Campus Block B." },
  { id: "status", label: "Status", required: false, hint: "Optional. Active (ready for occupancy) or Inactive (under maintenance). Defaults to Active." },
  { id: "bedCount", label: "Bed Count", required: false, hint: "Optional. Whole number, e.g. 2. Defaults to 0." },
  { id: "chairsCount", label: "Chairs Count", required: false, hint: "Optional. Whole number, e.g. 4. Defaults to 0." },
  { id: "lockerCount", label: "Locker Count", required: false, hint: "Optional. Whole number, e.g. 2. Defaults to 0." },
  { id: "tablesCount", label: "Tables Count", required: false, hint: "Optional. Whole number, e.g. 1. Defaults to 0." },
  { id: "damageWindow", label: "Damage — Window", required: false, hint: "Optional. Yes / No. Required to tick at least one damage item when Status is Inactive." },
  { id: "damageDoor", label: "Damage — Door", required: false, hint: "Optional. Yes / No." },
  { id: "damageWaterPanel", label: "Damage — Water Panel", required: false, hint: "Optional. Yes / No." },
  { id: "damageRoof", label: "Damage — Roof", required: false, hint: "Optional. Yes / No." },
  { id: "damageWall", label: "Damage — Wall", required: false, hint: "Optional. Yes / No." },
  { id: "damageElectricity", label: "Damage — Electricity", required: false, hint: "Optional. Yes / No." },
  { id: "damageNotes", label: "Damage Notes", required: false, hint: "Optional. Free text, max 1000 characters." },
];

export const HOUSEHOLD_IMPORT_FIELD_IDS: ReadonlySet<string> = new Set(
  HOUSEHOLD_IMPORT_FIELDS.map((f) => f.id),
);

export const HOUSEHOLD_REQUIRED_FIELD_IDS: readonly HouseholdImportFieldId[] =
  HOUSEHOLD_IMPORT_FIELDS.filter((f) => f.required).map((f) => f.id);

// ---------------------------------------------------------------------------
// Header auto-mapping
// ---------------------------------------------------------------------------

const HOUSEHOLD_IMPORT_ALIASES: Record<HouseholdImportFieldId, string[]> = {
  srNo: ["sr no", "sr.no", "srno", "s.no", "sno", "row no", "row", "no", "#", "sl no", "sl.no", "serial no"],
  houseNumber: ["house number", "house no", "house no.", "house number (id)", "house #", "unit no", "unit number", "houseno", "no."],
  houseType: ["house type", "type", "house class", "unit type", "housetype"],
  staffCategory: ["staff category", "category", "staff cat", "staffcat", "staff"],
  rgType: ["r/g type", "rg type", "rg", "r/g classification", "guest/regular", "regular guest", "classification", "type (r/g)"],
  hid: ["hid", "house id", "house id (hid)", "houseid", "id"],
  locationName: ["location name", "location", "site", "site name", "loc", "area"],
  status: ["status", "house status", "active/inactive", "active status", "condition status"],
  bedCount: ["bed count", "beds", "no of beds", "number of beds", "bed"],
  chairsCount: ["chairs count", "chairs", "no of chairs", "number of chairs", "chair"],
  lockerCount: ["locker count", "lockers", "no of lockers", "number of lockers", "locker"],
  tablesCount: ["tables count", "tables", "no of tables", "number of tables", "table"],
  damageWindow: ["damage window", "window damage", "damaged window", "window"],
  damageDoor: ["damage door", "door damage", "damaged door", "door"],
  damageWaterPanel: ["damage water panel", "water panel damage", "damaged water panel", "water panel", "water panel"],
  damageRoof: ["damage roof", "roof damage", "damaged roof", "roof"],
  damageWall: ["damage wall", "wall damage", "damaged wall", "wall"],
  damageElectricity: ["damage electricity", "electricity damage", "damaged electricity", "electricity", "electrical"],
  damageNotes: ["damage notes", "damage note", "notes", "remarks", "comment", "comments", "maintenance notes"],
};

/** Strip all non-alphanumeric chars and normalize whitespace for matching. */
export function normalizeHouseholdHeader(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Attempt to automatically map column headers to household import fields.
 *
 * Two-phase matching so a header like "R/G Type" maps to `rgType` (exact
 * alias) instead of being stolen by the generic "type" alias of `houseType`:
 *   1. exact alias equality (case/whitespace/punctuation-insensitive)
 *   2. "contains" fallback for anything still unmapped
 */
export function autoMapHouseholdColumns(
  headers: string[],
): Partial<Record<HouseholdImportFieldId, number>> {
  const mapping: Partial<Record<HouseholdImportFieldId, number>> = {};
  const normalized = headers.map(normalizeHouseholdHeader);

  const entries = Object.entries(
    HOUSEHOLD_IMPORT_ALIASES,
  ) as [HouseholdImportFieldId, string[]][];

  // Phase 1: exact alias match.
  for (let i = 0; i < normalized.length; i++) {
    const cell = normalized[i];
    if (!cell) continue;
    for (const [fieldId, aliases] of entries) {
      if (mapping[fieldId] !== undefined) continue;
      for (const alias of aliases) {
        if (cell === normalizeHouseholdHeader(alias)) {
          mapping[fieldId] = i;
          break;
        }
      }
    }
  }

  // Phase 2: contains fallback for columns that had no exact alias.
  for (let i = 0; i < normalized.length; i++) {
    const cell = normalized[i];
    if (!cell) continue;
    for (const [fieldId, aliases] of entries) {
      if (mapping[fieldId] !== undefined) continue;
      for (const alias of aliases) {
        const aliasNorm = normalizeHouseholdHeader(alias);
        // "Contains" matching only for meaningful aliases; single/two-letter
        // aliases (e.g. "R", "rg") stay exact-match-only to avoid stealing
        // unrelated columns.
        if (aliasNorm.length >= 3 && cell.includes(aliasNorm)) {
          mapping[fieldId] = i;
          break;
        }
      }
    }
  }

  return mapping;
}

// ---------------------------------------------------------------------------
// Value normalization (mirrors the House Register vocabulary)
// ---------------------------------------------------------------------------

export function normalizeHouseType(value: string): string | null {
  const v = value.trim().toLowerCase().replace(/\s+/g, "");
  if (v === "staff" || v === "seniorstaff") return "Staff";
  const upper = v.toUpperCase();
  return (HOUSE_TYPES as readonly string[]).includes(upper) && upper !== "STAFF"
    ? upper
    : null;
}

export function normalizeStaffCategory(value: string): string | null {
  const v = value.trim().toUpperCase();
  if (!(STAFF_CATEGORIES as readonly string[]).includes(v)) return null;
  return v;
}

export function normalizeRgType(value: string): string | null {
  const v = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (v === "regular" || v === "r" || v === "reg") return "Regular";
  if (v === "guest" || v === "guest house" || v === "g") return "Guest";
  return null;
}

export function normalizeHouseholdStatus(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (v === "active" || v === "") return "Active";
  if (v === "inactive" || v === "under maintenance" || v === "maintenance") {
    return "Inactive";
  }
  return null;
}

/** Parse a whole-number count column. Returns null when empty, NaN when invalid. */
export function parseCount(value: string): number | null | "invalid" {
  const v = value.trim();
  if (v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return "invalid";
  return n;
}

// ---------------------------------------------------------------------------
// Import modes
// ---------------------------------------------------------------------------

export { HOUSEHOLD_IMPORT_MODES, type HouseholdImportMode } from "@/lib/household-constants";

export function parseHouseholdImportMode(value: string): HouseholdImportMode | null {
  return value === "add" || value === "update" || value === "add_update"
    ? value
    : null;
}

// ---------------------------------------------------------------------------
// Parsed + classified row types
// ---------------------------------------------------------------------------

export type HouseholdRowClassification =
  | "new"
  | "update"
  | "existing" // exists but skipped (add mode)
  | "not_found" // update mode only, no existing record
  | "duplicate" // duplicate inside the file
  | "conflict" // clashes with existing register records / lifecycle rules
  | "invalid"; // failed backend validation

export interface ParsedHouseholdRow {
  excelRow: number;
  hid: string; // "" when not provided (server will generate)
  houseNumber: string; // uppercased
  houseType: string;
  staffCategory: string | null;
  rgType: string;
  locationName: string | null;
  status: string;
  bedCount: number;
  chairsCount: number;
  lockerCount: number;
  tablesCount: number;
  damageWindow: boolean;
  damageDoor: boolean;
  damageWaterPanel: boolean;
  damageRoof: boolean;
  damageWall: boolean;
  damageElectricity: boolean;
  damageNotes: string | null;
}

export interface ExistingHouseholdLite {
  id: string;
  hid: string;
  houseNumber: string;
  houseType: string;
  staffCategory: string | null;
  rgType: string;
  locationName: string | null;
  status: string;
  bedCount: number;
  chairsCount: number;
  lockerCount: number;
  tablesCount: number;
  damageWindow: boolean;
  damageDoor: boolean;
  damageWaterPanel: boolean;
  damageRoof: boolean;
  damageWall: boolean;
  damageElectricity: boolean;
  damageNotes: string | null;
  /** true when a live (allocated) HouseAllocation points at the house. */
  isAllocated: boolean;
  /** true when an unresolved handback inspection is open. */
  hasOpenInspection: boolean;
}

export interface HouseholdPreviewRow {
  excelRow: number;
  hid: string;
  houseNumber: string;
  houseType: string;
  staffCategory: string | null;
  rgType: string;
  status: string;
  classification: HouseholdRowClassification;
  action: "create" | "update" | "skip";
  message: string;
  hasChanges?: boolean;
}

// ---------------------------------------------------------------------------
// Analysis (parse workbook → validate → classify)
// ---------------------------------------------------------------------------

export interface HouseholdImportColumnInfo {
  id: HouseholdImportFieldId;
  label: string;
  required: boolean;
  conditional: boolean;
  mapped: boolean;
}

export interface HouseholdImportSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  newRows: number;
  updateRows: number;
  existingSkipped: number;
  notFoundSkipped: number;
  duplicateRows: number;
  conflictRows: number;
  /** Rows that will actually create or update in the DB. */
  actionableRows: number;
}

export interface HouseholdImportAnalysis {
  fileName: string;
  fileSize: number;
  sheetName: string;
  sheetNames: string[];
  headerRow: number;
  dataRowCount: number;
  mappedColumns: HouseholdImportColumnInfo[];
  mapping: Partial<Record<HouseholdImportFieldId, number>>;
  mode: HouseholdImportMode;
  summary: HouseholdImportSummary;
  rows: HouseholdPreviewRow[];
  /** Actionable rows (create/update) with full parsed values, used by the confirm endpoint. */
  pendingRows: HouseholdPendingRow[];
  missingRequiredColumns: string[];
  /** Excel row → validation message list (validation + conflicts + lifecycle guards). */
  errors: { excelRow: number; houseNumber: string; message: string }[];
  /** Error rows exceed this cap in the response payload; full set available on confirm. */
  truncated: boolean;
}

export interface HouseholdPendingRow {
  row: ParsedHouseholdRow;
  classification: HouseholdRowClassification;
  action: "create" | "update";
}

export const HOUSEHOLD_PREVIEW_ROW_LIMIT = 3000;

export interface HouseholdLookups {
  byNumber: Map<string, ExistingHouseholdLite>;
  byHid: Map<string, ExistingHouseholdLite>;
}

export function buildHouseholdLookups(
  households: ExistingHouseholdLite[],
): HouseholdLookups {
  const byNumber = new Map<string, ExistingHouseholdLite>();
  const byHid = new Map<string, ExistingHouseholdLite>();
  for (const h of households) {
    byNumber.set(h.houseNumber.toUpperCase(), h);
    if (h.hid) byHid.set(h.hid, h);
  }
  return { byNumber, byHid };
}

/**
 * Fetch the org-scoped register snapshot the classify step needs: every house
 * plus the set of houses with a live allocation (status "allocated") and the
 * set with an unresolved handback inspection. Used by preview AND confirm so
 * the two never disagree.
 */
export async function fetchHouseholdImportContext(
  orgId: string,
): Promise<{ lookups: HouseholdLookups; households: ExistingHouseholdLite[] }> {
  const [households, allocations, inspections] = await Promise.all([
    prisma.household.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        hid: true,
        houseNumber: true,
        houseType: true,
        staffCategory: true,
        rgType: true,
        locationName: true,
        status: true,
        bedCount: true,
        chairsCount: true,
        lockerCount: true,
        tablesCount: true,
        damageWindow: true,
        damageDoor: true,
        damageWaterPanel: true,
        damageRoof: true,
        damageWall: true,
        damageElectricity: true,
        damageNotes: true,
      },
    }),
    prisma.houseAllocation.findMany({
      where: { status: "allocated" },
      select: { householdId: true },
    }),
    prisma.houseInspection.findMany({
      where: { organizationId: orgId, resolvedTo: null },
      select: { householdId: true },
    }),
  ]);

  const allocatedIds = new Set(
    allocations.map((a) => a.householdId).filter((id): id is string => !!id),
  );
  const openInspectionIds = new Set(
    inspections.map((i) => i.householdId),
  );

  const lite: ExistingHouseholdLite[] = households.map((h) => ({
    ...h,
    isAllocated: allocatedIds.has(h.id),
    hasOpenInspection: openInspectionIds.has(h.id),
  }));

  return { lookups: buildHouseholdLookups(lite), households: lite };
}

function houseRowsEqual(row: ParsedHouseholdRow, existing: ExistingHouseholdLite): boolean {
  return (
    row.houseType === existing.houseType &&
    (row.staffCategory ?? null) === (existing.staffCategory ?? null) &&
    row.rgType === existing.rgType &&
    (row.locationName ?? null) === (existing.locationName ?? null) &&
    row.status === existing.status &&
    row.bedCount === existing.bedCount &&
    row.chairsCount === existing.chairsCount &&
    row.lockerCount === existing.lockerCount &&
    row.tablesCount === existing.tablesCount &&
    row.damageWindow === existing.damageWindow &&
    row.damageDoor === existing.damageDoor &&
    row.damageWaterPanel === existing.damageWaterPanel &&
    row.damageRoof === existing.damageRoof &&
    row.damageWall === existing.damageWall &&
    row.damageElectricity === existing.damageElectricity &&
    (row.damageNotes ?? null) === (existing.damageNotes ?? null)
  );
}

/**
 * Parse + validate + classify a workbook against live register data.
 * Pure except for the supplied workbook buffer; DB data is passed in via
 * `existingByNumber` / `existingByHid` so preview and confirm stay identical.
 */
export async function analyzeHouseholdWorkbook(
  buffer: Buffer,
  fileName: string,
  sheetName: string | undefined,
  mode: HouseholdImportMode,
  existing: HouseholdLookups,
): Promise<HouseholdImportAnalysis> {
  const sheets: SheetData[] = await parseWorkbook(buffer, fileName);

  if (sheets.length === 0) {
    throw new Error("The file contains no readable worksheets.");
  }

  const sheetNames = sheets.map((s) => s.name);
  const target =
    sheetName !== undefined
      ? sheets.find((s) => s.name.toLowerCase() === sheetName.toLowerCase())
      : null;

  // Auto-detect the worksheet: prefer the one whose headers contain the most
  // required household columns; fall back to the first non-empty sheet.
  let sheet: SheetData;
  if (target) {
    sheet = target;
  } else {
    let best: SheetData | null = null;
    let bestScore = -1;
    for (const s of sheets) {
      if (s.rows.length === 0) continue;
      const mapping = autoMapHouseholdColumns(s.headers);
      const score = HOUSEHOLD_REQUIRED_FIELD_IDS.filter(
        (id) => mapping[id] !== undefined,
      ).length;
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    if (!best) {
      throw new Error(
        "No worksheet with valid House Register headers was found. Download the House Register template and use it as a guide.",
      );
    }
    sheet = best;
  }

  if (!sheet || sheet.rows.length === 0) {
    throw new Error(`The worksheet "${sheet.name}" is empty.`);
  }

  // Header row = first row with any content.
  let headerRowIdx = -1;
  for (let i = 0; i < sheet.rows.length; i++) {
    if (sheet.rows[i].some((c) => c.trim() !== "")) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx === -1) {
    throw new Error(`The worksheet "${sheet.name}" is empty.`);
  }

  const headers = sheet.rows[headerRowIdx] ?? [];
  const mapping = autoMapHouseholdColumns(headers);
  const dataStart = headerRowIdx + 1;
  const dataRows = sheet.rows.slice(dataStart);
  const dataRowCount = dataRows.length;

  if (dataRowCount > MAX_IMPORT_ROWS) {
    throw new Error(
      `The worksheet contains ${dataRowCount} data rows. Maximum allowed is ${MAX_IMPORT_ROWS}.`,
    );
  }

  const missingRequiredColumns = HOUSEHOLD_REQUIRED_FIELD_IDS.filter(
    (id) => mapping[id] === undefined,
  );

  const mappedColumns: HouseholdImportColumnInfo[] = HOUSEHOLD_IMPORT_FIELDS.map(
    (f) => ({
      id: f.id,
      label: f.label,
      required: f.required,
      conditional: f.conditional ?? false,
      mapped: mapping[f.id] !== undefined,
    }),
  );

  const labels = new Map<string, string>(
    HOUSEHOLD_IMPORT_FIELDS.map((f) => [f.id, f.label]),
  );

  // ---- Validate every row ----
  const parsedRows: ParsedHouseholdRow[] = [];
  const rawErrors: { excelRow: number; houseNumber: string; message: string }[] = [];

  const seenNumbers = new Map<string, number>();
  const seenHids = new Map<string, number>();

  dataRows.forEach((cellsRaw, idx) => {
    const excelRow = dataStart + idx + 1;
    const rowCells = cellsRaw ?? [];
    const hasContent = rowCells.some((c) => (c ?? "").trim() !== "");
    if (!hasContent) return;

    const raw = (id: HouseholdImportFieldId): string => {
      const col = mapping[id];
      if (col === undefined) return "";
      return (rowCells[col] ?? "").trim();
    };

    const parseSingle = (): ParsedHouseholdRow => {
      const houseNumber = raw("houseNumber").toUpperCase();
      const hid = raw("hid").trim();
      const houseTypeRaw = raw("houseType");
      const rgTypeRaw = raw("rgType");
      const statusRaw = raw("status");

      const damageWindow = parseBool(raw("damageWindow")) ?? false;
      const damageDoor = parseBool(raw("damageDoor")) ?? false;
      const damageWaterPanel = parseBool(raw("damageWaterPanel")) ?? false;
      const damageRoof = parseBool(raw("damageRoof")) ?? false;
      const damageWall = parseBool(raw("damageWall")) ?? false;
      const damageElectricity = parseBool(raw("damageElectricity")) ?? false;

      const bedCount = parseCount(raw("bedCount"));
      const chairsCount = parseCount(raw("chairsCount"));
      const lockerCount = parseCount(raw("lockerCount"));
      const tablesCount = parseCount(raw("tablesCount"));

      return {
        excelRow,
        hid,
        houseNumber,
        houseType: houseTypeRaw.trim() || "",
        staffCategory: raw("staffCategory") || null,
        rgType: rgTypeRaw.trim() || "",
        locationName: raw("locationName") || null,
        status: statusRaw.trim() || "Active",
        bedCount: bedCount === "invalid" ? 0 : (bedCount ?? 0),
        chairsCount: chairsCount === "invalid" ? 0 : (chairsCount ?? 0),
        lockerCount: lockerCount === "invalid" ? 0 : (lockerCount ?? 0),
        tablesCount: tablesCount === "invalid" ? 0 : (tablesCount ?? 0),
        damageWindow,
        damageDoor,
        damageWaterPanel,
        damageRoof,
        damageWall,
        damageElectricity,
        damageNotes: raw("damageNotes") || null,
      };
    };

    const row = parseSingle();
    const errorList: string[] = [];

    // Field-level checks that precede the shared schema.
    if (row.houseNumber !== "" && !HOUSE_NUMBER_FAMILY_REGEX.test(row.houseNumber)) {
      errorList.push(
        "House Number: must use a valid family (Staff SA1-SE999 or categories A1-E999), e.g. SA1, SB2, A1, E5.",
      );
    }
    if (row.hid !== "") {
      if (!HOUSEHOLD_HID_REGEX.test(row.hid)) {
        errorList.push("House ID (HID): must follow the canonical format 106-90-001.");
      } else if (!validateHouseIdFormat(row.hid)) {
        errorList.push("House ID (HID): must follow the canonical format 106-90-001.");
      }
    }

    const normalizedHouseType = row.houseType === "" ? row.houseType : (normalizeHouseType(row.houseType) ?? row.houseType);
    const normalizedStaff = row.staffCategory ? normalizeStaffCategory(row.staffCategory) : null;
    const normalizedRg = row.rgType === "" ? row.rgType : (normalizeRgType(row.rgType) ?? row.rgType);
    const normalizedStatus = row.status === "" ? "Active" : (normalizeHouseholdStatus(row.status) ?? row.status);

    const countChecks: { label: string; value: number | null | "invalid" }[] = [
      { label: "Bed Count", value: parseCount(raw("bedCount")) },
      { label: "Chairs Count", value: parseCount(raw("chairsCount")) },
      { label: "Locker Count", value: parseCount(raw("lockerCount")) },
      { label: "Tables Count", value: parseCount(raw("tablesCount")) },
    ];
    for (const c of countChecks) {
      if (c.value === "invalid") errorList.push(`${c.label}: must be a non-negative whole number.`);
    }

    const boolChecks: { label: string; raw: string }[] = [
      { label: "Damage — Window", raw: raw("damageWindow") },
      { label: "Damage — Door", raw: raw("damageDoor") },
      { label: "Damage — Water Panel", raw: raw("damageWaterPanel") },
      { label: "Damage — Roof", raw: raw("damageRoof") },
      { label: "Damage — Wall", raw: raw("damageWall") },
      { label: "Damage — Electricity", raw: raw("damageElectricity") },
    ];
    for (const b of boolChecks) {
      if (b.raw !== "" && parseBool(b.raw) === null) {
        errorList.push(`${b.label}: use Yes/No, True/False, or 1/0.`);
      }
    }

    // Run the actual House Register validation rules (shared with the UI).
    const schemaResult = createHouseholdSchema.safeParse({
      hid: row.hid === "" ? undefined : row.hid,
      houseType: normalizedHouseType,
      staffCategory: normalizedStaff,
      houseNumber: row.houseNumber,
      rgType: normalizedRg,
      locationId: undefined,
      locationName: row.locationName,
      status: normalizedStatus,
      bedCount: row.bedCount,
      chairsCount: row.chairsCount,
      lockerCount: row.lockerCount,
      tablesCount: row.tablesCount,
      damageWindow: row.damageWindow,
      damageDoor: row.damageDoor,
      damageWaterPanel: row.damageWaterPanel,
      damageRoof: row.damageRoof,
      damageWall: row.damageWall,
      damageElectricity: row.damageElectricity,
      damageNotes: row.damageNotes,
    });

    if (!schemaResult.success) {
      errorList.push(
        ...schemaResult.error.issues.map((issue) => {
          const field = String(issue.path[0] ?? "");
          const label = labels.get(field) ?? field;
          return `${label}: ${issue.message}`;
        }),
      );
    }

    // Build the canonical parsed row (uppercase house number, normalized values).
    const parsed: ParsedHouseholdRow = {
      ...row,
      houseNumber: row.houseNumber.toUpperCase(),
      hid: row.hid,
      houseType: normalizedHouseType,
      staffCategory: normalizedStaff ?? null,
      rgType: normalizedRg,
      status: normalizedStatus,
      locationName: row.locationName || null,
    };

    if (errorList.length > 0) {
      rawErrors.push({
        excelRow,
        houseNumber: parsed.houseNumber || "(missing)",
        message: errorList.join(" "),
      });
      return;
    }

    // ---- In-file duplicate detection ----
    const numKey = parsed.houseNumber.toUpperCase();
    if (seenNumbers.has(numKey)) {
      rawErrors.push({
        excelRow,
        houseNumber: parsed.houseNumber,
        message: `Duplicate house number ${parsed.houseNumber} in the file — first seen on Excel row ${seenNumbers.get(numKey)}.`,
      });
      return;
    }
    if (parsed.hid !== "") {
      if (seenHids.has(parsed.hid)) {
        rawErrors.push({
          excelRow,
          houseNumber: parsed.houseNumber,
          message: `Duplicate House ID ${parsed.hid} in the file — first seen on Excel row ${seenHids.get(parsed.hid)}.`,
        });
        return;
      }
      seenHids.set(parsed.hid, excelRow);
    }
    seenNumbers.set(numKey, excelRow);
    parsedRows.push(parsed);
  });

  // ---- Classify against the live register ----
  const previewRows: HouseholdPreviewRow[] = [];
  const pendingRows: HouseholdPendingRow[] = [];
  for (const parsed of parsedRows) {
    const existingByNumber = existing.byNumber.get(parsed.houseNumber.toUpperCase());
    const existingByHid = parsed.hid !== "" ? existing.byHid.get(parsed.hid) : undefined;

    // Provided HID already belongs to a different house, or belongs to an
    // existing house that is not the house matched by houseNumber → conflict.
    const hidClaimedByOther =
      existingByHid !== undefined &&
      (existingByNumber === undefined ||
        existingByHid.id !== existingByNumber.id);
    if (hidClaimedByOther) {
      previewRows.push({
        ...parsed,
        classification: "conflict",
        action: "skip",
        message: `House ID ${parsed.hid} is already assigned to house ${existingByHid.houseNumber} in the register. Remove the HID from this row or update that house instead.`,
      });
      continue;
    }

    if (!existingByNumber) {
      // New house.
      if (mode === "update") {
        previewRows.push({
          ...parsed,
          classification: "not_found",
          action: "skip",
          message: `House ${parsed.houseNumber} was not found in the register. Use "Add New Houses" (or Add + Update) to create it.`,
        });
      } else {
        previewRows.push({
          ...parsed,
          classification: "new",
          action: "create",
          message:
            parsed.hid !== ""
              ? `New house. HID ${parsed.hid} will be reserved.`
              : "New house. A HID will be generated on import.",
        });
        pendingRows.push({ row: parsed, classification: "new", action: "create" });
      }
      continue;
    }

    // House already exists.
    if (mode === "add") {
      previewRows.push({
        ...parsed,
        classification: "existing",
        action: "skip",
        message: `House number ${parsed.houseNumber} already exists in the House Register.`,
      });
      continue;
    }

    // Update modes — check lifecycle guards first (mirror of PATCH /api/household/[id]).
    const isDeactivating =
      existingByNumber.status !== "Inactive" && parsed.status === "Inactive";
    const isActivating =
      existingByNumber.status === "Inactive" && parsed.status === "Active";

    if (isDeactivating && existingByNumber.isAllocated) {
      previewRows.push({
        ...parsed,
        classification: "conflict",
        action: "skip",
        message: `House ${parsed.houseNumber} is currently allocated. Release it through the House Queue before marking it Inactive.`,
      });
      continue;
    }
    if (isActivating && existingByNumber.hasOpenInspection) {
      previewRows.push({
        ...parsed,
        classification: "conflict",
        action: "skip",
        message: `House ${parsed.houseNumber} is pending its handback inspection. Complete the inspection before activating it.`,
      });
      continue;
    }

    const hasChanges = !houseRowsEqual(parsed, existingByNumber);
    previewRows.push({
      ...parsed,
      classification: "update",
      action: hasChanges ? "update" : "skip",
      hasChanges,
      message: hasChanges
        ? `House ${parsed.houseNumber} exists — fields will be updated.`
        : `House ${parsed.houseNumber} exists — no changes detected, will be skipped.`,
    });
    if (hasChanges) {
      pendingRows.push({ row: parsed, classification: "update", action: "update" });
    }
  }

  // ---- Summary ----
  const summary: HouseholdImportSummary = {
    totalRows: parsedRows.length + rawErrors.length,
    validRows: parsedRows.length,
    invalidRows: rawErrors.length,
    newRows: previewRows.filter((r) => r.classification === "new").length,
    updateRows: previewRows.filter((r) => r.action === "update").length,
    existingSkipped: previewRows.filter((r) => r.classification === "existing").length,
    notFoundSkipped: previewRows.filter((r) => r.classification === "not_found").length,
    duplicateRows: 0,
    conflictRows: previewRows.filter((r) => r.classification === "conflict").length,
    actionableRows: previewRows.filter((r) => r.action === "create" || r.action === "update").length,
  };
  // Duplicate rows were captured as raw errors, so report the count there too.
  summary.duplicateRows = rawErrors.filter((e) =>
    e.message.startsWith("Duplicate "),
  ).length;

  const errors = rawErrors;
  const truncated =
    errors.length > HOUSEHOLD_PREVIEW_ROW_LIMIT ||
    previewRows.length > HOUSEHOLD_PREVIEW_ROW_LIMIT;
  const displayedRows = errors.slice(0, HOUSEHOLD_PREVIEW_ROW_LIMIT);
  const displayedPreviewRows = previewRows.slice(0, HOUSEHOLD_PREVIEW_ROW_LIMIT);

  return {
    fileName,
    fileSize: buffer.length,
    sheetName: sheet.name,
    sheetNames,
    headerRow: headerRowIdx + 1,
    dataRowCount,
    mappedColumns,
    mapping,
    mode,
    summary,
    rows: displayedPreviewRows,
    pendingRows,
    missingRequiredColumns,
    errors: truncated ? displayedRows : errors,
    truncated,
  };
}

// ---------------------------------------------------------------------------
// Persistence (single transaction)
// ---------------------------------------------------------------------------

export interface HouseholdImportOutcome {
  created: number;
  updated: number;
  failed: { excelRow: number; houseNumber: string; message: string }[];
}

/**
 * Persist the import inside the caller's transaction.
 *
 * - Takes the same advisory lock as `POST /api/household` so concurrent HID
 *   generation can never collide.
 * - Re-fetches every target row inside the transaction and re-applies the
 *   lifecycle guards before mutating, so state cannot change between preview
 *   and confirm.
 * - Any thrown error rolls the whole import back (all-or-nothing).
 */
export async function persistHouseholdImport(
  tx: Prisma.TransactionClient,
  orgId: string,
  createRows: ParsedHouseholdRow[],
  updateRows: ParsedHouseholdRow[],
  userId: string | null,
): Promise<HouseholdImportOutcome> {
  const HID_GENERATION_LOCK_KEY = 7282710;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${HID_GENERATION_LOCK_KEY})`;

  const outcome: HouseholdImportOutcome = {
    created: 0,
    updated: 0,
    failed: [],
  };

  // ---- Creates: assign HIDs server-side, same 106-90-NNN scheme ----
  if (createRows.length > 0) {
    const existingHids = await tx.household.findMany({
      where: { organizationId: orgId },
      select: { hid: true },
    });

    let maxNum = -1;
    const regex = /^106-90-(\d+)$/;
    for (const h of existingHids) {
      const m = h.hid.trim().match(regex);
      if (m) {
        const n = parseInt(m[1], 10);
        if (!isNaN(n) && n > maxNum) maxNum = n;
      }
    }

    // Reserve numbers already claimed by provided HIDs in the file.
    const reserved = new Set<number>();
    for (const r of createRows) {
      if (r.hid !== "") {
        const m = r.hid.trim().match(regex);
        if (m) {
          const n = parseInt(m[1], 10);
          if (!isNaN(n)) {
            reserved.add(n);
            if (n > maxNum) maxNum = n;
          }
        }
      }
    }

    let next = maxNum + 1;
    const data: Prisma.HouseholdCreateManyInput[] = createRows.map((row) => {
      let hid = row.hid;
      if (hid === "") {
        while (reserved.has(next)) next++;
        hid = `106-90-${String(next).padStart(3, "0")}`;
        next++;
      }
      const isActive = row.status === "Active";
      return {
        organizationId: orgId,
        hid,
        houseType: row.houseType,
        staffCategory: row.houseType === "Staff" ? row.staffCategory : null,
        houseNumber: row.houseNumber.toUpperCase(),
        rgType: row.rgType,
        locationId: null,
        locationName: row.locationName,
        status: row.status,
        bedCount: row.bedCount,
        chairsCount: row.chairsCount,
        lockerCount: row.lockerCount,
        tablesCount: row.tablesCount,
        ...(isActive
          ? {
              damageWindow: false,
              damageDoor: false,
              damageWaterPanel: false,
              damageRoof: false,
              damageWall: false,
              damageElectricity: false,
              damageNotes: null,
            }
          : {
              damageWindow: row.damageWindow,
              damageDoor: row.damageDoor,
              damageWaterPanel: row.damageWaterPanel,
              damageRoof: row.damageRoof,
              damageWall: row.damageWall,
              damageElectricity: row.damageElectricity,
              damageNotes: row.damageNotes,
            }),
        createdBy: userId ?? undefined,
      };
    });

    await tx.household.createMany({ data });
    outcome.created = data.length;
  }

  // ---- Updates: re-check guards in-transaction, then update ----
  if (updateRows.length > 0) {
    for (const row of updateRows) {
      const existing = await tx.household.findFirst({
        where: {
          organizationId: orgId,
          houseNumber: { equals: row.houseNumber.toUpperCase(), mode: "insensitive" },
        },
      });
      if (!existing) {
        outcome.failed.push({
          excelRow: row.excelRow,
          houseNumber: row.houseNumber,
          message: `House ${row.houseNumber} no longer exists in the register.`,
        });
        continue;
      }

      const isDeactivating =
        existing.status !== "Inactive" && row.status === "Inactive";
      const isActivating =
        existing.status === "Inactive" && row.status === "Active";

      if (isDeactivating) {
        const live = await tx.houseAllocation.count({
          where: { householdId: existing.id, status: "allocated" },
        });
        if (live > 0) {
          outcome.failed.push({
            excelRow: row.excelRow,
            houseNumber: row.houseNumber,
            message: `House ${row.houseNumber} is currently allocated — release it through the House Queue before deactivating.`,
          });
          continue;
        }
      }
      if (isActivating) {
        const open = await tx.houseInspection.count({
          where: { organizationId: orgId, householdId: existing.id, resolvedTo: null },
        });
        if (open > 0) {
          outcome.failed.push({
            excelRow: row.excelRow,
            houseNumber: row.houseNumber,
            message: `House ${row.houseNumber} is pending its handback inspection — complete it before activating.`,
          });
          continue;
        }
      }

      const isActive = row.status === "Active";
      const data: Prisma.HouseholdUpdateManyMutationInput = {
        houseType: row.houseType,
        staffCategory: row.houseType === "Staff" ? row.staffCategory : null,
        houseNumber: row.houseNumber.toUpperCase(),
        rgType: row.rgType,
        locationName: row.locationName,
        status: row.status,
        bedCount: row.bedCount,
        chairsCount: row.chairsCount,
        lockerCount: row.lockerCount,
        tablesCount: row.tablesCount,
        ...(isActive
          ? {
              damageWindow: false,
              damageDoor: false,
              damageWaterPanel: false,
              damageRoof: false,
              damageWall: false,
              damageElectricity: false,
              damageNotes: null,
            }
          : {
              damageWindow: row.damageWindow,
              damageDoor: row.damageDoor,
              damageWaterPanel: row.damageWaterPanel,
              damageRoof: row.damageRoof,
              damageWall: row.damageWall,
              damageElectricity: row.damageElectricity,
              damageNotes: row.damageNotes,
            }),
        ...(row.hid !== "" && row.hid !== existing.hid
          ? { hid: row.hid }
          : {}),
      };
      // Occupancy is owned here for register activate/deactivate only.
      if (isActivating || isDeactivating) {
        data.occupancyStatus = isActivating ? "Vacant" : "Maintenance";
      }

      await tx.household.update({
        where: { id: existing.id },
        data,
      });
      outcome.updated += 1;
    }
  }

  return outcome;
}