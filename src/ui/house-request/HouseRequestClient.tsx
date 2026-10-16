"use client";

/**
 * House Request — search an Employee ID, show the record, justify it, file it.
 *
 * WHAT THIS PAGE IS
 * One employee, one decision. A counter officer has an Employee ID in front of
 * them, needs to know the record behind it, needs to know what the published
 * policy makes of it, and then needs to write once and file. That is four steps
 * and the page does them in that order.
 *
 *   1. SEARCH   — type an Employee ID, press Search. The Employees table is the
 *                 only authority on who that ID belongs to.
 *   2. VERIFY   — the record is loaded from the server, and the eligibility
 *                 chain settles each of the four requirements against it.
 *   3. JUSTIFY  — the one writable field, and the Submit button attached to the
 *                 name it is about.
 *   4. QUEUED   — the official voucher, printable, with a way back into it.
 *
 * WHY THE SEARCH FIELD IS THE ONLY INPUT IN STEP 1
 * Everything about the employee is read from the register, never typed. A client
 * that could assert a name or a grade would be a client that could file a request
 * for a person who does not exist, so the submission body carries the Employee ID
 * and the reason and nothing else. The panel under the search field states that
 * contract on the page rather than only in the source.
 *
 * WHY THE WORK SURFACE SPLITS IN TWO ON A WIDE SCREEN
 * The reasoning step is the only writing on this page, and it is writing about a
 * specific person. In a single column the record is four hundred pixels above the
 * box, so by the time the officer has decided what to say they are looking at an
 * empty textarea and remembering. Side by side, the name, the grade, the band and
 * the family size stay in the eye line while the reason is written — which is the
 * difference between a justification that agrees with the file and one that
 * contradicts it. Below `lg` the columns stack in the same reading order:
 * evidence, then verdict, then the action.
 *
 * WHY A BLOCKED EMPLOYEE GETS NO BUTTON
 * When policy refuses, the page states the block and what to do about it, and
 * does not render a disabled submit. A greyed control invites a pointless retry
 * and makes the reader believe the system is broken rather than the answer being
 * no. The same reasoning puts the four requirements on screen BEFORE anybody is
 * typed, so a refusal is never a surprise: see `GatePreview`.
 *
 * WHY TYPING CLEARS THE RECORD
 * The moment the Employee ID in the box no longer matches the record on screen,
 * that record is no longer about anything and the Submit button goes dead. A form
 * that keeps somebody else's grade on screen under an edited ID is how a request
 * gets filed for the wrong person.
 */

import { useEffect, useRef } from "react";
import {
  Check,
  Info,
  Loader2,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notify } from "@/lib/feedback/notify";
import {
  REMARKS_MAX_LENGTH,
  REMARKS_MIN_LENGTH,
} from "@/lib/house-requests/constants";
import type { HouseRequestFailure } from "@/lib/house-requests/failures";
import { cn } from "@/lib/utils";
import EmployeeInfoCard from "./EmployeeInfoCard";
import EligibilityGate, { GatePreview } from "./EligibilityGate";
import ReasonComposer, { REASON_FORM_ID } from "./ReasonComposer";
import RequestVoucher from "./RequestVoucher";
import { isActiveStatus } from "./format";
import {
  Callout,
  CompactFactRow,
  CompactFactTable,
  Kbd,
  Sheet,
  StepCaption,
  StepFlow,
  type StepNumber,
} from "./table-kit";
import { useHouseRequestFlow } from "./useHouseRequestFlow";

export interface HouseRequestCapabilities {
  create: boolean;
}

interface HouseRequestClientProps {
  capabilities: HouseRequestCapabilities;
}

/**
 * Severity → icon and tint, so an access problem never wears the input red.
 */
const FAILURE_PRESENTATION = {
  policy: { Icon: ShieldCheck, tone: "warning" as const },
  input: { Icon: X, tone: "neutral" as const },
  access: { Icon: ShieldCheck, tone: "neutral" as const },
  system: { Icon: RotateCcw, tone: "warning" as const },
};

