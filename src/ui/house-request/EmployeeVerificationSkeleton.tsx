"use client";

import React from "react";
import { Loader2 } from "lucide-react";

export interface EmployeeVerificationSkeletonProps {
  employeeNumber?: string;
}

/**
 * Skeleton loading view for Employee Verification, matching the exact single-table
 * 4-column geometry inside the same 680px sheet.
 */
export default function EmployeeVerificationSkeleton({
  employeeNumber,
}: EmployeeVerificationSkeletonProps) {
  return (
    <div className="evr-page-wrap">
      {/* Centered White Sheet matching result table shape */}
      <section
        className="evr-sheet"
        role="status"
        aria-busy="true"
        aria-live="polite"
        aria-label={`Reading live from the Employee Register for ${employeeNumber ?? ""}`}
      >
        {/* Prominent live verification spinner */}
        <div className="mb-4 flex flex-col items-center justify-center rounded-lg border border-[#1e3a5f]/20 bg-[#e8eef6]/50 px-4 py-6 text-center">
          <Loader2
            className="h-7 w-7 animate-spin text-[#1e3a5f]"
            aria-hidden="true"
          />
          <p className="mt-2 text-xs font-bold tracking-wide text-[#1e3a5f] uppercase">
            Reading live from the Employee Register...
          </p>
          <p className="text-muted-foreground mt-0.5 text-[11px]">
            Verifying{" "}
            {employeeNumber
              ? `Employee ID: HR-${employeeNumber}`
              : "Employee Record"}
          </p>
        </div>

        <table className="evr-table" aria-hidden="true">
          <colgroup>
            <col />
            <col />
            <col />
            <col />
          </colgroup>
          <tbody>
            {/* Header row skeleton */}
            <tr>
              <td colSpan={2} className="evr-header-cell evr-header-left">
                <div className="evr-org-title">Metahara Sugar Factory</div>
                <div className="evr-doc-subtitle">
                  Employee Verification Result
                </div>
              </td>
              <td colSpan={2} className="evr-header-cell evr-header-right">
                <div className="evr-ref-no">
                  Ref <strong>HR-{employeeNumber || "..."}</strong>
                </div>
                <div className="evr-print-meta">
                  Reading live from the Employee Register...
                </div>
              </td>
            </tr>

            {/* Employee Section Band */}
            <tr>
              <th colSpan={4} scope="colgroup" className="evr-section-band">
                Employee
              </th>
            </tr>
            <tr>
              <th scope="row" className="evr-label-cell">
                Full name
              </th>
              <td className="evr-value-cell">
                <span className="motion-safe:animate-pulse">
                  Loading record...
                </span>
              </td>
              <th scope="row" className="evr-label-cell">
                Employee ID
              </th>
              <td className="evr-value-cell">{employeeNumber || "—"}</td>
            </tr>
            <tr>
              <th scope="row" className="evr-label-cell">
                Verification
              </th>
              <td className="evr-value-cell">
                <span className="motion-safe:animate-pulse">Verifying...</span>
              </td>
              <th scope="row" className="evr-label-cell">
                Eligibility
              </th>
              <td className="evr-value-cell">
                <span className="motion-safe:animate-pulse">Evaluating...</span>
              </td>
            </tr>
            <tr>
              <th scope="row" className="evr-label-cell">
                Service
              </th>
              <td className="evr-value-cell">—</td>
              <th scope="row" className="evr-label-cell">
                Job grade
              </th>
              <td className="evr-value-cell">—</td>
            </tr>
            <tr>
              <th scope="row" className="evr-label-cell">
                Marital status
              </th>
              <td className="evr-value-cell">—</td>
              <th scope="row" className="evr-label-cell">
                Disability
              </th>
              <td className="evr-value-cell">—</td>
            </tr>

            {/* 1. Employment Section Band */}
            <tr>
              <th colSpan={4} scope="colgroup" className="evr-section-band">
                1. Employment
              </th>
            </tr>
            <tr>
              <th scope="row" className="evr-label-cell">
                Department
              </th>
              <td className="evr-value-cell">—</td>
              <th scope="row" className="evr-label-cell">
                Job title
              </th>
              <td className="evr-value-cell">—</td>
            </tr>
            <tr>
              <th scope="row" className="evr-label-cell">
                Type
              </th>
              <td className="evr-value-cell">—</td>
              <th scope="row" className="evr-label-cell">
                Status
              </th>
              <td className="evr-value-cell">—</td>
            </tr>
            <tr>
              <th scope="row" className="evr-label-cell">
                Hire date
              </th>
              <td className="evr-value-cell">—</td>
              <th scope="row" className="evr-label-cell">
                Service years
              </th>
              <td className="evr-value-cell">—</td>
            </tr>

            {/* 2. Personal & Household Section Band */}
            <tr>
              <th colSpan={4} scope="colgroup" className="evr-section-band">
                2. Personal &amp; Household
              </th>
            </tr>
            <tr>
              <th scope="row" className="evr-label-cell">
                Gender
              </th>
              <td className="evr-value-cell">—</td>
              <th scope="row" className="evr-label-cell">
                Marital status
              </th>
              <td className="evr-value-cell">—</td>
            </tr>
            <tr>
              <th scope="row" className="evr-label-cell">
                Family size
              </th>
              <td className="evr-value-cell">—</td>
              <th scope="row" className="evr-label-cell">
                Accessibility
              </th>
              <td className="evr-value-cell">—</td>
            </tr>
            <tr>
              <th scope="row" className="evr-label-cell">
                Phone
              </th>
              <td className="evr-value-cell">—</td>
              <th scope="row" className="evr-label-cell">
                National ID
              </th>
              <td className="evr-value-cell">—</td>
            </tr>

            {/* 3. Housing Position Section Band */}
            <tr>
              <th colSpan={4} scope="colgroup" className="evr-section-band">
                3. Housing Position
              </th>
            </tr>
            <tr>
              <th scope="row" className="evr-label-cell">
                Request status
              </th>
              <td className="evr-value-cell">—</td>
              <th scope="row" className="evr-label-cell">
                Queue position
              </th>
              <td className="evr-value-cell">—</td>
            </tr>
            <tr>
              <th scope="row" className="evr-label-cell">
                Reason on file
              </th>
              <td className="evr-value-cell">—</td>
              <th scope="row" className="evr-label-cell">
                MCDA score
              </th>
              <td className="evr-value-cell">—</td>
            </tr>
            <tr>
              <th scope="row" className="evr-label-cell">
                House band
              </th>
              <td className="evr-value-cell">—</td>
              <th scope="row" className="evr-label-cell">
                Job grade
              </th>
              <td className="evr-value-cell">—</td>
            </tr>

            {/* 4. Eligibility Checks Section Band */}
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
                ...
              </td>
            </tr>
            <tr>
              <td colSpan={3} className="evr-value-cell">
                Job grade maps to a house band
              </td>
              <td className="evr-value-cell" style={{ textAlign: "right" }}>
                ...
              </td>
            </tr>
            <tr>
              <td colSpan={3} className="evr-value-cell">
                No allocated house is held
              </td>
              <td className="evr-value-cell" style={{ textAlign: "right" }}>
                ...
              </td>
            </tr>
            <tr>
              <td colSpan={3} className="evr-value-cell">
                No request is already open
              </td>
              <td className="evr-value-cell" style={{ textAlign: "right" }}>
                ...
              </td>
            </tr>

            {/* Footer row */}
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
