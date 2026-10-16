import { describe, expect, it } from "vitest";

import { houseQueueInspectionCompleteSchema } from "@/lib/validation";
import { validateDamage } from "@/lib/house-queue/damage";

/**
 * The request schema and the damage validator are two layers of one rule, and the
 * tests pin that they agree.
 *
 * The schema cannot ask "is this part damaged?" field-by-field — that question
 * spans six fields — so it defers to `validateDamage`. These tests exist to catch
 * the failure mode where one layer is tightened and the other is not, which would
 * leave a submission the form accepted and the API refused (or worse, the
 * reverse).
 */

/** The body the form sends for a fully-OK inspection. */
const allOk = {
  checklistWindow: false,
  checklistDoor: false,
  checklistWaterPanel: false,
  checklistRoof: false,
  checklistWall: false,
  checklistElectricity: false,
};

/** Run both layers, the way the route does. */
function submit(body: Record<string, unknown>) {
  const parsed = houseQueueInspectionCompleteSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false as const,
      errors: parsed.error.issues.map((i) => i.message),
    };
  }
  const d = parsed.data;
  const state = {
    checklistWindow: d.checklistWindow,
    checklistDoor: d.checklistDoor,
    checklistWaterPanel: d.checklistWaterPanel,
    checklistRoof: d.checklistRoof,
    checklistWall: d.checklistWall,
    checklistElectricity: d.checklistElectricity,
  };
  const damage = validateDamage(state, {
    costWindow: d.costWindow,
    costDoor: d.costDoor,
    costWaterPanel: d.costWaterPanel,
    costRoof: d.costRoof,
    costWall: d.costWall,
    costElectricity: d.costElectricity,
  });
  return damage.errors.length > 0
    ? { ok: false as const, errors: damage.errors }
    : { ok: true as const, totalCost: damage.totalCost, lines: damage.lines };
}

describe("completing an inspection — server validation", () => {
  it("accepts a clean all-OK submission with a total of 0.00", () => {
    const result = submit({ ...allOk, conditionNote: "All good." });
    expect(result.ok).toBe(true);
    expect(result.totalCost).toBe(0);
    expect(result.lines).toEqual([]);
  });

  it("rejects a damaged item with no cost", () => {
    const result = submit({ ...allOk, checklistWindow: true });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/Window is marked damaged/);
  });

  it("rejects a damaged item whose cost field was left blank", () => {
    const result = submit({ ...allOk, checklistRoof: true, costRoof: "" });
    expect(result.ok).toBe(false);
  });

  it("rejects a cost with three decimals rather than rounding it", () => {
    const result = submit({
      ...allOk,
      checklistDoor: true,
      costDoor: "10.999",
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/at most 2 decimals/);
  });

  it("rejects a negative or non-numeric cost", () => {
    expect(submit({ ...allOk, checklistWall: true, costWall: "-5" }).ok).toBe(
      false,
    );
    expect(submit({ ...allOk, checklistWall: true, costWall: "abc" }).ok).toBe(
      false,
    );
  });

  it("ignores a cost sent for an OK part instead of billing it", () => {
    const result = submit({ ...allOk, costWall: "750.00" });
    expect(result.ok).toBe(true);
    expect(result.totalCost).toBe(0);
  });

  it("accepts costs as strings or numbers and totals them the same", () => {
    const asStrings = submit({
      ...allOk,
      checklistWindow: true,
      costWindow: "1250.50",
    });
    const asNumbers = submit({
      ...allOk,
      checklistWindow: true,
      costWindow: 1250.5,
    });
    expect(asStrings.totalCost).toBe(1250.5);
    expect(asNumbers.totalCost).toBe(asStrings.totalCost);
  });

  it("totals several damaged parts exactly", () => {
    const result = submit({
      ...allOk,
      checklistWindow: true,
      costWindow: "0.10",
      checklistDoor: true,
      costDoor: "0.20",
      checklistElectricity: true,
      costElectricity: "1250.70",
    });
    expect(result.ok).toBe(true);
    // 0.10 + 0.20 + 1250.70 — exact in cents, not 1251.0000000000002.
    expect(result.totalCost).toBe(1251);
  });

  it("defaults an omitted checklist to all-OK rather than rejecting it", () => {
    // The booleans default false, so a body carrying only a note is a valid
    // "nothing was damaged" submission.
    const parsed = houseQueueInspectionCompleteSchema.safeParse({
      conditionNote: "No damage found.",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data.checklistWindow).toBe(false);
  });

  it("keeps the condition note optional", () => {
    const withNote = houseQueueInspectionCompleteSchema.safeParse({
      ...allOk,
      conditionNote: "Note text.",
    });
    expect(withNote.success).toBe(true);
    expect(withNote.data.conditionNote).toBe("Note text.");

    const without = houseQueueInspectionCompleteSchema.safeParse({ ...allOk });
    expect(without.success).toBe(true);
  });

  it("rejects a condition note past the stored column length", () => {
    const parsed = houseQueueInspectionCompleteSchema.safeParse({
      ...allOk,
      conditionNote: "x".repeat(1001),
    });
    expect(parsed.success).toBe(false);
  });
});
