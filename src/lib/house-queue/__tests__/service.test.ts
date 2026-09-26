import { describe, it, expect, vi, beforeEach } from "vitest";

const { client, activeConfigVersion } = vi.hoisted(() => {
  const houseAllocation = {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  };
  const household = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  };
  const houseInspection = {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  };
  // Default ACTIVE engine-config row (v1, defaults) returned by config reads —
  // mirrors DEFAULT_ENGINE_CONFIG so the action service honours the active
  // config without touching the real database.
  const activeConfigVersion = {
    id: "cfg-1",
    organizationId: "org-1",
    versionNumber: 1,
    status: "active",
    weights: { serviceYears: 0.4, maritalStatus: 0.25, disability: 0.2, gender: 0.15 },
    eligibilityBands: [
      { category: "Staff", gradeMin: 18, gradeMax: null },
      { category: "A", gradeMin: 15, gradeMax: 17 },
      { category: "B", gradeMin: 12, gradeMax: 14 },
      { category: "C", gradeMin: 10, gradeMax: 11 },
      { category: "D", gradeMin: 7, gradeMax: 9 },
      { category: "E", gradeMin: 1, gradeMax: 6 },
    ],
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
  const client = {
    employee: { findFirst: vi.fn(), findMany: vi.fn() },
    household,
    houseAllocation,
    houseInspection,
    engineConfigVersion: {
      findFirst: vi.fn().mockResolvedValue(activeConfigVersion),
      findMany: vi.fn().mockResolvedValue([activeConfigVersion]),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    configAuditEntry: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    audit_logs: { create: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: any) => unknown) =>
      fn({
        houseAllocation,
        household,
        houseInspection,
        audit_logs: client.audit_logs,
      }),
    ),
    $extends: vi.fn(() => client),
  };
  return { client, activeConfigVersion };
});

vi.mock("@/lib/prisma", () => ({ default: client }));

// Keep the real AUDIT_ACTIONS / AUDIT_ENTITIES constants but stub createAuditLog:
// real headers() needs a Next request scope and would swallow the write in tests.
vi.mock("@/lib/audit-log", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit-log")>();
  return {
    ...actual,
    createAuditLog: vi.fn().mockResolvedValue(undefined),
  };
});

import {
  approveAllocation,
  completeInspection,
  executeRelease,
  initiateRelease,
  scheduleInspection,
  setSkipOrDefer,
} from "../service";
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  createAuditLog,
} from "@/lib/audit-log";
import { ConflictError } from "@/lib/api-route";
import prisma from "@/lib/prisma";

const mockPrisma = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(mockPrisma.$transaction).mockImplementation((fn: (tx: any) => unknown) =>
    fn({
      houseAllocation: client.houseAllocation,
      household: client.household,
      houseInspection: client.houseInspection,
      audit_logs: client.audit_logs,
    }),
  );
  // snapshotForEmployee / recalculate walk computeHouseQueue
  mockPrisma.employee.findMany.mockResolvedValue([]);
  mockPrisma.household.findMany.mockResolvedValue([]);
  mockPrisma.houseAllocation.findMany.mockResolvedValue([]);
});

const employee = {
  id: "e1",
  employeeNumber: "EMP001",
  firstname: "Alice",
  lastname: "One",
  jobGrade: 12,
};

const household = {
  id: "h1",
  hid: "106-90-020",
  houseNumber: "B1",
  houseType: "B",
  rgType: "Regular",
  locationName: "Site A",
  status: "Active",
};

