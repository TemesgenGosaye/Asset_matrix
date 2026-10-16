import { describe, expect, it } from "vitest";
import {
  DEFAULT_INSPECTION_LEAD_WORKING_DAYS,
  computeInspectionDate,
  formatInspectionDate,
  inspectionLeadWorkingDays,
  nextWorkingDay,
} from "../inspection-schedule";

/**
 * The auto-scheduling rule.
 *
 * The point of it is that a raised inspection is never booked for a Saturday or
 * Sunday, and that the lead time is configuration rather than a constant — so a
 * site can change it without a code change, but a nonsense value cannot break
 * the calendar.
 */

describe("inspectionLeadWorkingDays", () => {
  it("defaults to the documented lead time when unset", () => {
    expect(inspectionLeadWorkingDays()).toBe(
      DEFAULT_INSPECTION_LEAD_WORKING_DAYS,
    );
  });

  it("reads a valid override", () => {
    const prev = process.env.HOUSE_INSPECTION_LEAD_WORKING_DAYS;
    try {
      process.env.HOUSE_INSPECTION_LEAD_WORKING_DAYS = "5";
      expect(inspectionLeadWorkingDays()).toBe(5);
    } finally {
      if (prev === undefined)
        delete process.env.HOUSE_INSPECTION_LEAD_WORKING_DAYS;
      else process.env.HOUSE_INSPECTION_LEAD_WORKING_DAYS = prev;
    }
  });

  it("ignores a nonsensical override", () => {
    const prev = process.env.HOUSE_INSPECTION_LEAD_WORKING_DAYS;
    try {
      for (const bad of ["abc", "-3", "1e9", "2.5"]) {
        process.env.HOUSE_INSPECTION_LEAD_WORKING_DAYS = bad;
        expect(inspectionLeadWorkingDays(), bad).toBe(
          DEFAULT_INSPECTION_LEAD_WORKING_DAYS,
        );
      }
    } finally {
      if (prev === undefined)
        delete process.env.HOUSE_INSPECTION_LEAD_WORKING_DAYS;
      else process.env.HOUSE_INSPECTION_LEAD_WORKING_DAYS = prev;
    }
  });
});

describe("nextWorkingDay", () => {
  it("leaves a weekday alone", () => {
    // 2026-01-14 is a Wednesday.
    expect(
      formatInspectionDate(nextWorkingDay(new Date("2026-01-14T00:00:00Z"))),
    ).toBe("2026-01-14");
  });

  it("pushes Saturday to Monday", () => {
    // 2026-01-17 is a Saturday.
    expect(
      formatInspectionDate(nextWorkingDay(new Date("2026-01-17T00:00:00Z"))),
    ).toBe("2026-01-19");
  });

  it("pushes Sunday to Monday", () => {
    // 2026-01-18 is a Sunday.
    expect(
      formatInspectionDate(nextWorkingDay(new Date("2026-01-18T00:00:00Z"))),
    ).toBe("2026-01-19");
  });
});

describe("computeInspectionDate", () => {
  it("returns a UTC-midnight date, never a local one", () => {
    // The column is a @db.Date and every reader slices the ISO string, so a
    // local-midnight value would land a day early east of UTC.
    const date = computeInspectionDate(new Date("2026-01-14T09:30:00Z"));
    expect(date.getUTCHours()).toBe(0);
    expect(date.getUTCMinutes()).toBe(0);
    expect(date.getTime() % 86_400_000).toBe(0);
  });

  it("counts working days, skipping the weekend", () => {
    // Wednesday + 1 working day = Thursday.
    expect(
      formatInspectionDate(
        computeInspectionDate(new Date("2026-01-14T00:00:00Z"), 1),
      ),
    ).toBe("2026-01-15");
    // Thursday + 1 working day is simply Friday — the weekend is only skipped
    // when the walk actually lands on it.
    expect(
      formatInspectionDate(
        computeInspectionDate(new Date("2026-01-15T00:00:00Z"), 1),
      ),
    ).toBe("2026-01-16");
    // Friday + 1 working day = Monday.
    expect(
      formatInspectionDate(
        computeInspectionDate(new Date("2026-01-16T00:00:00Z"), 1),
      ),
    ).toBe("2026-01-19");
  });

  it("never lands on a weekend, over a whole year of start days", () => {
    for (let day = 0; day < 365; day++) {
      const from = new Date(Date.UTC(2026, 0, 1 + day));
      for (const lead of [0, 1, 2, 3, 7]) {
        const scheduled = computeInspectionDate(from, lead);
        const dow = scheduled.getUTCDay();
        expect([0, 6], `${formatInspectionDate(from)} +${lead}d`).not.toContain(
          dow,
        );
      }
    }
  });

  it("treats a zero lead time as 'the next working day'", () => {
    // Never "today": an inspection raised at 17:00 cannot be carried out the
    // same day, and scheduling it for today would hand an inspector a task
    // already in the past.
    const out = computeInspectionDate(new Date("2026-01-14T17:00:00Z"), 0);
    expect(formatInspectionDate(out)).toBe("2026-01-15");
  });

  it("clamps a negative lead to zero rather than scheduling in the past", () => {
    const out = computeInspectionDate(new Date("2026-01-14T00:00:00Z"), -5);
    expect(out.getTime()).toBeGreaterThan(
      new Date("2026-01-14T00:00:00Z").getTime(),
    );
  });

  it("crosses a month boundary correctly", () => {
    // 2026-01-30 is a Friday; +1 working day is Monday 2026-02-02.
    expect(
      formatInspectionDate(
        computeInspectionDate(new Date("2026-01-30T00:00:00Z"), 1),
      ),
    ).toBe("2026-02-02");
  });

  it("crosses a year boundary correctly", () => {
    // 2026-12-31 is a Thursday; +1 working day is Friday 2027-01-01.
    expect(
      formatInspectionDate(
        computeInspectionDate(new Date("2026-12-31T00:00:00Z"), 1),
      ),
    ).toBe("2027-01-01");
  });

  it("uses the configured lead time when none is given", () => {
    const prev = process.env.HOUSE_INSPECTION_LEAD_WORKING_DAYS;
    try {
      process.env.HOUSE_INSPECTION_LEAD_WORKING_DAYS = "3";
      // Wednesday + 3 working days = Monday.
      expect(
        formatInspectionDate(
          computeInspectionDate(new Date("2026-01-14T00:00:00Z")),
        ),
      ).toBe("2026-01-19");
    } finally {
      if (prev === undefined)
        delete process.env.HOUSE_INSPECTION_LEAD_WORKING_DAYS;
      else process.env.HOUSE_INSPECTION_LEAD_WORKING_DAYS = prev;
    }
  });
});
