import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { TerminationCopy } from "../AllocationReceiptPrint";
import type { ReceiptDetail } from "../AllocationReceiptPrint";
import { RECEIPT_COPY } from "@/lib/house-queue/damage";

/**
 * Renders the termination receipt and asserts on its markup.
 *
 * This is the document a person signs, so the assertions are about what a reader
 * can and cannot conclude from the page: which damage is listed, whether the
 * total agrees with the rows above it, and whether an absent value is stated
 * plainly rather than left as a blank that could read as "not recorded".
 *
 * The print portal and the page-count measurement are out of scope here (the
 * latter needs a real layout engine); what is checked is the content and the
 * bilingual labelling that has to survive onto the form.
 */

const employee = {
  firstname: "Aster",
  lastname: "Bekele",
  employeeNumber: "EMP-0042",
  department: { name: "Factory Maintenance" },
};

function render(terminationReceipt: ReceiptDetail["terminationReceipt"]) {
  return renderToStaticMarkup(
    <TerminationCopy
      detail={{
        allocationId: "alloc-1",
        status: "terminated",
        terminatedAt: "2026-10-01T09:00:00.000Z",
        house: { houseNumber: "12" },
        employee,
        terminationReceipt,
      }}
      formNo="OF/MSF/HRSM/293"
      date="2026-10-02"
    />,
  );
}

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    receiptNo: "HTR-202610-AAAA",
    damageLines: [],
    totalDamageCost: "0.00",
    conditionNote: null,
    completedAt: "2026-10-01T09:00:00.000Z",
    printedAt: "2026-10-02T08:00:00.000Z",
    printCount: 1,
    isOriginal: true,
    ...overrides,
  };
}

