// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

import {
  DamageChecklistEditor,
  DamageChecklistReadonly,
  emptyDamageChecklist,
  type DamageChecklistValues,
} from "../DamageChecklist";
import { DAMAGE_ITEMS, validateDamage } from "@/lib/house-queue/damage";

/**
 * The handback checklist form, driven as a person drives it.
 *
 * The behaviour that matters most here cannot be seen in a snapshot: switching a
 * part back to OK must DELETE its cost, not merely hide it. A hidden input still
 * submits, so a stale figure left in state is both the reason an undamaged part
 * reaches an invoice and a value the server would otherwise have to guess about.
 * That is a click, so this file needs a DOM.
 *
 * Assertions are on what a person reads (text) and on the values handed back to
 * the parent, not on class names.
 */

function values(
  damaged: string[],
  costs: Record<string, string> = {},
): DamageChecklistValues {
  return {
    state: Object.fromEntries(
      DAMAGE_ITEMS.map((i) => [i.key, damaged.includes(i.key)]),
    ),
    costs: Object.fromEntries(DAMAGE_ITEMS.map((i) => [i.key, costs[i.key]])),
  };
}

/** Render the editor as a controlled component and capture every change. */
function renderEditor(initial: DamageChecklistValues) {
  const changes: DamageChecklistValues[] = [];
  function Harness() {
    const [v, setV] = React.useState(initial);
    return (
      <DamageChecklistEditor
        values={v}
        onChange={(next) => {
          changes.push(next);
          setV(next);
        }}
      />
    );
  }
  render(<Harness />);
  return { changes, latest: () => changes[changes.length - 1] };
}

/** Click the OK/Damaged toggle on a part's row. */
function toggle(partKey: string) {
  const row = Array.from(document.querySelectorAll("li")).find((li) =>
    li.textContent?.includes(labelFor(partKey)),
  );
  if (!row) throw new Error(`no row for ${partKey}`);
  const btn = row.querySelector("button");
  if (!btn) throw new Error(`no toggle for ${partKey}`);
  fireEvent.click(btn);
}

function labelFor(partKey: string): string {
  const item = DAMAGE_ITEMS.find((i) => i.key === partKey);
  if (!item) throw new Error(`unknown part ${partKey}`);
  return item.label;
}

function costInput(partKey: string): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(`#damage-cost-${partKey}`);
}

function textOf(node: ParentNode): string {
  return (node.textContent ?? "").replace(/\s+/g, " ").trim();
}

describe("DamageChecklistEditor — a damaged item shows and requires its cost", () => {
  it("starts every registry part at OK, with no cost inputs", () => {
    renderEditor(values([]));
    for (const item of DAMAGE_ITEMS) {
      expect(screen.getByText(item.label)).toBeTruthy();
    }
    for (const item of DAMAGE_ITEMS) {
      expect(costInput(item.key)).toBeNull();
    }
  });

  it("reveals the cost input for a part marked Damaged", () => {
    renderEditor(values([]));
    toggle("window");

    expect(costInput("window")).not.toBeNull();
    // Only the part that was marked.
    expect(costInput("door")).toBeNull();
    expect(costInput("roof")).toBeNull();
  });

  it("accepts a cost and folds it into the running total", () => {
    renderEditor(values([]));
    toggle("window");
    fireEvent.change(costInput("window")!, { target: { value: "1250.50" } });
    toggle("wall");
    fireEvent.change(costInput("wall")!, { target: { value: "99.50" } });

    // 1250.50 + 99.50, computed in cents.
    expect(textOf(document.body)).toContain("1,350.00 ETB");
  });

  it("flags a damaged part whose cost is left blank", () => {
    renderEditor(values([]));
    toggle("roof");

    expect(textOf(document.body)).toContain("A damaged roof needs a cost");
  });

  it("flags a zero cost as unusable", () => {
    renderEditor(values([]));
    toggle("door");
    fireEvent.change(costInput("door")!, { target: { value: "0" } });

    expect(textOf(document.body)).toContain("needs a cost");
  });

  it("stops flagging once a usable cost is entered", () => {
    renderEditor(values([]));
    toggle("roof");
    fireEvent.change(costInput("roof")!, { target: { value: "250.00" } });

    expect(textOf(document.body)).not.toContain("needs a cost");
  });

  it("says damage sends the house to maintenance, and clean does not", () => {
    renderEditor(values([]));
    expect(textOf(document.body)).toContain("resolve back to Active");
    toggle("wall");
    expect(textOf(document.body)).toContain("Under Maintenance");
  });
});

