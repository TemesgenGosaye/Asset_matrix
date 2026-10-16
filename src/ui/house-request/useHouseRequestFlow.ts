"use client";

/**
 * The House Request page's state machine.
 *
 * WHY A HOOK AND NOT A COMPONENT
 * The page has exactly one subject — one employee, moving through verify →
 * submit → filed — and every visible part of it is a projection of that subject's
 * state. When the state lived inside the component, the render function became a
 * switch over four mutually exclusive branches and every one of them had to
 * re-derive `blocked`, `canSubmit` and `submitBlockedReason` independently.
 * Hoisting it here means the derivations exist once, so "can I submit?" can never
 * disagree between the button, the hint under it and the failure banner.
 *
 * THE SUBJECT CAN ADVANCE OR GO BACKWARDS, AND NEVER STAYS HALF-CHANGED
 * A lookup issued for `EMP-0001` can land after the user has already typed
 * `EMP-0002`. Without the monotonic token below, the slow response paints the
 * wrong person's record into a form the user is about to submit. Editing the ID
 * therefore invalidates every response already in flight AND drops the record it
 * no longer describes — a form still displaying somebody else's job grade under
 * an edited ID is how a request gets filed for the wrong person.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  REMARKS_MAX_LENGTH,
  REMARKS_MIN_LENGTH,
} from "@/lib/house-requests/constants";
import {
  describeFailureResponse,
  describeNetworkFailure,
  fieldMessages,
  type HouseRequestFailure,
} from "@/lib/house-requests/failures";
import type {
  HouseRequestSubmissionResult,
  HouseRequestVerifyResult,
} from "@/lib/house-requests/types";
import type { HouseCategory } from "@/lib/house-queue/types";
import { isActiveStatus } from "./format";

/** Where the single subject of this page currently is. */
export type Stage = "search" | "form" | "confirmed";

/** The receipt of a successful submit, frozen at submission time. */
export interface Confirmation extends HouseRequestSubmissionResult {
  /** Job grade at the moment of submission. */
  jobGrade: number | null;
}

export interface HouseRequestFlow {
  stage: Stage;
  employeeNumber: string;
  /**
   * Set the Employee ID box.
   *
   * Deliberately a hook function rather than a raw `setState`: changing the value
   * drops the loaded record and invalidates any lookup still in flight, so the
   * record on screen can never describe an ID that is no longer in the box.
   */
  setEmployeeNumber: (value: string) => void;
  lookup: HouseRequestVerifyResult | null;
  error: HouseRequestFailure | null;

  lookupLoading: boolean;
  submitting: boolean;

  remarks: string;
  setRemarks: (value: string) => void;
  /** Called on blur so the reason box validates on exit, not on every key. */
  markRemarksTouched: () => void;
  remarksTouched: boolean;
  trimmedRemarks: string;
  remarksLength: number;
  /** Client-side message for the reason box. */
  remarksError: string | null;
  /** The server's own field messages, shown verbatim rather than re-guessed. */
  serverRemarksErrors: string[] | null;

  /** True when the verified employee cannot file a new request at all. */
  blocked: boolean;
  canSubmit: boolean;
  /** Why the primary action is unavailable, in the reader's terms. */
  submitBlockedReason: string | null;
  /** The eligibility verdict, restated for the badge beside the record. */
  isEligible: boolean;
  eligibleHouseType: HouseCategory | null;
  /** Plain-language reason the badge shows. Never empty once verified. */
  eligibilityReason: string | null;
  /** The employee already occupies an allocated house. */
  alreadyHasActiveAllocation: boolean;
  /** The employee already holds a request that is still open. */
  hasOpenRequest: boolean;
  /** Why the ID in the box cannot be verified, or null when it can. */
  idProblem: string | null;

  confirmation: Confirmation | null;

  runLookup: (employeeNumber?: string) => Promise<void>;
  runSubmit: () => Promise<boolean>;
  retry: () => void;
  dismissError: () => void;
  reset: () => void;
}

export interface UseHouseRequestFlowOptions {
  canCreate: boolean;
}

