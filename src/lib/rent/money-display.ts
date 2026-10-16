/**
 * Display-only money formatting, with no Prisma import.
 *
 * `./money` is the arithmetic module and necessarily pulls in `@prisma/client`.
 * Browser components only ever *render* an amount - they never add or subtract -
 * so they import these two functions instead and the Prisma client stays out of
 * the client bundle. `./money` re-exports them, so server and browser cannot
 * drift: there is exactly one implementation of each.
 *
 * The grouping is done on the decimal string rather than through
 * `Number.prototype.toLocaleString`, so a 12-digit ETB amount is never re-rounded
 * by IEEE-754 on the way to the screen.
 */

const RENT_CURRENCY_LABEL = "ETB";

/**
 * Group the whole part of a decimal string in threes with commas.
 *
 * Returns the canonical fixed-2 representation. Non-numeric input yields
 * `"0.00"` rather than throwing, matching how a missing amount should render in
 * a table cell.
 */
export function formatEtbNumber(value: unknown): string {
  const text = toPlainDecimalString(value);
  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [whole = "0", fraction = "00"] = unsigned.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}.${fraction}`;
}

/** Format a money amount for display: thousands separators, 2 decimals, `ETB`. */
export function formatEtb(value: unknown): string {
  return `${formatEtbNumber(value)} ${RENT_CURRENCY_LABEL}`;
}

/**
 * True when the amount is exactly zero.
 *
 * Callers use this instead of comparing strings, where `"9" > "100"` is true
 * and would light up an "outstanding" badge on a settled ledger.
 */
export function isZeroAmount(value: unknown): boolean {
  const [whole = "0", fraction = "00"] = toPlainDecimalString(value).split(".");
  return whole.replace(/^0+(?=\d)/, "") === "0" && /^0*$/.test(fraction);
}

/**
 * Coerce anything that may carry an amount into a plain `[-]d[.dd]` string.
 *
 * Accepts the decimal strings Prisma sends, numbers, and objects with a
 * `toString`/`toFixed` (Prisma.Decimal, which the server modules use).
 */
function toPlainDecimalString(value: unknown): string {
  if (value === null || value === undefined) return "0.00";

  const raw =
    typeof value === "object" && value !== null && "toFixed" in value
      ? (value as { toFixed: (places: number) => string }).toFixed(2)
      : typeof value === "bigint"
        ? `${value}.00`
        : String(value);

  const cleaned = raw.replace(/,/g, "").trim();
  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(cleaned);
  if (!match) return "0.00";

  const [, sign, wholeRaw = "", fractionRaw = ""] = match;
  const whole = wholeRaw === "" ? "0" : wholeRaw.replace(/^0+(?=\d)/, "");
  const fraction = fractionRaw.slice(0, 2).padEnd(2, "0");
  return `${sign === "-" && whole !== "0" ? "-" : ""}${whole}.${fraction}`;
}
