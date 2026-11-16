"use client";

/**
 * A failure, rendered where the user is already looking.
 *
 * WHY THE SEVERITY MAP IS NOT THE STATUS CODE
 * The HTTP status says what happened to the REQUEST. The severity says what
 * happened to the PERSON using the page, and those are not the same question:
 * a 404 for an unknown Employee ID is a typing problem, a 403 is an
 * administrative problem, and a 500 is a system problem. Rendering them all in
 * the same red would train the reader that red means "the system is broken"
 * rather than "you typed the wrong code".
 *
 * WHY AN UNKNOWN ID GETS NO "TRY AGAIN"
 * Repeating a rejected ID produces the same rejection. The useful action after
 * a mistyped Employee ID is a different ID, so the notice offers a way back to
 * the field rather than a way to repeat the call.
 */

import { RotateCcw, ShieldAlert, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { HouseRequestFailure } from "@/lib/house-requests/failures";
import { cn } from "@/lib/utils";

/** Severity → icon and tint, so an access problem never wears the input red. */
const FAILURE_PRESENTATION = {
  policy: { Icon: ShieldAlert, tone: "warning" as const },
  input: { Icon: X, tone: "danger" as const },
  access: { Icon: ShieldAlert, tone: "neutral" as const },
  system: { Icon: RotateCcw, tone: "warning" as const },
};

/** Only a transport fault is worth repeating; a rejected ID needs a different ID. */
const RETRYABLE_CODES = new Set(["NETWORK_ERROR", "SERVER_ERROR"]);

const TONE_STYLES = {
  danger: {
    shell: "border-destructive/35 bg-destructive/5",
    badge: "bg-destructive/12 text-destructive",
    icon: "text-destructive",
  },
  warning: {
    shell: "border-warning-foreground/30 bg-warning-bg",
    badge: "bg-warning-bg text-warning-foreground",
    icon: "text-warning-foreground",
  },
  neutral: {
    shell: "border-border bg-secondary",
    badge: "bg-muted text-muted-foreground",
    icon: "text-muted-foreground",
  },
} as const;

export default function FailureNotice({
  failure,
  onRetry,
  onDismiss,
  onReset,
  className,
}: {
  failure: HouseRequestFailure;
  onRetry: () => void;
  onDismiss: () => void;
  onReset: () => void;
  className?: string;
}) {
  const { Icon, tone } = FAILURE_PRESENTATION[failure.severity];
  const styles = TONE_STYLES[tone];
  const isUnknownId =
    failure.code === "EMPLOYEE_NOT_FOUND" ||
    failure.code === "EMPLOYEE_ARCHIVED";

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-xl border px-4 py-3.5",
        styles.shell,
        className ?? "",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          styles.badge,
        )}
      >
        <Icon className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-foreground text-sm font-semibold">
          {isUnknownId ? "Employee ID not found" : failure.title}
        </p>
        <p className="text-muted-foreground mt-0.5 text-sm text-pretty">
          {isUnknownId
            ? "No employee in your organization carries that Employee ID. Check it against the Employee Register and try again."
            : failure.message}
        </p>
        {failure.hint && !isUnknownId ? (
          <p className="text-muted-foreground mt-1.5 text-xs text-pretty">
            {failure.hint}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          {RETRYABLE_CODES.has(failure.code) ? (
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
        </div>
      </div>
    </div>
  );
}
