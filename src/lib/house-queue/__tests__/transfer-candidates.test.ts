import { beforeEach, describe, expect, it, vi } from "vitest";

const { client, bandsRef } = vi.hoisted(() => {
  const employee = { findFirst: vi.fn() };
  const household = { findMany: vi.fn(), findFirst: vi.fn() };
  const houseAllocation = { findMany: vi.fn(), findFirst: vi.fn() };
  const client = {
    employee,
    household,
    houseAllocation,
    houseInspection: { findMany: vi.fn(), findFirst: vi.fn() },
    audit_logs: { create: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: any) => unknown) => fn(client)),
    $extends: vi.fn(() => client),
  };
  // Mutable so a test can change the active policy bands before calling.
  const bandsRef = {
    current: [
      { category: "E", gradeMin: 1, gradeMax: 6 },
      { category: "D", gradeMin: 7, gradeMax: 9 },
      { category: "C", gradeMin: 10, gradeMax: 11 },
      { category: "B", gradeMin: 12, gradeMax: 14 },
      { category: "A", gradeMin: 15, gradeMax: 17 },
      { category: "Staff", gradeMin: 18, gradeMax: null },
    ] as unknown[],
  };
  return { client, bandsRef };
});

vi.mock("@/lib/prisma", () => ({ default: client }));

vi.mock("@/lib/house-queue/config/service", () => ({
  getActiveConfig: vi.fn(async () => ({
    payload: {
      recommendation: {},
      eligibilityBands: bandsRef.current,
    },
  })),
}));

import { listEligibleTransferHouses } from "../service";

const BANDS = [
  { category: "E", gradeMin: 1, gradeMax: 6 },
  { category: "D", gradeMin: 7, gradeMax: 9 },
  { category: "C", gradeMin: 10, gradeMax: 11 },
  { category: "B", gradeMin: 12, gradeMax: 14 },
  { category: "A", gradeMin: 15, gradeMax: 17 },
  { category: "Staff", gradeMin: 18, gradeMax: null },
];

function house(n: number, type = "B") {
  return {
    id: `h${n}`,
    houseNumber: `${type}${n}`,
    hid: `106-90-${String(n).padStart(3, "0")}`,
    houseType: type,
    rgType: "Regular",
    locationName: "Main",
    status: "Active",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  bandsRef.current = BANDS;
  vi.mocked(client.household.findMany).mockResolvedValue([]);
  vi.mocked(client.houseAllocation.findMany).mockResolvedValue([]);
});

/**
 * §4.1 / §10: the qualifying category is derived from the employee's grade in
 * the database, never from the client. The boundary grades are the ones most
 * likely to be off by one, so each is asserted individually.
 */
describe("grade → house category boundaries", () => {
  const cases: Array<[number, string]> = [
    [1, "E"],
    [6, "E"],
    [7, "D"],
    [9, "D"],
    [10, "C"],
    [11, "C"],
    [12, "B"],
    [14, "B"],
    [15, "A"],
    [17, "A"],
    [18, "Staff"],
  ];

  for (const [grade, category] of cases) {
    it(`maps grade ${grade} to ${category}`, async () => {
      vi.mocked(client.employee.findFirst).mockResolvedValue({
        id: "e1",
        jobGrade: grade,
      });
      vi.mocked(client.household.findMany).mockResolvedValue([
        house(1, category),
      ]);

      const result = await listEligibleTransferHouses("org1", "e1");
      expect(result.eligibleCategory).toBe(category);
      // The query is constrained to that category, so no house outside the
      // employee's band can appear in the response.
      const query = client.household.findMany.mock.calls[0][0];
      expect(query.where.houseType).toBe(category);
      expect(query.where.status).toBe("Active");
    });
  }

  it("refuses a grade below the policy floor", async () => {
    vi.mocked(client.employee.findFirst).mockResolvedValue({
      id: "e1",
      jobGrade: 0,
    });

    await expect(listEligibleTransferHouses("org1", "e1")).rejects.toThrow(
      /INELIGIBLE_HOUSE_TYPE/,
    );
  });

  it("reports MISSING_EMPLOYEE_GRADE distinctly", async () => {
    vi.mocked(client.employee.findFirst).mockResolvedValue({
      id: "e1",
      jobGrade: null,
    });

    await expect(listEligibleTransferHouses("org1", "e1")).rejects.toThrow(
      /MISSING_EMPLOYEE_GRADE/,
    );
  });

  it("has no Admin override — the only input is an employee id, so no category can be forced", async () => {
    vi.mocked(client.employee.findFirst).mockResolvedValue({
      id: "e1",
      jobGrade: 12,
    });
    vi.mocked(client.household.findMany).mockResolvedValue([house(1, "B")]);

    const result = await listEligibleTransferHouses("org1", "e1");
    // Grade 12 is B. Asking for Staff is not expressible through this API, and
    // the query that ran asked the database for B only.
    expect(result.eligibleCategory).toBe("B");
    expect(client.household.findMany.mock.calls[0][0].where.houseType).toBe(
      "B",
    );
  });

  it("follows the active config when policy bands change", async () => {
    bandsRef.current = [{ category: "Staff", gradeMin: 1, gradeMax: null }];
    vi.mocked(client.employee.findFirst).mockResolvedValue({
      id: "e1",
      jobGrade: 3,
    });
    vi.mocked(client.household.findMany).mockResolvedValue([house(1, "Staff")]);

    const result = await listEligibleTransferHouses("org1", "e1");
    expect(result.eligibleCategory).toBe("Staff");
  });
});

