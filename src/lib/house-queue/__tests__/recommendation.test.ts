import { describe, it, expect } from "vitest";
import {
  compareHouses,
  houseNumberNumeric,
  pickBestHouse,
  type HouseCandidate,
} from "../recommendation";

const house = (
  over: Partial<HouseCandidate>,
): HouseCandidate => ({
  id: over.id ?? "h1",
  houseNumber: over.houseNumber ?? "A1",
  hid: over.hid ?? "106-90-001",
  houseType: over.houseType ?? "A",
  rgType: over.rgType ?? "Regular",
  locationName: over.locationName ?? "Site 1",
  status: over.status ?? "Active",
  ...over,
});

describe("houseNumberNumeric", () => {
  it("extracts the trailing numeric part", () => {
    expect(houseNumberNumeric("SA12")).toBe(12);
    expect(houseNumberNumeric("E5")).toBe(5);
  });

  it("returns a sentinel for numbers without digits", () => {
    expect(houseNumberNumeric("GA")).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("compareHouses", () => {
  it("ranks Regular houses before Guest houses", () => {
    const regular = house({ id: "r", rgType: "Regular" });
    const guest = house({ id: "g", rgType: "Guest" });
    expect(compareHouses(regular, guest)).toBeLessThan(0);
  });

  it("ranks lower numeric house numbers earlier (A2 before A10)", () => {
    const a2 = house({ id: "a2", houseNumber: "A2" });
    const a10 = house({ id: "a10", houseNumber: "A10" });
    expect(compareHouses(a2, a10)).toBeLessThan(0);
  });

  it("ranks by location name alphabetically", () => {
    const w = house({ id: "w", locationName: "Apollo" });
    const z = house({ id: "z", locationName: "Zeus" });
    expect(compareHouses(w, z)).toBeLessThan(0);
  });

  it("anchors ties on the house hid", () => {
    const a = house({ id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", hid: "106-90-001" });
    const b = house({ id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", hid: "106-90-002" });
    expect(compareHouses(a, b)).toBeLessThan(0);
  });
});

describe("pickBestHouse", () => {
  it("returns null for an empty pool", () => {
    expect(pickBestHouse([])).toBeNull();
  });

  it("selects the deterministic best house", () => {
    const pool = [
      house({ id: "g1", houseNumber: "E1", rgType: "Guest" }),
      house({ id: "r10", houseNumber: "E10", rgType: "Regular", locationName: "Zeta" }),
      house({ id: "r2", houseNumber: "E2", rgType: "Regular", locationName: "Alpha" }),
    ];
    const best = pickBestHouse(pool);
    expect(best?.id).toBe("r2"); // Regular, earliest location, lowest number
  });

  it("is deterministic", () => {
    const pool = [1, 2, 3, 4].map((i) =>
      house({ id: `h${i}`, houseNumber: `A${i}` }),
    );
    const run1 = pickBestHouse([...pool].reverse());
    const run2 = pickBestHouse(pool);
    expect(run1?.id).toBe(run2?.id);
  });
});