import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The termination receipt is a signed document, so the tests are about the two
 * promises that make a document trustworthy:
 *
 *  1. It cannot be produced before the evidence exists. A receipt printed over an
 *     unfinished inspection asserts a handback that did not happen, so the gate
 *     runs first and a blocked print writes nothing.
 *  2. A reprint reproduces the original. The snapshot is taken once and never
 *     rewritten — not even when the underlying inspection has since changed,
 *     which is the case that makes "reprint from the live row" wrong.
 */

const { client, houseInspection, houseTerminationReceipt } = vi.hoisted(() => {
  const houseInspection = { findFirst: vi.fn() };
  const houseTerminationReceipt = {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
  // `$extends` because `api-route` pulls in the auth chain, which wraps the
  // client with a session extension at import time. Returning the same object
  // keeps the mock self-referential, as the other house-queue view tests do.
  const client = {
    houseInspection,
    houseTerminationReceipt,
    $extends: vi.fn(() => client),
  };
  return { client, houseInspection, houseTerminationReceipt };
});

vi.mock("@/lib/prisma", () => ({ default: client }));

import { getOrCreateTerminationReceipt } from "../receipt";

const ORG = "11111111-1111-1111-1111-111111111111";
const INSPECTION = "22222222-2222-2222-2222-222222222222";
const ALLOCATION = "33333333-3333-3333-3333-333333333333";
const HOUSEHOLD = "44444444-4444-4444-4444-444444444444";
const USER = "55555555-5555-5555-5555-555555555555";

/** A completed inspection with two damaged parts, priced. */
function completedInspection(overrides: Record<string, unknown> = {}) {
  return {
    id: INSPECTION,
    allocationId: ALLOCATION,
    householdId: HOUSEHOLD,
    resolvedTo: "UnderMaintenance",
    completedAt: new Date("2026-10-01T09:00:00.000Z"),
    conditionNote: "Two panes replaced at handback.",
    checklistWindow: true,
    checklistDoor: false,
    checklistWaterPanel: false,
    checklistRoof: false,
    checklistWall: true,
    checklistElectricity: false,
    costWindow: "1250.5",
    costDoor: "0",
    costWaterPanel: "0",
    costRoof: "0",
    costWall: "99.5",
    costElectricity: "0",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  houseTerminationReceipt.findFirst.mockResolvedValue(null);
  houseTerminationReceipt.create.mockImplementation(({ data }) =>
    Promise.resolve({ receiptNo: data.receiptNo, printCount: 1 }),
  );
  houseTerminationReceipt.update.mockResolvedValue({});
});

describe("getOrCreateTerminationReceipt — blocked before completion", () => {
  it("refuses an inspection that does not exist, and writes nothing", async () => {
    houseInspection.findFirst.mockResolvedValue(null);

    const { gate, snapshot } = await getOrCreateTerminationReceipt({
      organizationId: ORG,
      inspectionId: INSPECTION,
      printedBy: USER,
    });

    expect(gate.allowed).toBe(false);
    expect(gate.reason).toBe("NOT_INSPECTED");
    expect(snapshot).toBeNull();
    expect(houseTerminationReceipt.create).not.toHaveBeenCalled();
  });

  it("refuses an unfinished inspection and writes nothing", async () => {
    houseInspection.findFirst.mockResolvedValue(
      completedInspection({ resolvedTo: null, completedAt: null }),
    );

    const { gate, snapshot } = await getOrCreateTerminationReceipt({
      organizationId: ORG,
      inspectionId: INSPECTION,
      printedBy: USER,
    });

    expect(gate.allowed).toBe(false);
    expect(gate.reason).toBe("INSPECTION_INCOMPLETE");
    expect(snapshot).toBeNull();
    // The gate must run before the write, or a refused print still leaves a
    // receipt row that a later reader could mistake for one that was issued.
    expect(houseTerminationReceipt.create).not.toHaveBeenCalled();
  });

  it("still allows printing for a completed damaged handback", async () => {
    // The release was finalised by the same completion, so the paperwork is
    // exactly as printable as a clean one.
    houseInspection.findFirst.mockResolvedValue(completedInspection());

    const { gate } = await getOrCreateTerminationReceipt({
      organizationId: ORG,
      inspectionId: INSPECTION,
      printedBy: USER,
    });

    expect(gate.allowed).toBe(true);
  });

  it("scopes the read to the caller's organization", async () => {
    houseInspection.findFirst.mockResolvedValue(completedInspection());

    await getOrCreateTerminationReceipt({
      organizationId: ORG,
      inspectionId: INSPECTION,
      printedBy: USER,
    });

    expect(houseInspection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: INSPECTION, organizationId: ORG },
      }),
    );
  });
});

