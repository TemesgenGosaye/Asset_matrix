"use client";

import { useRef } from "react";
import { Loader2 } from "lucide-react";

import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/lib/feedback/notify";
import {
  REMARKS_MAX_LENGTH,
  REMARKS_MIN_LENGTH,
} from "@/lib/house-requests/constants";
import { cn } from "@/lib/utils";
import FailureNotice from "./FailureNotice";
import {
  REASON_PROMPTS,
  hasRegisterFacts,
  registerFactsFor,
} from "./reason-prompts";
import type { HouseRequestFlow } from "./useHouseRequestFlow";

/**
 * Justification composer for the house-request flow.
 *
 * Renders only table rows on purpose: it is dropped into the same `evr-table`
 * as the Employee Verification Result (via that component's `children`), so the
 * whole page is one single document instead of two stacked sheets.
 */
export default function RequestComposer({
  flow,
  onReset,
}: {
  flow: HouseRequestFlow;
  onReset: () => void;
}) {
  const { lookup, submitting, remarks, setRemarks, markRemarksTouched } = flow;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const employee = lookup?.employee ?? null;

  if (!lookup || !employee) return null;

  const length = remarks.trim().length;
  const tooShort = length < REMARKS_MIN_LENGTH;
  const tooLong = length > REMARKS_MAX_LENGTH;
  const serverErrors = flow.serverRemarksErrors ?? [];

  function insert(text: string) {
    const next = `${remarks}${remarks && !remarks.endsWith("\n") ? "\n" : ""}${text} `;
    setRemarks(next);
    markRemarksTouched();
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  async function handleSubmit() {
    if (await flow.runSubmit()) {
      notify.success({
        title: "House request filed",
        description: `${lookup?.fullName ?? "The employee"} is now in the House Queue.`,
      });
    }
  }

  return (
    <>
      {/* SECTION BAND */}
      <tr>
        <th colSpan={4} scope="colgroup" className="evr-section-band">
          Justification
        </th>
      </tr>

      <tr>
        <th scope="row" className="evr-label-cell">
          Reason
        </th>
        <td colSpan={3} className="evr-value-cell">
          <p className="text-[11px] leading-relaxed text-[var(--evr-muted-text)]">
            Explain the housing need in at least {REMARKS_MIN_LENGTH} characters.
            This is stored with the request and shown to the allocator.
          </p>

          <Textarea
            ref={textareaRef}
            id="house-request-reason"
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
            onBlur={markRemarksTouched}
            disabled={submitting}
            placeholder={`Why does ${lookup.fullName} need a house? Include family situation, current accommodation, and any medical or accessibility need.`}
            aria-invalid={tooShort || tooLong || serverErrors.length > 0}
            aria-describedby="house-request-reason-help"
            className={cn(
              "mt-2 min-h-32 w-full resize-y rounded-sm border-[var(--evr-border)] bg-white px-3 py-2 text-[12.5px] leading-relaxed text-[var(--evr-value-text)] shadow-none focus-visible:ring-1 focus-visible:ring-[var(--evr-navy)]",
              (tooLong || serverErrors.length > 0) && "border-[var(--evr-fail)]/60",
            )}
          />

          <div
            id="house-request-reason-help"
            className="mt-2 flex flex-wrap items-center gap-1.5"
          >
            {REASON_PROMPTS.map((prompt) => (
              <button
                key={prompt.label}
                type="button"
                onClick={() => insert(prompt.text)}
                disabled={submitting}
                className="rounded-sm border border-[var(--evr-border)] bg-[var(--evr-label-bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--evr-navy)] transition-colors hover:border-[var(--evr-navy)] disabled:opacity-50"
              >
                {prompt.label}
              </button>
            ))}
            {hasRegisterFacts(employee) ? (
              <button
                type="button"
                onClick={() => insert(registerFactsFor(employee))}
                disabled={submitting}
                className="rounded-sm border border-[var(--evr-navy)] bg-white px-2 py-0.5 text-[10px] font-semibold text-[var(--evr-navy)] transition-colors hover:bg-[var(--evr-label-bg)] disabled:opacity-50"
              >
                Add register facts
              </button>
            ) : null}
          </div>

          {flow.remarksError ? (
            <p className="mt-2 text-[11px] font-semibold text-[var(--evr-fail)]">
              {flow.remarksError}
            </p>
          ) : null}
          {serverErrors.map((message) => (
            <p
              key={message}
              className="mt-2 text-[11px] font-semibold text-[var(--evr-fail)]"
            >
              {message}
            </p>
          ))}
        </td>
      </tr>

      <tr className="no-print">
        <th scope="row" className="evr-label-cell">
          Requester
        </th>
        <td colSpan={3} className="evr-value-cell">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[11.5px] text-[var(--evr-value-text)]">
              {lookup.fullName}
              <span className="ml-2 font-mono text-[11px] text-[var(--evr-muted-text)]">
                {lookup.empId}
              </span>
            </span>
            <span className="text-[11px] text-[var(--evr-muted-text)]">
              Type {lookup.eligibleHouseType ?? "—"} house ·{" "}
              <span
                className={cn(
                  tooLong
                    ? "evr-status-fail"
                    : tooShort
                      ? undefined
                      : "evr-status-pass",
                )}
              >
                {length}/{REMARKS_MAX_LENGTH}
              </span>
            </span>
            {!flow.canSubmit && flow.submitBlockedReason ? (
              <span className="text-[11px] text-[var(--evr-muted-text)]">
                {flow.submitBlockedReason}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!flow.canSubmit}
              aria-busy={submitting}
              aria-label={`Submit house request for ${lookup.fullName}, ${lookup.empId}`}
              className="evr-print-btn ml-auto disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : null}
              Submit house request
            </button>
          </div>
        </td>
      </tr>

      {flow.error ? (
        <tr>
          <td colSpan={4} className="evr-action-required-cell">
            <FailureNotice
              failure={flow.error}
              onRetry={flow.retry}
              onDismiss={flow.dismissError}
              onReset={onReset}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}
