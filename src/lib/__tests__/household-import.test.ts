import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ default: {} }));

vi.mock("@/lib/excel-import", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/excel-import")>();
  return { ...actual, parseWorkbook: vi.fn() };
});

import {
  autoMapHouseholdColumns,
  analyzeHouseholdWorkbook,
  buildHouseholdLookups,
  parseHouseholdImportMode,
  normalizeHouseType,
  normalizeRgType,
  type HouseholdImportMode,
  type ExistingHouseholdLite,
} from "../household-import";
import { parseWorkbook, type SheetData } from "../excel-import";

const HEADERS = [
  "Sr. No.",
  "House Number",
  "House Type",
  "Staff Category",
  "R/G Type",
  "House ID (HID)",
  "Location Name",
  "Status",
  "Bed Count",
  "Chairs Count",
  "Locker Count",
  "Tables Count",
  "Damage - Window",
  "Damage - Door",
  "Damage - Water Panel",
  "Damage - Roof",
  "Damage - Wall",
  "Damage - Electricity",
  "Damage Notes",
];

function makeSheet(
  dataRows: string[][],
  name = "House Register",
  headers: string[] = HEADERS,
): SheetData {
  return {
    name,
    rowCount: dataRows.length + 1,
    headers,
    rows: [headers, ...dataRows],
  };
}

function house(overrides: Partial<ExistingHouseholdLite> = {}): ExistingHouseholdLite {
  return {
    id: "h-" + (overrides.houseNumber ?? "A1"),
    hid: "106-90-000",
    houseNumber: "A1",
    houseType: "A",
    staffCategory: null,
    rgType: "Guest",
    locationName: null,
    status: "Active",
    bedCount: 1,
    chairsCount: 0,
    lockerCount: 0,
    tablesCount: 0,
    damageWindow: false,
    damageDoor: false,
    damageWaterPanel: false,
    damageRoof: false,
    damageWall: false,
    damageElectricity: false,
    damageNotes: null,
    isAllocated: false,
    hasOpenInspection: false,
    ...overrides,
  };
}

const row = (
  cells: string[],
): string[] => cells;

describe("household-import: auto column mapping", () => {
  it("maps the exact template headers to the correct fields", () => {
    const m = autoMapHouseholdColumns(HEADERS);
    expect(m.srNo).toBe(0);
    expect(m.houseNumber).toBe(1);
    expect(m.houseType).toBe(2);
    expect(m.staffCategory).toBe(3);
    expect(m.rgType).toBe(4);
    expect(m.hid).toBe(5);
    expect(m.locationName).toBe(6);
    expect(m.status).toBe(7);
    expect(m.bedCount).toBe(8);
    expect(m.damageWaterPanel).toBe(14);
    expect(m.damageNotes).toBe(18);
  });

  it("does not let the generic 'type' alias steal the R/G Type column", () => {
    const m = autoMapHouseholdColumns(HEADERS);
    expect(m.rgType).toBe(4);
    expect(m.houseType).toBe(2);
  });

  it("accepts common aliases (guest house, rg, house no)", () => {
    const headers = ["Row No", "House No", "Category", "Unit Type", "RG", "HID"];
    const m = autoMapHouseholdColumns(headers);
    expect(m.srNo).toBe(0);
    expect(m.houseNumber).toBe(1);
    expect(m.staffCategory).toBe(2);
    expect(m.houseType).toBe(3);
    expect(m.rgType).toBe(4);
    expect(m.hid).toBe(5);
  });
});

describe("household-import: value normalization", () => {
  it("normalizes house types, categories and R/G types", () => {
    expect(normalizeHouseType("Staff")).toBe("Staff");
    expect(normalizeHouseType("staff")).toBe("Staff");
    expect(normalizeHouseType("a")).toBe("A");
    expect(normalizeHouseType("E")).toBe("E");
    expect(normalizeHouseType("F")).toBeNull();
    expect(normalizeRgType("Regular")).toBe("Regular");
    expect(normalizeRgType("guest house")).toBe("Guest");
    expect(normalizeRgType("G")).toBe("Guest");
    expect(normalizeRgType("r")).toBe("Regular");
    expect(normalizeRgType("Other")).toBeNull();
  });
});

describe("household-import: import mode parsing", () => {
  it("accepts only add | update | add_update", () => {
    expect(parseHouseholdImportMode("add")).toBe("add");
    expect(parseHouseholdImportMode("update")).toBe("update");
    expect(parseHouseholdImportMode("add_update")).toBe("add_update");
    expect(parseHouseholdImportMode("merge")).toBeNull();
  });
});

