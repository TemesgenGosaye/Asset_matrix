"use client";

import { useCallback, useEffect, useRef } from "react";
import { Loader2, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import EmployeeVerificationResult from "./EmployeeVerificationResult";
import EmployeeVerificationSkeleton from "./EmployeeVerificationSkeleton";
import EmployeeVerificationError from "./EmployeeVerificationError";
import RequestComposer from "./RequestComposer";
import RequestReceipt from "./RequestReceipt";
import { useHouseRequestFlow } from "./useHouseRequestFlow";

export interface HouseRequestCapabilities {
  create: boolean;
}

export interface HouseRequestClientProps {
  capabilities: HouseRequestCapabilities;
  organizationName?: string;
}

export default function HouseRequestClient({
  capabilities,
  organizationName = "Metahara Sugar Factory",
}: HouseRequestClientProps) {
  const flow = useHouseRequestFlow({ canCreate: capabilities.create });
  const {
    stage,
    employeeNumber,
    setEmployeeNumber,
    lookup,
    error,
    lookupLoading,
    confirmation,
    idProblem,
    runLookup,
    retry,
    reset,
  } = flow;

  const searchRef = useRef<HTMLInputElement>(null);
  const verified = stage === "form" && lookup != null;
  const filed = stage === "confirmed" && confirmation != null;

  useEffect(() => {
    if (stage === "search" && !lookupLoading) searchRef.current?.focus();
  }, [stage, lookupLoading]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const active = document.activeElement;
      const typing =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable);
      if (typing) return;
      event.preventDefault();
      searchRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const startOver = useCallback(() => reset(), [reset]);

  const displayOrg =
    organizationName &&
    !organizationName.toLowerCase().includes("demo") &&
    !organizationName.toLowerCase().includes("test")
      ? organizationName
      : "Metahara Sugar Factory";

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      {/* Professional Centered Search Section */}
      <section className="no-print mx-auto w-full max-w-2xl pt-2 text-center">
        <p className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
          {displayOrg} · HAMS Portal
        </p>
        <h1 className="text-foreground mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
          House Request: Employee Verification
        </h1>
        <p className="text-muted-foreground mt-1 text-xs sm:text-sm">
          Look up an employee by their exact ID to verify active employment and
          housing eligibility.
        </p>

        <form
          className="mt-4"
          onSubmit={(event) => {
            event.preventDefault();
            void runLookup();
          }}
        >
          <div className="border-border bg-card focus-within:border-primary/60 focus-within:ring-primary/15 relative flex items-center rounded-xl border p-1 shadow-sm transition-all focus-within:ring-2">
            <div className="text-muted-foreground pointer-events-none pl-3">
              <Search className="h-4 w-4" aria-hidden />
            </div>
            <input
              ref={searchRef}
              id="employee-id"
              name="employee-id"
              type="text"
              value={employeeNumber}
              onChange={(event) => setEmployeeNumber(event.target.value)}
              placeholder="Enter Employee ID (e.g. 1000599 or EMP-0042)"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              disabled={lookupLoading}
              aria-invalid={Boolean(idProblem)}
              aria-describedby="employee-id-help"
              className="text-foreground placeholder:text-muted-foreground h-10 flex-1 border-0 bg-transparent px-3 font-mono text-sm tracking-wide placeholder:font-sans placeholder:tracking-normal focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
            {employeeNumber && !lookupLoading ? (
              <button
                type="button"
                onClick={() => {
                  setEmployeeNumber("");
                  searchRef.current?.focus();
                }}
                className="text-muted-foreground hover:bg-secondary hover:text-foreground mr-1 rounded-md p-1"
                aria-label="Clear Employee ID"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
            <div className="hidden items-center pr-2 sm:flex">
              <kbd className="border-border bg-secondary/80 text-muted-foreground rounded border px-1.5 py-0.5 font-mono text-[10px]">
                /
              </kbd>
            </div>
            <Button
              type="submit"
              disabled={lookupLoading || !employeeNumber.trim()}
              className="bg-primary hover:bg-primary/90 text-primary-foreground h-10 shrink-0 gap-2 rounded-lg px-5 text-xs font-semibold shadow-none transition-colors"
            >
              {lookupLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Verifying...
                </>
              ) : (
                <>
                  <Search className="h-3.5 w-3.5" aria-hidden />
                  Verify
                </>
              )}
            </Button>
          </div>

          <div
            id="employee-id-help"
            className="text-muted-foreground mt-2 flex items-center justify-center gap-2 text-[11px]"
          >
            <span>Reads live from Employee Register</span>
            <span>•</span>
            <span>Press Enter to verify</span>
          </div>
        </form>
      </section>

      <p role="status" aria-live="polite" className="sr-only">
        {lookupLoading
          ? `Loading ${employeeNumber}.`
          : verified && lookup
            ? `${lookup.fullName} loaded. ${
                flow.blocked
                  ? "A house request cannot be filed."
                  : `Eligible for a Type ${lookup.eligibleHouseType ?? "—"} house.`
              }`
            : filed && confirmation
              ? `Request filed for ${confirmation.fullName}.`
              : ""}
      </p>

      {/* Result / Skeleton / Error Container */}
      {lookupLoading ? (
        <EmployeeVerificationSkeleton employeeNumber={employeeNumber} />
      ) : error && stage === "search" ? (
        <EmployeeVerificationError
          failure={error}
          searchedId={employeeNumber}
          onRetry={retry}
          onSearchAgain={startOver}
        />
      ) : verified && lookup ? (
        <EmployeeVerificationResult
          verify={lookup}
          organizationName={displayOrg}
          onReset={startOver}
        >
          {!flow.blocked ? (
            <RequestComposer flow={flow} onReset={startOver} />
          ) : null}
        </EmployeeVerificationResult>
      ) : filed && confirmation ? (
        <RequestReceipt confirmation={confirmation} onReset={startOver} />
      ) : null}
    </div>
  );
}
