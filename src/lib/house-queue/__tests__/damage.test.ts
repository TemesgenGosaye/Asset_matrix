import { describe, it, expect } from "vitest";

import {
  DAMAGE_ITEMS,
  formatEtb,
  parseCostCents,
  runningDamageTotal,
  validateDamage,
  wrapNoteForPrint,
  type DamageCosts,
  type DamageState,
} from "../damage";

/**
 * The handback damage checklist is money on a signed document, so these tests are
 * about the ways a naive implementation gets it wrong:
 *
 *  - A damaged part with a blank or mistyped cost must be REFUSED, not recorded
 *    as free. `Number("")` is 0 and `Number("abc")` is NaN, so a coercion-based
 *    check silently bills the factory nothing.
 *  - Switching a part back to OK must drop its cost. A figure left in a hidden
 *    field is the classic way an undamaged part still gets charged, and a hidden
 *    input is not an absent one — it still submits.
 *  - The total must be computed in integer cents. `0.1 + 0.2` is the reason.
 *  - The same validator runs on the client and the server, so "the form accepted
 *    it" and "the API accepted it" cannot be different statements.
 */

/** Build the state map from part keys, the way the form holds it. */
function state(...damaged: string[]): DamageState {
  return Object.fromEntries(
    DAMAGE_ITEMS.map((i) => [i.stateKey, damaged.includes(i.key)]),
  );
}

/** Build the cost map from part keys, the way the form holds it. */
function costs(entries: Record<string, string>): DamageCosts {
  return Object.fromEntries(
    DAMAGE_ITEMS.map((i) => [i.costKey, entries[i.key]]),
  );
}

describe("checklist taxonomy", () => {
  it("covers every damaged part the house registry records", () => {
    // The registry (Household.damage*) is the authority on which parts exist. If
    // a part is added there and not here, a handback could record damage the
    // register cannot store, and the receipt could print a row nothing backs.
    expect(DAMAGE_ITEMS.map((i) => i.key)).toEqual([
      "window",
      "door",
      "waterPanel",
      "roof",
      "wall",
      "electricity",
    ]);
  });

  it("pairs each part with a distinct state column and cost column", () => {
    const stateKeys = DAMAGE_ITEMS.map((i) => i.stateKey);
    const costKeys = DAMAGE_ITEMS.map((i) => i.costKey);
    expect(new Set(stateKeys).size).toBe(DAMAGE_ITEMS.length);
    expect(new Set(costKeys).size).toBe(DAMAGE_ITEMS.length);
  });

  it("gives every part an Amharic label for the bilingual receipt", () => {
    for (const item of DAMAGE_ITEMS) {
      expect(item.labelAm.length).toBeGreaterThan(0);
    }
  });
});

describe("parseCostCents", () => {
  it("accepts plain and two-decimal amounts", () => {
    expect(parseCostCents("1250")).toBe(125000);
    expect(parseCostCents("1250.5")).toBe(125050);
    expect(parseCostCents("1250.50")).toBe(125050);
    expect(parseCostCents(1250.5)).toBe(125050);
  });

  it("reads a Prisma Decimal's string form", () => {
    // The DB read path must not need its own parser.
    expect(parseCostCents({ toString: () => "990.25" })).toBe(99025);
  });

  it("rejects blank, negative, non-numeric and over-precise input", () => {
    expect(parseCostCents("")).toBeNull();
    expect(parseCostCents("   ")).toBeNull();
    expect(parseCostCents(null)).toBeNull();
    expect(parseCostCents(undefined)).toBeNull();
    expect(parseCostCents("-5")).toBeNull();
    expect(parseCostCents("abc")).toBeNull();
    expect(parseCostCents("1,250")).toBeNull();
    expect(parseCostCents(Number.NaN)).toBeNull();
    // Three decimals is refused rather than rounded: a rounded figure on a
    // receipt is worse than a refused submission.
    expect(parseCostCents("10.999")).toBeNull();
  });
});

describe("validateDamage — a damaged part needs a valid cost", () => {
  it("refuses a damaged part with no cost", () => {
    const result = validateDamage(state("window"), costs({}));
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/Window is marked damaged/);
  });

  it("refuses a blank cost field the same way as a missing one", () => {
    // The distinction a naive check misses: `Number("")` is 0.
    const result = validateDamage(state("door"), costs({ door: "" }));
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
  });

  it("refuses a non-numeric cost rather than reading it as zero", () => {
    const result = validateDamage(state("roof"), costs({ roof: "abc" }));
    expect(result.ok).toBe(false);
  });

  it("refuses a zero cost — damaged is never free", () => {
    const result = validateDamage(state("wall"), costs({ wall: "0" }));
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/at least 0\.01/);
  });

  it("reports every unusable part at once, not just the first", () => {
    const result = validateDamage(
      state("window", "roof", "electricity"),
      costs({ roof: "0" }),
    );
    expect(result.errors).toHaveLength(3);
  });

  it("withholds the total entirely when anything is invalid", () => {
    // Partial data must not be usable: a caller that forgot to check `errors`
    // would otherwise persist a half-assessed damage bill.
    const result = validateDamage(
      state("window", "roof"),
      costs({ window: "100.00" }),
    );
    expect(result.ok).toBe(false);
    expect(result.lines).toEqual([]);
    expect(result.totalCost).toBe(0);
  });
});