describe("availability excludes every live allocation, not just `allocated`", () => {
  it("excludes houses held by an allocation awaiting handback inspection", async () => {
    vi.mocked(client.employee.findFirst).mockResolvedValue({
      id: "e1",
      jobGrade: 12,
    });
    vi.mocked(client.household.findMany).mockResolvedValue([
      house(1),
      house(2),
    ]);
    // B1 is mid-release: its occupant has not handed the keys back yet.
    vi.mocked(client.houseAllocation.findMany).mockResolvedValue([
      { householdId: "h1" },
    ]);

    const result = await listEligibleTransferHouses("org1", "e1");
    expect(result.candidates.map((c) => c.houseNumber)).toEqual(["B2"]);

    // The exclusion query must consider all live spellings, including the
    // uppercase one the release flow writes.
    const allocQuery = client.houseAllocation.findMany.mock.calls[0][0];
    expect(allocQuery.where.status.in).toEqual(
      expect.arrayContaining([
        "allocated",
        "RELEASE_PENDING",
        "release_pending",
        "PENDING_INSPECTION",
      ]),
    );
  });

  it("frees a house whose release was already completed", async () => {
    vi.mocked(client.employee.findFirst).mockResolvedValue({
      id: "e1",
      jobGrade: 12,
    });
    vi.mocked(client.household.findMany).mockResolvedValue([
      house(1),
      house(2),
    ]);
    // A released row no longer ties an employee to the house.
    vi.mocked(client.houseAllocation.findMany).mockResolvedValue([
      { householdId: "h2" },
    ]);

    const result = await listEligibleTransferHouses("org1", "e1");
    expect(result.candidates.map((c) => c.houseNumber)).toEqual(["B1"]);
  });

  it("reports NO_ELIGIBLE_HOUSE instead of an ambiguous empty list", async () => {
    vi.mocked(client.employee.findFirst).mockResolvedValue({
      id: "e1",
      jobGrade: 12,
    });
    vi.mocked(client.household.findMany).mockResolvedValue([house(1)]);
    vi.mocked(client.houseAllocation.findMany).mockResolvedValue([
      { householdId: "h1" },
    ]);

    await expect(listEligibleTransferHouses("org1", "e1")).rejects.toThrow(
      /NO_ELIGIBLE_HOUSE/,
    );
  });

  it("scopes every read to the caller's organization and skips deleted staff", async () => {
    vi.mocked(client.employee.findFirst).mockResolvedValue({
      id: "e1",
      jobGrade: 12,
    });
    vi.mocked(client.household.findMany).mockResolvedValue([house(1)]);

    await listEligibleTransferHouses("org1", "e1");

    const employeeQuery = client.employee.findFirst.mock.calls[0][0];
    expect(employeeQuery.where.organizationId).toBe("org1");
    expect(employeeQuery.where.deletedAt).toBeNull();
    expect(
      client.household.findMany.mock.calls[0][0].where.organizationId,
    ).toBe("org1");
    expect(
      client.houseAllocation.findMany.mock.calls[0][0].where.organizationId,
    ).toBe("org1");
  });

  it("404s for an employee outside the organization", async () => {
    vi.mocked(client.employee.findFirst).mockResolvedValue(null);

    await expect(
      listEligibleTransferHouses("org1", "other-org"),
    ).rejects.toThrow(/not found/i);
  });

  it("orders candidates by the Engine B ranking", async () => {
    vi.mocked(client.employee.findFirst).mockResolvedValue({
      id: "e1",
      jobGrade: 12,
    });
    vi.mocked(client.household.findMany).mockResolvedValue([
      house(10),
      house(2),
      house(1),
    ]);

    const result = await listEligibleTransferHouses("org1", "e1");
    // Numeric house-number order, not lexical: B1, B2, B10.
    expect(result.candidates.map((c) => c.houseNumber)).toEqual([
      "B1",
      "B2",
      "B10",
    ]);
  });
});
