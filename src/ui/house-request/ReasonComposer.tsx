"use client";

/**
 * Step 3 · Justify — the one thing on this page a human actually writes.
 *
 * WHY IT CARRIES THE WHOLE BURDEN
 * Every other field is read from the register and cannot be typed. If this box is
 * vague the allocator rejects it later and the employee waits. So it is the most
 * prominent writable surface on the page.
 *
 * WHY IT SITS BESIDE THE RECORD AND NOT UNDER IT
 * The officer writes "the family has no accommodation of its own" about a person
 * they can see. When the reason box is below the record, that sentence is written
 * from memory of facts that have scrolled away, and the most common way a housing
 * file contradicts itself is a reason typed against a record that is no longer on
 * screen. So from `lg` up the record and the writable form are side by side and
 * the name never leaves the viewport while the justification is being written.
 *
 * WHY THERE IS NO BUTTON IN HERE
 * The submit action belongs to `SubmitGate`, on the same screen a few pixels
 * below, with the employee's name and ID printed beside it. Two submit buttons
 * for one request splits focus and makes the officer choose; one, always attached
 * to its subject, does not.
 *
 * FOUR DETAILS THAT ARE NOT DECORATION
 *
 *   - REGISTER FACTS, ON REQUEST. A one-tap insert of the facts the register
 *     already holds — family size, marital status, grade, band, service — each
 *     labelled as coming from the Employee Register. It removes the retyping that
 *     produces contradictions with the file, and it stops there: what the
 *     register does not know (current accommodation, medical need, why now) is
 *     left as an open question for the human.
 *   - A LIVE COUNTER that turns amber before the ceiling rather than after a
 *     rejected submit, so 1 000 characters is something the writer steers
 *     towards rather than discovers.
 *   - VALIDATION ON BLUR, never per keystroke. A half-typed reason shouted at
 *     mid-sentence is the fastest way to lose someone's trust in a form.
 *   - ⌘/Ctrl + ENTER. The submit button is right below, but the caret is down
 *     here, and the shortest path between the last word and the button should
 *     not require finding the button first.
 */

import { useRef } from "react";
import { ClipboardPaste } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  REMARKS_MAX_LENGTH,
  REMARKS_MIN_LENGTH,
} from "@/lib/house-requests/constants";
import type { EmployeeSnapshot } from "@/lib/house-requests/types";
import { cn } from "@/lib/utils";
import { REASON_PROMPTS, registerFactsFor } from "./register-summary";
import { Kbd, Meter, Sheet, StepCaption } from "./table-kit";

/** Turns amber before the ceiling is actually breached. */
const WARN_RATIO = 0.9;

/**
 * The reason form's id, shared with the submit button through the HTML `form`
 * attribute.
 *
 * The button lives in `SubmitGate` so it can sit on the same surface as the
 * employee's name, but the caret is down here — so ⌘/Ctrl+Enter, the length meter
 * and the button must all act on one form, and that form needs a stable id.
 */
export const REASON_FORM_ID = "house-request-reason";

export interface ReasonComposerProps {
  /** Wired to the submit button with the HTML `form` attribute. */
  formId: string;
  employee: EmployeeSnapshot;
  value: string;
  onChange: (value: string) => void;
  /** Called on blur, so the box validates on exit rather than per keystroke. */
  onBlur: () => void;
  submitting: boolean;
  /**
   * Why the action is unavailable, in the reader's terms.
   *
   * Accepted but deliberately NOT rendered: the submit gate prints this on the
   * line directly below the box, and a hint that repeats the message four
   * centimetres away is noise that trains the reader to stop reading the one
   * place it actually matters. Kept as a prop so the composer stays the single
   * owner of the reason field's contract.
   */
  blockedReason: string | null;
  /** The server's own wording, shown verbatim when it disagrees with the client. */
  serverErrors: string[] | null;
  onSubmit: () => void;
}

