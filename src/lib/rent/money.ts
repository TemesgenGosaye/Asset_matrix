/**
 * Decimal-safe money helpers for the rent module.
 *
 * MONEY IS NEVER A FLOAT. Amounts are stored as `Decimal(12,2)` in PostgreSQL
 * and travel over the wire as decimal *strings* (Prisma.Decimal serialises via
 * `toJSON`, which returns a string). Every arithmetic operation below goes
 * through `Prisma.Decimal`, so 0.1 + 0.2 is 0.30 and never 0.30000000000000004.
 *
 * The only place a `number` appears is {@link formatEtb} / {@link parseAmountInput},
 * which are display and form-input concerns respectively - not arithmetic.
 */

import { Prisma } from "@prisma/client";
import { RENT_CURRENCY } from "./constants";

export type { Prisma };

/** A money amount as it crosses the API boundary: an exact decimal string. */
export type MoneyString = string;

/**
 * Coerce anything Prisma may hand back for a `numeric` column into a
 * `Prisma.Decimal`.
 *
 * `$queryRaw` returns `Decimal` for `sum(decimal)`, `number` for `count(*)`-as-int
 * and `bigint` for `count(*)`-as-bigint, and `string` when the value has been
 * through a JSON round-trip. Normalising here means no caller has to care.
 */
export function toDecimal(value: unknown): Prisma.Decimal {
  if (value instanceof Prisma.Decimal) return value;
  if (value === null || value === undefined) return new Prisma.Decimal(0);
  if (typeof value === "bigint") return new Prisma.Decimal(value.toString());
  return new Prisma.Decimal(value as Prisma.Decimal.Value);
}

/**
 * Render a money amount as the canonical wire format: a fixed 2-decimal string.
 *
 * `"1250"`, `1250` and `Prisma.Decimal("1250")` all become `"1250.00"`.
 */
export function toMoneyString(value: unknown): MoneyString {
  return toDecimal(value).toFixed(2);
}

/**
 * Add money amounts. Used for the schedule's per-month snapshot arithmetic and
 * for any running total the service needs to compare against a stored value.
 */
export function addMoney(...values: unknown[]): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>(
    (total, value) => total.add(toDecimal(value)),
    new Prisma.Decimal(0),
  );
}

/**
 * Subtract money amounts: `subtractMoney(a, b, c)` is `a - b - c`.
 *
 * The first value is the minuend; every later value is subtracted from it in
 * order. Returns zero when called with no arguments.
 */
export function subtractMoney(...values: unknown[]): Prisma.Decimal {
  if (values.length === 0) return new Prisma.Decimal(0);
  const [minuend, ...rest] = values;
  return rest.reduce<Prisma.Decimal>(
    (total, value) => total.sub(toDecimal(value)),
    toDecimal(minuend),
  );
}

/** Multiply a money amount by an integer count (e.g. price x term months). */
export function multiplyMoney(value: unknown, count: number): Prisma.Decimal {
  return toDecimal(value).mul(count);
}

/** True when the amount is strictly greater than zero. */
export function isPositiveMoney(value: unknown): boolean {
  return toDecimal(value).greaterThan(0);
}

/** True when two amounts are equal to the cent. */
export function moneyEquals(a: unknown, b: unknown): boolean {
  return toDecimal(a).equals(toDecimal(b));
}

/**
 * Round to the storage scale (2 decimals, half-up) so a value handed to Prisma
 * can never be rejected by `Decimal(12,2)`.
 */
export function roundToScale(value: unknown): Prisma.Decimal {
  return toDecimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * Parse a user-typed amount into an exact `Prisma.Decimal`.
 *
 * Accepts what an `<input type="number">` or a paste actually produces
 * ("1250", "1250.5", " 1,250.50 ") and rejects anything that is not a plain
 * decimal with at most two fractional digits. Returns `null` rather than `NaN`
 * so callers are forced to handle the failure.
 */
export function parseAmountInput(
  input: string | number | null | undefined,
): Prisma.Decimal | null {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim().replace(/,/g, "");
  if (raw === "") return null;
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return null;

  const [, fraction = ""] = raw.split(".");
  if (fraction.length > 2) return null;

  const value = new Prisma.Decimal(raw);
  return value.isFinite() ? value : null;
}

export { formatEtb, formatEtbNumber, isZeroAmount } from "./money-display";
