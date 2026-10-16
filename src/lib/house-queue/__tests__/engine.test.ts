import { describe, it, expect, vi, beforeEach } from "vitest";

const client = vi.hoisted(() => ({
  employee: { findMany: vi.fn() },
  household: { findMany: vi.fn() },
  houseAllocation: { findMany: vi.fn() },
  houseRequest: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ default: client }));

import {
  buildGradeGroups,
  computeHouseQueue,
  pickEarliestRequestByEmployee,
} from "../engine";
import { DEFAULT_ENGINE_CONFIG } from "../config/types";
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

/** A live request admitting one employee to the queue. */
const request = (employeeId: string, over: Record<string, unknown> = {}) => ({
  id: `req-${employeeId}`,
  employeeId,
  createdAt: new Date("2026-09-20T08:00:00Z"),
  ...over,
});

/**
 * Seed the four source queries.
 *
 * `requests` defaults to one live request per employee, because that is the
 * contract every other assertion in this file is built on: the queue only ever
 * ranks employees who asked for a house. Pass an explicit array (including `[]`)
 * to test the gate itself.
 */
function seed({
  employees = [],
  households = [],
  allocations = [],
  requests,
}: {
  employees?: Record<string, unknown>[];
  households?: Record<string, unknown>[];
  allocations?: Record<string, unknown>[];
  requests?: Record<string, unknown>[];
}) {
  mockPrisma.employee.findMany.mockResolvedValue(employees);
  mockPrisma.household.findMany.mockResolvedValue(households);
  mockPrisma.houseAllocation.findMany.mockResolvedValue(allocations);
  mockPrisma.houseRequest.findMany.mockResolvedValue(
    requests ?? employees.map((e) => request(e.id as string)),
  );
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
        house({
          id: "hs1",
          houseNumber: "SA1",
          hid: "106-90-001",
          houseType: "Staff",
        }),
        house({
          id: "hd1",
          houseNumber: "D1",
          hid: "106-90-010",
          houseType: "D",
        }),
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
        house({
          id: "hs1",
          houseNumber: "SA1",
          hid: "106-90-001",
          houseType: "Staff",
        }),
        house({
          id: "hs2",
          houseNumber: "SA2",
          hid: "106-90-002",
          houseType: "Staff",
        }),
      ],
      allocations: [
        {
          id: "al1",
          employeeId: "e2",
          householdId: "hs2",
          status: "allocated",
          reason: null,
        },
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
      households: [
        house({
          id: "hb1",
          houseNumber: "B1",
          hid: "106-90-020",
          houseType: "B",
        }),
      ],
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
    seed({ employees: [], households: [], allocations: [], requests: [] });
    await computeHouseQueue("org-42");

    expect(mockPrisma.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: "org-42" }),
      }),
    );
    expect(mockPrisma.household.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: "org-42" }),
      }),
    );
    expect(mockPrisma.houseAllocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: "org-42" }),
      }),
    );
    expect(mockPrisma.houseRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org-42",
          status: "submitted",
        }),
      }),
    );
  });

  it("supports grade, status and search filters as display filters", async () => {
    seed({
      employees: [
        emp({ id: "e1", employeeNumber: "EMP001", jobGrade: 18 }),
        emp({ id: "e2", employeeNumber: "EMP002", jobGrade: 7 }),
      ],
      households: [
        house({
          id: "hs1",
          houseNumber: "SA1",
          hid: "106-90-001",
          houseType: "Staff",
        }),
        house({
          id: "hd1",
          houseNumber: "D1",
          hid: "106-90-010",
          houseType: "D",
        }),
      ],
      allocations: [],
    });

    const byGrade = await computeHouseQueue("o1", { grade: 18 });
    expect(byGrade.rows.map((r) => r.employeeId)).toEqual(["e1"]);

    const bySearch = await computeHouseQueue("o1", { search: "EMP002" });
    expect(bySearch.rows.map((r) => r.employeeId)).toEqual(["e2"]);

    const byStatus = await computeHouseQueue("o1", {
      status: "ready_for_allocation",
    });
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
        house({
          id: "hd1",
          houseNumber: "D1",
          hid: "106-90-010",
          houseType: "D",
        }),
        house({
          id: "hd2",
          houseNumber: "D2",
          hid: "106-90-011",
          houseType: "D",
        }),
      ],
      allocations: [],
    });

    const result = await computeHouseQueue("o1");

    expect(result.gradeGroups.map((g) => g.grade)).toEqual([18, 7, null]);
    expect(result.gradeGroups[0].category).toBe("Staff");
    expect(result.gradeGroups[0].total).toBe(1);
    expect(result.gradeGroups[1].category).toBe("D");

    const staffAvail = result.availability.find((a) => a.category === "Staff");
    expect(staffAvail).toMatchObject({
      category: "Staff",
      totalActive: 0,
      available: 0,
    });
    const dAvail = result.availability.find((a) => a.category === "D");
    expect(dAvail).toMatchObject({
      category: "D",
      totalActive: 2,
      available: 2,
    });

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