describe("approveAllocation", () => {
  it("approves an eligible employee to a matching Active house", async () => {
    mockPrisma.employee.findFirst.mockResolvedValue(employee);
    mockPrisma.household.findFirst.mockResolvedValue(household);
    mockPrisma.houseAllocation.findFirst.mockResolvedValue(null);
    mockPrisma.houseAllocation.count.mockResolvedValue(0);
    mockPrisma.houseAllocation.create.mockResolvedValue({
      id: "al1",
      status: "allocated",
      householdId: "h1",
    });
    mockPrisma.audit_logs.create.mockResolvedValue({});

    const result = await approveAllocation({
      organizationId: "org1",
      employeeId: "e1",
      householdId: "h1",
      decidedBy: "admin1",
    });

    expect(result.status).toBe("allocated");
    expect(result.householdId).toBe("h1");
    expect(mockPrisma.houseAllocation.create).toHaveBeenCalledTimes(1);
    expect(client.household.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "h1" },
        data: { occupancyStatus: "Occupied" },
      }),
    );
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ACTIONS.APPROVE,
        entity: AUDIT_ENTITIES.HOUSE_QUEUE,
        entityId: "e1",
      }),
    );
  });

  it("frees the previously occupied house on reassign", async () => {
    mockPrisma.employee.findFirst.mockResolvedValue(employee);
    mockPrisma.household.findFirst.mockResolvedValue(household);
    // Employee already holds house h1; reassigning to h2.
    mockPrisma.houseAllocation.findFirst.mockResolvedValue({
      id: "al1",
      status: "allocated",
      householdId: "h1",
      recommendedHouseId: "h1",
    });
    mockPrisma.houseAllocation.count.mockResolvedValue(0);
    mockPrisma.houseAllocation.update.mockResolvedValue({
      id: "al1",
      status: "allocated",
      householdId: "h2",
    });

    await approveAllocation({
      organizationId: "org1",
      employeeId: "e1",
      householdId: "h2",
      decidedBy: "admin1",
    });

    expect(client.household.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "h1" },
        data: { occupancyStatus: "Vacant" },
      }),
    );
    expect(client.household.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "h2" },
        data: { occupancyStatus: "Occupied" },
      }),
    );
  });

  it("rejects a customer's grade outside the central rule", async () => {
    mockPrisma.employee.findFirst.mockResolvedValue({
      ...employee,
      jobGrade: 0,
    });

    await expect(
      approveAllocation({
        organizationId: "org1",
        employeeId: "e1",
        householdId: "h1",
        decidedBy: "admin1",
      }),
    ).rejects.toThrow(/does not qualify/i);
  });

  it("rejects an inactive or wronglytyped house", async () => {
    mockPrisma.employee.findFirst.mockResolvedValue(employee);
    mockPrisma.household.findFirst.mockResolvedValue({
      ...household,
      status: "Inactive",
    });
    await expect(
      approveAllocation({
        organizationId: "org1",
        employeeId: "e1",
        householdId: "h1",
        decidedBy: "admin1",
      }),
    ).rejects.toThrow(/Only Active houses/i);

    mockPrisma.household.findFirst.mockResolvedValue({
      ...household,
      houseType: "C",
    });
    await expect(
      approveAllocation({
        organizationId: "org1",
        employeeId: "e1",
        householdId: "h1",
        decidedBy: "admin1",
      }),
    ).rejects.toThrow(/requires B/i);
  });

  it("rejects double-booking inside the transaction", async () => {
    mockPrisma.employee.findFirst.mockResolvedValue(employee);
    mockPrisma.household.findFirst.mockResolvedValue(household);
    mockPrisma.houseAllocation.findFirst.mockResolvedValue(null);
    mockPrisma.houseAllocation.count.mockResolvedValue(1);

    await expect(
      approveAllocation({
        organizationId: "org1",
        employeeId: "e1",
        householdId: "h1",
        decidedBy: "admin1",
      }),
    ).rejects.toThrow(ConflictError);
  });
});

describe("setSkipOrDefer", () => {
  it("skips an employee with a reason", async () => {
    mockPrisma.employee.findFirst.mockResolvedValue(employee);
    mockPrisma.houseAllocation.findFirst.mockResolvedValue(null);
    mockPrisma.houseAllocation.create.mockResolvedValue({
      id: "al1",
      status: "skipped",
      householdId: null,
    });

    const result = await setSkipOrDefer({
      organizationId: "org1",
      employeeId: "e1",
      mode: "skip",
      reason: "On leave",
      decidedBy: "admin1",
    });
    expect(result.status).toBe("skipped");
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ACTIONS.SKIP,
        entity: AUDIT_ENTITIES.HOUSE_QUEUE,
        entityId: "e1",
      }),
    );
  });

  it("blocks skipping while live-allocated", async () => {
    mockPrisma.employee.findFirst.mockResolvedValue(employee);
    mockPrisma.houseAllocation.findFirst.mockResolvedValue({
      id: "al1",
      status: "allocated",
    });

    await expect(
      setSkipOrDefer({
        organizationId: "org1",
        employeeId: "e1",
        mode: "skip",
        decidedBy: "admin1",
      }),
    ).rejects.toThrow(/live allocation/i);
  });
});

