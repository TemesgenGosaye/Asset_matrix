/**
 * Display helpers for the House Request page.
 *
 * Pure formatting only — nothing here touches the network or the DOM. They live
 * apart from the components so the wording of a label, a badge or an enum can be
 * corrected in one place rather than hunted for across four files.
 */

import type { EmployeeSnapshot } from "@/lib/house-requests/types";

/**
 * Two-letter monogram for the summary avatar.
 *
 * Falls back to the Employee ID's leading characters when either name is
 * missing, so the avatar is never an empty circle — an empty avatar reads as a
 * broken image, which is worse than an approximate initial.
 */
export function initialsFor(
  employee: Pick<EmployeeSnapshot, "firstname" | "lastname" | "employeeNumber">,
): string {
  const first = employee.firstname?.trim()?.[0] ?? "";
  const last = employee.lastname?.trim()?.[0] ?? "";
  const pair = `${first}${last}`.toUpperCase();
  if (pair) return pair;
  return (employee.employeeNumber ?? "?").slice(0, 2).toUpperCase();
}

/**
 * Turn a stored enum into a sentence.
 *
 * The register stores `permanent`, `on_leave`, `PendingInspection` and so on.
 * Splitting on `_` and capitalising reads correctly for all of them; anything
 * that already carries its own capitals is left alone.
 */
export function humaniseEnum(value: string | null | undefined): string {
  if (!value) return "—";
  const words = value.replace(/[_-]+/g, " ").trim();
  if (!words) return "—";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A value the record genuinely does not carry, said so rather than left blank. */
export const ABSENT = "Not recorded";

/** Whether an employment status should read as live. */
export function isActiveStatus(status: string | null | undefined): boolean {
  return typeof status === "string" && status.toLowerCase() === "active";
}