describe("DamageChecklistEditor — switching back to OK clears the cost", () => {
  it("deletes the cost when the part is switched back to OK", () => {
    const { latest } = renderEditor(values(["window"], { window: "1250.50" }));
    expect(costInput("window")?.value).toBe("1250.50");

    toggle("window");

    expect(latest().state.window).toBe(false);
    expect(latest().costs.window).toBeUndefined();
    // Not merely hidden — gone, so it cannot be submitted.
    expect("window" in latest().costs).toBe(false);
    expect(costInput("window")).toBeNull();
  });

  it("leaves other parts' costs and states alone", () => {
    const { latest } = renderEditor(
      values(["window", "wall"], { window: "1250.50", wall: "99.50" }),
    );

    toggle("window");

    expect(latest().costs.wall).toBe("99.50");
    expect(latest().state.wall).toBe(true);
    expect(latest().costs.window).toBeUndefined();
  });

  it("keeps the part OK rather than resurrecting it as damaged", () => {
    const { latest } = renderEditor(values(["window"], { window: "500.00" }));
    toggle("window");

    const stateMap = Object.fromEntries(
      DAMAGE_ITEMS.map((i) => [i.stateKey, latest().state[i.key]]),
    );
    const costMap = Object.fromEntries(
      DAMAGE_ITEMS.map((i) => [i.costKey, latest().costs[i.key]]),
    );
    const result = validateDamage(stateMap, costMap);

    expect(result.damagedCount).toBe(0);
    expect(result.totalCost).toBe(0);
  });

  it("means the cleared figure can never reach the total", () => {
    const { latest } = renderEditor(
      values(["window", "wall"], { window: "1250.50", wall: "99.50" }),
    );
    toggle("window");

    const result = validateDamage(
      Object.fromEntries(
        DAMAGE_ITEMS.map((i) => [i.stateKey, latest().state[i.key]]),
      ),
      Object.fromEntries(
        DAMAGE_ITEMS.map((i) => [i.costKey, latest().costs[i.key]]),
      ),
    );

    expect(result.totalCost).toBe(99.5);
    expect(result.lines.map((l) => l.key)).toEqual(["wall"]);
  });
});