describe("household-import: analyze & classify workbook", () => {
  const NEW_SA1 = row(["1", "SA1", "Staff", "A", "Regular", "", "Block B", "Active", "2", "0", "0", "0", "No", "No", "No", "No", "No", "No", ""]);

  it("classifies brand-new houses in add mode", async () => {
    vi.mocked(parseWorkbook).mockResolvedValueOnce([
      makeSheet([NEW_SA1, row(["2", "B2", "B", "", "Guest", "", "", "", "", "", "", "", "No", "No", "No", "No", "No", "No", ""])]),
    ]);

    const analysis = await analyzeHouseholdWorkbook(
      Buffer.from("x"),
      "houses.xlsx",
      "House Register",
      "add",
      buildHouseholdLookups([]),
    );

    expect(analysis.summary.totalRows).toBe(2);
    expect(analysis.summary.newRows).toBe(2);
    expect(analysis.summary.actionableRows).toBe(2);
    expect(analysis.errors).toHaveLength(0);
    expect(analysis.rows[0].classification).toBe("new");
    expect(analysis.rows[0].action).toBe("create");
    expect(analysis.pendingRows).toHaveLength(2);
  });

  it("marks existing houses as 'existing' (skipped) in add mode", async () => {
    vi.mocked(parseWorkbook).mockResolvedValueOnce([
      makeSheet([row(["1", "A1", "A", "", "Guest", "", "Main Block", "Active", "1", "0", "0", "0", "No", "No", "No", "No", "No", "No", ""])]),
    ]);

    const existing = buildHouseholdLookups([house()]);
    const analysis = await analyzeHouseholdWorkbook(
      Buffer.from("x"),
      "houses.xlsx",
      "House Register",
      "add",
      existing,
    );

    expect(analysis.summary.newRows).toBe(0);
    expect(analysis.summary.existingSkipped).toBe(1);
    expect(analysis.rows[0].classification).toBe("existing");
    expect(analysis.rows[0].action).toBe("skip");
    expect(analysis.pendingRows).toHaveLength(0);
  });

  it("plans updates for changed existing houses in update mode", async () => {
    vi.mocked(parseWorkbook).mockResolvedValueOnce([
      makeSheet([row(["1", "A1", "A", "", "Guest", "", "Block A", "Active", "4", "0", "0", "0", "No", "No", "No", "No", "No", "No", ""])]),
    ]);

    const analysis = await analyzeHouseholdWorkbook(
      Buffer.from("x"),
      "houses.xlsx",
      "House Register",
      "update",
      buildHouseholdLookups([house()]),
    );

    expect(analysis.summary.updateRows).toBe(1);
    expect(analysis.rows[0].classification).toBe("update");
    expect(analysis.rows[0].action).toBe("update");
    expect(analysis.pendingRows).toHaveLength(1);
    expect(analysis.pendingRows[0].action).toBe("update");
  });

  it("skips existing houses with no changes in update mode", async () => {
    vi.mocked(parseWorkbook).mockResolvedValueOnce([
      makeSheet([row(["1", "A1", "A", "", "Guest", "", "", "Active", "1", "0", "0", "0", "No", "No", "No", "No", "No", "No", ""])]),
    ]);

    const analysis = await analyzeHouseholdWorkbook(
      Buffer.from("x"),
      "houses.xlsx",
      "House Register",
      "update",
      buildHouseholdLookups([house()]),
    );

    const r = analysis.rows[0];
    expect(r.classification).toBe("update");
    expect(r.action).toBe("skip");
    expect(r.hasChanges).toBe(false);
    expect(analysis.summary.updateRows).toBe(0);
    expect(analysis.pendingRows).toHaveLength(0);
  });

  it("reports not_found houses in update mode", async () => {
    vi.mocked(parseWorkbook).mockResolvedValueOnce([
      makeSheet([row(["1", "D9", "D", "", "Regular", "", "", "Active", "", "", "", "", "No", "No", "No", "No", "No", "No", ""])]),
    ]);

    const analysis = await analyzeHouseholdWorkbook(
      Buffer.from("x"),
      "houses.xlsx",
      "House Register",
      "update",
      buildHouseholdLookups([house()]),
    );

    expect(analysis.rows[0].classification).toBe("not_found");
    expect(analysis.summary.notFoundSkipped).toBe(1);
    expect(analysis.pendingRows).toHaveLength(0);
  });

  it("rejects invalid rows with friendly messages", async () => {
    vi.mocked(parseWorkbook).mockResolvedValueOnce([
      makeSheet([
        row(["1", "F1", "A", "", "Regular", "", "", "Active", "", "", "", "", "No", "No", "No", "No", "No", "No", ""]), // bad family
        row(["2", "B1", "X", "", "Regular", "", "", "Active", "", "", "", "", "No", "No", "No", "No", "No", "No", ""]), // bad house type
        row(["3", "SA3", "Staff", "", "Regular", "", "", "Active", "", "", "", "", "No", "No", "No", "No", "No", "No", ""]), // staff without category
        row(["4", "C1", "C", "", "Regular", "", "", "Inactive", "", "", "", "", "No", "No", "No", "No", "No", "No", ""]), // inactive without damage
        row(["5", "SA4", "Staff", "C", "Regular", "", "", "Active", "-2", "", "", "", "No", "No", "No", "No", "No", "No", ""]), // negative count
      ]),
    ]);

    const analysis = await analyzeHouseholdWorkbook(
      Buffer.from("x"),
      "houses.xlsx",
      "House Register",
      "add",
      buildHouseholdLookups([]),
    );

    expect(analysis.summary.totalRows).toBe(5);
    expect(analysis.summary.invalidRows).toBe(5);
    expect(analysis.rows).toHaveLength(0);
    expect(analysis.pendingRows).toHaveLength(0);
    expect(analysis.errors.length).toBe(5);
    const joined = analysis.errors.map((e) => e.message).join("\n");
    expect(joined).toMatch(/House Number/);
    expect(joined).toMatch(/House Type|Invalid/m);
    expect(joined).toMatch(/Staff category is required/);
    expect(joined).toMatch(/Damage checklist is required/);
    expect(joined).toMatch(/Bed Count/);
    expect(analysis.summary.validRows).toBe(0);
  });

  it("detects in-file duplicates", async () => {
    vi.mocked(parseWorkbook).mockResolvedValueOnce([
      makeSheet([
        NEW_SA1,
        row(["2", "SA1", "Staff", "A", "Regular", "", "", "Active", "", "", "", "", "No", "No", "No", "No", "No", "No", ""]),
      ]),
    ]);

    const analysis = await analyzeHouseholdWorkbook(
      Buffer.from("x"),
      "houses.xlsx",
      "House Register",
      "add",
      buildHouseholdLookups([]),
    );

    expect(analysis.summary.totalRows).toBe(2);
    expect(analysis.summary.newRows).toBe(1);
    expect(analysis.summary.duplicateRows).toBe(1);
    expect(analysis.errors[0].message).toMatch(/Duplicate house number SA1/);
  });

  it("flags a provided HID already assigned to another house as a conflict", async () => {
    vi.mocked(parseWorkbook).mockResolvedValueOnce([
      makeSheet([
        row(["1", "A3", "A", "", "Guest", "106-90-050", "", "Active", "", "", "", "", "No", "No", "No", "No", "No", "No", ""]),
      ]),
    ]);

    const existing = buildHouseholdLookups([
      house({ hid: "106-90-050", houseType: "B", houseNumber: "B9" }),
    ]);

    const analysis = await analyzeHouseholdWorkbook(
      Buffer.from("x"),
      "houses.xlsx",
      "House Register",
      "add",
      existing,
    );

    expect(analysis.rows[0].classification).toBe("conflict");
    expect(analysis.rows[0].action).toBe("skip");
    expect(analysis.summary.conflictRows).toBe(1);
    expect(analysis.pendingRows).toHaveLength(0);
  });

  it("rejects deactivating an allocated house (queue owns that state)", async () => {
    vi.mocked(parseWorkbook).mockResolvedValueOnce([
      makeSheet([
        row(["1", "A1", "A", "", "Guest", "", "", "Inactive", "", "", "", "", "No", "No", "No", "No", "Yes", "No", "needs repairs"]),
      ]),
    ]);

    const existing = buildHouseholdLookups([house({ isAllocated: true })]);
    const analysis = await analyzeHouseholdWorkbook(
      Buffer.from("x"),
      "houses.xlsx",
      "House Register",
      "update",
      existing,
    );

    expect(analysis.rows[0].classification).toBe("conflict");
    expect(analysis.rows[0].action).toBe("skip");
    expect(analysis.rows[0].message).toMatch(/allocated/);
    expect(analysis.summary.conflictRows).toBe(1);
  });

  it("rejects activating a house with an open handback inspection", async () => {
    vi.mocked(parseWorkbook).mockResolvedValueOnce([
      makeSheet([
        row(["1", "A1", "A", "", "Guest", "", "", "Active", "", "", "", "", "No", "No", "No", "No", "No", "No", ""]),
      ]),
    ]);

    const existing = buildHouseholdLookups([
      house({ status: "Inactive", hasOpenInspection: true }),
    ]);
    const analysis = await analyzeHouseholdWorkbook(
      Buffer.from("x"),
      "houses.xlsx",
      "House Register",
      "update",
      existing,
    );

    expect(analysis.rows[0].classification).toBe("conflict");
    expect(analysis.rows[0].message).toMatch(/handback inspection|inspection/i);
  });

  it("accepts an Inactive house when a damage item is marked", async () => {
    vi.mocked(parseWorkbook).mockResolvedValueOnce([
      makeSheet([
        row(["1", "C1", "C", "", "Regular", "", "", "Inactive", "", "", "", "", "No", "No", "No", "Yes", "No", "No", "roof leak"]),
      ]),
    ]);

    const analysis = await analyzeHouseholdWorkbook(
      Buffer.from("x"),
      "houses.xlsx",
      "House Register",
      "add",
      buildHouseholdLookups([]),
    );

    expect(analysis.errors).toHaveLength(0);
    expect(analysis.rows[0].classification).toBe("new");
    expect(analysis.summary.newRows).toBe(1);
  });
});

describe("household-import: mode + lookups edge cases", () => {
  it("throws when the file has no readable worksheets", async () => {
    vi.mocked(parseWorkbook).mockResolvedValueOnce([]);

    await expect(
      analyzeHouseholdWorkbook(
        Buffer.from("x"),
        "houses.xlsx",
        undefined,
        "add" as HouseholdImportMode,
        buildHouseholdLookups([]),
      ),
    ).rejects.toThrow(/no readable worksheets/i);
  });
});