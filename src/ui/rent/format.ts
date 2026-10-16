/**
 * Client-side display formatters for the Pay Rent module.
 *
 * Deliberately thin wrappers over the shared lib helpers so the browser and the
 * server agree on how an amount or a date is rendered. Nothing here does money
 * arithmetic - amounts arrive as exact decimal strings and are only formatted.
 */

// Formatting only - deliberately not `@/lib/rent/money`, which imports
// `@prisma/client` for its arithmetic. Importing it here would drag the whole
// Prisma client into the browser bundle for formatting that needs none of it.
import {
  formatEtb,
  formatEtbNumber,
  isZeroAmount,
} from "@/lib/rent/money-display";
import { formatPhoneForDisplay } from "@/lib/rent/validators";

export { formatEtb, formatEtbNumber, isZeroAmount, formatPhoneForDisplay };

/** `2026-03-15` -> `15 Mar 2026`, computed in UTC so it cannot shift a day. */
export function formatRentDate(value: string | null | undefined): string {
  const parsed = value ? parseIsoDate(value) : null;
  if (!parsed) return "—";
  const raw = parsed.toLocaleString("en-GB", {
    month: "short",
    timeZone: "UTC",
  });
  // Some ICU builds render September as "Sept", which breaks the 3-letter column
  // width used by the schedule table. Slice so every month is exactly 3 letters.
  const month = raw.slice(0, 3);
  return `${parsed.getUTCDate()} ${month} ${parsed.getUTCFullYear()}`;
}

/** Same as {@link formatRentDate} but renders an em dash for an empty value. */
export function formatRentDateOrDash(value: string | null | undefined): string {
  return value ? formatRentDate(value) : "—";
}

/** `2026-03-15` -> `15/03/2026`. */
export function formatRentDateNumeric(
  value: string | null | undefined,
): string {
  const parsed = value ? parseIsoDate(value) : null;
  if (!parsed) return "—";
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${parsed.getUTCFullYear()}`;
}

/** Parse `YYYY-MM-DD` as a UTC-midnight `Date`; null when not a real date. */
function parseIsoDate(value: string): Date | null {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// ---------------------------------------------------------------------------
// Ethiopian calendar
// ---------------------------------------------------------------------------

/**
 * Ethiopian (Ge'ez) calendar conversion.
 *
 * Optional DISPLAY only - the database always stores Gregorian dates in UTC.
 * Implements the standard fixed 7-year leap cycle via JDN arithmetic: the cycle
 * has 1461 days (7 x 365 + 6), which is exactly what makes month 13 (Pagumē)
 * six days longer every seventh year.
 *
 * The conversion is date-only and timezone-free, so both calendar renderings
 * describe the same stored instant.
 */
export function toEthiopianDate(
  value: string | null | undefined,
): string | null {
  const parsed = value ? parseIsoDate(value) : null;
  if (!parsed) return null;

  const gy = parsed.getUTCFullYear();
  const gm = parsed.getUTCMonth() + 1;
  const gd = parsed.getUTCDate();

  // Gregorian -> Julian Day Number (Fliegel & Van Flandern), integer-exact.
  const a = Math.floor((14 - gm) / 12);
  const y = gy + 4800 - a;
  const m = gm + 12 * a - 3;
  const jdn =
    gd +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045;

  // JDN -> Ethiopian. 1723856 is the JDN of Meskerem 1, year 1 EC.
  const offset = jdn - 1723856;
  const cycleDay = offset % 1461;
  const dayInCycle = (cycleDay % 365) + 365 * Math.floor(cycleDay / 1460);

  const year =
    4 * Math.floor(offset / 1461) +
    Math.floor(cycleDay / 365) -
    Math.floor(cycleDay / 1460);
  const month = Math.floor(dayInCycle / 30) + 1;
  const day = (dayInCycle % 30) + 1;

  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year} ዓ.ም`;
}

/**
 * Render a date according to the portal's calendar preference.
 *
 * The toggle is a display concern only; both representations describe the same
 * stored Gregorian date.
 */
export function formatRentDateForCalendar(
  value: string | null | undefined,
  calendar: "gregorian" | "ethiopian",
): string {
  if (calendar === "ethiopian") {
    return toEthiopianDate(value) ?? "—";
  }
  return formatRentDate(value);
}

/** `2026-03-15` -> ISO weekday short form, for the schedule table. */
export function weekdayShort(value: string | null | undefined): string {
  const parsed = value ? parseIsoDate(value) : null;
  if (!parsed) return "";
  return parsed.toLocaleString("en-GB", { weekday: "short", timeZone: "UTC" });
}
