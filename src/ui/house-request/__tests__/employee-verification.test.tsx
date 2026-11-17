import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import EmployeeVerificationResult from "../EmployeeVerificationResult";
import EmployeeVerificationSkeleton from "../EmployeeVerificationSkeleton";
import EmployeeVerificationError from "../EmployeeVerificationError";
import type { HouseRequestVerifyResult } from "@/lib/house-requests/types";

function createMockVerifyResult(
  overrides?: Partial<HouseRequestVerifyResult>,
): HouseRequestVerifyResult {
  return {
    empId: "1000599",
    fullName: "Temesgen Gosaye",
    department: "Commercial Department",
    gender: "male",
    hireDate: "2026-10-05T00:00:00.000Z",
    serviceYears: 0,
    maritalStatus: "single",
    disabilityStatus: "Yes",
    photoUrl: null,
    isEligible: true,
    eligibleHouseType: "Staff",
    eligibilityReason: "Job grade 24 qualifies for Staff housing.",
    alreadyHasActiveAllocation: false,
    hasOpenRequest: true,
    queue: {
      rank: 2,
      cohortSize: 3,
      score: 0.2,
      category: "Staff",
    },
    employee: {
      id: "usr-1000599",
      employeeNumber: "1000599",
      firstname: "Temesgen",
      lastname: "Gosaye",
      fullName: "Temesgen Gosaye",
      jobGrade: 24,
      jobTitle: "SE",
      departmentId: "dept-comm",
      departmentName: "Commercial Department",
      gender: "male",
      serviceYears: 0,
      hireDate: "2026-10-05T00:00:00.000Z",
      maritalStatus: "single",
      familySize: 4,
      disabilityStatus: "Yes",
      employmentType: "full_time",
      employmentStatus: "active",
      phone: null,
      nationalIdMasked: "66776767676",
      houseCategory: "Staff",
    },
    existingRequest: {
      id: "req-1",
      status: "submitted",
      remarks: "tyyyyyyyyyyyyyyyyyyyyu",
      submittedAt: "2026-10-15T00:00:00.000Z",
    },
    hasAllocatedHouse: false,
    allocation: null,
    eligibilityLegend:
      "> 17 → Staff · 15 – 17 → A · 12 – 14 → B · 10 – 11 → C · 7 – 9 → D · 1 – 6 → E",
    ...overrides,
  };
}

