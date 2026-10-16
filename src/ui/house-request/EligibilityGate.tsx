"use client";

/**
 * The eligibility chain — the one panel that decides whether a request exists.
 *
 * WHY A CHAIN AND NOT FOUR PILLS
 * Eligibility is not a score, it is four requirements that must ALL hold. Four
 * coloured chips in a row read as four independent facts, and the reader takes
 * away "three out of four, good enough" — which is exactly the wrong reading of
 * a housing file. So the four gates are drawn as a chain: a node per gate, a
 * spine running down through them, and one verdict for the chain as a whole.
 *
 * WHY THE GATES ARE SHOWN BEFORE ANYBODY IS TYPED
 * On arrival the reader sees all four gates in their pending form, stating the
 * rule each one will apply. That is not filler: it means a refusal three
 * keystrokes later is never a surprise, because the reader was told what would be
 * checked and can watch it happen. It also gives the idle page the same shape the
 * result page has, so the page they learn is the page that answers them.
 *
 * WHY THE EVIDENCE IS QUOTED, NOT SUMMARISED
 * Every cell in the evidence column is a fact lifted straight off the record or
 * straight out of the published policy — "Grade 14 → Type B", "Holds B-202",
 * "Grade 0 → no band". An officer can check any single line against the file
 * without trusting the badge above it. A panel that only says "Eligible" is
 * asking for belief; this one can be audited line by line.
 *
 * WHY COLOUR COMES FROM THE THEME
 * Earlier builds painted this verdict with hard-coded emerald and amber ramps.
 * That is invisible in five of the module's seven themes — wrong on the sepia
 * Paper theme, wrong on pure-black OLED, and invisible entirely in Contrast,
 * where the whole panel flattened to grey and the pass/fail distinction vanished.
 * Everything below resolves through `--success-*` and `--warning-*`, so the
 * verdict is correct in all seven and never invents a hue the theme has not
 * defined.
 */

import Link from "next/link";
import {
  ArrowUpRight,
  Award,
  BadgeCheck,
  Briefcase,
  CircleSlash,
  FileText,
  Home,
  Info,
} from "lucide-react";

import { HouseCategoryBadge } from "@/ui/household/house-status";
import { formatDate } from "@/ui/household/house-format";
import type { HouseRequestVerifyResult } from "@/lib/house-requests/types";
import { GateRow, GateTable, Sheet, StatusPill } from "./table-kit";
import { humaniseEnum, isActiveStatus } from "./format";

/**
 * The four gates, in the order the reader would want them explained.
 *
 * Employment first because an inactive employee fails everything else as a
 * formality and the register is the thing that has to change. The grade rule
 * second because it is the policy the page exists to apply. The two
 * already-something-on-file gates last, because they are cleared by somebody
 * else's action and are the cheapest to resolve.
 */
const GATE_NAMES = {
  employment: "Active employment",
  grade: "Grade maps to a house band",
  allocation: "No live house held",
  request: "No open request",
} as const;

export interface EligibilityGateProps {
  verify: HouseRequestVerifyResult;
}

/**
 * The gate chain for one verified employee.
 *
 * Every status below is read straight off the response rather than recomputed:
 * the server applied the central job-grade rule against the ACTIVE engine config
 * inside its own transaction, and a second derivation on the client is one more
 * thing that can drift from it.
 */
