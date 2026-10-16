/**
 * Handback damage checklist — the one place that knows what a damaged item is,
 * what it costs, and what a receipt is allowed to say about it.
 *
 * Everything money-shaped here is integer **cents**, never a float. The reason
 * is that the total is printed on a legal document: a total that is off by one
 * cent because two 0.1 additions drifted is a total an employee can dispute and
 * a reprint that no longer matches the original. Cents also make "is this two
 * decimal places" a question with an exact answer.
 *
 * The registry already owns the damaged-part taxonomy (`Household.damageWindow`,
 * `damageDoor`, ... — electricity and water panel included), so this list is
 * that list, named once. Adding a part to the house register and to the
 * handback form is then the same edit, and a receipt can never print a part
 * that the register cannot record.
 *
 * Client-safe: pure functions over plain data, no Prisma and no Node built-ins.
 */

// `./money-display` is the display-only formatter; `./money` pulls in
// @prisma/client. A form and a print template are exactly the display-only case,
// so this module stays off the Prisma path entirely.
import { formatEtbNumber } from "@/lib/rent/money-display";

/**
 * The damaged-part taxonomy, in the order the registry declares it and the order
 * the receipt prints it.
 *
 * `key` is the part name used everywhere in application code; `stateKey` and
 * `costKey` name the two `house_inspections` columns that hold this part's
 * OK/damaged state and its cost. Keeping the column names here (rather than
 * writing them out per call site) is what stops the form, the service and the
 * receipt from disagreeing about which column belongs to which part.
 */
export const DAMAGE_ITEMS = [
  {
    key: "window",
    label: "Window",
    labelAm: "መስኮት",
    stateKey: "checklistWindow",
    costKey: "costWindow",
  },
  {
    key: "door",
    label: "Door",
    labelAm: "በር",
    stateKey: "checklistDoor",
    costKey: "costDoor",
  },
  {
    key: "waterPanel",
    label: "Water panel",
    labelAm: "የውኃ ፓነል",
    stateKey: "checklistWaterPanel",
    costKey: "costWaterPanel",
  },
  {
    key: "roof",
    label: "Roof",
    labelAm: "ጣሪያ",
    stateKey: "checklistRoof",
    costKey: "costRoof",
  },
  {
    key: "wall",
    label: "Wall",
    labelAm: "ግድል",
    stateKey: "checklistWall",
    costKey: "costWall",
  },
  {
    key: "electricity",
    label: "Electricity",
    labelAm: "መብራት",
    stateKey: "checklistElectricity",
    costKey: "costElectricity",
  },
] as const;

export type DamageItemKey = (typeof DAMAGE_ITEMS)[number]["key"];
export type DamageItemStateKey = (typeof DAMAGE_ITEMS)[number]["stateKey"];
export type DamageItemCostKey = (typeof DAMAGE_ITEMS)[number]["costKey"];

export const DAMAGE_ITEM_KEYS = DAMAGE_ITEMS.map((i) => i.key);

/** OK / Damaged for every part. An absent key means OK. */
export type DamageState = Record<string, boolean | undefined>;

/**
 * Raw cost input for every part. Widened to accept whatever Prisma hands back
 * (a `Decimal`, a string, a number) and whatever a form field holds (a string
 * mid-typing) so that callers never have to coerce before validating.
 */
export type DamageCosts = Record<string, unknown>;

/** One damaged part with its cost — the row a receipt prints. */
export interface DamageLine {
  key: DamageItemKey;
  label: string;
  labelAm: string;
  /** Cost in whole currency units (not cents), rounded to 2 decimals. */
  cost: number;
}

export interface DamageTotals {
  /** Damaged parts only, in taxonomy order. Empty when nothing is damaged. */
  lines: DamageLine[];
  /** Sum of `lines`, in whole currency units. */
  totalCost: number;
  damagedCount: number;
}

/** Bilingual copy for the receipt. Kept beside the data it describes. */
export const RECEIPT_COPY = {
  damageChecklistTitle: "Damage checklist / የጉዳት ዝርዝር",
  partsCountLabel: "ክፍሎች / Parts",
  noDamage: "No damage recorded / ምንም ጉዳት አልተመዘገበም",
  totalDamage: "Total damage cost / ጠቅላላ የጉዳት ወጪ",
  conditionNoteTitle: "Condition note / የሁኔታ ማስታወሻ",
  noNote: "No note / ማስታወሻ የለም",
  continued: "… continued / … ቀጥላ ይቀጥላል",
  currency: "ETB",
} as const;

/** Smallest cost a damaged part may carry: 0.01 — a damaged part is never free. */
const MIN_COST_CENTS = 1;

/**
 * Parse a raw cost into integer cents, or `null` when it is not a usable amount.
 *
 * Rejects rather than coerces, because the alternatives are all worse: `Number`
 * turns `""` into 0 and `"1,250"` into NaN, and silently reading a damaged part
 * as free is the one mistake that makes a damage assessment worthless.
 *
 * "Two decimals" is enforced as a scale check on the string, not on the parsed
 * float, so `10.999` is rejected instead of being quietly rounded to 11.00.
 */
