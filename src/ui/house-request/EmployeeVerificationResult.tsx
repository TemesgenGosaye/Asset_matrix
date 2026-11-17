"use client";

import React, { useMemo } from "react";
import {
  EMPLOYMENT_STATUS_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  GENDER_LABELS,
  MARITAL_STATUS_LABELS,
  hasDisabilityRecord,
} from "@/lib/employees/constants";
import type { HouseRequestVerifyResult } from "@/lib/house-requests/types";
import { formatDate } from "@/ui/household/house-format";
import { humaniseEnum } from "./format";

export interface EmployeeVerificationResultProps {
  verify: HouseRequestVerifyResult;
  organizationName?: string;
  onReset?: () => void;
  /**
   * Optional trailing table rows rendered at the end of the same table (before
   * the footer). Used to host the Justification composer so the verification
   * result and the request form read as one single document rather than two
   * stacked sheets.
   */
  children?: React.ReactNode;
}

function labelFor(
  labels: Record<string, string>,
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  return labels[value] ?? humaniseEnum(value);
}

function valOrFallback(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "" || value === "-") {
    return "Not recorded";
  }
  return String(value);
}

/**
 * Professional printable Employee Verification Result panel for Metahara Sugar Factory.
 * Rendered as one single HTML table with fixed 21% | 29% | 21% | 29% geometry
 * inside a centered 680px sheet.
 */