export default function ReasonComposer({
  formId,
  employee,
  value,
  onChange,
  onBlur,
  submitting,
  blockedReason,
  serverErrors,
  onSubmit,
}: ReasonComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const length = value.trim().length;
  const tooLong = length > REMARKS_MAX_LENGTH;
  const tooShort = length < REMARKS_MIN_LENGTH;
  const nearLimit = !tooLong && length > REMARKS_MAX_LENGTH * WARN_RATIO;
  const hasError =
    tooLong || (length > 0 && tooShort) || !!serverErrors?.length;

  /** How much is still owed before the request can be filed. */
  const outstanding = Math.max(0, REMARKS_MIN_LENGTH - length);

  const facts = registerFactsFor(employee);

  /** Put the caret at the very end and let the writer keep typing. */
  function place(next: string) {
    onChange(next);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.length, next.length);
    });
  }

  /**
   * Append a prompt heading and put the caret on the line after it.
   *
   * The caret position is the whole feature: a writer who has just chosen a
   * prompt should be typing immediately. Nothing is inserted mid-string, so
   * repeated presses build the outline in the order the prompts were chosen.
   */
  function appendPrompt(text: string) {
    const current = value;
    const prefix =
      current.length === 0 || current.endsWith("\n") || current.endsWith(" ")
        ? ""
        : "\n";
    place(`${current}${prefix}${text} `);
  }

  return (
    <form
      id={formId}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <Sheet
        label="Justify the housing need"
        title={StepCaption({ step: 3 })}
        icon={ClipboardPaste}
        tone="accent"
        bodyClassName=""
        className="h-full"
        actions={
          <span className="text-muted-foreground hidden shrink-0 items-center gap-1 text-[11px] sm:inline-flex">
            <Kbd>⌘</Kbd>
            <Kbd>↵</Kbd>
            to file
          </span>
        }
      >
        <div className="px-4 py-4 sm:px-5">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <Label
              htmlFor="remarks"
              className="text-foreground cursor-text text-[13px] font-semibold"
            >
              Reason
            </Label>
            <p className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
              {outstanding > 0
                ? `${outstanding} more character${outstanding === 1 ? "" : "s"} required`
                : `${length}/${REMARKS_MAX_LENGTH}`}
            </p>
          </div>

          <Textarea
            id="remarks"
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onSubmit();
              }
            }}
            disabled={submitting}
            rows={7}
            maxLength={REMARKS_MAX_LENGTH + 40}
            required
            aria-required="true"
            aria-invalid={hasError}
            // `remarks-error` is rendered only when there is something to say, so
            // it joins the description conditionally. Pointing at it
            // unconditionally leaves the field describing itself with an element
            // that is not in the document, which is the same as describing
            // nothing on the one state where the message matters most.
            aria-describedby={cn("remarks-hint", hasError && "remarks-error")}
            placeholder={`Why does ${employee.fullName} need a house? Cover the family situation, current accommodation, and any medical or accessibility need.`}
            className={cn(
              "border-border/80 resize-y text-[15px] leading-relaxed",
              hasError &&
                "border-destructive focus-visible:ring-destructive/30",
            )}
          />

          {/* The length bar doubles as the readiness bar: it fills the moment the
              reason is long enough to file, which is the same rule the button
              below is applying. */}
          <div className="mt-2">
            <Meter
              value={Math.min(length, REMARKS_MAX_LENGTH)}
              max={REMARKS_MAX_LENGTH}
              label={`Reason length against the ${REMARKS_MAX_LENGTH} character ceiling`}
              tone={
                tooLong || nearLimit
                  ? "warning"
                  : hasError
                    ? "muted"
                    : "success"
              }
              size="sm"
            />
          </div>

          {/* Only rendered when there is something to say, so `aria-describedby`
              never points at a missing element. */}
          {hasError ? (
            <div id="remarks-error" role="alert" className="mt-2 space-y-1">
              {tooLong ? (
                <p className="text-destructive text-xs font-medium">
                  Reason must be at most {REMARKS_MAX_LENGTH} characters.
                </p>
              ) : length > 0 && tooShort ? (
                <p className="text-destructive text-xs font-medium">
                  Reason must be at least {REMARKS_MIN_LENGTH} characters.
                </p>
              ) : null}
              {serverErrors?.map((message) => (
                <p
                  key={message}
                  className="text-destructive text-xs font-medium"
                >
                  {message}
                </p>
              ))}
            </div>
          ) : null}

          {/* Two kinds of help, side by side, in the order they are used: copy
              what the register knows, then answer what it does not. */}
          <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground mr-1 text-[10px] font-semibold tracking-[0.12em] uppercase">
              Cover
            </span>
            {REASON_PROMPTS.map((prompt) => (
              <button
                key={prompt.label}
                type="button"
                disabled={submitting}
                onClick={() => appendPrompt(prompt.text)}
                className="border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring inline-flex h-7 items-center rounded-md border px-2 text-[11px] transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
              >
                {prompt.label}
              </button>
            ))}
            {facts ? (
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  const current = value;
                  const prefix =
                    current.length === 0 || current.endsWith("\n")
                      ? ""
                      : "\n\n";
                  place(`${current}${prefix}${facts}\n`);
                }}
                className="border-primary/40 bg-accent text-accent-foreground focus-visible:ring-ring ml-auto inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
              >
                <ClipboardPaste className="h-3 w-3" aria-hidden />
                Insert register facts
              </button>
            ) : null}
          </div>

          <p
            id="remarks-hint"
            className="text-muted-foreground mt-3 text-xs text-pretty"
          >
            {/*
              The generic requirement only. `blockedReason` is NOT rendered here:
              the submit gate prints it on the line directly below, and a hint
              that repeats the message four centimetres away trains the reader to
              stop reading the one place it matters.
            */}
            Required · {REMARKS_MIN_LENGTH}–{REMARKS_MAX_LENGTH} characters ·
            recorded on the request and in the audit trail.
          </p>
        </div>
      </Sheet>
    </form>
  );
}