export function parseCostCents(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  // A Prisma Decimal exposes toString(); accepting that keeps the DB read path
  // and the form path on the same parser.
  const text =
    typeof raw === "number"
      ? Number.isFinite(raw)
        ? String(raw)
        : null
      : typeof raw === "string"
        ? raw.trim()
        : typeof (raw as { toString?: unknown }).toString === "function"
          ? String(raw).trim()
          : null;
  if (text === null || text === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;

  const [whole, frac = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Whole units → the cents integer this module sums in. */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/** The cents integer → whole units, for persistence and display. */
export function fromCents(cents: number): number {
  return cents / 100;
}

/**
 * The outcome of validating a checklist.
 *
 * Deliberately one shape rather than a success/failure union: this project
 * compiles without `strictNullChecks`, and under that setting TypeScript does not
 * narrow a union discriminated on a boolean literal — so `if (!r.ok) r.errors`
 * would not typecheck, and the natural fix (an `any` cast or an `in` check)
 * throws away exactly the guarantee the caller wants. With a flat result every
 * caller reads `errors.length` and cannot forget to check it.
 */
export interface DamageValidation {
  /** Always mirrors `errors.length === 0`, for readable call sites. */
  ok: boolean;
  /**
   * One message per unusable part. Non-empty means nothing may be written: on
   * failure `lines` and `totalCost` are deliberately empty/zero rather than
   * partially filled, so a caller cannot accidentally persist half a damage
   * assessment.
   */
  errors: string[];
  /** Damaged parts only, in taxonomy order. Empty when invalid or nothing damaged. */
  lines: DamageLine[];
  /** Sum of `lines`, in whole currency units. */
  totalCost: number;
  damagedCount: number;
}

/**
 * Validate and total a checklist.
 *
 * Two rules, both enforced here rather than at the call site so the API and the
 * form cannot disagree:
 *  - a Damaged part must carry a positive cost with at most two decimals;
 *  - an OK part must not carry one. Its cost is discarded rather than rejected,
 *    because a stale figure left in a hidden field is a UI artefact, not an
 *    attempt to inflate a claim, and refusing the whole submission over it would
 *    be a worse outcome than dropping the number.
 *
 * Returns the damage lines and the total together so a caller can never print a
 * total that disagrees with the rows above it.
 */
export function validateDamage(
  state: DamageState,
  costs: DamageCosts = {},
): DamageValidation {
  const lines: DamageLine[] = [];
  const errors: string[] = [];
  let totalCents = 0;

  for (const item of DAMAGE_ITEMS) {
    if (!state[item.stateKey]) continue; // OK — any cost for it is discarded

    const cents = parseCostCents(costs[item.costKey]);
    if (cents === null) {
      errors.push(
        `${item.label} is marked damaged, so a cost in ETB is required (positive, up to 2 decimals).`,
      );
      continue;
    }
    if (cents < MIN_COST_CENTS) {
      errors.push(
        `${item.label} is marked damaged, so its cost must be at least 0.01 ETB.`,
      );
      continue;
    }

    totalCents += cents;
    lines.push({
      key: item.key,
      label: item.label,
      labelAm: item.labelAm,
      cost: fromCents(cents),
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors, lines: [], totalCost: 0, damagedCount: 0 };
  }

  return {
    ok: true,
    errors,
    lines,
    totalCost: fromCents(totalCents),
    damagedCount: lines.length,
  };
}

/**
 * The running total for an in-progress form.
 *
 * Unlike `validateDamage` this never throws and never complains: it totals the
 * parts that are damaged *and* already priced, so the figure updates as the
 * inspector types without the total flickering to 0 while a field is mid-edit.
 * Parts that are damaged but not yet priced are excluded rather than read as 0,
 * so the total never claims less than has been entered.
 */
export function runningDamageTotal(
  state: DamageState,
  costs: DamageCosts = {},
): number {
  let totalCents = 0;
  for (const item of DAMAGE_ITEMS) {
    if (!state[item.stateKey]) continue;
    const cents = parseCostCents(costs[item.costKey]);
    if (cents === null) continue;
    totalCents += cents;
  }
  return fromCents(totalCents);
}

/** Damage parts by their human label — used in the release summary. */
export function damagedPartLabels(state: DamageState): string[] {
  return DAMAGE_ITEMS.filter((i) => state[i.stateKey]).map((i) => i.label);
}

/** Format an amount the way the form and the receipt both print it. */
export function formatEtb(amount: unknown): string {
  return `${formatEtbNumber(amount)} ${RECEIPT_COPY.currency}`;
}

/**
 * A note long enough to push the receipt onto a second page, or one that has
 * been clipped to keep it on the first.
 */
export interface PrintedNote {
  lines: string[];
  truncated: boolean;
}

/**
 * Wrap a note for print and clip it to a line budget.
 *
 * The receipt is a single A4 page and the note is the only free-text field on
 * it, so an unbounded note would silently produce a second page — or worse, a
 * clipped PDF whose last line is lost without saying so. Clipping is therefore
 * explicit and marked, so a reader can tell a short note from a shortened one.
 */
export function wrapNoteForPrint(
  note: string | null | undefined,
  options: { maxCharsPerLine?: number; maxLines?: number } = {},
): PrintedNote {
  const { maxCharsPerLine = 88, maxLines = 6 } = options;
  const text = (note ?? "").trim();
  if (!text) return { lines: [], truncated: false };

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    // A single word longer than the line (a pasted URL, an Amharic run) is
    // hard-split rather than allowed to overflow the cell.
    if (word.length > maxCharsPerLine) {
      if (current) {
        lines.push(current);
        current = "";
      }
      for (let i = 0; i < word.length; i += maxCharsPerLine) {
        lines.push(word.slice(i, i + maxCharsPerLine));
      }
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);

  const truncated = lines.length > maxLines;
  return { lines: truncated ? lines.slice(0, maxLines) : lines, truncated };
}