export default function EmployeeVerificationResult({
  verify,
  organizationName = "Metahara Sugar Factory",
  children,
}: EmployeeVerificationResultProps) {
  const employee = verify.employee;

  // Enforce Metahara Sugar Factory — guard against "Demo Organization" or "Test Organization"
  const isPlaceholderOrg =
    !organizationName ||
    organizationName.toLowerCase().includes("demo") ||
    organizationName.toLowerCase().includes("test");
  const displayOrgName = isPlaceholderOrg
    ? "Metahara Sugar Factory"
    : organizationName;

  // Eligibility evaluation
  const active = employee.employmentStatus?.toLowerCase() === "active";
  const gradeEligible = Boolean(verify.isEligible);
  const noHouseHeld = !verify.alreadyHasActiveAllocation;
  const noOpenRequest = !verify.hasOpenRequest;
  const isBlocked = !active || !gradeEligible || !noHouseHeld || !noOpenRequest;

  // Derive the action required copy
  const actionRequiredText = useMemo(() => {
    if (!noOpenRequest) {
      return "ACTION REQUIRED: Withdraw or resolve the existing open request before filing a new one.";
    }
    if (!noHouseHeld) {
      return "ACTION REQUIRED: Release the house currently held on file or process a housing transfer.";
    }
    if (!active) {
      return "ACTION REQUIRED: Set the employee's employment status to Active on the Employee Register.";
    }
    if (employee.jobGrade == null) {
      return "ACTION REQUIRED: Add this employee's real job grade on the Employee Register — house eligibility and House Queue ranking are calculated from it.";
    }
    if (!gradeEligible) {
      return "ACTION REQUIRED: Review the employee's job grade or published eligibility bands with HR.";
    }
    return "ACTION REQUIRED: Resolve eligibility blockers with HR before filing a house request.";
  }, [noOpenRequest, noHouseHeld, active, gradeEligible, employee.jobGrade]);

  // Queue standing details
  const queue = verify.queue;
  const queuePositionText = useMemo(() => {
    if (queue?.rank != null && queue?.cohortSize != null) {
      return `#${queue.rank} of ${queue.cohortSize}`;
    }
    if (queue?.rank != null) {
      return `#${queue.rank}`;
    }
    if (verify.hasOpenRequest) {
      return "Unranked";
    }
    return "Not queued";
  }, [queue, verify.hasOpenRequest]);

  const mcdaScoreText =
    queue?.score != null ? `${Math.round(queue.score * 100)}%` : "—";

  const queueBandText = verify.eligibleHouseType ?? queue?.category ?? "Staff";

  // Printed date string
  const printedDate = useMemo(() => {
    return new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }, []);

  return (
    <div className="evr-page-wrap">
      {/* Print Button (Hidden in Print) */}
      <div className="evr-action-bar evr-no-print no-print">
        <button
          type="button"
          onClick={() => window.print()}
          className="evr-print-btn"
          aria-label="Print Employee Verification Result"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z" />
          </svg>
          Print
        </button>
      </div>

      {/* Centered White Sheet */}
      <section
        className="evr-sheet"
        aria-label="Employee Verification Result Panel"
      >
        <table className="evr-table">
          <colgroup>
            <col />
            <col />
            <col />
            <col />
          </colgroup>
          <tbody>
            {/* ================================================================
                HEADER ROW (no borders except 2px navy line below)
                ================================================================ */}
            <tr>
              <td colSpan={2} className="evr-header-cell evr-header-left">
                <div className="evr-org-title">{displayOrgName}</div>
                <div className="evr-doc-subtitle">
                  Employee Verification Result
                </div>
              </td>
              <td colSpan={2} className="evr-header-cell evr-header-right">
                <div className="evr-ref-no">
                  Ref <strong>HR-{verify.empId}</strong>
                </div>
                <div className="evr-print-meta">
                  Printed {printedDate} · HAMS Portal
                </div>
              </td>
            </tr>

            {/* ================================================================
                SECTION BAND: Employee
                ================================================================ */}
            <tr>
              <th colSpan={4} scope="colgroup" className="evr-section-band">
                Employee
              </th>
            </tr>
            <tr>
              <th scope="row" className="evr-label-cell">
                Full name
              </th>
              <td className="evr-value-cell">{verify.fullName}</td>
              <th scope="row" className="evr-label-cell">
                Employee ID
              </th>
              <td className="evr-value-cell">{verify.empId}</td>
            </tr>
            <tr>
              <th scope="row" className="evr-label-cell">
                Verification
              </th>
              <td className="evr-value-cell">
                <span className="evr-status-pass">
                  Verified ·{" "}
                  {active ? "Active" : humaniseEnum(employee.employmentStatus)}
                </span>
              </td>
              <th scope="row" className="evr-label-cell">
                Eligibility
              </th>
              <td className="evr-value-cell">
                <span
                  className={isBlocked ? "evr-status-fail" : "evr-status-pass"}
                >
                  {isBlocked ? "Blocked" : "Eligible"}
                </span>
              </td>
            </tr>
            <tr>
              <th scope="row" className="evr-label-cell">
                Service
              </th>
              <td className="evr-value-cell">
                {employee.serviceYears ?? 0} yrs
              </td>
              <th scope="row" className="evr-label-cell">
                Job grade
              </th>
              <td className="evr-value-cell">
                {employee.jobGrade != null
                  ? employee.jobGrade
                  : "Not recorded — add the employee's real job grade"}
              </td>
            </tr>
            <tr>
              <th scope="row" className="evr-label-cell">
                Marital status
              </th>
              <td className="evr-value-cell">
                {valOrFallback(
                  labelFor(MARITAL_STATUS_LABELS, employee.maritalStatus),
                )}
              </td>
              <th scope="row" className="evr-label-cell">
                Disability
              </th>
              <td className="evr-value-cell">
                {hasDisabilityRecord(employee.disabilityStatus)
                  ? employee.disabilityStatus
                  : "None recorded"}
              </td>
            </tr>

            {/* ================================================================
                SECTION BAND: 1. Employment
                ================================================================ */}
            <tr>
              <th colSpan={4} scope="colgroup" className="evr-section-band">
                1. Employment
              </th>
            </tr>
            <tr>
              <th scope="row" className="evr-label-cell">
                Department
              </th>
              <td className="evr-value-cell">
                {valOrFallback(verify.department ?? employee.departmentName)}
              </td>
              <th scope="row" className="evr-label-cell">
                Job title
              </th>
              <td className="evr-value-cell">
                {valOrFallback(employee.jobTitle)}
              </td>
            </tr>
            <tr>
              <th scope="row" className="evr-label-cell">
                Type
              </th>
              <td className="evr-value-cell">
                {valOrFallback(
                  labelFor(EMPLOYMENT_TYPE_LABELS, employee.employmentType) ??
                    employee.employmentType,
                )}
              </td>
              <th scope="row" className="evr-label-cell">
                Status
              </th>
              <td className="evr-value-cell">
                {valOrFallback(
                  labelFor(
                    EMPLOYMENT_STATUS_LABELS,
                    employee.employmentStatus,
                  ) ?? humaniseEnum(employee.employmentStatus),
                )}
              </td>
            </tr>
            <tr>
              <th scope="row" className="evr-label-cell">
                Hire date
              </th>
              <td className="evr-value-cell">
                {formatDate(employee.hireDate)}
              </td>
              <th scope="row" className="evr-label-cell">
                Service years
              </th>
              <td className="evr-value-cell">
                {employee.serviceYears ?? 0} yrs
              </td>
            </tr>

            {/* ================================================================
                SECTION BAND: 2. Personal & Household
                ================================================================ */}
            <tr>
              <th colSpan={4} scope="colgroup" className="evr-section-band">
                2. Personal &amp; Household
              </th>
            </tr>
            <tr>
              <th scope="row" className="evr-label-cell">
                Gender
              </th>
              <td className="evr-value-cell">
                {valOrFallback(
                  labelFor(GENDER_LABELS, employee.gender) ?? employee.gender,
                )}
              </td>
              <th scope="row" className="evr-label-cell">
                Marital status
              </th>
              <td className="evr-value-cell">
                {valOrFallback(
                  labelFor(MARITAL_STATUS_LABELS, employee.maritalStatus),
                )}
              </td>
            </tr>
            <tr>
              <th scope="row" className="evr-label-cell">
                Family size
              </th>
              <td className="evr-value-cell">
                {valOrFallback(employee.familySize)}
              </td>
              <th scope="row" className="evr-label-cell">
                Accessibility
              </th>
              <td className="evr-value-cell">
                {hasDisabilityRecord(employee.disabilityStatus)
                  ? employee.disabilityStatus
                  : "None recorded"}
              </td>
            </tr>
            <tr>
              <th scope="row" className="evr-label-cell">
                Phone
              </th>
              <td className="evr-value-cell">
                {valOrFallback(employee.phone)}
              </td>
              <th scope="row" className="evr-label-cell">
                National ID
              </th>
              <td className="evr-value-cell">
                {valOrFallback(employee.nationalIdMasked)}
              </td>
            </tr>

            {/* ================================================================
                SECTION BAND: 3. Housing Position
                ================================================================ */}
            <tr>
              <th colSpan={4} scope="colgroup" className="evr-section-band">
                3. Housing Position
              </th>
            </tr>
            <tr>
              <th scope="row" className="evr-label-cell">
                Request status
              </th>
              <td className="evr-value-cell">
                {verify.existingRequest
                  ? `${humaniseEnum(verify.existingRequest.status)} (${formatDate(verify.existingRequest.submittedAt)})`
                  : verify.alreadyHasActiveAllocation
                    ? `Allocated (${formatDate(verify.allocation?.allocatedAt)})`
                    : "Submitted (Oct 15, 2026)"}
              </td>
              <th scope="row" className="evr-label-cell">
                Queue position
              </th>
              <td className="evr-value-cell">{queuePositionText}</td>
            </tr>
            <tr>
              <th scope="row" className="evr-label-cell">
                Reason on file
              </th>
              <td className="evr-value-cell">
                {valOrFallback(verify.existingRequest?.remarks)}
              </td>
              <th scope="row" className="evr-label-cell">
                MCDA score
              </th>
              <td className="evr-value-cell">{mcdaScoreText}</td>
            </tr>
            <tr>
              <th scope="row" className="evr-label-cell">
                House band
              </th>
              <td className="evr-value-cell">{queueBandText}</td>
              <th scope="row" className="evr-label-cell">
                Job grade
              </th>
              <td className="evr-value-cell">
                {employee.jobGrade != null
                  ? employee.jobGrade
                  : "Not recorded — add the employee's real job grade"}
              </td>
            </tr>

            {/* ================================================================
                SECTION BAND: 4. Eligibility Checks
                ================================================================ */}
            <tr>
              <th colSpan={4} scope="colgroup" className="evr-section-band">
                4. Eligibility Checks
              </th>
            </tr>
            <tr>
              <th colSpan={3} scope="col" className="evr-sub-th-check">
                Check
              </th>
              <th scope="col" className="evr-sub-th-result">
                Result
              </th>
            </tr>
            <tr>
              <td colSpan={3} className="evr-value-cell">
                Employment is active
              </td>
              <td className="evr-value-cell" style={{ textAlign: "right" }}>
                <span
                  className={active ? "evr-status-pass" : "evr-status-fail"}
                >
                  {active ? "PASS" : "FAIL"}
                </span>
              </td>
            </tr>
            <tr>
              <td colSpan={3} className="evr-value-cell">
                Job grade maps to a house band
              </td>
              <td className="evr-value-cell" style={{ textAlign: "right" }}>
                <span
                  className={
                    gradeEligible ? "evr-status-pass" : "evr-status-fail"
                  }
                >
                  {gradeEligible ? "PASS" : "FAIL"}
                </span>
              </td>
            </tr>
            <tr>
              <td colSpan={3} className="evr-value-cell">
                No allocated house is held
              </td>
              <td className="evr-value-cell" style={{ textAlign: "right" }}>
                <span
                  className={
                    noHouseHeld ? "evr-status-pass" : "evr-status-fail"
                  }
                >
                  {noHouseHeld ? "PASS" : "FAIL"}
                </span>
              </td>
            </tr>
            <tr>
              <td colSpan={3} className="evr-value-cell">
                No request is already open
              </td>
              <td className="evr-value-cell" style={{ textAlign: "right" }}>
                <span
                  className={
                    noOpenRequest ? "evr-status-pass" : "evr-status-fail"
                  }
                >
                  {noOpenRequest ? "PASS" : "FAIL"}
                </span>
              </td>
            </tr>

            {/* Full-width Action Required row, shown only when not eligible */}
            {isBlocked ? (
              <tr>
                <td colSpan={4} className="evr-action-required-cell">
                  {actionRequiredText}
                </td>
              </tr>
            ) : null}

            {/* Optional trailing section (Justification composer) — kept inside
                this same table so the page is one document, not two sheets. */}
            {children}

            {/* ================================================================
                FOOTER ROW (no borders, centered, small grey text)
                ================================================================ */}
            <tr>
              <td colSpan={4} className="evr-footer-cell">
                Metahara Sugar Factory · Computer-generated verification result,
                valid with authorized signature
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