/** Only a transport fault is worth repeating; a rejected ID needs a different ID. */
const RETRYABLE_CODES = new Set(["NETWORK_ERROR", "SERVER_ERROR"]);

/**
 * The two-column work surface's grid, in one place.
 *
 * The action column is given the larger share. The reason box is the only surface
 * here that a person types into for a minute at a time, and it is squeezed by the
 * gate table's own padding on the left — a record the reader can already see does
 * not need to be as legible as the field they are filling in.
 */
const WORK_SURFACE =
  "grid items-start gap-5 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]";

export default function HouseRequestClient({
  capabilities,
}: HouseRequestClientProps) {
  const flow = useHouseRequestFlow({ canCreate: capabilities.create });

  const {
    stage,
    employeeNumber,
    setEmployeeNumber,
    lookup,
    error,
    lookupLoading,
    submitting,
    remarks,
    remarksLength,
    setRemarks,
    markRemarksTouched,
    serverRemarksErrors,
    blocked,
    canSubmit,
    submitBlockedReason,
    isEligible,
    eligibleHouseType,
    alreadyHasActiveAllocation,
    hasOpenRequest,
    idProblem,
    confirmation,
    runLookup,
    runSubmit,
    retry,
    dismissError,
    reset,
  } = flow;

  const searchRef = useRef<HTMLInputElement>(null);

  const employee = lookup?.employee ?? null;
  const filed = stage === "confirmed" && confirmation != null;
  const verified = stage === "form" && employee != null;

  // A blocked reader is standing on the step they reached, and the step they
  // cannot enter is the one after it.
  const currentStep: StepNumber = filed ? 4 : verified ? (blocked ? 2 : 3) : 1;
  const blockedAt = verified && blocked ? 3 : null;

  // Focus the one required input whenever the page returns to its empty state
  useEffect(() => {
    if (!verified && !lookupLoading) searchRef.current?.focus();
  }, [verified, lookupLoading]);

  // `/` jumps to the Employee ID box from anywhere
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable);
      if (typing) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  async function handleSubmit() {
    const name = lookup?.fullName ?? "the employee";
    if (await runSubmit()) {
      notify.success({
        title: "House request filed",
        description: `${name} is now in the House Queue and will be ranked on the next calculation.`,
      });
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      {/* ─── Header ──────────────────────────────────────────────────────────
          ONE card carrying the title and the rail, not two stacked cards.

          It used to be a masthead card followed by a second card holding the
          progress rail: two borders, two sets of padding and roughly two hundred
          pixels of chrome between the top of the page and the one input anybody
          arrives to use. Merged, the rail reads as part of the title rather than
          as a widget parked under it, and the Employee ID field lands above the
          fold on a laptop.

          The "Housing Allocation Module · 4-Step Process" eyebrow is gone because
          the breadcrumb already reads Home › House Hold › House Request, and the
          title plus the rail say what the module is without repeating it. The
          icon is gone for the same reason: the brass rule under the title is this
          module's signature, and one signature per header is the rule. */}
      <section
        aria-labelledby="house-request-title"
        className="border-border/80 bg-card relative overflow-hidden rounded-xl border shadow-sm"
      >
        <div className="px-5 pt-5 pb-4 sm:px-6">
          <h1
            id="house-request-title"
            className="text-xl font-bold tracking-tight sm:text-2xl"
          >
            House Request
          </h1>
          {/* The module's one signature rule. Nothing else on the page is
              brass, so it can never be mistaken for a status. */}
          <div
            aria-hidden
            className="from-brass-400 mt-2 h-0.5 w-16 rounded bg-gradient-to-r to-transparent"
          />
          <p className="text-muted-foreground mt-2.5 max-w-2xl text-sm leading-relaxed text-pretty">
            Verify an employee against the Employee Register and file under the
            published job grade rule. Filed requests are ranked by that policy —
            not by the order they arrive.
          </p>
        </div>

        {/* The rail, on a solid strip under a hairline. `bg-secondary` rather
            than a translucent tint, so the header is one material in all seven
            themes. */}
        <div className="border-border/60 bg-secondary border-t px-4 py-3.5 sm:px-6">
          <StepFlow current={currentStep} blockedAt={blockedAt} />
        </div>
      </section>

      {/* ─── Step 1 · Search ─────────────────────────────────────────────────
          The only input in this step. It is a form, not a div, so Enter searches
          without any JavaScript being involved in that particular promise. It
          stays on screen at every step, because the next request is one
          keystroke away from the last one and hunting back up the page for the
          field is the friction that makes officers batch work instead. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runLookup();
        }}
        noValidate
      >
        <Sheet
          label="Verify an employee"
          title={StepCaption({ step: 1 })}
          icon={Search}
          tone="accent"
          bodyClassName="px-4 py-4 sm:px-5"
          actions={
            lookupLoading ? (
              <span className="text-muted-foreground inline-flex items-center gap-1.5 text-[11px] font-medium">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Checking the register
              </span>
            ) : null
          }
        >
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
            <div className="min-w-0 flex-1">
              <Label
                htmlFor="emp-id"
                className="text-foreground text-[13px] font-semibold"
              >
                Employee ID
              </Label>
              <div className="relative mt-1.5">
                <Search
                  className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2"
                  aria-hidden
                />
                <Input
                  id="emp-id"
                  ref={searchRef}
                  name="empId"
                  type="text"
                  value={employeeNumber}
                  onChange={(e) => setEmployeeNumber(e.target.value)}
                  placeholder="EMP-0042"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  enterKeyHint="search"
                  disabled={lookupLoading}
                  aria-invalid={
                    Boolean(idProblem) && employeeNumber.trim().length > 0
                  }
                  aria-describedby={cn(
                    "emp-id-hint",
                    idProblem &&
                      employeeNumber.trim().length > 0 &&
                      "emp-id-error",
                  )}
                  className={cn(
                    "h-11 pr-10 pl-10 font-mono tracking-wide",
                    lookupLoading && "opacity-60",
                  )}
                />
                {/* A field you retype for every single request should not be
                    cleared with a selection and a backspace each time. */}
                {employeeNumber ? (
                  <button
                    type="button"
                    aria-label="Clear Employee ID"
                    onClick={() => {
                      setEmployeeNumber("");
                      searchRef.current?.focus();
                    }}
                    className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute top-1/2 right-2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                ) : null}
              </div>
            </div>

            <Button
              type="submit"
              className="h-11 shrink-0 gap-1.5 px-5 font-medium"
              disabled={lookupLoading || !employeeNumber.trim()}
              aria-busy={lookupLoading}
            >
              {lookupLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Search className="h-4 w-4" aria-hidden />
              )}
              Search
            </Button>
          </div>

          <p
            id="emp-id-hint"
            className="text-muted-foreground mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-pretty"
          >
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>
                The Employee ID issued by HR, for example{" "}
                <span className="bg-muted/60 text-foreground rounded px-1 py-0.5 font-mono">
                  EMP-001
                </span>
                .
              </span>
              <span className="hidden items-center gap-1 sm:inline-flex">
                <Kbd>↵</Kbd> to search
                <span aria-hidden>·</span>
                <Kbd>/</Kbd> to focus
              </span>
            </span>

            {/* What the field is attached to. Cheap to render and it removes the
                question a verified page invites: is this box still live? */}
            {verified && lookup ? (
              <span className="text-foreground inline-flex items-center gap-1.5 font-medium">
                <Check
                  className="text-success-foreground h-3.5 w-3.5"
                  aria-hidden
                />
                Showing {lookup.fullName}
              </span>
            ) : null}
          </p>

          {/* A live problem with the ID is stated under the field that caused
              it, not at the top of a page the reader would scroll back past. */}
          {idProblem && employeeNumber.trim().length > 0 ? (
            <p
              id="emp-id-error"
              role="alert"
              className="text-muted-foreground mt-2 text-xs text-pretty"
            >
              {idProblem}
            </p>
          ) : null}
        </Sheet>
      </form>

      {/* ─── Failure Notice, before anything has been verified ────────────── */}
      {error && !verified ? (
        <FailureNotice
          failure={error}
          onRetry={retry}
          onDismiss={dismissError}
          onReset={reset}
          canRetry={RETRYABLE_CODES.has(error.code)}
        />
      ) : null}

      {lookupLoading && !employee ? <LoadingSurface /> : null}

      {/* ─── Idle: what will be checked, and who is allowed to type it ────── */}
      {!verified && !lookupLoading && !error && !filed ? (
        <>
          <p className="text-muted-foreground flex items-start gap-2 px-1 text-sm text-pretty">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              No employee verified yet. Enter an Employee ID above — everything
              else on this page is read from the server, never from what is
              typed.
            </span>
          </p>
          <div className={WORK_SURFACE}>
            <TrustContract />
            <GatePreview />
          </div>
        </>
      ) : null}

      {/* ─── Step 4 · Filed & official voucher ────────────────────────────── */}
      {filed && confirmation ? (
        <RequestVoucher confirmation={confirmation} onFileAnother={reset} />
      ) : null}

      {/* ─── Steps 2 & 3 · The verified record, the verdict, the action ──── */}
      {verified && lookup && employee ? (
        <div className={WORK_SURFACE}>
          <div className="space-y-5">
            <EmployeeInfoCard verify={lookup} />
          </div>

          <div className="space-y-5">
            {error ? (
              <FailureNotice
                failure={error}
                onRetry={retry}
                onDismiss={dismissError}
                onReset={reset}
                canRetry={RETRYABLE_CODES.has(error.code)}
              />
            ) : null}

            <EligibilityGate verify={lookup} />

            {/* The gate. A blocked employee does not get a disabled form — they
                get the block and WHAT TO DO ABOUT IT, because there is nothing
                to submit and a dead control invites a pointless retry. */}
            {blocked ? (
              <Callout
                tone="warning"
                icon={ShieldAlert}
                title="A request cannot be filed for this employee"
                actions={
                  <Button variant="outline" size="sm" onClick={reset}>
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    Search another employee
                  </Button>
                }
              >
                {remedyFor({
                  active: isActiveStatus(employee.employmentStatus),
                  isEligible,
                  alreadyHasActiveAllocation,
                  hasOpenRequest,
                })}
              </Callout>
            ) : (
              <SubmitGate
                employee={lookup.fullName}
                empId={lookup.empId}
                eligibleHouseType={eligibleHouseType}
                canSubmit={canSubmit}
                submitting={submitting}
                remarksLength={remarksLength}
                submitBlockedReason={submitBlockedReason}
                reason={
                  <ReasonComposer
                    formId={REASON_FORM_ID}
                    employee={employee}
                    value={remarks}
                    onChange={setRemarks}
                    onBlur={markRemarksTouched}
                    submitting={submitting}
                    blockedReason={submitBlockedReason}
                    serverErrors={serverRemarksErrors}
                    onSubmit={() => void handleSubmit()}
                  />
                }
              />
            )}
          </div>
        </div>
      ) : null}

      {/* Silent announcement for state the sighted reader sees as motion */}
      <p role="status" aria-live="polite" className="sr-only">
        {lookupLoading
          ? `Verifying ${employeeNumber} against the Employee Register.`
          : verified && employee
            ? `${lookup.fullName} verified. Job grade ${employee.jobGrade ?? "not set"}. ${isEligible ? `Eligible for a Type ${eligibleHouseType} house.` : "Not eligible for any house."}`
            : filed && confirmation
              ? `Request filed for ${confirmation.fullName}. Reference ${confirmation.requestId}.`
              : ""}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The trust contract — what this page reads, and what it lets you type
// ---------------------------------------------------------------------------

/**
 * The one panel on the idle page that is not the four gates.
 *
 * It exists because the strongest thing this page can say about itself is not a
 * feature — it is that two fields are the only things that ever leave the
 * browser, and every other fact is re-read from the database at the moment of
 * use. An officer deciding whether to trust a screen with an employee's housing
 * need has that as their actual question, and answering it up front costs three
 * rows.
 */
function TrustContract() {
  return (
    <Sheet
      label="What this page reads and what it lets you type"
      title="Where every fact on this page comes from"
      icon={UserRound}
      bodyClassName=""
      className="h-full"
    >
      <CompactFactTable caption="The three sources of every value on the house request page.">
        <CompactFactRow
          label="Employee Register"
          icon={UserRound}
          value="Names, employee ID, job grade, department, family, service"
          note="Read from the database on every verification. Nothing here can be typed, and nothing here is cached between searches."
        />
        <CompactFactRow
          label="Allocation policy"
          icon={ShieldCheck}
          value="Job grade → house band, and the queue ranking"
          note="Published and versioned by the allocation engine. The verdict shown on this page is that policy applied, not a local guess."
        />
        <CompactFactRow
          label="You type"
          icon={Send}
          value="An Employee ID, and a reason"
          note="These two fields are the entire submission body. A grade, a department or a family size cannot be asserted from the browser."
        />
      </CompactFactTable>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// The submit gate
// ---------------------------------------------------------------------------

/**
 * What the reader should DO, given that the request cannot be filed.
 *
 * Ordered the same way the block is derived — employment status, then grade, then
 * allocation, then request — so the sentence always names the first thing that has
 * to change. The eligibility *reason* lives on the gate chain; this is the action,
 * and the two never say the same thing.
 */
function remedyFor(input: {
  active: boolean;
  isEligible: boolean;
  alreadyHasActiveAllocation: boolean;
  hasOpenRequest: boolean;
}): React.ReactNode {
  if (!input.active) {
    return (
      <>
        Their employment status must be set to{" "}
        <span className="font-semibold">Active</span> on the Employee Register
        before a house request can be filed.
      </>
    );
  }
  if (!input.isEligible) {
    return (
      <>
        The published job grade rule maps no house band to this record, so no
        request can be filed until the policy or the job grade changes. The
        eligibility reason is on the gate chain above.
      </>
    );
  }
  if (input.alreadyHasActiveAllocation) {
    return (
      <>
        Release the house currently held by this employee — or move them out of
        it — before a request can be filed. The house they hold is named on the
        gate chain above.
      </>
    );
  }
  return (
    <>
      This employee already has an open request in the House Queue. Only one
      request per employee is allowed at a time.
    </>
  );
}

/**
 * The action, with the subject attached to it.
 *
 * The employee's name and ID are printed on the same surface as the button, and
 * repeated in the button's own accessible name. A floating "File request" with no
 * subject beside it is how a request gets filed for the wrong person, and the
 * subject is the one thing a reader checks last.
 */
function SubmitGate({
  employee,
  empId,
  eligibleHouseType,
  canSubmit,
  submitting,
  remarksLength,
  submitBlockedReason,
  reason,
}: {
  employee: string;
  empId: string;
  eligibleHouseType: string | null;
  canSubmit: boolean;
  submitting: boolean;
  remarksLength: number;
  submitBlockedReason: string | null;
  reason: React.ReactNode;
}) {
  const overLimit = remarksLength > REMARKS_MAX_LENGTH;
  const enough = remarksLength >= REMARKS_MIN_LENGTH;

  return (
    <section aria-label="Submit the house request" className="space-y-3">
      {reason}

      <div className="border-border/80 bg-secondary flex flex-wrap items-center justify-between gap-4 rounded-xl border px-4 py-3.5 shadow-xs sm:px-5">
        <div className="min-w-0">
          <p className="text-muted-foreground text-[10px] font-bold tracking-[0.12em] uppercase">
            Requesting a Type {eligibleHouseType ?? "—"} house for
          </p>
          <p className="text-foreground mt-0.5 truncate text-sm font-bold">
            {employee}
            <span className="text-muted-foreground ml-2 font-mono text-xs font-normal">
              {empId}
            </span>
          </p>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <span
            aria-live="polite"
            className={cn(
              "inline-flex items-center rounded-md px-2 py-1 text-[11px] font-semibold tabular-nums",
              overLimit
                ? "bg-destructive/10 text-destructive"
                : enough
                  ? "bg-success-bg text-success-foreground"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {remarksLength}/{REMARKS_MAX_LENGTH}
          </span>

          <Button
            type="submit"
            form={REASON_FORM_ID}
            className="shrink-0 gap-2 px-5 font-semibold shadow-xs"
            disabled={!canSubmit}
            aria-busy={submitting}
            aria-describedby={
              !canSubmit && submitBlockedReason ? "submit-blocked" : undefined
            }
            aria-label={`Submit a house request for ${employee}, ${empId}`}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Send className="h-4 w-4" aria-hidden />
            )}
            Submit
          </Button>
        </div>
      </div>

      {!canSubmit && submitBlockedReason ? (
        <p
          id="submit-blocked"
          role="status"
          className="text-muted-foreground px-1 text-xs text-pretty"
        >
          {submitBlockedReason}
        </p>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Loading + failures
// ---------------------------------------------------------------------------

/**
 * Placeholders shaped like the surface that is coming, so nothing on the page
 * jumps when the register answers.
 *
 * The two panels mirror the work surface's columns rather than collapsing into
 * one block, because the collapse-and-expand is the jump.
 */
function LoadingSurface() {
  return (
    <div className={WORK_SURFACE} aria-busy="true">
      <div className="border-border/80 bg-card overflow-hidden rounded-xl border shadow-sm">
        <div className="bg-muted/40 h-20 animate-pulse" />
        <div className="border-border/60 bg-border/40 grid grid-cols-2 gap-px border-b sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-card px-4 py-3.5">
              <div className="bg-muted h-2.5 w-14 animate-pulse rounded" />
              <div className="bg-muted mt-2 h-5 w-10 animate-pulse rounded" />
              <div className="bg-muted mt-2 h-2 w-16 animate-pulse rounded" />
            </div>
          ))}
        </div>
        <div className="space-y-3.5 p-4">
          {[82, 64, 74, 58].map((w, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="bg-muted h-2.5 w-20 animate-pulse rounded" />
              <div
                className="bg-muted h-2.5 animate-pulse rounded"
                style={{ width: `${w}px` }}
              />
            </div>
          ))}
          <p className="text-muted-foreground flex items-center pt-1.5 text-xs">
            <Loader2
              className="mr-1.5 inline h-3.5 w-3.5 animate-spin"
              aria-hidden
            />
            Reading the Employee Register…
          </p>
        </div>
      </div>

      <Sheet
        label="Policy eligibility"
        title={StepCaption({ step: 2 })}
        icon={ShieldCheck}
        bodyClassName=""
      >
        <div className="space-y-3.5 p-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="bg-muted h-6 w-6 shrink-0 animate-pulse rounded-full" />
              <div className="bg-muted h-2.5 flex-1 animate-pulse rounded" />
              <div className="bg-muted h-5 w-16 shrink-0 animate-pulse rounded" />
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

/**
 * A failure, rendered where the user is already looking.
 */
function FailureNotice({
  failure,
  onRetry,
  onDismiss,
  onReset,
  canRetry,
}: {
  failure: HouseRequestFailure;
  onRetry: () => void;
  onDismiss: () => void;
  onReset: () => void;
  canRetry: boolean;
}) {
  const { Icon, tone } = FAILURE_PRESENTATION[failure.severity];
  const isUnknownId =
    failure.code === "EMPLOYEE_NOT_FOUND" ||
    failure.code === "EMPLOYEE_ARCHIVED";

  return (
    <Callout
      tone={tone}
      icon={Icon}
      title={isUnknownId ? "Employee ID not found" : failure.title}
      actions={
        <>
          {canRetry ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Try again
            </Button>
          ) : null}
          {isUnknownId ? (
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              Dismiss
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={onReset}>
              Start over
            </Button>
          )}
        </>
      }
    >
      {isUnknownId
        ? "No employee in your organization carries that Employee ID. Check it against the Employee Register and try again."
        : failure.message}
      {failure.hint && !isUnknownId ? (
        <p className="mt-1 text-xs">{failure.hint}</p>
      ) : null}
    </Callout>
  );
}
