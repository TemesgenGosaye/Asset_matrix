import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  addMonthsClamped,
  daysInMonth,
  daysOverdue,
  formatDateOnly,
  generateRentSchedule,
  isLeapYear,
  isOverdue,
  leaseEndDate,
  parseDateOnly,
  todayUtc,
} from "../schedule";

/** Build a UTC date from Y/M/D so a test never depends on the host timezone. */
const d = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month - 1, day));

const iso = (date: Date) => date.toISOString().slice(0, 10);

describe("daysInMonth", () => {
  it("returns the length of each 31-day month", () => {
    for (const month of [1, 3, 5, 7, 8, 10, 12]) {
      expect(daysInMonth(2026, month)).toBe(31);
    }
  });

  it("returns 30 for the 30-day months", () => {
    for (const month of [4, 6, 9, 11]) {
      expect(daysInMonth(2026, month)).toBe(30);
    }
  });

  it("returns 28 for February in a common year", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
  });

  it("returns 29 for February in a leap year", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2000, 2)).toBe(29);
  });
});

describe("isLeapYear", () => {
  it("accepts the standard rule", () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
  });

  it("treats century years as common unless divisible by 400", () => {
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2100)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
  });
});

describe("addMonthsClamped", () => {
  it("returns the anchor itself for month 1", () => {
    expect(iso(addMonthsClamped(d(2026, 3, 15), 0))).toBe("2026-03-15");
  });

  it("keeps the same day of month when the month is long enough", () => {
    expect(iso(addMonthsClamped(d(2026, 1, 15), 1))).toBe("2026-02-15");
    expect(iso(addMonthsClamped(d(2026, 1, 15), 2))).toBe("2026-03-15");
  });

  // The rule that is easy to get wrong: clamping is ANCHORED to the start date's
  // day number, NOT cascading from the previous month's clamped value.
  it("clamps 31 Jan to 28 Feb and returns to 31 Mar (anchored, not cascading)", () => {
    const anchor = d(2026, 1, 31);
    expect(iso(addMonthsClamped(anchor, 0))).toBe("2026-01-31");
    expect(iso(addMonthsClamped(anchor, 1))).toBe("2026-02-28");
    expect(iso(addMonthsClamped(anchor, 2))).toBe("2026-03-31");
  });

  it("clamps 31 Jan to 29 Feb in a leap year", () => {
    const anchor = d(2024, 1, 31);
    expect(iso(addMonthsClamped(anchor, 1))).toBe("2024-02-29");
    expect(iso(addMonthsClamped(anchor, 2))).toBe("2024-03-31");
  });

  it("clamps 31 to the 30th of a 30-day month", () => {
    expect(iso(addMonthsClamped(d(2026, 3, 31), 1))).toBe("2026-04-30");
  });

  it("rolls the year over correctly", () => {
    expect(iso(addMonthsClamped(d(2026, 11, 15), 3))).toBe("2027-02-15");
    expect(iso(addMonthsClamped(d(2026, 12, 31), 1))).toBe("2027-01-31");
  });

  it("crosses a leap day without drifting", () => {
    expect(iso(addMonthsClamped(d(2024, 2, 29), 12))).toBe("2025-02-28");
    expect(iso(addMonthsClamped(d(2024, 2, 29), 24))).toBe("2026-02-28");
  });

  it("is timezone-stable: the same result regardless of the source time-of-day", () => {
    const morning = new Date(Date.UTC(2026, 0, 31, 0, 0, 0));
    const evening = new Date(Date.UTC(2026, 0, 31, 23, 59, 59));
    expect(iso(addMonthsClamped(morning, 1))).toBe("2026-02-28");
    expect(iso(addMonthsClamped(evening, 1))).toBe("2026-02-28");
  });
});

describe("leaseEndDate", () => {
  it("is the last scheduled month, not the day after", () => {
    expect(iso(leaseEndDate(d(2026, 1, 15), 24))).toBe("2027-12-15");
  });

  it("clamps for a month-end start", () => {
    expect(iso(leaseEndDate(d(2026, 1, 31), 1))).toBe("2026-01-31");
    expect(iso(leaseEndDate(d(2026, 1, 31), 12))).toBe("2026-12-31");
  });
});

