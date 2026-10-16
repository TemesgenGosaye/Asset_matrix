"use client";

/**
 * The employee record — who was actually verified.
 *
 * WHY IT IS A RECORD AND NOT A PROFILE CARD
 * A house request is a file, and a file is compared, not browsed: the reader runs
 * their eye down one attribute checking it against what the register says before
 * they commit to a decision that cannot be undone. So every attribute here is a
 * real `<th scope="row">` paired with its value — the pairing survives a phone
 * collapsing the columns and it survives a screen reader.
 *
 * WHY THE DECISION FIGURES COME FIRST
 * Four attributes actually change whether this request should be filed: the job
 * grade, the band that grade maps to, the years of service, and the size of the
 * household the house has to fit. They are the ones an officer checks while
 * deciding, and they are the ones the allocator later scores. So they are lifted
 * out of the list into a strip of figures at the top, at a size that can be read
 * at a glance, and everything else — the demographic context that informs the
 * reason without gating it — stays in the table underneath.
 *
 * WHY NO COLOUR APPEARS IN THIS PANEL AT ALL
 * This module reserves colour for status, and the status for this record lives
 * one panel to the right in the eligibility chain. An earlier build painted a
 * green-to-teal gradient across the header when the employee was eligible and an
 * amber-to-rose one when not, both from hard-coded ramps that were invisible in
 * five of the module's seven themes — wrong on Paper, wrong on OLED, and gone
 * entirely in Contrast. This panel is now one material in every theme, and the
 * verdict is carried by the chain, which is where it belongs.
 */

import {
  Accessibility,
  Award,
  Briefcase,
  Building2,
  Calendar,
  Heart,
  IdCard,
  House,
  MapPin,
  User,
  Users,
} from "lucide-react";

import { HouseCategoryBadge } from "@/ui/household/house-status";
import { formatDate } from "@/ui/household/house-format";
import {
  GENDER_LABELS,
  MARITAL_STATUS_LABELS,
  type EmploymentStatus,
} from "@/lib/employees/constants";
import type { HouseRequestVerifyResult } from "@/lib/house-requests/types";
import {
  CompactFactRow,
  CompactFactTable,
  Figure,
  FigureCell,
  FigureRow,
  Sheet,
  StatusPill,
  SubjectStamp,
  type Status,
} from "./table-kit";
import { ABSENT, humaniseEnum, initialsFor } from "./format";

/** The employee the verification step resolved, plus the policy's answer. */
export interface EmployeeInfoCardProps {
  verify: HouseRequestVerifyResult;
}

/** Rendered only when the record genuinely does not carry the fact. */
function Absent() {
  return <span className="text-muted-foreground/70">{ABSENT}</span>;
}

/**
 * The current house, when the employee holds one.
 *
 * Shown here rather than only in the refusal message because an officer who
 * refuses a request has to be able to see what they are refusing over — "already
 * allocated" with no house on screen sends them looking for something they
 * already know the answer to.
 */
function HeldHouseFact({ verify }: { verify: HouseRequestVerifyResult }) {
  const allocation = verify.allocation;
  if (!allocation) return null;

  const houseNo = allocation.houseNumber ?? allocation.hid;

  return (
    <CompactFactRow
      label="Currently holds"
      icon={House}
      value={
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{houseNo ?? "A house"}</span>
          {allocation.houseType ? (
            <span className="text-muted-foreground text-xs font-normal">
              Type {allocation.houseType}
            </span>
          ) : null}
        </span>
      }
      note={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {allocation.locationName ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden />
              {allocation.locationName}
            </span>
          ) : null}
          {allocation.allocatedAt ? (
            <span>Allocated {formatDate(allocation.allocatedAt)}</span>
          ) : null}
        </span>
      }
    />
  );
}

