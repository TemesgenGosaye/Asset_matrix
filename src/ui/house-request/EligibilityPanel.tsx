"use client";

import {
  ArrowRight,
  Ban,
  Check,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Gauge,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";

import type { HouseRequestVerifyResult } from "@/lib/house-requests/types";
import { cn } from "@/lib/utils";

function Requirement({
  met,
  children,
}: {
  met: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-2.5">
      <span
        className={cn(
          "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
          met
            ? "bg-success-bg text-success-foreground"
            : "bg-warning-bg text-warning-foreground",
        )}
      >
        {met ? (
          <Check className="h-3 w-3" aria-hidden />
        ) : (
          <X className="h-3 w-3" aria-hidden />
        )}
      </span>
      <span
        className={cn(
          "text-xs",
          met ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {children}
      </span>
    </li>
  );
}

function nextSteps(verify: HouseRequestVerifyResult): string[] {
  const steps: string[] = [];
  const active = verify.employee.employmentStatus.toLowerCase() === "active";
  if (!active) {
    steps.push(
      "Set the employee's employment status to Active on the Employee Register.",
    );
  }
  if (verify.employee.jobGrade == null) {
    steps.push(
      "Add this employee's real job grade on the Employee Register — house eligibility and House Queue ranking are calculated from it.",
    );
  } else if (!verify.isEligible) {
    steps.push(
      "Review the job grade or the published eligibility bands with HR.",
    );
  }
  if (verify.alreadyHasActiveAllocation) {
    steps.push("Release the house they currently hold, or process a transfer.");
  }
  if (verify.hasOpenRequest) {
    steps.push("Withdraw the existing request before filing a new one.");
  }
  return steps;
}

export default function EligibilityPanel({
  verify,
}: {
  verify: HouseRequestVerifyResult;
}) {
  const active = verify.employee.employmentStatus.toLowerCase() === "active";
  const blocked =
    !active ||
    !verify.isEligible ||
    verify.alreadyHasActiveAllocation ||
    verify.hasOpenRequest;
  const queue = verify.queue;
  const steps = blocked ? nextSteps(verify) : [];
  const score = queue?.score != null ? Math.round(queue.score * 100) : null;

  return (
    <section
      aria-label="Eligibility decision"
      className="border-border/70 bg-card overflow-hidden rounded-3xl border shadow-[var(--shadow-md)]"
    >
      <div className="border-border/60 bg-secondary flex items-center justify-between gap-3 border-b px-5 py-3.5">
        <div className="flex items-center gap-2">
          <ClipboardCheck
            className="text-muted-foreground h-4 w-4"
            aria-hidden
          />
          <h2 className="text-foreground text-sm font-bold tracking-tight">
            Eligibility
          </h2>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide uppercase",
            blocked
              ? "bg-warning-bg text-warning-foreground"
              : "bg-success-bg text-success-foreground",
          )}
        >
          {blocked ? (
            <ShieldAlert className="h-3 w-3" aria-hidden />
          ) : (
            <ShieldCheck className="h-3 w-3" aria-hidden />
          )}
          {blocked ? "Blocked" : "Eligible"}
        </span>
      </div>

      <div className="p-5">
        <div
          role="status"
          className={cn(
            "rounded-2xl border p-4",
            blocked
              ? "border-warning-foreground/25 bg-warning-bg"
              : "border-success-foreground/20 bg-success-bg",
          )}
        >
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                blocked
                  ? "bg-warning-bg text-warning-foreground"
                  : "bg-success-bg text-success-foreground",
              )}
            >
              {blocked ? (
                <CircleAlert className="h-5 w-5" aria-hidden />
              ) : (
                <CheckCircle2 className="h-5 w-5" aria-hidden />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-foreground text-sm font-bold tracking-tight">
                {blocked
                  ? "A request cannot be filed"
                  : `Eligible for a Type ${verify.eligibleHouseType ?? "—"} house`}
              </p>
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed text-pretty">
                {verify.eligibilityReason}
              </p>
            </div>
          </div>
        </div>

        <ul className="mt-5 space-y-2.5">
          <Requirement met={active}>Employment is active</Requirement>
          <Requirement met={verify.isEligible}>
            Job grade maps to a house band
          </Requirement>
          <Requirement met={!verify.alreadyHasActiveAllocation}>
            No allocated house is held
          </Requirement>
          <Requirement met={!verify.hasOpenRequest}>
            No request is already open
          </Requirement>
        </ul>

        {queue ? (
          <div className="border-border/60 bg-secondary/60 mt-5 rounded-2xl border p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Gauge className="text-muted-foreground h-4 w-4" aria-hidden />
                <p className="text-foreground text-xs font-bold">
                  Queue position
                </p>
              </div>
              <span className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
                Type {queue.category ?? verify.eligibleHouseType ?? "—"}
              </span>
            </div>

            <div className="mt-3 flex items-end justify-between gap-4">
              <div>
                <p className="housing-serif text-foreground text-2xl leading-none font-bold tabular-nums">
                  {queue.rank != null ? `#${queue.rank}` : "Unranked"}
                </p>
                <p className="text-muted-foreground mt-1 text-[11px]">
                  {queue.cohortSize != null
                    ? `of ${queue.cohortSize} in this band`
                    : "No cohort data"}
                </p>
              </div>
              {score != null ? (
                <div className="text-right">
                  <p className="text-foreground text-lg font-bold tabular-nums">
                    {score}%
                  </p>
                  <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
                    MCDA score
                  </p>
                </div>
              ) : null}
            </div>

            {score != null ? (
              <div className="bg-border/70 mt-3 h-1.5 overflow-hidden rounded-full">
                <div
                  className="from-brass-400 to-brass-600 h-full rounded-full bg-gradient-to-r"
                  style={{ width: `${Math.max(4, Math.min(100, score))}%` }}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {blocked ? (
          <div className="border-border/60 mt-5 border-t pt-4">
            <p className="text-foreground flex items-center gap-1.5 text-xs font-bold">
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              What needs to change
            </p>
            <ul className="mt-2 space-y-1.5">
              {steps.map((step) => (
                <li
                  key={step}
                  className="text-muted-foreground flex gap-2 text-xs leading-relaxed"
                >
                  <Ban
                    className="text-warning-foreground mt-0.5 h-3 w-3 shrink-0"
                    aria-hidden
                  />
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="text-muted-foreground border-border/60 mt-5 border-t pt-4 text-[10px] leading-relaxed">
          <span className="text-foreground font-semibold">Published bands</span>{" "}
          · {verify.eligibilityLegend}
        </p>
      </div>
    </section>
  );
}