describe("DamageChecklistReadonly — a completed inspection is frozen", () => {
  function renderReadonly(
    damaged: string[],
    costs: Record<string, string>,
    note?: string | null,
  ) {
    return render(
      <DamageChecklistReadonly
        state={Object.fromEntries(
          DAMAGE_ITEMS.map((i) => [i.stateKey, damaged.includes(i.key)]),
        )}
        costs={Object.fromEntries(
          DAMAGE_ITEMS.map((i) => [i.costKey, costs[i.key]]),
        )}
        conditionNote={note}
      />,
    );
  }

  /** Click a damaged part's disclosure chip to reveal its cost. */
  function reveal(partKey: string) {
    const row = Array.from(document.querySelectorAll("li")).find((li) =>
      li.textContent?.includes(labelFor(partKey)),
    );
    const btn = row?.querySelector("button");
    if (!btn) throw new Error(`no disclosure control for ${partKey}`);
    fireEvent.click(btn);
  }

  it("exposes nothing editable — the only controls are disclosure chips", () => {
    // The read-only guarantee is structural: the component takes no setter, so
    // it cannot be made editable by wiring something up later. Opening a row must
    // not introduce the means to change one.
    renderReadonly(["window"], { window: "500.00" }, "Note.");
    expect(document.querySelectorAll("input, textarea, select").length).toBe(0);
    for (const btn of Array.from(document.querySelectorAll("button"))) {
      expect(btn.hasAttribute("aria-expanded")).toBe(true);
    }
  });

  it("lists every part, marking the damaged ones and the sound ones", () => {
    // An inspection assesses all six parts, so the column shows all six: what was
    // found broken, and what was checked and found sound. A reader cannot tell
    // "checked and fine" from "never looked at" if undamaged parts are omitted.
    renderReadonly(["window", "wall"], { window: "1250.50", wall: "99.50" });
    const text = textOf(document.body);

    for (const item of DAMAGE_ITEMS) {
      expect(text).toContain(item.label);
    }
    expect(text).toContain("2 of 6 parts damaged");
  });

  it("holds each cost back until its damaged part is clicked", () => {
    // Six money figures at once is what makes the column unreadable in a
    // worklist. The figure is one click away and still stated exactly.
    renderReadonly(["window", "wall"], { window: "1250.50", wall: "99.50" });
    expect(textOf(document.body)).not.toContain("1,250.50 ETB");

    reveal("window");
    expect(textOf(document.body)).toContain("1,250.50 ETB");
    // Opening one part does not open the rest.
    expect(textOf(document.body)).not.toContain("99.50 ETB");
  });

  it("closes a revealed cost again on a second click", () => {
    renderReadonly(["window"], { window: "1250.50" });
    reveal("window");
    expect(textOf(document.body)).toContain("Repair cost");

    reveal("window");
    // The summary total is unchanged — only the per-part breakdown closes.
    expect(textOf(document.body)).not.toContain("Repair cost");
    expect(textOf(document.body)).toContain("1,250.50 ETB");
  });

  it("still totals every damaged part, revealed or not", () => {
    renderReadonly(["window", "wall"], { window: "1250.50", wall: "99.50" });
    expect(textOf(document.body)).toContain("1,350.00 ETB");
  });

  it("marks a sound part as sound and owing nothing", () => {
    renderReadonly(["window"], { window: "1250.50" });
    const text = textOf(document.body);
    // Five sound parts, one damaged.
    expect(text.match(/No Damage/g)?.length).toBe(DAMAGE_ITEMS.length - 1);
    expect(text.match(/Damaged/g)?.length).toBe(1);
  });

  it("states the no-damage total when nothing is damaged", () => {
    renderReadonly([], {});
    const text = textOf(document.body);
    expect(text).toContain("No damage recorded");
    expect(text).toContain("0.00 ETB");
  });

  it("shows a damaged part with no cost as unpriced rather than hiding it", () => {
    // Such a row predates cost recording. Dropping it would hide damage that was
    // genuinely recorded and quietly shrink the total.
    renderReadonly(["roof"], {});
    expect(textOf(document.body)).toContain("Roof");

    reveal("roof");
    const text = textOf(document.body);
    expect(text).toContain("Repair cost");
    expect(text).toContain("Not recorded");
  });

  it("shows the note, or an explicit no-note line", () => {
    renderReadonly([], {}, "Two panes replaced.");
    expect(textOf(document.body)).toContain("Two panes replaced.");

    renderReadonly([], {}, null);
    expect(textOf(document.body)).toContain("No note");
  });

  it("treats a whitespace-only note as no note", () => {
    renderReadonly([], {}, "   ");
    expect(textOf(document.body)).toContain("No note");
  });

  it("carries the Amharic label for every part it lists", () => {
    renderReadonly(["window"], { window: "500.00" });
    for (const item of DAMAGE_ITEMS) {
      expect(textOf(document.body)).toContain(item.labelAm);
    }
  });
});

describe("emptyDamageChecklist", () => {
  it("starts from all-OK with no costs", () => {
    const fresh = emptyDamageChecklist();
    const result = validateDamage(
      Object.fromEntries(
        DAMAGE_ITEMS.map((i) => [i.stateKey, fresh.state[i.key]]),
      ),
      fresh.costs,
    );
    expect(result.ok).toBe(true);
    expect(result.totalCost).toBe(0);
    expect(result.damagedCount).toBe(0);
  });
});
