/**
 * Inspection auto-scheduling.
 *
 * A handback inspection is raised by the system the moment a house is vacated,
 * so somebody has to decide when it happens. The rule is configuration, not a
 * constant buried in the release path, because the lead time an office actually
 * wants depends on how far the inspector is from the house — but the *shape* of
 * the rule (working days only, never a weekend) is the same everywhere.
 *
 * Two configurable inputs:
 *   - the lead time, in working days, before the date the release was raised;
 *   - an optional explicit date, which still gets snapped off weekends so a
 *     hand-typed Saturday cannot produce a Saturday inspection.
 */

/** Default lead time: the next working day after the release. */
export const DEFAULT_INSPECTION_LEAD_WORKING_DAYS = 1;

/**
 * Day of week → is it a working day? 0 = Sunday … 6 = Saturday.
 *
 * Read in UTC because every date in this module is a UTC-midnight `@db.Date`.
 * Using the local weekday would put a UTC-midnight Saturday at "Friday" for an
 * operator east of Greenwich and schedule the inspection a day early.
 */
function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Read the configured lead time in working days.
 *
 * Bounded to a sensible range so a typo in the environment (`0`, `-5`, `1e9`)
 * cannot schedule an inspection in the past or fifty years out.
 */
export function inspectionLeadWorkingDays(): number {
  const raw = process.env.HOUSE_INSPECTION_LEAD_WORKING_DAYS;
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_INSPECTION_LEAD_WORKING_DAYS;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 60) {
    return DEFAULT_INSPECTION_LEAD_WORKING_DAYS;
  }
  return parsed;
}

/** Advance to the next working day if `date` lands on a weekend. */
export function nextWorkingDay(date: Date): Date {
  const out = new Date(date.getTime());
  let guard = 0;
  while (isWeekend(out) && guard < 14) {
    out.setUTCDate(out.getUTCDate() + 1);
    guard += 1;
  }
  return out;
}

/**
 * The date a newly raised inspection is scheduled for.
 *
 * Counts `N` working days forward, skipping Saturdays and Sundays, where
 * `N = max(1, leadWorkingDays)`. The floor of 1 is deliberate: an inspection
 * raised at 17:00 cannot be carried out the same day, and booking it for today
 * would hand an inspector a task already in the past. So a lead of 1 means "the
 * next working day", and a lead of 0 means the same thing rather than "today".
 *
 * Negative leads clamp to 1, so a bad configuration schedules the near future
 * rather than the past.
 *
 * Returns UTC midnight, matching the `@db.Date` column: a local-midnight value
 * would read back a day early anywhere east of UTC.
 */
export function computeInspectionDate(
  from: Date = new Date(),
  leadWorkingDays: number = inspectionLeadWorkingDays(),
): Date {
  const out = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  let remaining = Math.max(1, leadWorkingDays);
  let guard = 0;

  while (remaining > 0 && guard < 400) {
    out.setUTCDate(out.getUTCDate() + 1);
    guard += 1;
    if (isWeekend(out)) continue;
    remaining -= 1;
  }

  return out;
}

/** `YYYY-MM-DD`, for the API surface and the audit trail. */
export function formatInspectionDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