export default function EmployeeInfoCard({ verify }: EmployeeInfoCardProps) {
  const employee = verify.employee;
  const active =
    (employee.employmentStatus as EmploymentStatus | undefined) === "active";
  const employmentTone: Status = active ? "pass" : "fail";

  return (
    <Sheet
      label="Verified employee record"
      title="Employee Register · verified record"
      icon={IdCard}
      bodyClassName=""
      className="h-full"
    >
      <SubjectStamp
        initials={initialsFor(employee)}
        name={verify.fullName}
        status={employmentTone}
        statusLabel={humaniseEnum(employee.employmentStatus)}
        meta={
          <>
            <span className="bg-card text-foreground rounded-md border px-1.5 py-0.5 font-mono text-[12px] font-semibold">
              {verify.empId}
            </span>
            {employee.jobTitle ? (
              <>
                <span aria-hidden className="text-muted-foreground/60">
                  ·
                </span>
                <span className="text-foreground font-medium">
                  {employee.jobTitle}
                </span>
              </>
            ) : null}
            <span aria-hidden className="text-muted-foreground/60">
              ·
            </span>
            <span className="truncate">
              {verify.department ?? "Unassigned"}
            </span>
          </>
        }
      />

      {/* ── The four figures that decide ─────────────────────────────────── */}
      <FigureRow>
        <FigureCell>
          <Figure
            label="Job grade"
            icon={Award}
            value={
              employee.jobGrade != null ? (
                <span className="tabular-nums">{employee.jobGrade}</span>
              ) : (
                <span className="text-muted-foreground text-lg">Not set</span>
              )
            }
            caption={
              employee.jobGrade != null
                ? "As issued by HR"
                : "No grade on the register"
            }
          />
        </FigureCell>

        <FigureCell>
          <Figure
            label="House band"
            icon={House}
            value={
              verify.isEligible && verify.eligibleHouseType ? (
                <span>Type {verify.eligibleHouseType}</span>
              ) : (
                <span className="text-muted-foreground text-lg">None</span>
              )
            }
            caption={
              verify.isEligible
                ? "Mapped by the published rule"
                : "Maps to no published band"
            }
          />
        </FigureCell>

        <FigureCell>
          <Figure
            label="Service"
            icon={Calendar}
            value={
              <>
                <span className="tabular-nums">{verify.serviceYears}</span>
                <span className="text-muted-foreground ml-1 text-sm font-normal">
                  {verify.serviceYears === 1 ? " year" : " years"}
                </span>
              </>
            }
            caption={
              verify.hireDate
                ? `Hired ${formatDate(verify.hireDate)}`
                : "No hire date"
            }
          />
        </FigureCell>

        <FigureCell>
          <Figure
            label="Household"
            icon={Users}
            value={
              employee.familySize != null ? (
                <>
                  <span className="tabular-nums">{employee.familySize}</span>
                  <span className="text-muted-foreground ml-1 text-sm font-normal">
                    {employee.familySize === 1 ? " person" : " people"}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground text-lg">Not set</span>
              )
            }
            caption={
              verify.maritalStatus
                ? humaniseEnum(
                    MARITAL_STATUS_LABELS[verify.maritalStatus] ??
                      verify.maritalStatus,
                  )
                : "Family size not recorded"
            }
          />
        </FigureCell>
      </FigureRow>

      {/* ── Everything else the record carries ──────────────────────────── */}
      <CompactFactTable
        caption={`The employee register record for ${verify.fullName}, as verified against the Employee table.`}
      >
        <CompactFactRow
          label="Full name"
          icon={User}
          value={verify.fullName}
          note="Pre-joined by the server from the register"
        />
        <CompactFactRow
          label="Employee ID"
          icon={IdCard}
          mono
          value={verify.empId}
        />
        <CompactFactRow
          label="Job title"
          icon={Briefcase}
          value={employee.jobTitle ?? <Absent />}
        />
        <CompactFactRow
          label="Department"
          icon={Building2}
          value={verify.department ?? <Absent />}
          note={verify.department ? null : "No department on the record"}
        />
        <CompactFactRow
          label="Employment"
          icon={Calendar}
          value={humaniseEnum(employee.employmentType)}
          note={
            verify.hireDate
              ? `Hired ${formatDate(verify.hireDate)}`
              : "No hire date on the record"
          }
        />
        <CompactFactRow
          label="Gender"
          icon={User}
          value={
            verify.gender ? (
              humaniseEnum(GENDER_LABELS[verify.gender] ?? verify.gender)
            ) : (
              <Absent />
            )
          }
        />
        <CompactFactRow
          label="Marital status"
          icon={Heart}
          value={
            verify.maritalStatus ? (
              humaniseEnum(
                MARITAL_STATUS_LABELS[verify.maritalStatus] ??
                  verify.maritalStatus,
              )
            ) : (
              <Absent />
            )
          }
          note="Scored by the allocation engine, not a gate"
        />
        <CompactFactRow
          label="Accommodation need"
          icon={Accessibility}
          value={
            verify.disabilityStatus ? (
              <StatusPill status="fail">Yes — recorded</StatusPill>
            ) : (
              <span className="text-muted-foreground">No</span>
            )
          }
          note="Recorded for priority within a band; it does not decide eligibility"
        />

        <HeldHouseFact verify={verify} />
      </CompactFactTable>

      {/* ── The band the employee qualifies for, named as the policy states it
          so the reader can audit the mapping rather than trust it. ───────── */}
      <p className="text-muted-foreground border-border/60 flex flex-wrap items-center gap-2 border-t px-4 py-3 text-xs text-pretty sm:px-5">
        <span className="text-foreground font-semibold">House band policy</span>
        {verify.eligibilityLegend}
        {verify.isEligible && verify.eligibleHouseType ? (
          <span className="inline-flex items-center">
            <HouseCategoryBadge category={verify.eligibleHouseType} />
          </span>
        ) : null}
      </p>
    </Sheet>
  );
}