describe("generateRentSchedule", () => {
  it("generates exactly one row per month of the term", () => {
    const rows = generateRentSchedule({
      startDate: d(2026, 1, 15),
      termMonths: 24,
      monthlyPrice: "1250.00",
    });
    expect(rows).toHaveLength(24);
  });

  it("numbers months from 1 and starts on the start date", () => {
    const rows = generateRentSchedule({
      startDate: d(2026, 1, 15),
      termMonths: 3,
      monthlyPrice: "500",
    });
    expect(rows.map((r) => r.monthNumber)).toEqual([1, 2, 3]);
    expect(iso(rows[0].dueDate)).toBe("2026-01-15");
    expect(iso(rows[1].dueDate)).toBe("2026-02-15");
    expect(iso(rows[2].dueDate)).toBe("2026-03-15");
  });

  it("snapshots the monthly price on every row", () => {
    const rows = generateRentSchedule({
      startDate: d(2026, 1, 1),
      termMonths: 12,
      monthlyPrice: "2500.75",
    });
    for (const row of rows) {
      expect(row.amountDue.toFixed(2)).toBe("2500.75");
    }
  });

  it("keeps money exact where a float would drift", () => {
    const rows = generateRentSchedule({
      startDate: d(2026, 1, 1),
      termMonths: 3,
      monthlyPrice: "0.10",
    });
    // 0.1 + 0.2 === 0.30000000000000004 in IEEE-754; the ledger total must not be.
    const sum = rows.reduce<Prisma.Decimal>(
      (acc, row) => acc.add(row.amountDue),
      new Prisma.Decimal(0),
    );
    expect(sum.toFixed(2)).toBe("0.30");
  });

  it("handles a month-end anchor across a full year", () => {
    const rows = generateRentSchedule({
      startDate: d(2026, 1, 31),
      termMonths: 12,
      monthlyPrice: "100",
    });
    expect(rows.map((r) => iso(r.dueDate))).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
      "2026-06-30",
      "2026-07-31",
      "2026-08-31",
      "2026-09-30",
      "2026-10-31",
      "2026-11-30",
      "2026-12-31",
    ]);
  });

  it("rejects a term outside 1..120", () => {
    expect(() =>
      generateRentSchedule({
        startDate: d(2026, 1, 1),
        termMonths: 0,
        monthlyPrice: "1",
      }),
    ).toThrow(RangeError);
    expect(() =>
      generateRentSchedule({
        startDate: d(2026, 1, 1),
        termMonths: 121,
        monthlyPrice: "1",
      }),
    ).toThrow(RangeError);
    expect(() =>
      generateRentSchedule({
        startDate: d(2026, 1, 1),
        termMonths: 12.5,
        monthlyPrice: "1",
      }),
    ).toThrow(RangeError);
  });

  it("accepts the inclusive bounds", () => {
    expect(
      generateRentSchedule({
        startDate: d(2026, 1, 1),
        termMonths: 1,
        monthlyPrice: "1",
      }),
    ).toHaveLength(1);
    expect(
      generateRentSchedule({
        startDate: d(2026, 1, 1),
        termMonths: 120,
        monthlyPrice: "1",
      }),
    ).toHaveLength(120);
  });

  it("rejects an invalid start date", () => {
    expect(() =>
      generateRentSchedule({
        startDate: new Date("nonsense"),
        termMonths: 12,
        monthlyPrice: "1",
      }),
    ).toThrow(RangeError);
  });
});

