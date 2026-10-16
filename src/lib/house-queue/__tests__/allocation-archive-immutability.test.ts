import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The `house_allocations` ledger is historied: at most one row per employee may
 * hold `allocated` at a time, while every completed release must survive
 * forever as a record on the Terminated Houses page.
 *
 * These tests drive the real service against an in-memory ledger that HONOURS
 * the `where` clause, because the bug lived precisely in the query: the
 * re-activation paths resolved the employee's newest row and mutated it in
 * place, overwriting `status` off `released` and deleting the termination.
 */

type Row = {
  id: string;
  organizationId: string;
  employeeId: string;
  householdId: string | null;
  status: string;
  createdAt: Date;
  terminationReason?: string | null;
  terminatedAt?: Date | null;
  terminatedBy?: string | null;
};

const { store, client } = vi.hoisted(() => {
  const rows: Row[] = [];
  const activeConfigVersion = {
    id: "cfg-1",
    organizationId: "org-1",
    versionNumber: 1,
    status: "active",
    weights: {
      serviceYears: 0.4,
      maritalStatus: 0.25,
      disability: 0.2,
      gender: 0.15,
    },
    eligibilityBands: [{ category: "B", gradeMin: 12, gradeMax: 14 }],
    recommendationRules: {
      preferRegularOverGuest: true,
      locationSortDirection: "asc",
      houseNumberSortMode: "numeric_aware",
    },
    changeSummary: null,
    createdBy: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    publishedBy: null,
    publishedAt: null,
    supersededById: null,
  };

  const matches = (row: Row, where: any): boolean => {
    for (const [key, cond] of Object.entries(where ?? {})) {
      if (cond === undefined) continue;
      const value = (row as any)[key];
      if (cond !== null && typeof cond === "object" && !Array.isArray(cond)) {
        const c = cond as { notIn?: string[]; in?: string[]; not?: unknown };
        if (c.notIn && c.notIn.includes(value as string)) return false;
        if (c.in && !c.in.includes(value as string)) return false;
        if ("not" in c && value === c.not) return false;
      } else if (value !== cond) {
        return false;
      }
    }
    return true;
  };

  let seq = 0;
  const houseAllocation = {
    findFirst: vi.fn(async ({ where, orderBy }: any) => {
      const hit = rows.filter((r) => matches(r, where));
      hit.sort((a, b) =>
        orderBy?.createdAt === "desc"
          ? b.createdAt.getTime() - a.createdAt.getTime()
          : 0,
      );
      return hit[0] ?? null;
    }),
    findMany: vi.fn(async ({ where }: any = {}) =>
      rows.filter((r) => matches(r, where)),
    ),
    create: vi.fn(async ({ data }: any) => {
      const row: Row = {
        id: `al-${++seq}`,
        organizationId: data.organizationId,
        employeeId: data.employeeId,
        householdId: data.householdId ?? null,
        status: data.status,
        createdAt: new Date("2026-06-01T00:00:00Z"),
      };
      rows.push(row);
      return { ...row };
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const row = rows.find((r) => matches(r, where));
      if (!row) throw new Error(`No row matched ${JSON.stringify(where)}`);
      Object.assign(row, data);
      return { ...row };
    }),
    updateMany: vi.fn(async ({ where, data }: any) => {
      const hit = rows.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    }),
    count: vi.fn(
      async ({ where }: any) => rows.filter((r) => matches(r, where)).length,
    ),
  };

  const households: any[] = [];
  const client = {
    employee: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    household: {
      findFirst: vi.fn(
        async ({ where }: any) =>
          households.find((h) => h.id === where.id) ?? null,
      ),
      findMany: vi.fn(async () => []),
      update: vi.fn(async ({ where, data }: any) => {
        const h = households.find((x) => x.id === where.id)!;
        Object.assign(h, data);
        return h;
      }),
    },
    houseAllocation,
    houseInspection: {
      create: vi.fn(async ({ data }: any) => ({
        id: `insp-${data.allocationId}`,
      })),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    houseRequest: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    engineConfigVersion: {
      findFirst: vi.fn().mockResolvedValue(activeConfigVersion),
      findMany: vi.fn().mockResolvedValue([activeConfigVersion]),
    },
    user: { findMany: vi.fn().mockResolvedValue([]) },
    audit_logs: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(),
    $extends: vi.fn(() => client),
  };
  return { store: { rows, households }, client };
});

vi.mock("@/lib/prisma", () => ({ default: client }));
vi.mock("@/lib/audit-log", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit-log")>();
  return { ...actual, createAuditLog: vi.fn().mockResolvedValue(undefined) };
});

