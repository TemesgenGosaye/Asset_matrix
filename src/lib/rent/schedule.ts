/**
 * Rent schedule date arithmetic.
 *
 * The single tested home for "which day of which month is month N due?". Every
 * due date in the system comes from here - the generator, the update path that
 * regenerates a schedule, and the tests - so the clamping rule cannot drift.
 *
 * TWO RULES THAT ARE EASY TO GET WRONG:
 *
 * 1. CLAMPING IS ANCHORED, NOT CASCADING.
 *    A lease starting on the 31st is due on the 31st of every month that has a
 *    31st, and on the last day of every month that does not:
 *        Jan 31 -> Feb 28 -> Mar 31 (not Mar 28)
 *        Jan 31 -> Feb 29 (leap year) -> Mar 31
 *    Cascading (Feb 28 becoming the new anchor) would silently drift a whole day
 *    per short month and end the lease on the wrong date.
 *
 * 2. EVERYTHING IS UTC.
 *    Due dates are calendar dates, not instants. They are stored as SQL `DATE`
 *    and computed with `Date.UTC`, so a server in Africa/Addis_Ababa and one in
 *    UTC produce identical schedules and no DST/timezone shift can move a due
 *    date across a day boundary.
 */

import { Prisma } from "@prisma/client";
import { TERM_MONTHS_MAX, TERM_MONTHS_MIN } from "./constants";

/** Days in a Gregorian month. `month` is 1-12. */
export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** True when `year` is a Gregorian leap year. */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * The due date for the month `monthsAfterStart` of a lease that began on
 * `anchor`, clamped to the last day of a shorter month.
 *
 * `monthsAfterStart = 0` returns the anchor itself, so month 1 is due on the
 * rent start date exactly as specified - even if the start date is, say, the
 * 30th and the next month is shorter.
 *
 * @param anchor         Lease start date (any component of the local/UTC time
 *                       of day is ignored; only Y/M/D is read).
 * @param monthsAfterStart 0 for month 1, 1 for month 2, and so on. May be any
 *                       non-negative integer.
 */
export function addMonthsClamped(anchor: Date, monthsAfterStart: number): Date {
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth(); // 0-based
  const day = anchor.getUTCDate();

  // getUTCFullYear/Month on month+offset normalises the month overflow itself
  // (month 12 + 1 -> January of the next year), so only the day needs clamping.
  const target = new Date(Date.UTC(year, month + monthsAfterStart, 1));
  const targetYear = target.getUTCFullYear();
  // `getUTCMonth()` is 0-based while `daysInMonth()` takes a 1-based month.
  const targetMonth = target.getUTCMonth();

  const lastDay = daysInMonth(targetYear, targetMonth + 1);
  return new Date(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay)));
}

/** The last day covered by a lease: month `termMonths`, anchored at the start. */
export function leaseEndDate(startDate: Date, termMonths: number): Date {
  return addMonthsClamped(startDate, termMonths - 1);
}

/** A generated (not yet persisted) schedule row. */
export interface ScheduleEntry {
  /** 1-based month position within the lease. */
  monthNumber: number;
  dueDate: Date;
  /** Snapshot of the monthly price, in ETB. */
  amountDue: Prisma.Decimal;
}

/**
 * Build the full rent schedule for a lease.
 *
 * Month 1 is due on `startDate`; each later month keeps the start date's day
 * number, clamped. `amountDue` snapshots `monthlyPrice` on every row so a later
 * price change can rewrite the unpaid months without touching money that was
 * already invoiced.
 *
 * @throws RangeError when `termMonths` is outside 1..120. The caller is a Zod
 *         schema or a database CHECK, so this is a programming error rather than
 *         user input.
 */
export function generateRentSchedule(params: {
  startDate: Date;
  termMonths: number;
  monthlyPrice: Prisma.Decimal | string | number;
}): ScheduleEntry[] {
  const { startDate, termMonths, monthlyPrice } = params;

  if (
    !Number.isInteger(termMonths) ||
    termMonths < TERM_MONTHS_MIN ||
    termMonths > TERM_MONTHS_MAX
  ) {
    throw new RangeError(
      `termMonths must be an integer between ${TERM_MONTHS_MIN} and ${TERM_MONTHS_MAX}, received ${termMonths}`,
    );
  }
  if (Number.isNaN(startDate.getTime())) {
    throw new RangeError("startDate is not a valid date");
  }

  const price = new Prisma.Decimal(monthlyPrice as Prisma.Decimal.Value);
  const entries: ScheduleEntry[] = [];

  for (let monthNumber = 1; monthNumber <= termMonths; monthNumber += 1) {
    entries.push({
      monthNumber,
      dueDate: addMonthsClamped(startDate, monthNumber - 1),
      amountDue: price,
    });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Overdue / today
// ---------------------------------------------------------------------------

/**
 * The "current" date as a UTC midnight `Date`.
 *
 * Overdue is a comparison against a calendar date, so both sides are reduced to
 * midnight UTC before comparing. This is what makes the derived overdue flag
 * independent of the server's timezone.
 */
export function todayUtc(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/**
 * Is this installment overdue? DERIVED, never stored.
 *
 * `dueDate < today AND status = UNPAID`. A month due *today* is not yet overdue.
 */
export function isOverdue(
  dueDate: Date,
  status: string,
  now: Date = new Date(),
): boolean {
  if (status !== "UNPAID") return false;
  return dueDate.getTime() < todayUtc(now).getTime();
}

/** Whole days a due date is in the past; 0 when it is today or in the future. */
export function daysOverdue(dueDate: Date, now: Date = new Date()): number {
  const diff = todayUtc(now).getTime() - dueDate.getTime();
  return diff <= 0 ? 0 : Math.floor(diff / 86_400_000);
}

// ---------------------------------------------------------------------------
// Parsing date-only input
// ---------------------------------------------------------------------------

/** `YYYY-MM-DD` matches, and nothing else. */
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Accepted year range, matching `rent_receipt_sequences_year_range_check`.
 *
 * Anything outside this is rejected in Zod so the caller gets a field-level
 * message instead of a `422 CONSTRAINT_VIOLATION` from PostgreSQL.
 */
export const MIN_YEAR = 2000;
export const MAX_YEAR = 9999;

/**
 * Parse a `YYYY-MM-DD` string into a UTC-midnight `Date`.
 *
 * Returns `null` for anything that is not an exactly real calendar date, so
 * `2026-02-31` and `2026-13-01` are rejected instead of rolling over into
 * March - a silently rolled-over start date would produce a whole wrong
 * schedule.
 */
export function parseDateOnly(value: unknown): Date | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!DATE_ONLY_PATTERN.test(trimmed)) return null;

  const year = Number(trimmed.slice(0, 4));
  const month = Number(trimmed.slice(5, 7));
  const day = Number(trimmed.slice(8, 10));

  // `Date.UTC` remaps years 0-99 onto 1900-1999, which would silently turn
  // "0099-12-31" into 1999-12-31. Reject those outright.
  if (year < MIN_YEAR || year > MAX_YEAR) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  // Belt and braces: confirm the round trip, in case a leap rule ever diverges.
  if (date.getUTCFullYear() !== year) return null;
  return date;
}

/** `Date` -> `YYYY-MM-DD`, the wire format used by every API payload. */
export function formatDateOnly(value: Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