describe("parseDateOnly", () => {
  it("parses a real calendar date as UTC midnight", () => {
    const parsed = parseDateOnly("2026-03-15");
    expect(parsed?.toISOString()).toBe("2026-03-15T00:00:00.000Z");
  });

  it("rejects a rolled-over date instead of silently moving it", () => {
    // The classic bug: new Date('2026-02-31') becomes 3 March.
    expect(parseDateOnly("2026-02-31")).toBeNull();
    expect(parseDateOnly("2026-13-01")).toBeNull();
    expect(parseDateOnly("2026-00-10")).toBeNull();
    expect(parseDateOnly("2026-04-31")).toBeNull();
  });

  it("accepts 29 February in a leap year and rejects it otherwise", () => {
    expect(parseDateOnly("2024-02-29")).not.toBeNull();
    expect(parseDateOnly("2026-02-29")).toBeNull();
  });

  it("rejects free-form and malformed input", () => {
    expect(parseDateOnly("15/03/2026")).toBeNull();
    expect(parseDateOnly("2026-3-15")).toBeNull();
    expect(parseDateOnly("")).toBeNull();
    expect(parseDateOnly(null)).toBeNull();
    expect(parseDateOnly(20260315)).toBeNull();
  });

  it("normalises a Date to its UTC calendar day", () => {
    const parsed = parseDateOnly(new Date("2026-03-15T23:30:00.000Z"));
    expect(parsed?.toISOString()).toBe("2026-03-15T00:00:00.000Z");
  });

  it("rejects years outside the range the receipt sequence can store", () => {
    // `Date.UTC` remaps years 0-99 onto 1900-1999, so without an explicit
    // bound "0099-12-31" silently became 1999-12-31. That year is also outside
    // `rent_receipt_sequences_year_range_check` (2000-9999), so a payment dated
    // there passed Zod and then died on the database CHECK.
    expect(parseDateOnly("0099-12-31")).toBeNull();
    expect(parseDateOnly("0999-12-31")).toBeNull();
    expect(parseDateOnly("1999-12-31")).toBeNull();
    expect(parseDateOnly("0000-01-01")).toBeNull();
    // The boundary itself is accepted and round-trips exactly.
    expect(formatDateOnly(parseDateOnly("2000-01-01"))).toBe("2000-01-01");
  });
});

describe("formatDateOnly", () => {
  it("round-trips with parseDateOnly", () => {
    expect(formatDateOnly(parseDateOnly("2026-01-31"))).toBe("2026-01-31");
  });

  it("pads single-digit components", () => {
    expect(formatDateOnly(d(2026, 3, 5))).toBe("2026-03-05");
  });

  it("returns null for missing or invalid input", () => {
    expect(formatDateOnly(null)).toBeNull();
    expect(formatDateOnly(undefined)).toBeNull();
    expect(formatDateOnly(new Date("nope"))).toBeNull();
  });
});

describe("isOverdue (derived, never stored)", () => {
  const now = new Date(Date.UTC(2026, 5, 15, 12, 0, 0)); // 15 Jun 2026, midday

  it("is true for a past-due UNPAID month", () => {
    expect(isOverdue(d(2026, 6, 14), "UNPAID", now)).toBe(true);
  });

  it("is false for a month due today", () => {
    expect(isOverdue(d(2026, 6, 15), "UNPAID", now)).toBe(false);
  });

  it("is false for a future month", () => {
    expect(isOverdue(d(2026, 6, 16), "UNPAID", now)).toBe(false);
  });

  it("is false for a PAID month however old", () => {
    expect(isOverdue(d(2020, 1, 1), "PAID", now)).toBe(false);
  });

  it("is false for a VOIDED month", () => {
    expect(isOverdue(d(2020, 1, 1), "VOIDED", now)).toBe(false);
  });

  it("is unaffected by the time of day, because both sides are reduced to a day", () => {
    const justAfterMidnight = new Date(Date.UTC(2026, 5, 15, 0, 0, 1));
    const justBeforeMidnight = new Date(Date.UTC(2026, 5, 15, 23, 59, 59));
    expect(isOverdue(d(2026, 6, 15), "UNPAID", justAfterMidnight)).toBe(false);
    expect(isOverdue(d(2026, 6, 15), "UNPAID", justBeforeMidnight)).toBe(false);
  });
});

describe("daysOverdue", () => {
  const now = new Date(Date.UTC(2026, 5, 15, 9, 0, 0));

  it("counts whole days past due", () => {
    expect(daysOverdue(d(2026, 6, 14), now)).toBe(1);
    expect(daysOverdue(d(2026, 6, 10), now)).toBe(5);
  });

  it("is 0 for today and for the future", () => {
    expect(daysOverdue(d(2026, 6, 15), now)).toBe(0);
    expect(daysOverdue(d(2026, 7, 1), now)).toBe(0);
  });
});

describe("todayUtc", () => {
  it("strips the time of day", () => {
    expect(
      todayUtc(new Date(Date.UTC(2026, 4, 7, 23, 59, 59))).toISOString(),
    ).toBe("2026-05-07T00:00:00.000Z");
  });
});
