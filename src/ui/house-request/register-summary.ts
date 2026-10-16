/**
 * The facts a reason can be built on top of, without being invented.
 *
 * WHY A WRITER SHOULD NEVER RETYPE THE REGISTER
 * The page is a housing record. An allocator rejects a request whose reason
 * contradicts the file — "no children" against a family size of five — and a
 * counter officer writing under time pressure is exactly who types that. Every
 * fact offered here is re-read from the Employee register by the server on the
 * same lookup that drew this panel, so inserting them cannot introduce a
 * discrepancy: it copies, it does not claim.
 *
 * WHY THIS STOPS SHORT OF A REASON
 * Current accommodation, medical need and the reason for applying are NOT in the
 * register, and nothing here invents them. The insert produces a factual
 * scaffold with the questions left open; the human still answers them. That line
 * is the whole difference between helping somebody write and writing for them,
 * and in a housing file it is the only line that matters.
 */

import type { EmployeeSnapshot } from "@/lib/house-requests/types";
import { jobGradeBandLabel } from "@/lib/house-queue/eligibility";
import { humaniseEnum } from "./format";

/** One question an allocator will actually ask, in the order it is asked. */
export interface ReasonPrompt {
  /** Short label for the chip. */
  label: string;
  /** The heading this appends — a question, never an answer. */
  text: string;
}

/**
 * The prompts, ordered by how often they decide the outcome.
 *
 * Rendered whenever the box is short, and kept reachable afterwards, because the
 * officer who has already typed a paragraph is often the one who forgot the
 * accessibility question.
 */
export const REASON_PROMPTS: readonly ReasonPrompt[] = [
  { label: "Family", text: "Family size and dependants:" },
  { label: "Current housing", text: "Current accommodation:" },
  { label: "Medical need", text: "Medical or accessibility need:" },
  { label: "Employment", text: "Employment and grade:" },
] as const;

/**
 * The register's own facts, as two lines of plain English.
 *
 * Returns an empty string for a record that carries no facts worth inserting —
 * an employee with no grade, no title and no family size has nothing to copy,
 * and a scaffold of "Not recorded" lines is noise, not help.
 */
export function registerFactsFor(employee: EmployeeSnapshot): string {
  const lines: string[] = [];

  const family: string[] = [];
  if (employee.familySize != null) {
    family.push(`${employee.familySize}`);
  }
  if (employee.maritalStatus) {
    family.push(humaniseEnum(employee.maritalStatus).toLowerCase());
  }
  if (family.length > 0) {
    lines.push(`Family: ${family.join(", ")} (Employee register)`);
  }

  const employment: string[] = [];
  if (employee.jobTitle) employment.push(employee.jobTitle);
  if (employee.jobGrade != null) employment.push(`grade ${employee.jobGrade}`);
  if (employee.houseCategory) {
    const range = jobGradeBandLabel(employee.houseCategory);
    employment.push(
      `band ${employee.houseCategory}${range ? ` (${range})` : ""}`,
    );
  }
  if (employee.serviceYears > 0) {
    employment.push(
      `${employee.serviceYears} year${employee.serviceYears === 1 ? "" : "s"} of service`,
    );
  }
  if (employment.length > 0) {
    lines.push(`Employment: ${employment.join(", ")} (Employee register)`);
  }

  return lines.join("\n");
}

/** Whether there is anything worth inserting for this employee. */
export function hasRegisterFacts(employee: EmployeeSnapshot): boolean {
  return registerFactsFor(employee).length > 0;
}