import { approveAllocation, setSkipOrDefer } from "../service";
import prisma from "@/lib/prisma";

const mockPrisma = prisma as any;

const employee = {
  id: "e1",
  employeeNumber: "EMP001",
  firstname: "Alice",
  lastname: "One",
  jobGrade: 13,
};

function seedHouse(id: string, houseNumber: string) {
  store.households.push({
    id,
    hid: `106-90-0${id.slice(1)}`,
    houseNumber,
    houseType: "B",
    rgType: "Regular",
    locationName: "Site A",
    status: "Active",
    occupancyStatus: "Vacant",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  store.rows.length = 0;
  store.households.length = 0;
  mockPrisma.$transaction.mockImplementation((fn: (tx: any) => unknown) =>
    fn({
      houseAllocation: client.houseAllocation,
      household: client.household,
      houseInspection: client.houseInspection,
      audit_logs: client.audit_logs,
    }),
  );
  mockPrisma.employee.findFirst.mockResolvedValue(employee);
  mockPrisma.employee.findMany.mockResolvedValue([]);
  mockPrisma.household.findMany.mockResolvedValue([]);
  mockPrisma.houseAllocation.findMany.mockResolvedValue([]);
});

/** A completed, reason-coded release sitting in the archive. */
function seedArchivedRelease() {
  store.rows.push({
    id: "al-ARCHIVED",
    organizationId: "org1",
    employeeId: "e1",
    householdId: "h1",
    status: "released",
    createdAt: new Date("2026-05-01T09:00:00Z"),
    terminationReason: "EMPLOYEE_LEAVE",
    terminatedAt: new Date("2026-05-01T09:00:00Z"),
    terminatedBy: "admin1",
  });
}

const isArchived = (r: Row) =>
  r.status === "released" &&
  r.terminationReason === "EMPLOYEE_LEAVE" &&
  r.terminatedAt !== null;

describe("archived releases must survive later decisions", () => {
  it("re-allocating an employee appends a new thread and keeps the archive row", async () => {
    seedHouse("h1", "B1");
    seedHouse("h2", "B2");
    seedArchivedRelease();
    mockPrisma.household.findFirst.mockImplementation(
      async ({ where }: any) =>
        store.households.find((h) => h.id === where.id) ?? null,
    );

    await approveAllocation({
      organizationId: "org1",
      employeeId: "e1",
      householdId: "h2",
      decidedBy: "admin1",
    });

    const archived = store.rows.filter(isArchived);
    expect(archived).toHaveLength(1);
    expect(archived[0].id).toBe("al-ARCHIVED");
    expect(archived[0].householdId).toBe("h1");

    // A separate live thread now holds the new house.
    const live = store.rows.filter((r) => r.status === "allocated");
    expect(live).toHaveLength(1);
    expect(live[0].id).not.toBe("al-ARCHIVED");
    expect(live[0].householdId).toBe("h2");
  });

  it("skipping an employee appends a new thread and keeps the archive row", async () => {
    seedHouse("h1", "B1");
    seedArchivedRelease();

    await setSkipOrDefer({
      organizationId: "org1",
      employeeId: "e1",
      mode: "skip",
      reason: "Not needed",
      decidedBy: "admin1",
    });

    expect(store.rows.filter(isArchived)).toHaveLength(1);
    expect(store.rows.filter((r) => r.status === "skipped")).toHaveLength(1);
  });

  it("deferring an employee appends a new thread and keeps the archive row", async () => {
    seedHouse("h1", "B1");
    seedArchivedRelease();

    await setSkipOrDefer({
      organizationId: "org1",
      employeeId: "e1",
      mode: "defer",
      decidedBy: "admin1",
    });

    expect(store.rows.filter(isArchived)).toHaveLength(1);
    expect(store.rows.filter((r) => r.status === "deferred")).toHaveLength(1);
  });

  it("the archive page query still returns the release after re-allocation", async () => {
    seedHouse("h1", "B1");
    seedHouse("h2", "B2");
    seedArchivedRelease();
    mockPrisma.household.findFirst.mockImplementation(
      async ({ where }: any) =>
        store.households.find((h) => h.id === where.id) ?? null,
    );

    await approveAllocation({
      organizationId: "org1",
      employeeId: "e1",
      householdId: "h2",
      decidedBy: "admin1",
    });

    // Mirror of listTerminatedHouses' where-clause.
    const visible = store.rows.filter(
      (r) => r.status === "released" && r.terminatedAt != null,
    );
    expect(visible.map((r) => r.id)).toEqual(["al-ARCHIVED"]);
  });
});
