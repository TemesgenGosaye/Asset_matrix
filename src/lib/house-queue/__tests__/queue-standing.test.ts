import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `computeEmployeeQueueStanding` — where ONE person stands in the live queue.
 *
 * The House Request page answers "where is this person in the queue?" without
 * materialising the whole queue. The assertion that matters most is therefore
 * the last one in this file: the standing must be the SAME number the queue
 * page shows, because a requester told "#2" here and shown "#5" there has been
 * told two different truths about their own case.
 */

const client = vi.hoisted(() => ({
  employee: { findMany: vi.fn() },
  household: { findMany: vi.fn() },
  houseAllocation: { findMany: vi.fn() },
  houseRequest: { findMany: vi.fn() },
  engineConfigVersion: { findFirst: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ default: client }));

import {
  computeEmployeeQueueStanding,
  computeHouseQueue,
} from "../engine";
import { DEFAULT_ENGINE_CONFIG } from "../config/types";
import prisma from "@/lib/prisma";

const mockPrisma = prisma as any;

/** The ACTIVE engine config, whose bands mirror the central rule. */
const activeConfig = {
  id: "cfg-1",
  organizationId: "o1",
  versionNumber: 1,
  status: "active",
  weights: DEFAULT_ENGINE_CONFIG.weights,
  eligibilityBands: DEFAULT_ENGINE_CONFIG.eligibilityBands,
  recommendationRules: DEFAULT_ENGINE_CONFIG.recommendation,
  changeSummary: null,
  createdBy: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  publishedBy: null,
  publishedAt: new Date("2026-01-01T00:00:00.000Z"),
  supersededById: null,
};

const emp = (over: Record<string, unknown>) => ({
  id: "e1",
  employeeNumber: "EMP001",
  firstname: "Alice",
  lastname: "One",
  jobGrade: null,
  gender: "female",
  maritalStatus: "married",
  disabilityStatus: null,
  hireDate: new Date("2020-01-01"),
  ...over,
});

const request = (employeeId: string, over: Record<string, unknown> = {}) => ({
  id: `req-${employeeId}`,
  employeeId,
  createdAt: new Date("2026-09-20T08:00:00Z"),
  ...over,
});

/**
 * Seed the sources.
 *
 * The employee query honours the `id.in` filter the way the database would —
 * the standing reads only the requesters, so the mock has to as well or the
 * cohort would come back bigger than it is.
 */
function seed({
  employees = [],
  requests,
}: {
  employees?: Record<string, unknown>[];
  requests?: Record<string, unknown>[];
}) {
  mockPrisma.employee.findMany.mockImplementation(
    async ({ where }: { where?: { id?: { in?: string[] } } }) => {
      const ids = where?.id?.in;
      if (!ids) return employees;
      return employees.filter((e) => ids.includes(e.id as string));
    },
  );
  mockPrisma.household.findMany.mockResolvedValue([]);
  mockPrisma.houseAllocation.findMany.mockResolvedValue([]);
  mockPrisma.houseRequest.findMany.mockResolvedValue(
    requests ?? employees.map((e) => request(e.id as string)),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.engineConfigVersion.findFirst.mockResolvedValue(activeConfig);
});

describe("computeEmployeeQueueStanding", () => {
  it("reports no standing for an employee who has not asked for a house", async () => {
    seed({
      employees: [
        emp({ id: "e1", employeeNumber: "EMP001", jobGrade: 14 }),
      ],
      requests: [],
    });

    const standing = await computeEmployeeQueueStanding("o1", "e1");

    expect(standing.rank).toBeNull();
    expect(standing.cohortSize).toBeNull();
    expect(standing.category).toBeNull();
  });

  it("ranks the employee inside their own house band", async () => {
    // e1 and e2 both sit in band B; e3 sits in band A. Bands compete
    // separately, so e3 must not change e2's position.
    seed({
      employees: [
        emp({
          id: "e1",
          employeeNumber: "EMP001",
          jobGrade: 14,
          hireDate: new Date("2012-01-01"),
        }),
        emp({
          id: "e2",
          employeeNumber: "EMP002",
          jobGrade: 13,
          hireDate: new Date("2020-01-01"),
        }),
        emp({
          id: "e3",
          employeeNumber: "EMP003",
          jobGrade: 16,
          hireDate: new Date("2010-01-01"),
        }),
      ],
    });

    const first = await computeEmployeeQueueStanding("o1", "e1");
    expect(first.category).toBe("B");
    expect(first.rank).toBe(1);
    expect(first.cohortSize).toBe(2);

    // The longer-serving colleague is ahead, so e2 is second of two — not
    // second of three.
    const second = await computeEmployeeQueueStanding("o1", "e2");
    expect(second.rank).toBe(2);
    expect(second.cohortSize).toBe(2);
    expect(second.category).toBe("B");

    // Band A is a cohort of its own.
    const otherBand = await computeEmployeeQueueStanding("o1", "e3");
    expect(otherBand.category).toBe("A");
    expect(otherBand.rank).toBe(1);
    expect(otherBand.cohortSize).toBe(1);
  });

  it("leaves an ungraded requester unranked, the way the engine does", async () => {
    seed({
      employees: [emp({ id: "e1", employeeNumber: "EMP001", jobGrade: null })],
    });

    const standing = await computeEmployeeQueueStanding("o1", "e1");

    expect(standing.category).toBeNull();
    expect(standing.rank).toBeNull();
    expect(standing.score).toBeNull();
  });

  it("agrees with the rank the queue page shows", async () => {
    const employees = [
      emp({
        id: "e1",
        employeeNumber: "EMP001",
        jobGrade: 14,
        hireDate: new Date("2012-01-01"),
      }),
      emp({
        id: "e2",
        employeeNumber: "EMP002",
        jobGrade: 13,
        hireDate: new Date("2020-01-01"),
      }),
      emp({
        id: "e3",
        employeeNumber: "EMP003",
        jobGrade: 12,
        hireDate: new Date("2018-01-01"),
      }),
    ];
    seed({ employees });

    const queue = await computeHouseQueue("o1");
    const standing = await computeEmployeeQueueStanding("o1", "e3");

    const row = queue.rows.find((r) => r.employeeId === "e3");
    expect(row).toBeDefined();
    expect(standing.rank).toBe(row!.priorityRank);
    expect(standing.category).toBe(row!.houseCategory);
  });
});