export function useHouseRequestFlow({
  canCreate,
}: UseHouseRequestFlowOptions): HouseRequestFlow {
  const [stage, setStage] = useState<Stage>("search");
  const [employeeNumber, setEmployeeNumberState] = useState("");
  const [lookup, setLookup] = useState<HouseRequestVerifyResult | null>(null);
  const [error, setError] = useState<HouseRequestFailure | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  const [lookupLoading, setLookupLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [remarks, setRemarksState] = useState("");
  const [remarksTouched, setRemarksTouched] = useState(false);

  /**
   * The Employee ID as the CALLBACKS below see it.
   *
   * Mirrored from state rather than read from it, because `runLookup` is called
   * from a keyboard handler whose value has already been flushed into state by
   * React but has not necessarily re-rendered this hook yet. `setEmployeeNumber`
   * writes through it as well, so the two can never disagree.
   */
  const employeeNumberRef = useRef(employeeNumber);
  useEffect(() => {
    employeeNumberRef.current = employeeNumber;
  }, [employeeNumber]);

  /**
   * Monotonic token for the lookup.
   *
   * Bumping it invalidates every response that is already in flight. Declared
   * ABOVE the callbacks that invalidate them, because a callback closing over a
   * binding created later is a temporal-dead-zone hazard waiting for the one
   * caller that fires first.
   */
  const lookupToken = useRef(0);

  /**
   * Edit the Employee ID box, dropping the record it no longer describes.
   *
   * The guard is "did the value actually change?" rather than "was this called
   * from the keyboard?" — re-verifying writes the ID back into the box, and an
   * unguarded setter would wipe the record it just fetched.
   */
  const setEmployeeNumber = useCallback((value: string) => {
    const previous = employeeNumberRef.current;
    if (value === previous) return;

    employeeNumberRef.current = value;
    setEmployeeNumberState(value);

    // A lookup already in flight for the old ID must not paint its result into
    // the new one.
    lookupToken.current += 1;
    setLookup(null);
    setStage("search");
    setConfirmation(null);
    setError(null);
    setRemarksState("");
    setRemarksTouched(false);
  }, []);

  // ── Derived: can this request be submitted right now? ──────────────────────
  const trimmedRemarks = remarks.trim();
  const remarksLength = trimmedRemarks.length;
  const remarksTooShort = remarksLength < REMARKS_MIN_LENGTH;
  const remarksTooLong = remarksLength > REMARKS_MAX_LENGTH;
  const remarksValid = !remarksTooShort && !remarksTooLong;

  // The eligibility verdict is restated from the verified record rather than
  // re-derived here — the server already applied the central job-grade rule
  // against the ACTIVE engine config, and a second derivation in the client is
  // one more thing that can drift from it.
  const isEligible = lookup?.isEligible ?? false;
  const eligibleHouseType = lookup?.eligibleHouseType ?? null;
  const eligibilityReason = lookup?.eligibilityReason ?? null;
  const alreadyHasActiveAllocation =
    lookup?.alreadyHasActiveAllocation ?? false;
  const hasOpenRequest = lookup?.hasOpenRequest ?? false;

  /**
   * Whether a request may be filed for this employee at all.
   *
   * Four separate things have to hold, checked in the order the reader would want
   * them explained: the employee must be active, the grade must map to a band,
   * and nothing may already be on file. `isActiveStatus` is applied here rather
   * than asked for because the verify response deliberately reports an inactive
   * employee as a normal 200 rather than a 404 — verification reports, it never
   * decides.
   */
  const blocked =
    lookup != null &&
    (!isActiveStatus(lookup.employee.employmentStatus) ||
      !isEligible ||
      alreadyHasActiveAllocation ||
      hasOpenRequest);

  const canSubmit =
    stage === "form" &&
    canCreate &&
    lookup !== null &&
    !blocked &&
    remarksValid &&
    !submitting;

  const remarksError =
    remarksTouched && remarksLength > 0 && remarksTooShort
      ? `Reason must be at least ${REMARKS_MIN_LENGTH} characters.`
      : remarksTooLong
        ? `Reason must be at most ${REMARKS_MAX_LENGTH} characters.`
        : null;

  /**
   * Field-level messages the SERVER rejected the last submit with.
   *
   * The client already blocks an out-of-bounds reason locally, so this only
   * appears when the two copies of the rule have drifted. Showing the server's own
   * wording is the only honest thing to do in that case.
   */
  const serverRemarksErrors = fieldMessages(error, "remarks");

  const submitBlockedReason = (() => {
    if (stage !== "form" || lookup === null) return null;
    if (blocked || canSubmit || submitting) return null;
    if (!canCreate) {
      return "You do not have permission to submit house requests.";
    }
    if (remarksTooLong) {
      return `Shorten the reason by ${remarksLength - REMARKS_MAX_LENGTH} character(s) — the limit is ${REMARKS_MAX_LENGTH}.`;
    }
    if (remarksTooShort) {
      return `Add ${REMARKS_MIN_LENGTH - remarksLength} more character(s) — at least ${REMARKS_MIN_LENGTH} characters are required.`;
    }
    return "Enter a reason to enable the request.";
  })();

  /**
   * Why the Employee ID in the box cannot be verified, or null when it can.
   *
   * Only one state is rejected here — the empty box. Everything else of a usable
   * length is an Employee ID worth looking up, because the register is the
   * authority on what the codes look like and the client is not.
   */
  const idProblem: string | null = (() => {
    if (employeeNumber.trim().length === 0) {
      return "Enter an Employee ID to verify against the Employee Register.";
    }
    return null;
  })();

  // ── Lookup ────────────────────────────────────────────────────────────────
  const runLookup = useCallback(async (override?: string) => {
    const needle = (override ?? employeeNumberRef.current).trim();
    if (!needle) {
      setError({
        code: "EMPLOYEE_NOT_FOUND",
        severity: "input",
        title: "Employee ID required",
        message: "Enter an Employee ID to verify before continuing.",
        hint: "The Employee ID is the code issued by HR, for example EMP-001.",
        requiresReverification: false,
      });
      return;
    }

    const token = ++lookupToken.current;
    // The input always mirrors the ID that was actually looked up. Written
    // through the ref directly, NOT through `setEmployeeNumber`: the guard in
    // that setter clears the record when the value changes.
    employeeNumberRef.current = needle;
    setEmployeeNumberState(needle);
    setLookupLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ empId: needle });
      const res = await fetch(
        `/api/house-requests/verify?${params.toString()}`,
        {
          cache: "no-store",
        },
      );
      const body = (await res.json().catch(() => null)) as unknown;

      if (token !== lookupToken.current) return;

      if (!res.ok) {
        // A rejected ID must NOT reveal a form — the employee either does not
        // exist, or their record has been archived from the register. Both are
        // reported as "Employee ID not found" by the route; the stable `code` is
        // kept here so the notice can say which without leaking it.
        setLookup(null);
        setRemarksState("");
        setRemarksTouched(false);
        setStage("search");
        setError(describeFailureResponse(res.status, body));
        return;
      }

      const result = body as HouseRequestVerifyResult;
      setLookup(result);
      setRemarksState("");
      setRemarksTouched(false);
      setStage("form");
    } catch {
      if (token !== lookupToken.current) return;
      setLookup(null);
      setStage("search");
      setError(describeNetworkFailure("lookup"));
    } finally {
      if (token === lookupToken.current) setLookupLoading(false);
    }
  }, []);

  // ── Submit ────────────────────────────────────────────────────────────────
  const runSubmit = useCallback(async (): Promise<boolean> => {
    if (!lookup || !canSubmit) return false;

    setSubmitting(true);
    setError(null);

    try {
      // Only the Employee ID and the reason leave the browser. Every other field
      // is re-read from the database by the server, so a client can never assert
      // a grade or a department it made up.
      const res = await fetch("/api/house-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeNumber: lookup.employee.employeeNumber,
          remarks: trimmedRemarks,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | (Partial<HouseRequestSubmissionResult> & {
            error?: string;
            code?: string;
          })
        | null;

      if (!res.ok) {
        const failure = describeFailureResponse(res.status, body);

        // A rejection that is about the EMPLOYEE (already requested, already
        // allocated, grade ineligible, no longer active) invalidates the whole
        // verification, so drop back to search rather than leave a dead form on
        // screen. Rejections about the REQUEST (validation, auth, server fault)
        // keep the form and everything the user typed.
        if (failure.requiresReverification) {
          setLookup(null);
          setStage("search");
          setRemarksState("");
          setRemarksTouched(false);
        }
        setError(failure);
        return false;
      }

      setConfirmation({
        requestId: body?.requestId ?? "",
        employeeId: body?.employeeId ?? lookup.employee.id,
        employeeNumber: body?.employeeNumber ?? lookup.employee.employeeNumber,
        fullName: body?.fullName ?? lookup.employee.fullName,
        remarks: body?.remarks ?? trimmedRemarks,
        status: body?.status ?? "submitted",
        submittedAt: body?.submittedAt ?? new Date().toISOString(),
        houseCategory:
          (body?.houseCategory as HouseCategory | null | undefined) ??
          lookup.employee.houseCategory,
        jobGrade: lookup.employee.jobGrade,
      });
      setStage("confirmed");
      return true;
    } catch {
      setError(describeNetworkFailure("submit"));
      return false;
    } finally {
      setSubmitting(false);
    }
  }, [lookup, canSubmit, trimmedRemarks]);

  // ── Reset ─────────────────────────────────────────────────────────────────
  /** Start again on an empty field, for the next employee. */
  const reset = useCallback(() => {
    lookupToken.current += 1;
    setStage("search");
    employeeNumberRef.current = "";
    setEmployeeNumberState("");
    setLookup(null);
    setError(null);
    setRemarksState("");
    setRemarksTouched(false);
    setConfirmation(null);
    setLookupLoading(false);
    setSubmitting(false);
  }, []);

  /**
   * Repeat whichever call produced the failure on screen.
   *
   * A rejected ID needs a different ID, so retrying is only offered for a
   * transport fault — and even then it re-reads the ID currently in the box,
   * which is what the user is looking at.
   */
  const retry = useCallback(() => {
    if (stage === "form") void runSubmit();
    else void runLookup();
  }, [stage, runSubmit, runLookup]);

  const dismissError = useCallback(() => setError(null), []);

  return {
    stage,
    employeeNumber,
    setEmployeeNumber,
    lookup,
    error,
    lookupLoading,
    submitting,
    remarks,
    setRemarks: setRemarksState,
    markRemarksTouched: useCallback(() => setRemarksTouched(true), []),
    remarksTouched,
    trimmedRemarks,
    remarksLength,
    remarksError,
    serverRemarksErrors,
    blocked,
    canSubmit,
    submitBlockedReason,
    isEligible,
    eligibleHouseType,
    eligibilityReason,
    alreadyHasActiveAllocation,
    hasOpenRequest,
    idProblem,
    confirmation,
    runLookup,
    runSubmit,
    retry,
    dismissError,
    reset,
  };
}