// ---------------------------------------------------------------------------
// Queue entry gate — only employees who submitted a request are listed
// ---------------------------------------------------------------------------

describe("computeHouseQueue — request gate", () => {
  it("returns no rows when nobody has submitted a request", async () => {
    seed({
      employees: [
        emp({ id: "e1", employeeNumber: "EMP001", jobGrade: 18 }),
        emp({ id: "e2", employeeNumber: "EMP002", jobGrade: 7 }),
      ],
      households: [
        house({
          id: "hs1",
          houseNumber: "SA1",
          hid: "106-90-001",
          houseType: "Staff",
        }),
      ],
      allocations: [],
      requests: [],
    });

    const result = await computeHouseQueue("o1");

    expect(result.rows).toEqual([]);
    expect(result.gradeGroups).toEqual([]);
    // House availability is a property of the register, not of the queue, so it
    // survives an empty queue — the allocator still needs to see stock.
    expect(
      result.availability.find((a) => a.category === "Staff"),
    ).toMatchObject({
      totalActive: 1,
      available: 1,
    });
    expect(result.summary.totalEmployees).toBe(0);
  });

  it("excludes an employee who has no request while keeping the ones who do", async () => {
    seed({
      employees: [
        emp({ id: "e1", employeeNumber: "EMP001", jobGrade: 18 }),
        emp({ id: "e2", employeeNumber: "EMP002", jobGrade: 18 }),
        emp({ id: "e3", employeeNumber: "EMP003", jobGrade: 18 }),
      ],
      households: [
        house({
          id: "hs1",
          houseNumber: "SA1",
          hid: "106-90-001",
          houseType: "Staff",
        }),
        house({
          id: "hs2",
          houseNumber: "SA2",
          hid: "106-90-002",
          houseType: "Staff",
        }),
      ],
      allocations: [],
      requests: [request("e1"), request("e3")],
    });

    const result = await computeHouseQueue("o1");

    expect(result.rows.map((r) => r.employeeId).sort()).toEqual(["e1", "e3"]);
    expect(result.rows.find((r) => r.employeeId === "e2")).toBeUndefined();
  });

  it("never recommends a house to a non-requester", async () => {
    seed({
      employees: [
        emp({ id: "e1", employeeNumber: "EMP001", jobGrade: 18 }),
        emp({ id: "e2", employeeNumber: "EMP002", jobGrade: 18 }),
      ],
      households: [
        house({
          id: "hs1",
          houseNumber: "SA1",
          hid: "106-90-001",
          houseType: "Staff",
        }),
      ],
      allocations: [],
      requests: [request("e2")],
    });

    const result = await computeHouseQueue("o1");
    expect(result.rows).toHaveLength(1);
    // The single Staff house goes to the requester, not to the higher-ranked
    // non-requester.
    expect(result.rows[0].employeeId).toBe("e2");
    expect(result.rows[0].recommendedHouseId).toBe("hs1");
  });

  it("carries the request reference onto each row", async () => {
    seed({
      employees: [emp({ id: "e1", employeeNumber: "EMP001", jobGrade: 18 })],
      households: [
        house({ id: "hs1", houseNumber: "SA1", houseType: "Staff" }),
      ],
      allocations: [],
      requests: [
        request("e1", {
          id: "req-real",
          createdAt: new Date("2026-09-25T09:30:00Z"),
        }),
      ],
    });

    const result = await computeHouseQueue("o1");
    expect(result.rows[0].requestId).toBe("req-real");
    expect(result.rows[0].requestSubmittedAt).toBe("2026-09-25T09:30:00.000Z");
  });

  it("only reads submitted requests, so a cancelled one does not resurrect a row", async () => {
    seed({
      employees: [emp({ id: "e1", employeeNumber: "EMP001", jobGrade: 18 })],
      households: [],
      allocations: [],
      requests: [],
    });
    await computeHouseQueue("o1");

    // The gate is applied in SQL, so the cancelled row never reaches the engine.
    expect(mockPrisma.houseRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "submitted" }),
      }),
    );
  });

  it("keeps an allocated requester visible in their band", async () => {
    seed({
      employees: [emp({ id: "e1", employeeNumber: "EMP001", jobGrade: 18 })],
      households: [
        house({ id: "hs1", houseNumber: "SA1", houseType: "Staff" }),
      ],
      allocations: [
        {
          id: "al1",
          employeeId: "e1",
          householdId: "hs1",
          status: "allocated",
          reason: null,
        },
      ],
    });

    const result = await computeHouseQueue("o1");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].queueStatus).toBe("allocated");
    expect(result.gradeGroups[0].grade).toBe(18);
    expect(result.gradeGroups[0].category).toBe("Staff");
    expect(result.gradeGroups[0].allocated).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Per-grade cohort grouping (Engine A's axis)
// ---------------------------------------------------------------------------

describe("buildGradeGroups - job grade intervals", () => {
  const row = (over: Record<string, unknown>) =>
    ({
      srNo: 0,
      employeeId: "x",
      employeeNumber: "EMP",
      firstname: "A",
      lastname: "B",
      jobGrade: null,
      gender: null,
      maritalStatus: null,
      disabilityStatus: false,
      serviceYears: 0,
      hireDate: null,
      familySize: null,
      houseCategory: null,
      mcdScore: null,
      cohortSize: 1,
      mcdComponents: null,
      priorityRank: null,
      queueStatus: "waiting",
      allocationStatus: null,
      isAllocated: false,
      recommendedHouseId: null,
      recommendedHouseNumber: null,
      recommendedHid: null,
      recommendedLocation: null,
      note: null,
      requestId: "r",
      requestSubmittedAt: null,
      ...over,
    }) as never;

  /**
   * The grouping axis is the JOB GRADE INTERVAL (the central rule's band), in
   * the register's own order: Staff -> A -> B -> C -> D -> E.
   */
  it("returns one group per grade interval, in the canonical register order", () => {
    const groups = buildGradeGroups([
      row({ employeeId: "e", houseCategory: "E", jobGrade: 4 }),
      row({
        employeeId: "s",
        houseCategory: "Staff",
        jobGrade: 24,
        isAllocated: true,
      }),
      row({ employeeId: "b", houseCategory: "B", jobGrade: 13 }),
      row({ employeeId: "a", houseCategory: "A", jobGrade: 16 }),
    ]);

    expect(groups.map((g) => g.category)).toEqual(["Staff", "A", "B", "E"]);
  });

  /** Everyone inside one interval shares a table - this is the whole point. */
  it("puts every grade of an interval into the same table", () => {
    const groups = buildGradeGroups([
      row({ employeeId: "g12", jobGrade: 12, houseCategory: "B" }),
      row({ employeeId: "g13", jobGrade: 13, houseCategory: "B" }),
      row({ employeeId: "g14", jobGrade: 14, houseCategory: "B" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].category).toBe("B");
    expect(groups[0].total).toBe(3);
    expect(groups[0].rows.map((r) => r.jobGrade)).toEqual([12, 13, 14]);
  });

  it("keeps separate intervals apart at the boundary grade", () => {
    // 17 is band A, 18 is band Staff - adjacent grades, different tables.
    const groups = buildGradeGroups([
      row({ employeeId: "g17", jobGrade: 17, houseCategory: "A" }),
      row({ employeeId: "g18", jobGrade: 18, houseCategory: "Staff" }),
    ]);

    expect(groups.map((g) => g.category)).toEqual(["Staff", "A"]);
  });

  it("renumbers srNo from 1 within each interval", () => {
    const groups = buildGradeGroups([
      row({ employeeId: "a", jobGrade: 13, houseCategory: "B" }),
      row({ employeeId: "b", jobGrade: 12, houseCategory: "B" }),
      row({ employeeId: "c", jobGrade: 3, houseCategory: "E" }),
    ]);

    expect(groups[0].rows.map((r) => r.srNo)).toEqual([1, 2]);
    expect(groups[1].rows.map((r) => r.srNo)).toEqual([1]);
  });

  it("omits intervals with nobody in them", () => {
    const groups = buildGradeGroups([
      row({ employeeId: "c", jobGrade: 11, houseCategory: "C" }),
    ]);
    expect(groups.map((g) => g.category)).toEqual(["C"]);
  });

  it("counts ready and allocated per interval", () => {
    const groups = buildGradeGroups([
      row({
        employeeId: "1",
        jobGrade: 8,
        houseCategory: "D",
        queueStatus: "ready_for_allocation",
      }),
      row({
        employeeId: "2",
        jobGrade: 7,
        houseCategory: "D",
        queueStatus: "allocated",
        isAllocated: true,
      }),
      row({
        employeeId: "3",
        jobGrade: 9,
        houseCategory: "D",
        queueStatus: "no_house_available",
      }),
    ]);

    expect(groups[0]).toMatchObject({
      category: "D",
      total: 3,
      ready: 1,
      allocated: 1,
    });
  });

  /**
   * A grade removed from the record after submission must not make somebody
   * vanish from the queue - they land in one trailing ungraded group instead.
   */
  it("collects rows with no band into a single trailing group", () => {
    const groups = buildGradeGroups([
      row({ employeeId: "b", jobGrade: 13, houseCategory: "B" }),
      row({ employeeId: "u1", jobGrade: null, houseCategory: null }),
      row({ employeeId: "u2", jobGrade: 0, houseCategory: null }),
    ]);

    expect(groups.map((g) => g.category)).toEqual(["B", null]);
    expect(groups[1].total).toBe(2);
    expect(groups[1].rows.map((r) => r.employeeId)).toEqual(["u1", "u2"]);
  });

  it("returns an empty array for an empty queue", () => {
    expect(buildGradeGroups([])).toEqual([]);
  });

  it("preserves the incoming row order inside an interval (MCDA rank order)", () => {
    const groups = buildGradeGroups([
      row({
        employeeId: "rank1",
        jobGrade: 15,
        houseCategory: "A",
        priorityRank: 1,
      }),
      row({
        employeeId: "rank2",
        jobGrade: 14,
        houseCategory: "A",
        priorityRank: 2,
      }),
    ]);
    expect(groups[0].rows.map((r) => r.employeeId)).toEqual(["rank1", "rank2"]);
  });
});

describe("computeHouseQueue - one table per job grade interval", () => {
  it("buckets requesters by grade interval, one table per band", async () => {
    seed({
      employees: [
        emp({ id: "s1", employeeNumber: "S1", jobGrade: 22 }),
        emp({ id: "a1", employeeNumber: "A1", jobGrade: 16 }),
        emp({ id: "b1", employeeNumber: "B1", jobGrade: 13 }),
        emp({ id: "b2", employeeNumber: "B2", jobGrade: 12 }),
        emp({ id: "e1", employeeNumber: "E1", jobGrade: 4 }),
      ],
      households: [
        house({ id: "hs", houseNumber: "SA1", houseType: "Staff" }),
        house({
          id: "ha",
          houseNumber: "A1",
          hid: "106-90-101",
          houseType: "A",
        }),
        house({
          id: "hb1",
          houseNumber: "B1",
          hid: "106-90-201",
          houseType: "B",
        }),
        house({
          id: "he",
          houseNumber: "E1",
          hid: "106-90-501",
          houseType: "E",
        }),
      ],
      allocations: [],
    });

    const result = await computeHouseQueue("o1");

    expect(result.gradeGroups.map((g) => g.category)).toEqual([
      "Staff",
      "A",
      "B",
      "E",
    ]);

    // Grades 12, 13 and 14 all live in the B table together.
    const bGroup = result.gradeGroups.find((g) => g.category === "B")!;
    expect(bGroup.total).toBe(2);
    expect(bGroup.rows.map((r) => r.jobGrade).sort()).toEqual([12, 13]);
    expect(bGroup.rows.map((r) => r.srNo)).toEqual([1, 2]);

    // Every B-band requester is scored, and the cohort size is reported so the
    // UI can tell a real 0.00 apart from "nothing to compare against".
    for (const r of bGroup.rows) expect(r.mcdScore).not.toBeNull();
    expect(bGroup.rows[0].cohortSize).toBe(2);
  });

  /**
   * The four criterion columns in the queue table must sum to the Priority Score,
   * so the per-criterion contributions have to reach the row intact.
   */
  it("carries the per-criterion MCDA breakdown onto every scored row", async () => {
    seed({
      employees: [
        emp({
          id: "b1",
          employeeNumber: "B1",
          jobGrade: 13,
          hireDate: new Date("2005-01-01"),
          maritalStatus: "married",
          disabilityStatus: true,
        }),
        emp({
          id: "b2",
          employeeNumber: "B2",
          jobGrade: 12,
          hireDate: new Date("2024-01-01"),
          maritalStatus: "single",
          disabilityStatus: false,
        }),
      ],
      households: [
        house({
          id: "hb1",
          houseNumber: "B1",
          hid: "106-90-201",
          houseType: "B",
        }),
        house({
          id: "hb2",
          houseNumber: "B2",
          hid: "106-90-202",
          houseType: "B",
        }),
      ],
      allocations: [],
    });

    const result = await computeHouseQueue("o1");
    const weights = result.mcdaWeights;

    for (const r of result.rows) {
      expect(r.mcdComponents).not.toBeNull();
      // The four criterion columns sum to the composite score.
      const summed =
        r.mcdComponents!.serviceYears * weights.serviceYears +
        r.mcdComponents!.maritalStatus * weights.maritalStatus +
        r.mcdComponents!.disability * weights.disability +
        r.mcdComponents!.gender * weights.gender;
      expect(summed).toBeCloseTo(r.mcdScore!, 9);
    }

    // Senior + married + disabled outranks the newcomer on every criterion.
    const top = result.rows.find((r) => r.employeeId === "b1")!;
    expect(top.mcdComponents).toMatchObject({
      serviceYears: 1,
      maritalStatus: 1,
      disability: 1,
      gender: 0,
    });
    const bottom = result.rows.find((r) => r.employeeId === "b2")!;
    expect(bottom.mcdComponents).toMatchObject({
      serviceYears: 0,
      maritalStatus: 0,
      disability: 0,
      gender: 0,
    });
  });

  it("reports the weights the queue was computed with", async () => {
    seed({
      employees: [emp({ id: "b1", employeeNumber: "B1", jobGrade: 13 })],
      households: [house({ id: "hb1", houseNumber: "B1", houseType: "B" })],
      allocations: [],
    });

    const result = await computeHouseQueue("o1");
    // Must be the config's weights, so the UI's arithmetic cannot disagree with
    // the score after an admin publishes a different weight set.
    expect(result.mcdaWeights).toEqual(DEFAULT_ENGINE_CONFIG.weights);
  });

  /**
   * The regression this change exists for: two employees inside ONE interval
   * must be ranked against each other - not both stamped "#1" because they
   * happened to sit at different grades.
   */
  it("ranks employees across the grades of one interval, not per grade", async () => {
    seed({
      employees: [
        emp({
          id: "b1",
          employeeNumber: "B1",
          jobGrade: 13,
          hireDate: new Date("2010-01-01"),
        }),
        emp({
          id: "b2",
          employeeNumber: "B2",
          jobGrade: 12,
          hireDate: new Date("2024-01-01"),
        }),
      ],
      households: [
        house({
          id: "hb1",
          houseNumber: "B1",
          hid: "106-90-201",
          houseType: "B",
        }),
        house({
          id: "hb2",
          houseNumber: "B2",
          hid: "106-90-202",
          houseType: "B",
        }),
      ],
      allocations: [],
    });

    const result = await computeHouseQueue("o1");

    expect(result.gradeGroups).toHaveLength(1);
    const band = result.gradeGroups[0];
    expect(band.category).toBe("B");
    // Grade 13 (2010) outranks grade 12 (2024) on service years, even though
    // they are different grades - they share the 12-14 interval.
    expect(band.rows.map((r) => [r.employeeId, r.priorityRank])).toEqual([
      ["b1", 1],
      ["b2", 2],
    ]);
    // Ranks inside a table are a clean 1..n with no duplicated #1.
    expect(band.rows.map((r) => r.priorityRank)).toEqual([1, 2]);
  });

  it("gives a requester with no job grade a trailing ungraded table", async () => {
    seed({
      employees: [
        emp({ id: "b1", employeeNumber: "B1", jobGrade: 13 }),
        emp({ id: "u1", employeeNumber: "U1", jobGrade: null }),
      ],
      households: [
        house({
          id: "hb1",
          houseNumber: "B1",
          hid: "106-90-201",
          houseType: "B",
        }),
      ],
      allocations: [],
    });

    const result = await computeHouseQueue("o1");

    expect(result.gradeGroups.map((g) => g.category)).toEqual(["B", null]);
    const exceptionRow = result.rows.find((r) => r.employeeId === "u1")!;
    expect(exceptionRow.houseCategory).toBeNull();
    expect(exceptionRow.queueStatus).toBe("not_eligible");
    expect(exceptionRow.mcdScore).toBeNull();
    expect(exceptionRow.cohortSize).toBe(0);
  });
});

describe("pickEarliestRequestByEmployee", () => {
  it("keys by employee id", () => {
    const map = pickEarliestRequestByEmployee([
      { id: "r1", employeeId: "e1", createdAt: new Date("2026-01-01") },
      { id: "r2", employeeId: "e2", createdAt: new Date("2026-01-01") },
    ]);
    expect(map.get("e1")?.id).toBe("r1");
    expect(map.get("e2")?.id).toBe("r2");
  });

  it("keeps the earliest request when an employee somehow has several", () => {
    // The partial unique index should make this impossible; the helper is
    // deterministic regardless so ranking never depends on row order.
    const map = pickEarliestRequestByEmployee([
      { id: "later", employeeId: "e1", createdAt: new Date("2026-06-01") },
      { id: "earlier", employeeId: "e1", createdAt: new Date("2026-01-01") },
    ]);
    expect(map.get("e1")?.id).toBe("earlier");
  });

  it("returns an empty map for no requests", () => {
    expect(pickEarliestRequestByEmployee([]).size).toBe(0);
  });
});
