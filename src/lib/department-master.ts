/**
 * Metahara Sugar Factory — Official Permanent Department Master Data.
 *
 * This is the SINGLE source of truth for all departments across the system.
 * The hierarchy is expressed by (parent_code, code) tuples.
 *
 * Department codes are stable identifiers; names are the official department names.
 * Legacy name mapping handles migration from old names to official names.
 *
 * Hierarchy levels:
 *   L0 = top-level department  (e.g. "12 CIVIL WORK")
 *   L1 = sub-department        (e.g. "15.1 ABADIR A")
 *   L2 = sub-sub-department    (e.g. "23.2.1 ORGANIZATION AND METHODS")
 *
 * NOTE: This module MUST stay dependency-free (no prisma / server imports) so it
 * can be imported safely by both server scripts and client components.
 */

export type OfficialDepartment = {
  code: string;
  name: string;
  parentCode: string | null;
  sortOrder: number;
};

// ── Official department master ──────────────────────────────────────────────
// Each entry: (code, name, parentCode_or_None, sort_order)
// sort_order preserves the official display order within a parent.

export const OFFICIAL_DEPARTMENTS: OfficialDepartment[] = [
  // ── 12 CIVIL WORK ──────────────────────────────────────────────────────
  { code: "12", name: "CIVIL WORK", parentCode: null, sortOrder: 100 },

  // ── 13 L.P.C.D ─────────────────────────────────────────────────────────
  { code: "13", name: "L.P.C.D", parentCode: null, sortOrder: 200 },

  // ── 14 CULTIVATION ─────────────────────────────────────────────────────
  { code: "14", name: "CULTIVATION", parentCode: null, sortOrder: 300 },
  { code: "14.1", name: "TILLAGE", parentCode: "14", sortOrder: 310 },
  { code: "14.2", name: "CULTIVATION", parentCode: "14", sortOrder: 320 },

  // ── 15 PLANTATION ──────────────────────────────────────────────────────
  { code: "15", name: "PLANTATION", parentCode: null, sortOrder: 400 },
  { code: "15.1", name: "ABADIR A", parentCode: "15", sortOrder: 401 },
  { code: "15.2", name: "ABADIR B", parentCode: "15", sortOrder: 402 },
  { code: "15.3", name: "ABADIR C", parentCode: "15", sortOrder: 403 },
  { code: "15.4", name: "ABADIR EXTENSION", parentCode: "15", sortOrder: 404 },
  { code: "15.5", name: "ABADIR FRUIT", parentCode: "15", sortOrder: 405 },
  { code: "15.6", name: "MERTI 1ST EAST", parentCode: "15", sortOrder: 406 },
  { code: "15.7", name: "MERTI 1ST AWASH", parentCode: "15", sortOrder: 407 },
  { code: "15.8", name: "MERTI 2ND CHORE", parentCode: "15", sortOrder: 408 },
  { code: "15.9", name: "MERTI 2ND G/GOLLA", parentCode: "15", sortOrder: 409 },
  { code: "15.10", name: "MERTI 2ND KENIFA", parentCode: "15", sortOrder: 410 },
  { code: "15.11", name: "MERTI 3RD KIKAN", parentCode: "15", sortOrder: 411 },
  { code: "15.12", name: "MERTI 3RD SOUTH", parentCode: "15", sortOrder: 412 },
  { code: "15.13", name: "MERTI 3RD R.LAND", parentCode: "15", sortOrder: 413 },
  { code: "15.14", name: "NORTH", parentCode: "15", sortOrder: 414 },
  { code: "15.15", name: "RATU CULTURE", parentCode: "15", sortOrder: 415 },

  // ── 16 AGRICULTURE RESEARCH ────────────────────────────────────────────
  { code: "16", name: "AGRICULTURE RESEARCH", parentCode: null, sortOrder: 500 },

  // ── 17 HARVESTING ──────────────────────────────────────────────────────
  { code: "17", name: "HARVESTING", parentCode: null, sortOrder: 600 },
  { code: "17.1", name: "SEED CANE & IRRIGATION", parentCode: "17", sortOrder: 601 },
  { code: "17.2", name: "CANE CUTTING", parentCode: "17", sortOrder: 602 },
  { code: "17.3", name: "HAULAGE", parentCode: "17", sortOrder: 603 },

  // ── 18 F.E.S ───────────────────────────────────────────────────────────
  { code: "18", name: "F.E.S", parentCode: null, sortOrder: 700 },
  { code: "18.1", name: "ESTATE CAR & MOTORCYCLE", parentCode: "18", sortOrder: 701 },
  { code: "18.2", name: "HEAVY EQUIPMENT", parentCode: "18", sortOrder: 702 },
  { code: "18.3", name: "WHEEL TRACTOR", parentCode: "18", sortOrder: 703 },

  // ── 19 COMMERCIAL DEPARTMENT ───────────────────────────────────────────
  { code: "19", name: "COMMERCIAL DEPARTMENT", parentCode: null, sortOrder: 800 },

  // ── 21 TECHNICAL ───────────────────────────────────────────────────────
  { code: "21", name: "TECHNICAL", parentCode: null, sortOrder: 900 },
  { code: "21.1", name: "PREVENTIVE MAINTENANCE, EXTRACTION AND POWER PLANT", parentCode: "21", sortOrder: 910 },
  { code: "21.2", name: "INSTRUMENT WORKSHOP", parentCode: "21", sortOrder: 920 },
  { code: "21.3", name: "ELECTRICAL WORKSHOP", parentCode: "21", sortOrder: 930 },
  { code: "21.4", name: "MECHANICAL WORKSHOP", parentCode: "21", sortOrder: 940 },
  { code: "21.5", name: "FABRICATION WORKSHOP", parentCode: "21", sortOrder: 950 },

  // ── 22 PRODUCTION ──────────────────────────────────────────────────────
  { code: "22", name: "PRODUCTION", parentCode: null, sortOrder: 1000 },

  // ── 23 MANAGER OFFICE ──────────────────────────────────────────────────
  { code: "23", name: "MANAGER OFFICE", parentCode: null, sortOrder: 1100 },
  { code: "23.1", name: "LEGAL SERVICE", parentCode: "23", sortOrder: 1110 },
  { code: "23.2", name: "MANAGEMENT SERVICE", parentCode: "23", sortOrder: 1120 },
  { code: "23.2.1", name: "ORGANIZATION AND METHODS", parentCode: "23.2", sortOrder: 1121 },
  { code: "23.2.2", name: "PLANNING, BUSINESS DEVELOPMENT AND BUDGET PREPARATION", parentCode: "23.2", sortOrder: 1122 },
  { code: "23.2.3", name: "MANAGEMENT INFORMATION SYSTEM", parentCode: "23.2", sortOrder: 1123 },
  { code: "23.3", name: "ESTATE SERVICE", parentCode: "23", sortOrder: 1130 },
  { code: "23.3.1", name: "GENERAL SERVICE", parentCode: "23.3", sortOrder: 1131 },
  { code: "23.3.2", name: "PUBLIC RELATION", parentCode: "23.3", sortOrder: 1132 },
  { code: "23.4", name: "BOARD OF DIRECTORS", parentCode: "23", sortOrder: 1140 },

  // ── 24 FINANCE DEPARTMENT ──────────────────────────────────────────────
  { code: "24", name: "FINANCE DEPARTMENT", parentCode: null, sortOrder: 1200 },
  { code: "24.1", name: "GENERAL ACCOUNTING", parentCode: "24", sortOrder: 1210 },
  { code: "24.2", name: "COST ACCOUNTING", parentCode: "24", sortOrder: 1220 },
  { code: "24.3", name: "BUDGET CONTROL AND FINANCIAL ANALYSIS", parentCode: "24", sortOrder: 1230 },

  // ── 25 LOGISTICS ───────────────────────────────────────────────────────
  { code: "25", name: "LOGISTICS", parentCode: null, sortOrder: 1300 },
  { code: "25.1", name: "MATERIAL REQUIREMENT PLANNING", parentCode: "25", sortOrder: 1310 },
  { code: "25.2", name: "STORE ADMINISTRATION", parentCode: "25", sortOrder: 1320 },

  // ── 26 HUMAN RESOURCE DEPARTMENT ───────────────────────────────────────
  { code: "26", name: "HUMAN RESOURCE DEPARTMENT", parentCode: null, sortOrder: 1400 },
  { code: "26.2", name: "MANPOWER PLANNING AND TRAINING", parentCode: "26", sortOrder: 1420 },
  { code: "26.3", name: "EMPLOYMENT AND ADMINISTRATION", parentCode: "26", sortOrder: 1430 },
  { code: "26.4", name: "EMPLOYEE RELATION", parentCode: "26", sortOrder: 1440 },

  // ── 27 GUEST HOUSE ─────────────────────────────────────────────────────
  { code: "27", name: "GUEST HOUSE", parentCode: null, sortOrder: 1500 },

  // ── 28 BUILDING ────────────────────────────────────────────────────────
  { code: "28", name: "BUILDING", parentCode: null, sortOrder: 1600 },

  // ── 29 PARK AND LANSE ──────────────────────────────────────────────────
  { code: "29", name: "PARK AND LANSE", parentCode: null, sortOrder: 1700 },

  // ── 30 MEDICAL SERVICE ─────────────────────────────────────────────────
  { code: "30", name: "MEDICAL SERVICE", parentCode: null, sortOrder: 1800 },
  { code: "30.1", name: "MEDICAL SECTION", parentCode: "30", sortOrder: 1810 },
  { code: "30.2", name: "PUBLIC HEALTH", parentCode: "30", sortOrder: 1820 },

  // ── 31 W.P.E ───────────────────────────────────────────────────────────
  { code: "31", name: "W.P.E — WORKERS PARTY OF ETHIOPIA", parentCode: null, sortOrder: 1900 },

  // ── 32 LABOUR UNION ────────────────────────────────────────────────────
  { code: "32", name: "LABOUR UNION", parentCode: null, sortOrder: 2000 },

  // ── 33 WORKERS CONTROL COMMITTEE ───────────────────────────────────────
  { code: "33", name: "WORKERS CONTROL COMMITTEE", parentCode: null, sortOrder: 2100 },
  { code: "33.1", name: "ANTI-CORRUPTION OFFICE", parentCode: "33", sortOrder: 2110 },

  // ── 34 SECURITY ────────────────────────────────────────────────────────
  { code: "34", name: "SECURITY", parentCode: null, sortOrder: 2200 },

  // ── 35 T.D.C ───────────────────────────────────────────────────────────
  { code: "35", name: "T.D.C", parentCode: null, sortOrder: 2300 },

  // ── 36 REWA ────────────────────────────────────────────────────────────
  { code: "36", name: "REWA", parentCode: null, sortOrder: 2400 },

  // ── 37 REYA ────────────────────────────────────────────────────────────
  { code: "37", name: "REYA", parentCode: null, sortOrder: 2500 },

  // ── 38 POLICE ──────────────────────────────────────────────────────────
  { code: "38", name: "POLICE", parentCode: null, sortOrder: 2600 },

  // ── 39 FRUIT ───────────────────────────────────────────────────────────
  { code: "39", name: "FRUIT", parentCode: null, sortOrder: 2700 },

  // ── 40 CUSTOMS ─────────────────────────────────────────────────────────
  { code: "40", name: "CUSTOMS", parentCode: null, sortOrder: 2800 },

  // ── 50 WORKER CLUB ─────────────────────────────────────────────────────
  { code: "50", name: "WORKER CLUB", parentCode: null, sortOrder: 2900 },

  // ── 51 FAMILY CLUB ─────────────────────────────────────────────────────
  { code: "51", name: "FAMILY CLUB", parentCode: null, sortOrder: 3000 },

  // ── 52 COMMUNITY CENTER ────────────────────────────────────────────────
  { code: "52", name: "COMMUNITY CENTER", parentCode: null, sortOrder: 3100 },

  // ── 53 CO-OPERATIVE SHOP ───────────────────────────────────────────────
  { code: "53", name: "CO-OPERATIVE SHOP", parentCode: null, sortOrder: 3200 },

  // ── 54 WONJI-SHOA TRAINING CENTER ─────────────────────────────────────
  { code: "54", name: "WONJI-SHOA TRAINING CENTER", parentCode: null, sortOrder: 3300 },

  // ── 55 AUDIT SERVICE ───────────────────────────────────────────────────
  { code: "55", name: "AUDIT SERVICE", parentCode: null, sortOrder: 3400 },

  // ── 56 PROJECT AND PRODUCTIVITY IMPROVEMENT OFFICE ─────────────────────
  { code: "56", name: "PROJECT AND PRODUCTIVITY IMPROVEMENT OFFICE", parentCode: null, sortOrder: 3500 },
];