describe("initiateRelease", () => {
  it("records the reason branch for a live allocation", async () => {
    mockPrisma.employee.findFirst.mockResolvedValue(employee);
    mockPrisma.houseAllocation.findFirst.mockResolvedValue({
      id: "al1",
      status: "allocated",
      householdId: "h1",
      recommendedHouseId: "h1",
    });
    mockPrisma.household.findFirst.mockResolvedValue(household);

    const result = await initiateRelease({
      organizationId: "org1",
      employeeId: "e1",
      decidedBy: "admin1",
      branch: "EMPLOYEE_LEAVE",
      reason: "Moved to Addis",
    });

    expect(result.allocationId).toBe("al1");
    expect(result.houseNumber).toBe("B1");
    expect(result.branch).toBe("EMPLOYEE_LEAVE");
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ACTIONS.RELEASE,
        entity: AUDIT_ENTITIES.HOUSE_QUEUE,
        entityId: "e1",
        details: expect.objectContaining({
          step: "release_initiated",
          branch: "EMPLOYEE_LEAVE",
          houseNumber: "B1",
        }),
      }),
    );
  });

  it("rejects TRANSFER — a transfer is the Reassign action, not a release", async () => {
    await expect(
      initiateRelease({
        organizationId: "org1",
        employeeId: "e1",
        decidedBy: "admin1",
        // @ts-expect-error -- TRANSFER is deliberately not part of ReleaseReason
        branch: "TRANSFER",
      }),
    ).rejects.toThrow(/Reassign/);
  });

  it("rejects when the employee is not live-allocated", async () => {
    mockPrisma.employee.findFirst.mockResolvedValue(employee);
    mockPrisma.houseAllocation.findFirst.mockResolvedValue({
      id: "al1",
      status: "skipped",
      householdId: null,
    });

    await expect(
      initiateRelease({
        organizationId: "org1",
        employeeId: "e1",
        decidedBy: "admin1",
        branch: "EMPLOYEE_LEAVE",
      }),
    ).rejects.toThrow(/not allocated/i);
  });
});

describe("executeRelease", () => {
  it("terminates, vacates to PendingInspection and raises an inspection", async () => {
    mockPrisma.employee.findFirst.mockResolvedValue(employee);
    mockPrisma.houseAllocation.findFirst.mockResolvedValue({
      id: "al1",
      status: "allocated",
      householdId: "h1",
      recommendedHouseId: "h1",
    });
    mockPrisma.household.findFirst.mockResolvedValue(household);
    mockPrisma.houseAllocation.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.houseInspection.create.mockResolvedValue({ id: "insp1" });

    const result = await executeRelease({
      organizationId: "org1",
      employeeId: "e1",
      decidedBy: "admin1",
      branch: "EMPLOYEE_LEAVE",
      reason: "Departed",
    });

    expect(result.inspectionId).toBe("insp1");
    expect(result.houseNumber).toBe("B1");

    // Compare-and-set only touches a currently-allocated ledger row.
    expect(mockPrisma.houseAllocation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "al1", status: "allocated" },
        data: expect.objectContaining({
          status: "terminated",
          terminationReason: "EMPLOYEE_LEAVE",
          terminatedBy: "admin1",
        }),
      }),
    );

    // The vacated house leaves the Active pool pending its inspection.
    expect(client.household.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "h1" },
        data: expect.objectContaining({
          status: "PendingInspection",
          occupancyStatus: "Vacant",
        }),
      }),
    );

    // The 1:1 inspection is raised against the terminated row.
    expect(client.houseInspection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org1",
          allocationId: "al1",
          householdId: "h1",
        }),
      }),
    );

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ACTIONS.RELEASE,
        details: expect.objectContaining({
          step: "release_executed",
          inspectionId: "insp1",
        }),
      }),
    );
  });

  it("rejects TRANSFER — transfers go through the Reassign surface", async () => {
    await expect(
      executeRelease({
        organizationId: "org1",
        employeeId: "e1",
        decidedBy: "admin1",
        // @ts-expect-error -- TRANSFER is deliberately not part of ReleaseReason
        branch: "TRANSFER",
      }),
    ).rejects.toThrow(/Reassign/);
    // No lookup, ledger write or inspection should be produced for a transfer.
    expect(mockPrisma.employee.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.houseAllocation.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.houseInspection.create).not.toHaveBeenCalled();
  });

  it("rejects a double-termination when the update loses the race", async () => {
    mockPrisma.employee.findFirst.mockResolvedValue(employee);
    mockPrisma.houseAllocation.findFirst.mockResolvedValue({
      id: "al1",
      status: "allocated",
      householdId: "h1",
    });
    mockPrisma.household.findFirst.mockResolvedValue(household);
    // Another request already terminated the row.
    mockPrisma.houseAllocation.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      executeRelease({
        organizationId: "org1",
        employeeId: "e1",
        decidedBy: "admin1",
        branch: "RETIREMENT",
      }),
    ).rejects.toThrow(/no longer live/i);
  });

  it("rejects releasing when not allocated", async () => {
    mockPrisma.employee.findFirst.mockResolvedValue(employee);
    mockPrisma.houseAllocation.findFirst.mockResolvedValue({
      id: "al1",
      status: "skipped",
      householdId: null,
    });

    await expect(
      executeRelease({
        organizationId: "org1",
        employeeId: "e1",
        decidedBy: "admin1",
        branch: "EMPLOYEE_LEAVE",
      }),
    ).rejects.toThrow(/not allocated/i);
  });
});

