import { describe, it, expect } from "vitest";

import { canPrintHouseReceipt } from "../receipt-gate";

/**
 * A termination receipt and a transfer receipt are legal documents. Printing one
 * asserts the house was physically handed back — which means exactly one thing:
 * the handback inspection is complete.
 *
 * Completing that inspection is what finalises the release (it archives the
 * allocation and returns the house to stock in the same transaction), so there
 * is no separate state to wait on.
 *
 * The tests below pin two things a naive check gets wrong:
 *  1. An ABSENT inspection field is not permission. Partial shapes must fail
 *     closed, or a caller that forgets to pass the inspection can print.
 *  2. The refusal distinguishes WHY, because the next action differs.
 */

const completedInspection = {
  resolvedTo: "Active",
  completedAt: new Date("2026-01-10").toISOString(),
};

describe("canPrintHouseReceipt", () => {
  describe("handover (allocation receipt)", () => {
    it("is always allowed — it is printed before any inspection exists", () => {
      expect(
        canPrintHouseReceipt({ variant: "handover", inspection: null }),
      ).toEqual({
        allowed: true,
      });
    });

    it("stays allowed even when an inspection exists and is unfinished", () => {
      const gate = canPrintHouseReceipt({
        variant: "handover",
        inspection: { resolvedTo: null, completedAt: null },
      });
      expect(gate.allowed).toBe(true);
    });
  });

  describe("handback / transfer receipts", () => {
    it("allows printing once the handback inspection is complete", () => {
      const gate = canPrintHouseReceipt({
        variant: "handback",
        inspection: completedInspection,
      });
      expect(gate.allowed).toBe(true);
    });

    it("allows printing for a damaged handback resolved to maintenance", () => {
      const gate = canPrintHouseReceipt({
        variant: "handback",
        inspection: {
          resolvedTo: "UnderMaintenance",
          completedAt: new Date("2026-01-10").toISOString(),
        },
      });
      expect(gate.allowed).toBe(true);
    });

    it("applies the same rule to the transfer receipt", () => {
      expect(
        canPrintHouseReceipt({
          variant: "move",
          inspection: completedInspection,
        }).allowed,
      ).toBe(true);
    });

    it("refuses when no inspection was ever raised", () => {
      const gate = canPrintHouseReceipt({
        variant: "handback",
        inspection: null,
      });
      expect(gate.allowed).toBe(false);
      expect(gate.allowed === false && gate.reason).toBe("NOT_INSPECTED");
    });

    it("refuses when the inspection exists but is not finished", () => {
      const gate = canPrintHouseReceipt({
        variant: "handback",
        inspection: { resolvedTo: null, completedAt: null },
      });
      expect(gate.allowed === false && gate.reason).toBe(
        "INSPECTION_INCOMPLETE",
      );
    });

    it("refuses when a resolved inspection has no completedAt", () => {
      // Defence in depth: a half-written row must not read as a finished one.
      const gate = canPrintHouseReceipt({
        variant: "handback",
        inspection: { resolvedTo: "Active", completedAt: null },
      });
      expect(gate.allowed === false && gate.reason).toBe(
        "INSPECTION_INCOMPLETE",
      );
    });

    describe("fails closed on partial data", () => {
      it("refuses an empty inspection object", () => {
        const gate = canPrintHouseReceipt({
          variant: "handback",
          inspection: {},
        });
        expect(gate.allowed).toBe(false);
      });

      it("refuses when the inspection is omitted entirely", () => {
        const gate = canPrintHouseReceipt({ variant: "handback" });
        expect(gate.allowed).toBe(false);
      });
    });

    it("always explains itself, so the UI can show a reason", () => {
      const gate = canPrintHouseReceipt({
        variant: "handback",
        inspection: null,
      });
      expect(gate.allowed === false && gate.message.length).toBeGreaterThan(20);
    });
  });
});