describe("getOrCreateTerminationReceipt — the damage it prints", () => {
  it("lists only the damaged parts, each with its cost, plus the total", async () => {
    houseInspection.findFirst.mockResolvedValue(completedInspection());

    const { snapshot } = await getOrCreateTerminationReceipt({
      organizationId: ORG,
      inspectionId: INSPECTION,
      printedBy: USER,
    });

    expect(snapshot.damageLines.map((l) => l.key)).toEqual(["window", "wall"]);
    expect(snapshot.damageLines[0].cost).toBe("1,250.50");
    expect(snapshot.damageLines[1].cost).toBe("99.50");
    // 1250.50 + 99.50 — the stored total is written beside the lines, never
    // recomputed at print time.
    expect(snapshot.totalDamageCost).toBe("1,350.00");
  });

  it("prints an explicit no-damage total rather than an empty table", async () => {
    houseInspection.findFirst.mockResolvedValue(
      completedInspection({
        checklistWindow: false,
        checklistWall: false,
        costWindow: "0",
        costWall: "0",
      }),
    );

    const { snapshot } = await getOrCreateTerminationReceipt({
      organizationId: ORG,
      inspectionId: INSPECTION,
      printedBy: USER,
    });

    expect(snapshot.damageLines).toEqual([]);
    expect(snapshot.totalDamageCost).toBe("0.00");
  });

  it("carries the condition note, and null when there is none", async () => {
    houseInspection.findFirst.mockResolvedValue(completedInspection());
    const withNote = await getOrCreateTerminationReceipt({
      organizationId: ORG,
      inspectionId: INSPECTION,
      printedBy: USER,
    });
    expect(withNote.snapshot.conditionNote).toBe(
      "Two panes replaced at handback.",
    );

    houseTerminationReceipt.findFirst.mockResolvedValue(null);
    houseInspection.findFirst.mockResolvedValue(
      completedInspection({ conditionNote: null }),
    );
    const withoutNote = await getOrCreateTerminationReceipt({
      organizationId: ORG,
      inspectionId: INSPECTION,
      printedBy: USER,
    });
    expect(withoutNote.snapshot.conditionNote).toBeNull();
  });

  it("freezes the damage lines into the stored snapshot", async () => {
    houseInspection.findFirst.mockResolvedValue(completedInspection());

    await getOrCreateTerminationReceipt({
      organizationId: ORG,
      inspectionId: INSPECTION,
      printedBy: USER,
    });

    expect(houseTerminationReceipt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          inspectionId: INSPECTION,
          allocationId: ALLOCATION,
          householdId: HOUSEHOLD,
          totalDamageCost: 1350,
          damageSnapshot: [
            expect.objectContaining({ key: "window", cost: "1,250.50" }),
            expect.objectContaining({ key: "wall", cost: "99.50" }),
          ],
        }),
      }),
    );
  });
});