// ── Helper lookups ──────────────────────────────────────────────────────────

// code -> department
export const DEPARTMENT_BY_CODE: ReadonlyMap<string, OfficialDepartment> =
  new Map(OFFICIAL_DEPARTMENTS.map((d) => [d.code, d]));

// name -> code (case-insensitive lookup via lower())
export const DEPARTMENT_CODE_BY_NAME: ReadonlyMap<string, string> = new Map(
  OFFICIAL_DEPARTMENTS.map((d) => [d.name.toLowerCase(), d.code]),
);

/**
 * Resolve the official department name from a code.
 * Returns undefined when the code is unknown.
 */
export function departmentNameByCode(code: string | null | undefined): string | undefined {
  if (!code) return undefined;
  return DEPARTMENT_BY_CODE.get(code)?.name;
}

/**
 * Canonical display label for a department: "CODE — NAME" (e.g. "15.3 — ABADIR C").
 */
export function departmentLabel(
  code: string | null | undefined,
  name?: string | null | undefined,
): string {
  if (code) {
    return name || departmentNameByCode(code) || code;
  }
  return name || "—";
}

// ── Legacy name mapping ────────────────────────────────────────────────────
// Maps old/variant department names -> official department code/name.
// Used during migration / normalisation of existing data.

export const LEGACY_DEPARTMENT_MAP: Record<string, string> = {
  // Old constants names -> official names
  Accounts: "FINANCE DEPARTMENT",
  "Procurement & Warehouse": "LOGISTICS",
  "Quality Control & Lab": "AGRICULTURE RESEARCH",
  "Distillery / Ethanol": "PRODUCTION",
  "Infrastructure & Irrigation": "CIVIL WORK",
  "Transport & Logistics": "LOGISTICS",
  "Information Technology": "MANAGEMENT INFORMATION SYSTEM",
  "Safety & Health": "MEDICAL SERVICE",
  "Sales & Marketing": "COMMERCIAL DEPARTMENT",
  "Livestock & Plantation Development": "L.P.C.D",
  "Agricultural Research Station": "AGRICULTURE RESEARCH",
  "Diversity, Equity & Inclusion": "HUMAN RESOURCE DEPARTMENT",
  "Club Caffe": "WORKER CLUB",
  "Community Relations & CSR": "COMMUNITY CENTER",
  "Executive Management Office": "MANAGER OFFICE",
  "Factory Process Management": "PRODUCTION",
  "Legal & Compliance": "LEGAL SERVICE",
  "Internal Audit": "AUDIT SERVICE",
  "Corporate Communications & PR": "PUBLIC RELATION",

  // seed_metehara_factory.py names -> official names
  "General Management": "MANAGER OFFICE",
  "Sugar Production": "PRODUCTION",
  "Agriculture & Plantation": "PLANTATION",
  "Engineering & Maintenance": "TECHNICAL",
  "Human Resources": "HUMAN RESOURCE DEPARTMENT",
  "Finance & Accounts": "FINANCE DEPARTMENT",
  "Procurement & Logistics": "LOGISTICS",
  "Quality Control & Laboratory": "AGRICULTURE RESEARCH",
  "Medical Services": "MEDICAL SERVICE",

  // seed_data.py names
  Administration: "MANAGER OFFICE",
  Finance: "FINANCE DEPARTMENT",
  IT: "MANAGEMENT INFORMATION SYSTEM",
  "IT Department": "MANAGEMENT INFORMATION SYSTEM",
  Logistics: "LOGISTICS",
  Production: "PRODUCTION",
  Operations: "PRODUCTION",
  Planner: "PRODUCTION",
  HR: "HUMAN RESOURCE DEPARTMENT",

  // Amharic names from migration 0003 (if still in DB)
  "የውስጥ ኦዲት አገልግሎት": "AUDIT SERVICE",
  "የሕግ አገልግሎት": "LEGAL SERVICE",
  "የምርምርና ልማት ክፍል": "AGRICULTURE RESEARCH",
  "የሰው ኃይል አስተዳደር": "HUMAN RESOURCE DEPARTMENT",
  "የፋይናንስ ክፍል": "FINANCE DEPARTMENT",
  "የእቅድና በጀት ክፍል": "BUDGET CONTROL AND FINANCIAL ANALYSIS",
  "የኢንፎርሜሽንና ኮሙኒኬሽን ቴክኖሎጂ (ICT) ክፍል": "MANAGEMENT INFORMATION SYSTEM",
  "የግዥ ክፍል": "COMMERCIAL DEPARTMENT",
  "የአቅርቦትና ሎጂስቲክስ ክፍል": "LOGISTICS",
  "የግብርና ኦፕሬሽን": "CULTIVATION",
  "የግብርና ምርት": "PLANTATION",
  "የሸንኮራ አገዳ ልማትና እርሻ": "PLANTATION",
  "የእርሻ ማሽነሪ ኦፕሬሽን": "F.E.S",
  "የፋብሪካ ኦፕሬሽን": "PRODUCTION",
  "የስኳር ምርት": "PRODUCTION",
  "የሜካኒካል ጥገና": "MECHANICAL WORKSHOP",
  "የኤሌክትሪክ ጥገና": "ELECTRICAL WORKSHOP",
  "የኢንስትሩመንትን ክፍል": "INSTRUMENT WORKSHOP",
  "የዎርክሾፕ ክፍል": "FABRICATION WORKSHOP",
  "የኃይል ማመንጫ": "TECHNICAL",
  "የኢታኖልና ኮምፓስት ምርት": "PRODUCTION",
  "የአስተዳደር ክፍል": "MANAGER OFFICE",
  "የፋሲሊቲ አስተዳደር": "BUILDING",
  "የንብረት አስተዳደር": "LOGISTICS",
  "የኢንቬንተሪ አስተዳደር": "STORE ADMINISTRATION",
  "የትራንስፖርት ክፍል": "LOGISTICS",
  "የተሽከርካሪ ጥገና ክፍል": "F.E.S",
  LPCD: "L.P.C.D",
  "ሆስፒታል": "MEDICAL SERVICE",
  "የግብርና ምርምር ክፍል": "AGRICULTURE RESEARCH",
};