/** Text content of the markup, with tags stripped and whitespace collapsed. */
function textOf(markup: string): string {
  return markup
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

describe("termination receipt — damage checklist", () => {
  it("prints the bilingual section heading", () => {
    const markup = render(
      snapshot({
        damageLines: [
          { key: "window", label: "Window", labelAm: "መስኮት", cost: "1,250.50" },
        ],
        totalDamageCost: "1,250.50",
      }) as ReceiptDetail["terminationReceipt"],
    );
    expect(textOf(markup)).toContain(RECEIPT_COPY.damageChecklistTitle);
  });

  it("lists only the damaged parts, each with its cost", () => {
    const markup = render(
      snapshot({
        damageLines: [
          { key: "window", label: "Window", labelAm: "መስኮት", cost: "1,250.50" },
          { key: "wall", label: "Wall", labelAm: "ግድል", cost: "99.50" },
        ],
        totalDamageCost: "1,350.00",
      }) as ReceiptDetail["terminationReceipt"],
    );
    const text = textOf(markup);

    expect(text).toContain("Window");
    expect(text).toContain("1,250.50");
    expect(text).toContain("Wall");
    expect(text).toContain("99.50");

    // Only damaged parts: an undamaged part must not appear as a row.
    for (const undamaged of ["Door", "Roof", "Electricity", "Water panel"]) {
      expect(text).not.toContain(undamaged);
    }
  });

  it("prints the total damage cost alongside the rows", () => {
    const markup = render(
      snapshot({
        damageLines: [
          { key: "window", label: "Window", labelAm: "መስኮት", cost: "1,250.50" },
        ],
        totalDamageCost: "1,250.50",
      }) as ReceiptDetail["terminationReceipt"],
    );
    const text = textOf(markup);
    expect(text).toContain(RECEIPT_COPY.totalDamage);
    expect(text).toContain("1,250.50");
  });

  it("states the no-damage line and a 0.00 total when nothing is damaged", () => {
    // "Nothing here" and "nothing was recorded" are different statements; only
    // the second is evidence, so the line is explicit.
    const markup = render(snapshot() as ReceiptDetail["terminationReceipt"]);
    const text = textOf(markup);

    expect(text).toContain(RECEIPT_COPY.noDamage);
    expect(text).toContain(RECEIPT_COPY.totalDamage);
    expect(text).toContain("0.00");
    expect(text).not.toContain("Not priced");
  });

  it("omits the damage section entirely when no snapshot was supplied", () => {
    // There is nothing truthful to print, so it is absent rather than guessed.
    const markup = render(null);
    const text = textOf(markup);
    expect(text).not.toContain(RECEIPT_COPY.damageChecklistTitle);
    expect(text).not.toContain(RECEIPT_COPY.noDamage);
  });

  it("labels each damaged part in Amharic as well as English", () => {
    const markup = render(
      snapshot({
        damageLines: [
          { key: "window", label: "Window", labelAm: "መስኮት", cost: "500.00" },
        ],
        totalDamageCost: "500.00",
      }) as ReceiptDetail["terminationReceipt"],
    );
    expect(textOf(markup)).toContain("መስኮት");
  });
});

/**
 * The list is the part of the form a reader checks before signing, so it is laid
 * out as a ruled schedule rather than loose rows: a numbered index they can cite,
 * a count of what was found, and one total band that is visibly the sum of the
 * rows above it.
 */
describe("termination receipt — damaged items schedule", () => {
  const twoParts = snapshot({
    damageLines: [
      { key: "window", label: "Window", labelAm: "መስኮት", cost: "1,250.50" },
      { key: "wall", label: "Wall", labelAm: "ግድል", cost: "99.50" },
    ],
    totalDamageCost: "1,350.00",
  }) as ReceiptDetail["terminationReceipt"];

  it("numbers the rows so a part can be cited while the receipt is disputed", () => {
    const markup = render(twoParts);
    const rows = [...markup.matchAll(/<td[^>]*>\s*(\d+)\s*<\/td>/g)].map(
      (m) => m[1],
    );
    // One row number per damaged part, in order, and no more.
    expect(rows).toEqual(["1", "2"]);
  });

  it("states how many parts were found, in the section band", () => {
    const text = textOf(render(twoParts));
    expect(text).toContain(`${RECEIPT_COPY.partsCountLabel} 2`);
  });

  it("marks up the columns as real table headers", () => {
    // A header row is what lets the schedule be read aloud, re-typeset or
    // re-implemented without guessing which column is the money.
    const markup = render(twoParts);
    expect(markup).toContain('scope="col"');
    expect(markup).toContain('scope="colgroup"');
  });

  it("keeps the total in its own footer band rather than as another row", () => {
    const markup = render(twoParts);
    const totalIndex = markup.indexOf(RECEIPT_COPY.totalDamage);
    expect(markup.indexOf("<tfoot>")).toBeGreaterThan(-1);
    expect(totalIndex).toBeGreaterThan(markup.indexOf("<tbody>"));
    expect(markup.lastIndexOf("</table>")).toBeGreaterThan(totalIndex);
  });

  it("still totals a nil assessment rather than leaving the figure blank", () => {
    const markup = render(snapshot() as ReceiptDetail["terminationReceipt"]);
    const text = textOf(markup);
    expect(text).toContain(RECEIPT_COPY.noDamage);
    expect(text).toContain(RECEIPT_COPY.totalDamage);
    expect(text).toContain("0.00");
  });
});

describe("termination receipt — condition note", () => {
  it("prints the note under its bilingual heading", () => {
    const markup = render(
      snapshot({
        conditionNote: "Two panes replaced at handback.",
      }) as ReceiptDetail["terminationReceipt"],
    );
    const text = textOf(markup);

    expect(text).toContain(RECEIPT_COPY.conditionNoteTitle);
    expect(text).toContain("Two panes replaced at handback.");
    expect(text).not.toContain(RECEIPT_COPY.noNote);
  });

  it("prints the explicit no-note line when the note is empty", () => {
    for (const value of [null, "", "   "]) {
      const markup = render(
        snapshot({
          conditionNote: value,
        }) as ReceiptDetail["terminationReceipt"],
      );
      const text = textOf(markup);
      expect(text).toContain(RECEIPT_COPY.conditionNoteTitle);
      expect(text).toContain(RECEIPT_COPY.noNote);
    }
  });

  it("marks a clipped note as continued rather than silently cutting it", () => {
    // The receipt is one A4 page. A note long enough to overflow is marked, so a
    // reader can tell a short note from a shortened one.
    const markup = render(
      snapshot({
        conditionNote: "cracked glazing ".repeat(200),
      }) as ReceiptDetail["terminationReceipt"],
    );
    const text = textOf(markup);

    expect(text).toContain(RECEIPT_COPY.continued);
    expect(text).toContain("ቀጥላ ይቀጥላል");
  });

  it("does not mark a short note as continued", () => {
    const markup = render(
      snapshot({
        conditionNote: "Minor scuffing.",
      }) as ReceiptDetail["terminationReceipt"],
    );
    expect(textOf(markup)).not.toContain(RECEIPT_COPY.continued);
  });
});

describe("termination receipt — reprint", () => {
  it("marks a reprint and its print number", () => {
    // Two documents with the same receipt number must be tellable apart, or one
    // of them gets passed off as the original.
    const markup = render(
      snapshot({
        isOriginal: false,
        printCount: 3,
      }) as ReceiptDetail["terminationReceipt"],
    );
    const text = textOf(markup);
    expect(text).toContain("REPRINT");
    expect(text).toContain("#3");
  });

  it("does not mark the original as a reprint", () => {
    const markup = render(snapshot() as ReceiptDetail["terminationReceipt"]);
    expect(textOf(markup)).not.toContain("REPRINT");
  });

  it("prints exactly what the snapshot holds, not what the inspection says now", () => {
    // This is the whole point of snapshotting: the numbers on the paper are the
    // numbers that were on the paper the first time.
    const markup = render(
      snapshot({
        damageLines: [
          { key: "window", label: "Window", labelAm: "መስኮት", cost: "1,000.00" },
        ],
        totalDamageCost: "1,000.00",
      }) as ReceiptDetail["terminationReceipt"],
    );
    const text = textOf(markup);
    expect(text).toContain("1,000.00");
    expect(text).not.toContain("1,250.50");
  });
});

describe("termination receipt — the rest of the form still prints", () => {
  it("keeps the employee, house and form number on the page", () => {
    const markup = render(snapshot() as ReceiptDetail["terminationReceipt"]);
    const text = textOf(markup);
    expect(text).toContain("Aster Bekele");
    expect(text).toContain("12");
    expect(text).toContain("OF/MSF/HRSM/293");
    // The factory footer is what makes the form usable in the field.
    expect(text).toContain("PLEASE MAKE SURE THAT THIS IS THE CORRECT ISSUE");
  });
});
