import { describe, it, expect, vi, beforeEach } from "vitest";

const client = vi.hoisted(() => ({
  employee: { findMany: vi.fn() },
  household: { findMany: vi.fn() },
  houseAllocation: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ default: client }));

import { computeHouseQueue } from "../engine";
import prisma from "@/lib/prisma";

const mockPrisma = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
});

const emp = (over: Record<string, unknown>) => ({
  id: "e1",
  employeeNumber: `${(over.employeeNumber as string) ?? ""}`,
  firstname: "Alice",
  lastname: "One",
  jobGrade: null,
  gender: "female",
  maritalStatus: "married",
  disabilityStatus: false,
  hireDate: new Date("2020-01-01"),
  ...over,
});

const house = (over: Record<string, unknown>) => ({
  id: "h1",
  houseNumber: "A1",
  hid: "106-90-001",
  houseType: "Staff",
  rgType: "Regular",
  locationName: "Site A",
  status: "Active",
  ...over,
});

function seed({
  employees = [],
  households = [],
  allocations = [],
}: {
  employees?: Record<string, unknown>[];
  households?: Record<string, unknown>[];
  allocations?: Record<string, unknown>[];
}) {
  mockPrisma.employee.findMany.mockResolvedValue(employees);
  mockPrisma.household.findMany.mockResolvedValue(households);
  mockPrisma.houseAllocation.findMany.mockResolvedValue(allocations);
}

