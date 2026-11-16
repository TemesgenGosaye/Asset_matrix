import type { EmployeeSnapshot } from "@/lib/house-requests/types";
import { jobGradeBandLabel } from "@/lib/house-queue/eligibility";
import { humaniseEnum } from "./format";

export interface ReasonPrompt {
  label: string;
  text: string;
}

export const REASON_PROMPTS: readonly ReasonPrompt[] = [
  { label: "Family", text: "Family size and dependants:" },
  { label: "Current housing", text: "Current accommodation:" },
  { label: "Medical need", text: "Medical or accessibility need:" },
  { label: "Employment", text: "Employment and grade:" },
] as const;

export function registerFactsFor(employee: EmployeeSnapshot): string {
  const lines: string[] = [];

  const family: string[] = [];
  if (employee.familySize != null) family.push(`${employee.familySize}`);
  if (employee.maritalStatus) {
    family.push(humaniseEnum(employee.maritalStatus).toLowerCase());
  }
  if (family.length > 0) {
    lines.push(`Family: ${family.join(", ")} (Employee Register)`);
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
    lines.push(`Employment: ${employment.join(", ")} (Employee Register)`);
  }

  return lines.join("\n");
}

export function hasRegisterFacts(employee: EmployeeSnapshot): boolean {
  return registerFactsFor(employee).length > 0;
}