export default function EligibilityGate({ verify }: EligibilityGateProps) {
  const {
    isEligible,
    eligibleHouseType,
    alreadyHasActiveAllocation,
    hasOpenRequest,
    allocation,
    existingRequest,
    eligibilityLegend,
  } = verify;

  const employee = verify.employee;
  const active = isActiveStatus(employee.employmentStatus);

  // Gate 1 — employment.
  const employmentStatus: "pass" | "fail" = active ? "pass" : "fail";

  // Gate 2 — the published grade rule.
  const gradeStatus: "pass" | "fail" = isEligible ? "pass" : "fail";

  // Gate 3 and 4 — nothing else on file against this employee.
  const allocationStatus: "pass" | "fail" = alreadyHasActiveAllocation
    ? "fail"
    : "pass";
  const requestStatus: "pass" | "fail" = hasOpenRequest ? "fail" : "pass";

  const blocked =
    !active || !isEligible || alreadyHasActiveAllocation || hasOpenRequest;

  const met = [
    employmentStatus,
    gradeStatus,
    allocationStatus,
    requestStatus,
  ].filter((s) => s === "pass").length;

  return (
    <Sheet
      label="Policy eligibility"
      title="Step 2 · Verify against the register"
      icon={Info}
      tone={blocked ? "warning" : "success"}
      bodyClassName=""
      className="h-full"
    >
      {/* ── The verdict for the chain as a whole ──────────────────────────────
          Solid theme fills only. The one place on this page where a status
          colour fills an area, and it fills it from a token rather than from a
          hard-coded ramp, so it survives every theme. */}
      <div
        className={
          blocked
            ? "border-warning-foreground/25 bg-warning-bg border-b"
            : "border-success-foreground/25 bg-success-bg border-b"
        }
      >
        <div className="flex flex-wrap items-center gap-2 px-4 py-3.5 sm:px-5">
          {isEligible ? (
            <>
              <StatusPill status="pass">
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                Eligible for Type {eligibleHouseType}
              </StatusPill>
              <HouseCategoryBadge category={eligibleHouseType} />
            </>
          ) : (
            <StatusPill status="fail">
              <CircleSlash className="h-3.5 w-3.5" aria-hidden />
              Not eligible
            </StatusPill>
          )}

          <span className="text-muted-foreground ml-auto text-[11px] font-semibold tabular-nums">
            {met} of 4 requirements met
          </span>
        </div>

        {/* The policy's own sentence, unedited. The gates below are the
            derivation; this is the answer, and it is what the reader has to be
            able to quote back to the employee. */}
        <p className="text-foreground px-4 pb-4 text-sm text-pretty sm:px-5">
          {verify.eligibilityReason}
        </p>
      </div>

      {/* ── The chain ─────────────────────────────────────────────────────── */}
      <GateTable
        caption={`The four requirements a house request must meet, checked against ${verify.fullName}.`}
      >
        <GateRow
          isLast={false}
          icon={Briefcase}
          gate={GATE_NAMES.employment}
          sublabel="Employee register"
          status={employmentStatus}
          evidence={
            active ? (
              humaniseEnum(employee.employmentStatus)
            ) : (
              <span className="text-warning-foreground">
                {humaniseEnum(employee.employmentStatus)}
              </span>
            )
          }
          note="House requests are only accepted for active employees"
          verdict={active ? "Met" : "Not met"}
        />

        <GateRow
          isLast={false}
          icon={Award}
          gate={GATE_NAMES.grade}
          sublabel="Published job grade rule"
          status={gradeStatus}
          evidence={
            isEligible && eligibleHouseType ? (
              <>
                <span className="tabular-nums">Grade {employee.jobGrade}</span>
                <span className="text-muted-foreground"> → </span>
                <span>Type {eligibleHouseType} house</span>
              </>
            ) : employee.jobGrade != null ? (
              <>
                <span className="tabular-nums">Grade {employee.jobGrade}</span>
                <span className="text-muted-foreground"> → </span>
                <span className="text-warning-foreground">no band</span>
              </>
            ) : (
              <span className="text-muted-foreground">
                No job grade on the record
              </span>
            )
          }
          note={eligibilityLegend}
          verdict={isEligible ? "Met" : "Not met"}
        />

        <GateRow
          isLast={false}
          icon={Home}
          gate={GATE_NAMES.allocation}
          sublabel="House allocations"
          status={allocationStatus}
          evidence={
            alreadyHasActiveAllocation && allocation ? (
              <>
                <span>
                  Holds{" "}
                  <span className="font-semibold">
                    {allocation.houseNumber ?? allocation.hid ?? "a house"}
                  </span>
                  {allocation.houseType ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · Type {allocation.houseType}
                    </span>
                  ) : null}
                </span>
                {allocation.locationName ? (
                  <span className="text-muted-foreground mt-0.5 block text-xs">
                    {allocation.locationName}
                    {allocation.allocatedAt
                      ? ` · allocated ${formatDate(allocation.allocatedAt)}`
                      : ""}
                  </span>
                ) : null}
                <Link
                  href="/houses/allocated"
                  className="text-primary focus-visible:ring-ring mt-1.5 inline-flex items-center gap-1 text-xs font-semibold underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  Open the allocation
                  <ArrowUpRight className="h-3 w-3" aria-hidden />
                </Link>
              </>
            ) : (
              "No house currently allocated to this employee"
            )
          }
          note={
            alreadyHasActiveAllocation && allocation?.moveCount
              ? `Moved ${allocation.moveCount} time${allocation.moveCount === 1 ? "" : "s"} on this allocation`
              : undefined
          }
          verdict={alreadyHasActiveAllocation ? "Blocked" : "Met"}
        />

        <GateRow
          isLast
          icon={FileText}
          gate={GATE_NAMES.request}
          sublabel="House queue"
          status={requestStatus}
          evidence={
            hasOpenRequest && existingRequest ? (
              <>
                <span>
                  Request{" "}
                  <span className="font-mono text-[13px] font-semibold">
                    {existingRequest.id}
                  </span>
                </span>
                <span className="text-muted-foreground mt-0.5 block text-xs">
                  Filed {formatDate(existingRequest.submittedAt)} ·{" "}
                  {humaniseEnum(existingRequest.status)}
                </span>
                <Link
                  href="/house-queue"
                  className="text-primary focus-visible:ring-ring mt-1.5 inline-flex items-center gap-1 text-xs font-semibold underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  Open the queue
                  <ArrowUpRight className="h-3 w-3" aria-hidden />
                </Link>
              </>
            ) : (
              "No request on file for this employee"
            )
          }
          note="Only one open request per employee is permitted"
          verdict={hasOpenRequest ? "Blocked" : "Met"}
        />
      </GateTable>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// The preview
// ---------------------------------------------------------------------------

/**
 * The same four gates, before anyone has been typed.
 *
 * Every node pending and every verdict withheld — the reader is told the rule
 * each gate will apply, and told plainly that nothing has been checked, because
 * a gate that looked merely quiet would be read as a gate that passed.
 */
export function GatePreview() {
  const rows: {
    gate: string;
    sublabel: string;
    rule: string;
    icon: typeof Briefcase;
  }[] = [
    {
      gate: GATE_NAMES.employment,
      sublabel: "Employee register",
      rule: "The register must show the employee as active.",
      icon: Briefcase,
    },
    {
      gate: GATE_NAMES.grade,
      sublabel: "Published job grade rule",
      rule: "The job grade must fall inside a published house band.",
      icon: Award,
    },
    {
      gate: GATE_NAMES.allocation,
      sublabel: "House allocations",
      rule: "No house may currently be allocated to the employee.",
      icon: Home,
    },
    {
      gate: GATE_NAMES.request,
      sublabel: "House queue",
      rule: "Only one open request per employee is permitted.",
      icon: FileText,
    },
  ];

  return (
    <Sheet
      label="What a house request must satisfy"
      title="Policy eligibility · four requirements"
      icon={Info}
      bodyClassName=""
      className="h-full"
    >
      <GateTable caption="The four requirements a house request must satisfy. None has been checked yet.">
        {rows.map((row, i) => (
          <GateRow
            key={row.gate}
            isLast={i === rows.length - 1}
            icon={row.icon}
            gate={row.gate}
            sublabel={row.sublabel}
            status="pending"
            evidence={<span className="text-muted-foreground">{row.rule}</span>}
            note="Checked when an Employee ID is verified"
            verdict="Not checked"
          />
        ))}
      </GateTable>

      <p className="border-border/60 text-muted-foreground border-t px-4 py-3 text-xs text-pretty sm:px-5">
        All four must hold before a request can be filed. Nothing on this page
        can override them.
      </p>
    </Sheet>
  );
}