describe("computeHouseQueue", () => {
  it("derives one row per employee with correct category and status", async () => {
    seed({
      employees: [
        emp({ id: "e1", employeeNumber: "EMP001", jobGrade: 18 }),
        emp({ id: "e2", employeeNumber: "EMP002", jobGrade: 7 }),
        emp({ id: "e4", employeeNumber: "EMP004", jobGrade: null }),
      ],
      households: [
        house({ id: "hs1", houseNumber: "SA1", hid: "106-90-001", houseType: "Staff" }),
        house({ id: "hd1", houseNumber: "D1", hid: "106-90-010", houseType: "D" }),
      ],
      allocations: [],
    });

    const result = await computeHouseQueue("o1");
    expect(result.rows).toHaveLength(3);

    const r1 = result.rows.find((r) => r.employeeId === "e1")!;
    expect(r1.houseCategory).toBe("Staff");
    expect(r1.queueStatus).toBe("ready_for_allocation");
    expect(r1.recommendedHouseId).toBe("hs1");

    const r3 = result.rows.find((r) => r.employeeId === "e4")!;
    expect(r3.houseCategory).toBeNull();
    expect(r3.queueStatus).toBe("not_eligible");
    expect(r3.recommendedHouseId).toBeNull();
    expect(r3.mcdScore).toBeNull();
  });

  it("marks a live allocation as allocated and excludes its house from the pool", async () => {
    seed({
      employees: [
        emp({ id: "e1", employeeNumber: "EMP001", jobGrade: 18 }),
        emp({ id: "e2", employeeNumber: "EMP002", jobGrade: 18 }),
      ],
      households: [
        house({ id: "hs1", houseNumber: "SA1", hid: "106-90-001", houseType: "Staff" }),
        house({ id: "hs2", houseNumber: "SA2", hid: "106-90-002", houseType: "Staff" }),
      ],
      allocations: [
        { id: "al1", employeeId: "e2", householdId: "hs2", status: "allocated", reason: null },
      ],
    });

    const result = await computeHouseQueue("o1");
    const e1 = result.rows.find((r) => r.employeeId === "e1")!;
    const e2 = result.rows.find((r) => r.employeeId === "e2")!;

    expect(e1.queueStatus).toBe("ready_for_allocation");
    expect(e1.recommendedHouseId).toBe("hs1"); // hs2 already allocated
    expect(e2.queueStatus).toBe("allocated");
    expect(e2.recommendedHouseId).toBe("hs2"); // snapshot of the ledger decision
  });

  it("recomputes live score/rank and applies the persisted reason", async () => {
    seed({
      employees: [emp({ id: "e1", employeeNumber: "EMP001", jobGrade: 12 })],
      households: [house({ id: "hb1", houseNumber: "B1", hid: "106-90-020", houseType: "B" })],
      allocations: [
        {
          id: "al1",
          employeeId: "e1",
          householdId: "hb1",
          status: "allocated",
          mcdScore: 0.42, // ledger snapshot is NOT trusted for the live view
          priorityRank: 1,
          reason: "approved",
          decidedAt: new Date("2026-01-01"),
          decidedBy: null,
        },
      ],
    });

    const result = await computeHouseQueue("o1");
    const row = result.rows[0];
    expect(row.mcdScore).not.toBe(0.42); // recomputed from live attributes
    expect(row.priorityRank).toBe(1);
    expect(row.note).toBe("approved");
    expect(row.recommendedHouseId).toBe("hb1");
  });

  it("applies org scoping to every query", async () => {
    seed({ employees: [], households: [], allocations: [] });
    await computeHouseQueue("org-42");

    expect(mockPrisma.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: "org-42" }) }),
    );
    expect(mockPrisma.household.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: "org-42" }) }),
    );
    expect(mockPrisma.houseAllocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: "org-42" }) }),
    );
  });

  it("supports grade, status and search filters as display filters", async () => {
    seed({
      employees: [
        emp({ id: "e1", employeeNumber: "EMP001", jobGrade: 18 }),
        emp({ id: "e2", employeeNumber: "EMP002", jobGrade: 7 }),
      ],
      households: [
        house({ id: "hs1", houseNumber: "SA1", hid: "106-90-001", houseType: "Staff" }),
        house({ id: "hd1", houseNumber: "D1", hid: "106-90-010", houseType: "D" }),
      ],
      allocations: [],
    });

    const byGrade = await computeHouseQueue("o1", { grade: 18 });
    expect(byGrade.rows.map((r) => r.employeeId)).toEqual(["e1"]);

    const bySearch = await computeHouseQueue("o1", { search: "EMP002" });
    expect(bySearch.rows.map((r) => r.employeeId)).toEqual(["e2"]);

    const byStatus = await computeHouseQueue("o1", { status: "ready_for_allocation" });
    expect(byStatus.rows.map((r) => r.employeeId).sort()).toEqual(["e1", "e2"]);
  });

  it("builds grade groups, availability and summary", async () => {
    seed({
      employees: [
        emp({ id: "e1", employeeNumber: "EMP001", jobGrade: 18 }),
        emp({ id: "e2", employeeNumber: "EMP002", jobGrade: 7 }),
        emp({ id: "e4", employeeNumber: "EMP004", jobGrade: null }),
      ],
      households: [
        house({ id: "hd1", houseNumber: "D1", hid: "106-90-010", houseType: "D" }),
        house({ id: "hd2", houseNumber: "D2", hid: "106-90-011", houseType: "D" }),
      ],
      allocations: [],
    });

    const result = await computeHouseQueue("o1");

    expect(result.gradeGroups.map((g) => g.grade)).toEqual([18, 7, null]);
    expect(result.gradeGroups[0].category).toBe("Staff");
    expect(result.gradeGroups[0].total).toBe(1);
    expect(result.gradeGroups[1].category).toBe("D");

    const staffAvail = result.availability.find((a) => a.category === "Staff");
    expect(staffAvail).toMatchObject({ category: "Staff", totalActive: 0, available: 0 });
    const dAvail = result.availability.find((a) => a.category === "D");
    expect(dAvail).toMatchObject({ category: "D", totalActive: 2, available: 2 });

    expect(result.summary).toMatchObject({
      totalEmployees: 3,
      eligibleCount: 2,
      allocatedCount: 0,
      // grade-18 employee has no Staff house available → no_house_available
      readyCount: 1,
      noHouseCount: 1,
      notEligibleCount: 1,
    });
  });
});