/**
 * Normalise a legacy department name to its official code, or null when unknown.
 * Lookup is case-insensitive.
 */
export function normalizeDepartmentNameToCode(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  const direct = DEPARTMENT_CODE_BY_NAME.get(trimmed.toLowerCase());
  if (direct) return direct;
  const mapped = LEGACY_DEPARTMENT_MAP[trimmed];
  if (mapped) return DEPARTMENT_CODE_BY_NAME.get(mapped.toLowerCase()) ?? null;
  // Nyckel: also match when the name embeds the code, e.g. "ABADIR C (15.3)"
  const codeMatch = trimmed.match(/(?:^|\s)\(?(\d+(?:\.\d+)*)\)?\s*$/);
  if (codeMatch && DEPARTMENT_BY_CODE.has(codeMatch[1])) return codeMatch[1];
  return null;
}

// ── Select-option helpers (used by the asset forms) ─────────────────────────

export interface DepartmentOption {
  id: string;
  code: string | null;
  name: string;
  parentId: string | null;
  sortOrder: number;
  depth: number;
  label: string;
}

/**
 * Flatten a list of departments (from the DB) into display-ready options
 * following the official hierarchy: parents first (by sortOrder), then children
 * recursively. Each option gains a depth + "CODE — NAME" label and an indent.
 */
