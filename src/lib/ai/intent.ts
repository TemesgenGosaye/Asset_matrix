/**
 * Deterministic intent router for the assistant's fast lane.
 *
 * The router is a pure function: no LLM, no network, no database. It normalises
 * the question and matches it against an ordered rule set covering the question
 * shapes staff actually ask (counts, status breakdowns, single-record lookups).
 * Anything it does not recognise returns `null`, and the caller hands the turn to
 * the reasoning lane instead.
 *
 * Ordering matters: more specific rules run before broader ones, so
 * "how many vacant houses in Addis" resolves to the occupancy rule rather than
 * the generic "how many houses" rule.
 *
 * Both English and Amharic phrasing are recognised, including the transliterated
 * forms Ethiopian staff commonly type (e.g. "bet", "sanaw", "tsebel").
 */

export interface IntentMatch<TParams = Record<string, unknown>> {
  id: string;
  params: TParams;
}

type Rule<TParams> = {
  id: string;
  test: (text: string, raw: string) => IntentMatch<TParams> | null;
};

const NUM_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  top: 5,
  first: 1,
};

const ORDINAL_WORDS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
};

/** Words that signal an open-ended question that needs the model. */
const REASONING_MARKERS = [
  "why",
  "how come",
  "explain",
  "what happens",
  "what if",
  "should i",
  "should we",
  "compare",
  "difference between",
  "recommend",
  "advice",
  "summarise",
  "summarize",
  "analyse",
  "analyze",
  "step by step",
  "pros and cons",
];

const AM_REASONING_MARKERS = ["ለምን", "ምክንያቱ", "አስረዳ", "ማብረጃ", "ምን ይሆናል"];