describe("getOrCreateTerminationReceipt — reprint matches the original", () => {
  it("returns the stored snapshot and never rewrites it", async () => {
    houseInspection.findFirst.mockResolvedValue(completedInspection());
    houseTerminationReceipt.findFirst.mockResolvedValue({
      receiptNo: "HTR-202610-AAAA",
      printedAt: new Date("2026-10-02T08:00:00.000Z"),
      printCount: 1,
      // Deliberately different from the live inspection: this is what a reprint
      // must print, not what the inspection says now.
      damageSnapshot: [
        { key: "window", label: "Window", labelAm: "መስኮት", cost: "1,000.00" },
      ],
      totalDamageCost: "1000.00",
      conditionNote: "As printed originally.",
    });

    const { snapshot } = await getOrCreateTerminationReceipt({
      organizationId: ORG,
      inspectionId: INSPECTION,
      printedBy: USER,
    });

    expect(snapshot.isOriginal).toBe(false);
    expect(snapshot.receiptNo).toBe("HTR-202610-AAAA");
    expect(snapshot.damageLines).toEqual([
      { key: "window", label: "Window", labelAm: "መስኮት", cost: "1,000.00" },
    ]);
    expect(snapshot.totalDamageCost).toBe("1,000.00");
    expect(snapshot.conditionNote).toBe("As printed originally.");
    // The first print stands: a second row would give one house two receipts.
    expect(houseTerminationReceipt.create).not.toHaveBeenCalled();
  });

  it("counts a reprint without altering its contents", async () => {
    houseInspection.findFirst.mockResolvedValue(completedInspection());
    houseTerminationReceipt.findFirst.mockResolvedValue({
      receiptNo: "HTR-202610-AAAA",
      printedAt: new Date("2026-10-02T08:00:00.000Z"),
      printCount: 2,
      damageSnapshot: [],
      totalDamageCost: "0.00",
      conditionNote: null,
    });

    const { snapshot } = await getOrCreateTerminationReceipt({
      organizationId: ORG,
      inspectionId: INSPECTION,
      printedBy: USER,
    });

    expect(houseTerminationReceipt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { inspectionId: INSPECTION, organizationId: ORG },
        data: { printCount: { increment: 1 }, printedBy: USER },
      }),
    );
    expect(snapshot.printCount).toBe(3);
    expect(snapshot.printedAt).toBe("2026-10-02T08:00:00.000Z");
  });

  it("marks the first print as the original", async () => {
    houseInspection.findFirst.mockResolvedValue(completedInspection());

    const { snapshot } = await getOrCreateTerminationReceipt({
      organizationId: ORG,
      inspectionId: INSPECTION,
      printedBy: USER,
    });

    expect(snapshot.isOriginal).toBe(true);
    expect(snapshot.printCount).toBe(1);
    expect(snapshot.receiptNo).toMatch(/^HTR-\d{6}-[0-9A-F]{4}$/);
  });

  it("scopes the snapshot lookup to the caller's organization", async () => {
    houseInspection.findFirst.mockResolvedValue(completedInspection());
    houseTerminationReceipt.findFirst.mockResolvedValue({
      receiptNo: "HTR-202610-AAAA",
      printedAt: new Date("2026-10-02T08:00:00.000Z"),
      printCount: 1,
      damageSnapshot: [],
      totalDamageCost: "0.00",
      conditionNote: null,
    });

    await getOrCreateTerminationReceipt({
      organizationId: ORG,
      inspectionId: INSPECTION,
      printedBy: USER,
    });

    expect(houseTerminationReceipt.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { inspectionId: INSPECTION, organizationId: ORG },
      }),
    );
  });
});

describe("getOrCreateTerminationReceipt — a corrupt snapshot is refused, not printed", () => {
  it("throws rather than printing a partial damage list", async () => {
    // A JSON column can be edited by hand or mangled by a migration. Printing
    // fewer rows than were signed off is worse than refusing to print.
    houseInspection.findFirst.mockResolvedValue(completedInspection());
    houseTerminationReceipt.findFirst.mockResolvedValue({
      receiptNo: "HTR-202610-AAAA",
      printedAt: new Date("2026-10-02T08:00:00.000Z"),
      printCount: 1,
      damageSnapshot: "not-an-array",
      totalDamageCost: "0.00",
      conditionNote: null,
    });

    await expect(
      getOrCreateTerminationReceipt({
        organizationId: ORG,
        inspectionId: INSPECTION,
        printedBy: USER,
      }),
    ).rejects.toThrow(/unreadable/);
  });

  it("drops a malformed line but keeps the well-formed ones", async () => {
    houseInspection.findFirst.mockResolvedValue(completedInspection());
    houseTerminationReceipt.findFirst.mockResolvedValue({
      receiptNo: "HTR-202610-AAAA",
      printedAt: new Date("2026-10-02T08:00:00.000Z"),
      printCount: 1,
      damageSnapshot: [
        { key: "window", label: "Window", labelAm: "መስኮት", cost: "500.00" },
        { key: "junk" },
        null,
      ],
      totalDamageCost: "500.00",
      conditionNote: null,
    });

    const { snapshot } = await getOrCreateTerminationReceipt({
      organizationId: ORG,
      inspectionId: INSPECTION,
      printedBy: USER,
    });

    expect(snapshot.damageLines).toHaveLength(1);
    expect(snapshot.damageLines[0].cost).toBe("500.00");
  });
});