describe("validateDamage — an OK part carries no cost", () => {
  it("ignores a cost left on a part that is OK", () => {
    // The window is damaged and priced; the wall still carries a stale figure
    // from before it was switched back to OK. That figure must not be billed.
    const result = validateDamage(
      state("window"),
      costs({ window: "300.00", wall: "999.00" }),
    );
    expect(result.ok).toBe(true);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].key).toBe("window");
    expect(result.totalCost).toBe(300);
  });

  it("keeps the part OK rather than resurrecting it as damaged", () => {
    const result = validateDamage(state(), costs({ door: "500.00" }));
    expect(result.ok).toBe(true);
    expect(result.damagedCount).toBe(0);
    expect(result.totalCost).toBe(0);
  });
});

describe("total cost", () => {
  it("sums the damaged parts", () => {
    const result = validateDamage(
      state("window", "wall"),
      costs({ window: "1200.00", wall: "450.50" }),
    );
    expect(result.totalCost).toBe(1650.5);
    expect(result.damagedCount).toBe(2);
  });

  it("is exact where float addition would drift", () => {
    // 0.1 + 0.2 === 0.30000000000000004 in IEEE-754. Printed on a receipt and
    // compared against a stored total, that is a disputed document.
    const result = validateDamage(
      state("window", "door", "roof"),
      costs({ window: "0.10", door: "0.20", roof: "0.30" }),
    );
    expect(result.totalCost).toBe(0.6);
    expect(formatEtb(result.totalCost)).toBe("0.60 ETB");
  });

  it("groups thousands in the printed figure", () => {
    const result = validateDamage(
      state("window"),
      costs({ window: "1250000.5" }),
    );
    expect(formatEtb(result.totalCost)).toBe("1,250,000.50 ETB");
  });

  it("is 0 when nothing is damaged", () => {
    const result = validateDamage(state(), costs({}));
    expect(result.totalCost).toBe(0);
    expect(result.lines).toEqual([]);
    expect(formatEtb(result.totalCost)).toBe("0.00 ETB");
  });

  it("lists damaged parts in registry order, not the order entered", () => {
    const result = validateDamage(
      state("electricity", "window"),
      costs({ electricity: "10.00", window: "20.00" }),
    );
    expect(result.lines.map((l) => l.key)).toEqual(["window", "electricity"]);
  });
});

describe("runningDamageTotal — the figure shown while filling the form", () => {
  it("totals the parts already priced", () => {
    expect(
      runningDamageTotal(state("window", "door"), {
        costWindow: "100.00",
        costDoor: "50.00",
      }),
    ).toBe(150);
  });

  it("excludes a damaged part still being typed rather than counting it as 0", () => {
    // Mid-edit the total would otherwise flicker down to a smaller number that
    // looks like an error.
    expect(
      runningDamageTotal(state("window", "door"), {
        costWindow: "100.00",
        costDoor: "",
      }),
    ).toBe(100);
    expect(
      runningDamageTotal(state("window", "door"), {
        costWindow: "100.00",
        costDoor: "12.",
      }),
    ).toBe(100);
  });

  it("never throws, whatever the field holds", () => {
    expect(runningDamageTotal(state("window"), { costWindow: "abc" })).toBe(0);
    expect(runningDamageTotal(state("window"), { costWindow: {} })).toBe(0);
  });
});

describe("wrapNoteForPrint — keeping the receipt to one A4 page", () => {
  it("wraps a short note onto one line per line", () => {
    expect(wrapNoteForPrint("Two broken panes in the kitchen.").lines).toEqual([
      "Two broken panes in the kitchen.",
    ]);
    expect(wrapNoteForPrint("Two broken panes in the kitchen.").truncated).toBe(
      false,
    );
  });

  it("treats an empty or whitespace note as no note at all", () => {
    for (const value of ["", "   ", null, undefined]) {
      expect(wrapNoteForPrint(value).lines).toEqual([]);
      expect(wrapNoteForPrint(value).truncated).toBe(false);
    }
  });

  it("wraps a long note at word boundaries", () => {
    const note = "a".repeat(30) + " " + "b".repeat(30);
    const printed = wrapNoteForPrint(note, { maxCharsPerLine: 20 });
    expect(printed.lines).toEqual([
      "a".repeat(20),
      "aaaaaaaaaa",
      "b".repeat(20),
      "b".repeat(10),
    ]);
    expect(printed.truncated).toBe(false);
  });

  it("hard-splits a single over-long word instead of overflowing the cell", () => {
    const printed = wrapNoteForPrint("x".repeat(25), { maxCharsPerLine: 10 });
    expect(printed.lines).toEqual(["x".repeat(10), "x".repeat(10), "xxxxx"]);
  });

  it("clips to the line budget and marks the note as continued", () => {
    // 20 words at ~5 chars each wraps to well over 4 lines of 20 characters.
    const printed = wrapNoteForPrint("word ".repeat(20), {
      maxCharsPerLine: 20,
      maxLines: 3,
    });
    expect(printed.lines).toHaveLength(3);
    // The reader must be able to tell a short note from a shortened one.
    expect(printed.truncated).toBe(true);
  });

  it("keeps a note that just fits unmarked", () => {
    const printed = wrapNoteForPrint("word ".repeat(3), { maxLines: 3 });
    expect(printed.truncated).toBe(false);
  });
});