function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[?!.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function has(text: string, ...needles: string[]): boolean {
  return needles.some((n) => text.includes(n));
}

/** Extract a small positive integer ("top 5", "next 3", "in 30 days"). */
function extractCount(text: string, fallback: number, cap = 50): number {
  const digit = text.match(/\b(\d{1,3})\b/);
  if (digit) return Math.min(cap, Math.max(1, parseInt(digit[1], 10)));
  for (const [word, value] of Object.entries(NUM_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(text)) return value;
  }
  return fallback;
}

/** Extract an ordinal position ("who is third in the queue"). */
function extractOrdinal(text: string): number | null {
  const digit = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (digit) return parseInt(digit[1], 10);
  for (const [word, value] of Object.entries(ORDINAL_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(text)) return value;
  }
  return null;
}

/** Extract a job grade ("grade 7", "gs 9"). */
function extractGrade(text: string): number | null {
  const match = text.match(/\b(?:grade|gs|job\s*grade)\s*(\d{1,2})\b/);
  return match ? parseInt(match[1], 10) : null;
}

/** Extract a house identifier: "H-104", "house 12", "hid 45", "no. 7". */
function extractHouseRef(text: string): string | null {
  const prefixed = text.match(/\bh-?\s*([0-9]{1,4})\b/);
  if (prefixed) return `H-${prefixed[1]}`;

  const hid = text.match(/\bhid\s*-?\s*([0-9a-z]{1,8})\b/);
  if (hid) return hid[1];

  const phrased = text.match(
    /\b(?:house|home|unit|residence|bet|ቤት|ቤተሰብ)\s*(?:number|no\.?|#)?\s*([a-z]?-?\s?[0-9]{1,4}[a-z]?)\b/,
  );
  if (phrased) return phrased[1].replace(/\s+/g, "");

  return null;
}

/** Detect an Amharic-script question. */
export function isAmharic(raw: string): boolean {
  return /[\u1200-\u137F]/.test(raw);
}

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

const HOUSE = ["house", "houses", "housing", "household", "households", "home", "homes", "unit", "units", "residence", "bet", "ቤት", "ቤቶች", "ቤተሰብ"];

const ASSET = [
  "asset",
  "assets",
  "equipment",
  "laptop",
  "laptops",
  "computer",
  "computers",
  "device",
  "devices",
  "hardware",
  "hhibb",
  "ሕብምብ",
  "መሣሪያ",
];

const QUEUE = [
  "queue",
  "waiting",
  "waitlist",
  "waiting list",
  "candidates",
  "candidate",
  "waiting employees",
  "pending applicants",
  "ሰልፍ",
  "የጠብቁ",
  "ተጠቃሚ",
  "ተጠባሪ",
];

const COUNTING = [
  "how many",
  "number of",
  "count",
  "total number",
  "how much",
  "tally",
  "ብዛታ",
  "ብዛታት",
  "ስንት",
  "እንደምን",
];

const ACTIVE = ["active", "current", "in use", "usable", "ንቁ", "ንቁዎች", "በአገልግሎት ላይ"];

const INACTIVE = ["inactive", "deactivated", "retired", "ያልተነቃ", "ያልተንቃ"];

const OCCUPIED = ["occupied", "allocated", "tenanted", "inhabited", "የተሰጠ", "የተመደበ", "ተያዥኖት"];

const VACANT = [
  "vacant",
  "empty",
  "unoccupied",
  "free",
  "available",
  "unallocated",
  "ready for allocation",
  "ክፍት",
  "ክፍት ያለው",
  "ያልተሰጠ",
  "ዝግዣር",
];

const MAINTENANCE = [
  "maintenance",
  "under repair",
  "repair",
  "damaged",
  "broken",
  "out of service",
  "ጥገና",
  "በጥገና",
  "ተጎዳሚ",
];

const TICKET = [
  "ticket",
  "tickets",
  "complaint",
  "complaints",
  "request",
  "requests",
  "issue",
  "issues",
  "ቅሬታ",
  "ቅሬታዎች",
  "ጥያቄ",
  "ጥያቄዎች",
];

const WARRANTY = ["warranty", "warranties", "guarantee", "ዋስትና", "ዋና ገምያ"];

const EMPLOYEE = [
  "employee",
  "employees",
  "staff",
  "personnel",
  "worker",
  "workers",
  "ሠራታ",
  "ሠራታን",
  "አሽላማዎች",
  "ባለሙያዎች",
];

const CONSUMABLE = [
  "consumable",
  "consumables",
  "stock",
  "inventory",
  "supply",
  "supplies",
  "ፍጠት",
  "ክምችት",
  "ምርት",
];

const LICENCE = ["licence", "licences", "license", "licenses", "seat", "seats", "ፈቃድ", "ፈቃዶች", "ወንበር"];

const INSPECTION = [
  "inspection",
  "inspections",
  "handback",
  "hand back",
  "damage",
  "damages",
  "defect",
  "ምርመራ",
  "ጉዳት",
  "ክፍለ ጉዳት",
];

const COST = [
  "cost",
  "costs",
  "value",
  "price",
  "prices",
  "worth",
  "spend",
  "spending",
  "expenditure",
  "ዋጋ",
  "ወጪ",
  "ማውጣጥ",
  "ድምር",
];

// ---------------------------------------------------------------------------
// Rules — most specific first
// ---------------------------------------------------------------------------

const CAPABILITY_TEXT = new RegExp(
  [
    "what can you do",
    "what do you do",
    "who are you",
    "what are you",
    "how do you work",
    "help me",
    "what can i ask",
    "what should i ask",
    "ምን ልታወቅኝ",
    "ምን ታወቅሃለህ",
    "እንዚህኛ ነህ",
  ].join("|"),
);

const RULES: Rule<Record<string, unknown>>[] = [
  // -- capability ---------------------------------------------------------
  {
    id: "support.capabilities",
    test: (text, raw) =>
      CAPABILITY_TEXT.test(text) || CAPABILITY_TEXT.test(raw.toLowerCase())
        ? { id: "support.capabilities", params: {} }
        : null,
  },

  // -- single house occupant --------------------------------------------
  {
    id: "housing.occupantOf",
    test: (text) => {
      if (!has(text, ...HOUSE)) return null;
      const asksWho = has(
        text,
        "who",
        "whom",
        "occupant",
        "occupants",
        "tenant",
        "tenants",
        "lives",
        "living",
        "resides",
        "assigned to",
        "allocated to",
        "ንድር",
        "የሚስማል",
        "ተያዥኖት",
        "የተመደበ",
      );
      if (!asksWho) return null;
      const ref = extractHouseRef(text);
      if (!ref) return null;
      return { id: "housing.occupantOf", params: { houseRef: ref } };
    },
  },

  // -- queue: "who is Nth / top N in the queue" --------------------------
  {
    id: "queue.position",
    test: (text) => {
      if (!has(text, ...QUEUE)) return null;
      if (!has(text, "who", "which employee", "whom", "ንድር")) return null;
      const limit = extractCount(text, 5, 25);
      const position = extractOrdinal(text);
      return {
        id: "queue.position",
        params: { limit, position },
      };
    },
  },

  // -- queue: breakdown by grade -----------------------------------------
  {
    id: "queue.byGrade",
    test: (text) => {
      if (!has(text, ...QUEUE)) return null;
      const grade = extractGrade(text);
      if (grade === null) return null;
      return { id: "queue.byGrade", params: { grade } };
    },
  },

  // -- queue: how many waiting ------------------------------------------
  {
    id: "queue.size",
    test: (text) => {
      if (!has(text, ...QUEUE, "eligible")) return null;
      const asksCount = has(text, ...COUNTING);
      if (asksCount || text.trim().split(" ").length <= 4) {
        return { id: "queue.size", params: {} };
      }
      return null;
    },
  },

  // -- housing: status-specific counts ----------------------------------
  {
    id: "housing.statusCounts",
    test: (text) => {
      if (!has(text, ...HOUSE, "occupancy", "occupant")) return null;
      const wantsVacant = has(text, ...VACANT);
      const wantsOccupied = has(text, ...OCCUPIED);
      const wantsMaint = has(text, ...MAINTENANCE);
      if (wantsVacant === wantsOccupied && wantsOccupied === wantsMaint) {
        return null;
      }
      const wantsInactive = has(text, ...INACTIVE);
      if (wantsInactive && !wantsVacant && !wantsOccupied && !wantsMaint) {
        return { id: "housing.registerStatus", params: { status: "Inactive" } };
      }
      return {
        id: "housing.statusCounts",
        params: {
          wantVacant: wantsVacant,
          wantOccupied: wantsOccupied,
          wantMaintenance: wantsMaint,
          limit: extractCount(text, 12, 40),
        },
      };
    },
  },

  // -- housing: register status (Active / Inactive) ----------------------
  // A counting phrasing ("how many active houses") belongs to housing.counts,
  // which answers with the same figure plus the occupancy split and a per-type
  // table. This rule only catches the non-counting phrasings ("show active
  // houses", "which houses are inactive").
  {
    id: "housing.registerStatus",
    test: (text) => {
      if (!has(text, ...HOUSE, "register")) return null;
      if (has(text, ...COUNTING)) return null;
      const wantsActive = has(text, ...ACTIVE);
      const wantsInactive = has(text, ...INACTIVE);
      if (wantsActive === wantsInactive) return null;
      return {
        id: "housing.registerStatus",
        params: { status: wantsActive ? "Active" : "Inactive" },
      };
    },
  },

  // -- housing: occupancy / type breakdown -------------------------------
  {
    id: "housing.breakdown",
    test: (text) => {
      if (!has(text, ...HOUSE)) return null;
      const wantsBreakdown = has(
        text,
        "breakdown",
        "by type",
        "per type",
        "distribution",
        "split",
        "occupancy",
        "occupancy rate",
        "how full",
        "utilisation",
        "utilization",
        "ማኃልፍ",
        "በአይነት",
      );
      if (!wantsBreakdown) return null;
      return { id: "housing.breakdown", params: {} };
    },
  },

  // -- housing: generic counts ("how many houses", "how many active houses")
  {
    id: "housing.counts",
    test: (text) => {
      if (!has(text, ...HOUSE)) return null;
      if (!has(text, ...COUNTING, "show", "list", "total", "ጠቅላላ", "ዝርዝር")) {
        return null;
      }
      const wantsActive = has(text, ...ACTIVE);
      const wantsInactive = has(text, ...INACTIVE);
      return {
        id: "housing.counts",
        params: {
          registerStatus: wantsInactive
            ? "Inactive"
            : wantsActive
              ? "Active"
              : null,
          limit: extractCount(text, 10, 60),
        },
      };
    },
  },

  // -- inspections --------------------------------------------------------
  {
    id: "inspections.summary",
    test: (text) => {
      if (!has(text, ...INSPECTION)) return null;
      if (!has(text, ...COUNTING, "pending", "hold", "on hold", "open", "list", "show", "ዝርዝር", "ተዘግቷል")) {
        return null;
      }
      return {
        id: "inspections.summary",
        params: {
          onlyPending: has(text, "pending", "hold", "on hold", "open", "unresolved", "ተዘግቷል", "በመጠባበቅ ላይ"),
          limit: extractCount(text, 8, 40),
        },
      };
    },
  },

  // -- warranties ---------------------------------------------------------
  {
    id: "assets.expiringWarranties",
    test: (text) => {
      if (!has(text, ...WARRANTY)) return null;
      const days =
        text.match(/(\d{1,4})\s*(?:day|days|ቀን)/)?.[1];
      const months =
        text.match(/(\d{1,3})\s*(?:month|months|ወር)/)?.[1];
      let horizon = 60;
      if (days) horizon = parseInt(days, 10);
      else if (months) horizon = parseInt(months, 10) * 30;
      return {
        id: "assets.expiringWarranties",
        params: { days: Math.min(horizon, 1095), limit: extractCount(text, 10, 60) },
      };
    },
  },

  // -- low stock / licence strain ---------------------------------------
  {
    id: "assets.stockAlerts",
    test: (text) => {
      const wantsConsumable = has(text, ...CONSUMABLE);
      const wantsLicence = has(text, ...LICENCE);
      if (!wantsConsumable && !wantsLicence) return null;
      if (!has(text, "low", "out of stock", "reorder", "shortage", "strain", "expired", "expiring", "available", "ዝቅተኛ", "ያለምግኝ", "ተሽሽሏል")) {
        return null;
      }
      return {
        id: "assets.stockAlerts",
        params: { limit: extractCount(text, 10, 50) },
      };
    },
  },

  // -- asset estate value -------------------------------------------------
  {
    id: "assets.estateValue",
    test: (text) => {
      if (!has(text, ...ASSET)) return null;
      if (!has(text, ...COST, "worth")) return null;
      return { id: "assets.estateValue", params: {} };
    },
  },

  // -- asset counts -------------------------------------------------------
  {
    id: "assets.counts",
    test: (text) => {
      if (!has(text, ...ASSET)) return null;
      if (!has(text, ...COUNTING, "total", "list", "show", "ጠቅላላ", "ዝርዝር")) {
        return null;
      }
      return { id: "assets.counts", params: { limit: extractCount(text, 10, 60) } };
    },
  },

  // -- tickets -----------------------------------------------------------
  {
    id: "tickets.summary",
    test: (text) => {
      if (!has(text, ...TICKET)) return null;
      if (!has(text, ...COUNTING, "summary", "status", "open", "pending", "status breakdown", "ማጠቃለያ", "ዝርዝር", "ክፍት")) {
        return null;
      }
      return { id: "tickets.summary", params: { limit: extractCount(text, 8, 40) } };
    },
  },

  // -- employees ----------------------------------------------------------
  {
    id: "employees.counts",
    test: (text) => {
      if (!has(text, ...EMPLOYEE)) return null;
      if (!has(text, ...COUNTING, "total", "headcount", "list", "show", "active employees", "ጠቅላላ", "ዝርዝር")) {
        return null;
      }
      return { id: "employees.counts", params: {} };
    },
  },
];

export interface RoutedIntent {
  id: string;
  params: Record<string, unknown>;
}

/**
 * Route a question to a fast-lane intent.
 *
 * @returns The matched intent, or `null` when the question needs the reasoning
 *          lane (open-ended, multi-step, comparative, or unrecognised).
 */
export function routeIntent(raw: string): RoutedIntent | null {
  const text = normalize(raw);
  if (!text) return null;

  // An explicitly open-ended question always goes to the reasoning lane, even if
  // it happens to contain a countable noun. "Why is the queue so long?" must not
  // be answered with a bare count.
  const lowerRaw = raw.toLowerCase();
  if (
    REASONING_MARKERS.some((m) => text.includes(m)) ||
    AM_REASONING_MARKERS.some((m) => raw.includes(m)) ||
    REASONING_MARKERS.some((m) => lowerRaw.includes(m))
  ) {
    return null;
  }

  for (const rule of RULES) {
    const match = rule.test(text, raw);
    if (match) return { id: match.id, params: match.params };
  }

  return null;
}