describe("Metahara Sugar Factory — Employee Verification Result Panel", () => {
  it("renders the exact four-column single table in the required sequence", () => {
    const mock = createMockVerifyResult();
    const html = renderToStaticMarkup(
      <EmployeeVerificationResult
        verify={mock}
        organizationName="Metahara Sugar Factory"
      />,
    );

    // Single table structure with fixed colgroup
    expect(html).toContain("<table");
    expect(html).toContain("<colgroup>");
    expect(html).toContain("evr-table");

    // Header row
    expect(html).toContain("Metahara Sugar Factory");
    expect(html).toContain("Employee Verification Result");
    expect(html).toContain("Ref <strong>HR-1000599</strong>");
    expect(html).toContain("Printed");
    expect(html).toContain("HAMS Portal");

    // Section band: Employee
    expect(html).toContain("Employee");
    expect(html).toContain("Full name");
    expect(html).toContain("Temesgen Gosaye");
    expect(html).toContain("Employee ID");
    expect(html).toContain("1000599");
    expect(html).toContain("Verification");
    expect(html).toContain("Verified · Active");
    expect(html).toContain("Eligibility");
    expect(html).toContain("Blocked"); // hasOpenRequest is true
    expect(html).toContain("Service");
    expect(html).toContain("0 yrs");
    expect(html).toContain("Job grade");
    expect(html).toContain("24");
    expect(html).toContain("Marital status");
    expect(html).toContain("Single");
    expect(html).toContain("Disability");
    // The disability is free text now, so the panel shows what the record
    // actually says rather than a yes/no summary.
    expect(html).toContain("Yes");

    // Section band: 1. Employment
    expect(html).toContain("1. Employment");
    expect(html).toContain("Department");
    expect(html).toContain("Commercial Department");
    expect(html).toContain("Job title");
    expect(html).toContain("SE");
    expect(html).toContain("Type");
    expect(html).toContain("Full-time");
    expect(html).toContain("Status");
    expect(html).toContain("Active");
    expect(html).toContain("Hire date");
    expect(html).toContain("Service years");

    // Section band: 2. Personal & Household
    expect(html).toContain("2. Personal &amp; Household");
    expect(html).toContain("Gender");
    expect(html).toContain("Male");
    expect(html).toContain("Family size");
    expect(html).toContain("4");
    expect(html).toContain("Accessibility");
    expect(html).toContain("Phone");
    expect(html).toContain("Not recorded");
    expect(html).toContain("National ID");
    expect(html).toContain("66776767676");

    // Section band: 3. Housing Position
    expect(html).toContain("3. Housing Position");
    expect(html).toContain("Request status");
    expect(html).toContain("Submitted (Oct 15, 2026)");
    expect(html).toContain("Queue position");
    expect(html).toContain("#2 of 3");
    expect(html).toContain("Reason on file");
    expect(html).toContain("tyyyyyyyyyyyyyyyyyyyyu");
    expect(html).toContain("MCDA score");
    expect(html).toContain("20%");
    expect(html).toContain("House band");
    expect(html).toContain("Staff");

    // Section band: 4. Eligibility Checks
    expect(html).toContain("4. Eligibility Checks");
    expect(html).toContain("Check");
    expect(html).toContain("Result");
    expect(html).toContain("Employment is active");
    expect(html).toContain("PASS");
    expect(html).toContain("Job grade maps to a house band");
    expect(html).toContain("No allocated house is held");
    expect(html).toContain("No request is already open");
    expect(html).toContain("FAIL");

    // Full-width Action Required row when blocked
    expect(html).toContain(
      "ACTION REQUIRED: Withdraw or resolve the existing open request before filing a new one.",
    );

    // Authorization section is intentionally absent (removed from the document)
    expect(html).not.toContain("Verified by");
    expect(html).not.toContain("Stamp");

    // Footer row
    expect(html).toContain(
      "Metahara Sugar Factory · Computer-generated verification result, valid with authorized signature",
    );

    // Print button
    expect(html).toContain("Print");
  });

  it("does not render the Action Required row when the employee is ELIGIBLE", () => {
    const mock = createMockVerifyResult({
      hasOpenRequest: false,
      existingRequest: null,
      alreadyHasActiveAllocation: false,
      isEligible: true,
    });

    const html = renderToStaticMarkup(
      <EmployeeVerificationResult verify={mock} />,
    );

    expect(html).toContain("Eligible");
    expect(html).not.toContain("ACTION REQUIRED:");
  });
});

describe("EmployeeVerificationSkeleton in Single-Table Shape", () => {
  it("renders a matching table skeleton with aria-busy and aria-live polite", () => {
    const html = renderToStaticMarkup(
      <EmployeeVerificationSkeleton employeeNumber="1000599" />,
    );

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('role="status"');
    expect(html).toContain("evr-table");
    expect(html).toContain("Employee");
    expect(html).toContain("HR-1000599");
    expect(html).toContain("Reading live from the Employee Register...");
  });
});

describe("EmployeeVerificationError in Sheet Container", () => {
  it("renders inside evr-sheet with friendly not-found message", () => {
    const html = renderToStaticMarkup(
      <EmployeeVerificationError
        failure={{
          code: "EMPLOYEE_NOT_FOUND",
          severity: "input",
          title: "Employee ID not found",
          message: "No employee with this Employee ID was found.",
          requiresReverification: false,
        }}
        searchedId="99999"
        onRetry={vi.fn()}
        onSearchAgain={vi.fn()}
      />,
    );

    expect(html).toContain("evr-sheet");
    expect(html).toContain("Employee Not Found");
    expect(html).toContain("99999");
    expect(html).toContain("Search again");
  });

  it("renders timeout error with 'Try again' button inside sheet", () => {
    const html = renderToStaticMarkup(
      <EmployeeVerificationError
        failure={{
          code: "NETWORK_ERROR",
          severity: "system",
          title: "Verification timed out",
          message:
            "The Employee Register did not respond within the 10-second verification window.",
          requiresReverification: false,
        }}
        onRetry={vi.fn()}
        onSearchAgain={vi.fn()}
      />,
    );

    expect(html).toContain("evr-sheet");
    expect(html).toContain("Verification Timed Out");
    expect(html).toContain("10-second");
    expect(html).toContain("Try again");
  });
});
