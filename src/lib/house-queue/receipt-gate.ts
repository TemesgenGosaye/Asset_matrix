/**
 * Print gate for house receipts.
 *
 * A termination (handback) receipt and a transfer receipt are legal documents:
 * they are the paper record that a house changed hands, and they are filed,
 * signed and kept. Printing one asserts that the house was physically handed
 * back — inspected, damage recorded, and the release finalised.
 *
 * Without that gate a receipt is just a request printed from a database row.
 * An employee who is still occupying the house could be handed a signed
 * termination confirmation, and the house could vanish from the register while
 * its allocation was still live. So the receipt is withheld until the
 * handback inspection exists and has been completed.
 *
 * The handover (allocation) receipt is deliberately NOT gated: it is printed
 * *before* any inspection, to document an allocation being granted.
 *
 * Client-safe: a pure function over data the caller already holds.
 */

/** What the caller wants to print. */
export type ReceiptVariant = "handover" | "handback" | "move";

export interface ReceiptGateInput {
  variant: ReceiptVariant;
  /**
   * The handback inspection raised for this release, if any. Null before the
   * release executes.
   *
   * Fields are optional because the print component accepts a looser shape than
   * either view supplies — absent means "not established", which fails the gate
   * exactly as an explicit null does. That is deliberate: an incomplete shape
   * must not read as permission.
   */
  inspection?: {
    resolvedTo?: string | null;
    completedAt?: string | null;
  } | null;
}

export type ReceiptGate =
  | {
      allowed: true;
      /** Present (as undefined) on the allowed branch too, so a caller can read
       *  `gate.message` unconditionally without narrowing first — which matters
       *  for tooltips, where the check is a separate boolean derived from
       *  `gate.allowed`.
       */
      message?: undefined;
      /**
       * Present (as undefined) on this branch for the same reason. Declaring it
       * rather than relying on narrowing the union: this project compiles without
       * `strictNullChecks`, where TypeScript will not narrow on a boolean-literal
       * discriminant, so `gate.reason` would be a type error on an API whose whole
       * purpose is to be branched on.
       */
      reason?: undefined;
    }
  | {
      allowed: false;
      /** Stable code, so a caller can branch without matching on prose. */
      reason: "NOT_INSPECTED" | "INSPECTION_INCOMPLETE";
      message: string;
    };

/**
 * Decide whether a receipt may be printed.
 *
 * Two distinct refusals rather than one, because the correct next step differs:
 *  - NOT_INSPECTED          → the release has not raised an inspection at all
 *  - INSPECTION_INCOMPLETE  → an inspector has not completed it yet
 *
 * Completing the handback inspection IS what finalises a release: the same
 * transaction records the damage result, marks the allocation `released` with a
 * `terminatedAt`, and returns the house to stock. So "inspected and resolved" is
 * the whole gate — there is no separate secret to present.
 */
export function canPrintHouseReceipt(input: ReceiptGateInput): ReceiptGate {
  if (input.variant === "handover") return { allowed: true };

  const { inspection } = input;

  if (!inspection) {
    return {
      allowed: false,
      reason: "NOT_INSPECTED",
      message:
        "This house has no handback inspection yet, so a termination receipt cannot be printed. Complete the release workflow first.",
    };
  }

  if (!inspection.resolvedTo || !inspection.completedAt) {
    return {
      allowed: false,
      reason: "INSPECTION_INCOMPLETE",
      message:
        "The handback inspection for this house is not complete yet. Finish it on the Inspections page before printing a receipt.",
    };
  }

  return { allowed: true };
}

/** Convenience for callers that only need a boolean. */
export function isHouseReceiptPrintable(input: ReceiptGateInput): boolean {
  return canPrintHouseReceipt(input).allowed;
}