describe("scheduleInspection", () => {
  it("assigns an inspector and date to an open inspection", async () => {
    mockPrisma.houseInspection.findFirst.mockResolvedValue({
      id: "insp1",
      resolvedTo: null,
    });
    mockPrisma.houseInspection.updateMany.mockResolvedValue({ count: 1 });

    const result = await scheduleInspection({
      organizationId: "org1",
      inspectionId: "insp1",
      inspectorId: "facility1",
      scheduledDate: "2026-09-30",
      decidedBy: "admin1",
    });

    expect(result.inspectorId).toBe("facility1");
    expect(mockPrisma.houseInspection.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "insp1", resolvedTo: null },
        data: expect.objectContaining({ inspectorId: "facility1" }),
      }),
    );
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          step: "inspection_scheduled",
          scheduledDate: "2026-09-30",
        }),
      }),
    );
  });

  it("rejects scheduling an already-completed inspection", async () => {
    mockPrisma.houseInspection.findFirst.mockResolvedValue({
      id: "insp1",
      resolvedTo: "Active",
    });

    await expect(
      scheduleInspection({
        organizationId: "org1",
        inspectionId: "insp1",
        inspectorId: "facility1",
        scheduledDate: "2026-09-30",
        decidedBy: "admin1",
      }),
    ).rejects.toThrow(/already completed/i);
  });
});

describe("completeInspection", () => {
  const openInspection = {
    id: "insp1",
    resolvedTo: null,
    householdId: "h1",
    allocationId: "al1",
    inspectorId: "facility1",
    scheduledDate: new Date("2026-09-30T00:00:00.000Z"),
    photoUrls: [],
  };

  it("resolves a clean inspection back to the Active pool", async () => {
    mockPrisma.houseInspection.findFirst.mockResolvedValue(openInspection);
    mockPrisma.household.findFirst.mockResolvedValue(household);
    mockPrisma.houseInspection.updateMany.mockResolvedValue({ count: 1 });

    const result = await completeInspection({
      organizationId: "org1",
      inspectionId: "insp1",
      decidedBy: "facility1",
      checklist: {
        window: false,
        door: false,
        waterPanel: false,
        roof: false,
        wall: false,
        electricity: false,
      },
      conditionNote: "All good",
    });

    expect(result.resolvedTo).toBe("Active");
    // The house re-enters the Active pool, vacant, with damages cleared.
    expect(client.household.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "h1" },
        data: expect.objectContaining({
          status: "Active",
          occupancyStatus: "Vacant",
          damageWindow: false,
        }),
      }),
    );
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          step: "inspection_completed",
          resolvedTo: "Active",
        }),
      }),
    );
  });

  it("resolves a damaged inspection Under Maintenance with the checklist mirrored", async () => {
    mockPrisma.houseInspection.findFirst.mockResolvedValue(openInspection);
    mockPrisma.household.findFirst.mockResolvedValue(household);
    mockPrisma.houseInspection.updateMany.mockResolvedValue({ count: 1 });

    const result = await completeInspection({
      organizationId: "org1",
      inspectionId: "insp1",
      decidedBy: "facility1",
      checklist: {
        window: true,
        door: false,
        waterPanel: false,
        roof: false,
        wall: true,
        electricity: false,
      },
      conditionNote: "Broken window, cracked wall",
    });

    expect(result.resolvedTo).toBe("UnderMaintenance");
    expect(client.household.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "h1" },
        data: expect.objectContaining({
          status: "UnderMaintenance",
          occupancyStatus: "Maintenance",
          damageWindow: true,
          damageWall: true,
          damageNotes: "Broken window, cracked wall",
        }),
      }),
    );
  });

  it("rejects the double-completion when the compare-and-set fails", async () => {
    mockPrisma.houseInspection.findFirst.mockResolvedValue(openInspection);
    mockPrisma.household.findFirst.mockResolvedValue(household);
    mockPrisma.houseInspection.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      completeInspection({
        organizationId: "org1",
        inspectionId: "insp1",
        decidedBy: "facility1",
        checklist: {
          window: false,
          door: false,
          waterPanel: false,
          roof: false,
          wall: false,
          electricity: false,
        },
      }),
    ).rejects.toThrow(/just completed/i);
  });
});