import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    household: {
      findMany: vi.fn(),
    },
  },
}));

import prisma from "@/lib/prisma";
import {
  validateHouseIdFormat,
  generateNextHID,
  getHouseNumberPrefix,
  validateHouseNumberFormat,
  isValidHouseNumberFamily,
  getHouseNumberFamily,
} from "../household";
import {
  HOUSE_NUMBER_FAMILY_REGEX,
  HOUSEHOLD_HID_REGEX,
} from "../household-constants";

describe("House ID Format & Generation (106-90-XXX)", () => {
  describe("validateHouseIdFormat", () => {
    it("validates correct 106-90-XXX format", () => {
      expect(validateHouseIdFormat("106-90-000")).toBe(true);
      expect(validateHouseIdFormat("106-90-001")).toBe(true);
      expect(validateHouseIdFormat("106-90-042")).toBe(true);
      expect(validateHouseIdFormat("106-90-100")).toBe(true);
      expect(validateHouseIdFormat("106-90-1000")).toBe(true);
    });

    it("rejects invalid formats", () => {
      expect(validateHouseIdFormat("HID-0001")).toBe(false);
      expect(validateHouseIdFormat("msfh-900-001-")).toBe(false);
      expect(validateHouseIdFormat("106-90-01")).toBe(false);
      expect(validateHouseIdFormat("106-90-")).toBe(false);
      expect(validateHouseIdFormat("106-91-000")).toBe(false);
      expect(validateHouseIdFormat("random-id")).toBe(false);
    });
  });

  describe("generateNextHID", () => {
    it("starts at 106-90-000 when no houses exist", async () => {
      vi.mocked(prisma.household.findMany).mockResolvedValueOnce([]);

      const nextHid = await generateNextHID("org-123");
      expect(nextHid).toBe("106-90-000");
    });

    it("increments sequentially based on existing highest 106-90-XXX ID", async () => {
      vi.mocked(prisma.household.findMany).mockResolvedValueOnce([
        { hid: "106-90-000" } as any,
        { hid: "106-90-001" } as any,
      ]);

      const nextHid = await generateNextHID("org-123");
      expect(nextHid).toBe("106-90-002");
    });

    it("ignores old format IDs and starts at 106-90-000 if no new format IDs exist", async () => {
      vi.mocked(prisma.household.findMany).mockResolvedValueOnce([
        { hid: "HID-0001" } as any,
        { hid: "msfh-900-001-" } as any,
      ]);

      const nextHid = await generateNextHID("org-123");
      expect(nextHid).toBe("106-90-000");
    });

    it("safely extracts max number when mixed old and new IDs exist", async () => {
      vi.mocked(prisma.household.findMany).mockResolvedValueOnce([
        { hid: "msfh-900-001-" } as any,
        { hid: "106-90-005" } as any,
        { hid: "106-90-002" } as any,
      ]);

      const nextHid = await generateNextHID("org-123");
      expect(nextHid).toBe("106-90-006");
    });

    it("handles large numbers correctly (e.g. 106-90-100)", async () => {
      vi.mocked(prisma.household.findMany).mockResolvedValueOnce([
        { hid: "106-90-099" } as any,
      ]);

      const nextHid = await generateNextHID("org-123");
      expect(nextHid).toBe("106-90-100");
    });
  });

  describe("House Number Prefix & Format", () => {
    it("generates correct prefix for Staff categories", () => {
      expect(getHouseNumberPrefix("Staff", "A")).toBe("SA");
      expect(getHouseNumberPrefix("Staff", "B")).toBe("SB");
      expect(getHouseNumberPrefix("Staff", "E")).toBe("SE");
    });

    it("generates correct prefix for regular categories", () => {
      expect(getHouseNumberPrefix("A")).toBe("A");
      expect(getHouseNumberPrefix("B")).toBe("B");
      expect(getHouseNumberPrefix("C")).toBe("C");
    });

    it("validates house number matching prefix", () => {
      expect(validateHouseNumberFormat("SA1", "Staff", "A").valid).toBe(true);
      expect(validateHouseNumberFormat("SA12", "Staff", "A").valid).toBe(true);
      expect(validateHouseNumberFormat("SB1", "Staff", "A").valid).toBe(false);
      expect(validateHouseNumberFormat("B1", "B").valid).toBe(true);
      expect(validateHouseNumberFormat("A5", "B").valid).toBe(false);
    });

    it("enforces strict house-number families (SA-SE and A-E only)", () => {
      // Valid Staff families
      expect(isValidHouseNumberFamily("SA1")).toBe(true);
      expect(isValidHouseNumberFamily("SB10")).toBe(true);
      expect(isValidHouseNumberFamily("SC3")).toBe(true);
      expect(isValidHouseNumberFamily("SD20")).toBe(true);
      expect(isValidHouseNumberFamily("SE99")).toBe(true);

      // Valid regular category families
      expect(isValidHouseNumberFamily("A1")).toBe(true);
      expect(isValidHouseNumberFamily("B42")).toBe(true);
      expect(isValidHouseNumberFamily("C7")).toBe(true);
      expect(isValidHouseNumberFamily("D15")).toBe(true);
      expect(isValidHouseNumberFamily("E3")).toBe(true);

      // Rejected families (outside SA-SE and A-E)
      expect(isValidHouseNumberFamily("SF1")).toBe(false);
      expect(isValidHouseNumberFamily("F1")).toBe(false);
      expect(isValidHouseNumberFamily("G2")).toBe(false);
      expect(isValidHouseNumberFamily("P1")).toBe(false);
      expect(isValidHouseNumberFamily("Q3")).toBe(false);
      expect(isValidHouseNumberFamily("T5")).toBe(false);
      expect(isValidHouseNumberFamily("S1")).toBe(false); // S without category letter
      expect(isValidHouseNumberFamily("123")).toBe(false);
      expect(isValidHouseNumberFamily("SA")).toBe(false); // missing digits
      expect(isValidHouseNumberFamily("A")).toBe(false);

      // Family extraction
      expect(getHouseNumberFamily("SA12")).toBe("SA");
      expect(getHouseNumberFamily("se5")).toBe("SE");
      expect(getHouseNumberFamily("B9")).toBe("B");
      expect(getHouseNumberFamily("F1")).toBe(null);
    });

    it("rejects unknown house types or missing staff categories", () => {
      expect(() => getHouseNumberPrefix("Staff")).toThrow(
        /Staff category .* is required/i,
      );
      expect(() => getHouseNumberPrefix("Staff", "X")).toThrow(
        /Staff category .* is required/i,
      );
      expect(() => getHouseNumberPrefix("F")).toThrow(/Invalid house type/i);
      expect(() => getHouseNumberPrefix("Unknown")).toThrow(/Invalid house type/i);
    });

    it("matches canonical HID pattern", () => {
      expect(HOUSEHOLD_HID_REGEX.test("106-90-001")).toBe(true);
      expect(HOUSEHOLD_HID_REGEX.test("106-90-999")).toBe(true);
      expect(HOUSEHOLD_HID_REGEX.test("106-90-1000")).toBe(true);
      expect(HOUSEHOLD_HID_REGEX.test("HID-0002-mtr9m91y-c1eb48")).toBe(false);
      expect(HOUSEHOLD_HID_REGEX.test("106-90-1")).toBe(false);
      expect(HOUSEHOLD_HID_REGEX.test("invalid")).toBe(false);
    });
  });
});