export function flattenDepartmentOptions(
  departments: Array<{
    id: string;
    code: string | null;
    name: string;
    parentId: string | null;
    sortOrder: number;
  }>,
): DepartmentOption[] {
  const sorted = [...departments].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return (a.code ?? a.name).localeCompare(b.code ?? b.name, undefined, {
      numeric: true,
    });
  });

  const byParent = new Map<string | null, typeof sorted>();
  const byId = new Map<string, (typeof sorted)[number]>();
  for (const d of sorted) {
    byId.set(d.id, d);
    const key = d.parentId;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(d);
  }

  const result: DepartmentOption[] = [];
  const indentUnit = "   ";

  const walk = (parentKey: string | null, depth: number) => {
    for (const d of byParent.get(parentKey) ?? []) {
      result.push({
        id: d.id,
        code: d.code,
        name: d.name,
        parentId: d.parentId,
        sortOrder: d.sortOrder,
        depth,
        label: `${d.code ? `${d.code} — ` : ""}${d.name}`,
      });
      walk(d.id, depth + 1);
    }
  };

  // Top-level in official order; stray rows (missing/unknown parent) last.
  walk(null, 0);
  const emitted = new Set(result.map((o) => o.id));
  for (const d of sorted) {
    if (!emitted.has(d.id)) {
      result.push({
        id: d.id,
        code: d.code,
        name: d.name,
        parentId: d.parentId,
        sortOrder: d.sortOrder,
        depth: 0,
        label: `${d.code ? `${d.code} — ` : ""}${d.name}`,
      });
    }
  }

  return result;
}