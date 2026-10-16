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
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  };
  // Queue-entry tickets. The action service calls the live engine to snapshot an
  // employee's MCDA score, and the engine now reads live HouseRequest rows to
  // decide who is in the queue at all. These seeded employees have no request,
  // so the snapshot is null — the decision tests below do not depend on it.
  const houseRequest = {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
  };
  // Default ACTIVE engine-config row (v1, defaults) returned by config reads —
  // mirrors DEFAULT_ENGINE_CONFIG so the action service honours the active
  // config without touching the real database.
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
    houseRequest,
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
import { AUDIT_ACTIONS, AUDIT_ENTITIES, createAuditLog } from "@/lib/audit-log";
import { ConflictError } from "@/lib/api-route";
import prisma from "@/lib/prisma";

const mockPrisma = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(mockPrisma.$transaction).mockImplementation(
    (fn: (tx: any) => unknown) =>
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
  /**
   * A release does not FINISH here. It parks the allocation at RELEASE_PENDING
   * and takes the house out of the pool; the only thing that can finish it is the
   * handback inspection (see `completeInspection`). These assertions exist to pin
   * that, because the previous behaviour terminated the row and let the
   * inspection put the house straight back — which is the hole this gate closes.
   */
  it("parks the allocation at RELEASE_PENDING and takes the house out of the pool", async () => {
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
    // The release reports when the auto-raised inspection is due.
    expect(result.scheduledDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Compare-and-set only touches a currently-allocated ledger row, and the
    // new status is RELEASE_PENDING — NOT terminated.
    expect(mockPrisma.houseAllocation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "al1", status: "allocated" },
        data: expect.objectContaining({
          status: "RELEASE_PENDING",
          terminationReason: "EMPLOYEE_LEAVE",
        }),
      }),
    );

    // The allocation must NOT be terminated at this point.
    const allocWrite = mockPrisma.houseAllocation.updateMany.mock.calls[0][0];
    expect(allocWrite.data).not.toHaveProperty("terminatedAt");
    expect(allocWrite.data).not.toHaveProperty("terminatedBy");

    // The vacated house leaves the Active pool pending inspection AND code.
    expect(client.household.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "h1" },
        data: expect.objectContaining({
          status: "PendingInspection",
          occupancyStatus: "Vacant",
        }),
      }),
    );
    // It is not returned to Active by any write in this transaction.
    const houseWrite = client.household.update.mock.calls[0][0];
    expect(houseWrite.data.status).not.toBe("Active");

    // The 1:1 inspection is raised ALREADY SCHEDULED with an auto date.
    expect(client.houseInspection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org1",
          allocationId: "al1",
          householdId: "h1",
          reason: "EMPLOYEE_LEAVE",
          status: "SCHEDULED",
        }),
      }),
    );
    const inspWrite = client.houseInspection.create.mock.calls[0][0];
    expect(inspWrite.data.scheduledDate).toBeInstanceOf(Date);

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ACTIONS.RELEASE,
        details: expect.objectContaining({
          step: "release_executed",
          inspectionId: "insp1",
          awaitingHandbackInspection: true,
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

  it("rejects a double-release when the update loses the race", async () => {
    mockPrisma.employee.findFirst.mockResolvedValue(employee);
    mockPrisma.houseAllocation.findFirst.mockResolvedValue({
      id: "al1",
      status: "allocated",
      householdId: "h1",
    });
    mockPrisma.household.findFirst.mockResolvedValue(household);
    // Another request already parked the row.
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

  const noDamage = {
    window: false,
    door: false,
    waterPanel: false,
    roof: false,
    wall: false,
    electricity: false,
  };

  /**
   * Completing the inspection IS the release. Since the 4-digit code was
   * removed there is no second gate, so this single transaction must do all
   * three things together: record the handback, archive the allocation, and
   * return the house to stock. These assert all three land, and that they are
   * written inside one `prisma.$transaction`.
   */
  it("finalises a clean handback: archives the allocation AND returns the house", async () => {
    mockPrisma.houseInspection.findFirst.mockResolvedValue(openInspection);
    mockPrisma.household.findFirst.mockResolvedValue(household);
    mockPrisma.houseInspection.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.houseAllocation.updateMany.mockResolvedValue({ count: 1 });

    const result = await completeInspection({
      organizationId: "org1",
      inspectionId: "insp1",
      decidedBy: "facility1",
      checklist: noDamage,
      conditionNote: "All good",
    });

    expect(result.resolvedTo).toBe("Active");
    expect(result.terminatedAt).toBeTruthy();

    // THE POINT: the allocation is archived with a terminatedAt, which is what
    // files this house on the Terminated Houses page.
    const allocWrite = mockPrisma.houseAllocation.updateMany.mock.calls[0][0];
    expect(allocWrite.where).toEqual(
      expect.objectContaining({
        id: "al1",
        status: "RELEASE_PENDING",
        terminatedAt: null,
      }),
    );
    expect(allocWrite.data).toEqual(
      expect.objectContaining({
        status: "released",
        terminatedBy: "facility1",
      }),
    );
    expect(allocWrite.data.terminatedAt).toBeInstanceOf(Date);

    // The house goes back into the pool in the same breath.
    expect(client.household.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "h1" },
        data: expect.objectContaining({
          status: "Active",
          occupancyStatus: "Vacant",
        }),
      }),
    );

    // All of it inside ONE transaction, so the archive and the pool can never
    // disagree.
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ step: "inspection_completed" }),
      }),
    );
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ step: "release_finalized" }),
      }),
    );
  });

  it("archives the allocation on a damaged handback and parks the house", async () => {
    mockPrisma.houseInspection.findFirst.mockResolvedValue(openInspection);
    mockPrisma.household.findFirst.mockResolvedValue(household);
    mockPrisma.houseInspection.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.houseAllocation.updateMany.mockResolvedValue({ count: 1 });

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
      costs: { window: "1250.50", wall: "99.50" },
      conditionNote: "Broken window, cracked wall",
    });

    expect(result.resolvedTo).toBe("UnderMaintenance");

    // The damage and its costs are stored on the inspection, not the household.
    const inspWrite = client.houseInspection.updateMany.mock.calls[0][0];
    expect(inspWrite.data.checklistWindow).toBe(true);
    expect(inspWrite.data.checklistWall).toBe(true);
    expect(inspWrite.data.conditionNote).toBe("Broken window, cracked wall");
    expect(inspWrite.data.costWindow).toBe(1250.5);
    expect(inspWrite.data.costWall).toBe(99.5);
    // An OK part is stored as an explicit zero, never left holding a stale figure.
    expect(inspWrite.data.costDoor).toBe(0);
    // 1250.50 + 99.50, stored beside the rows so a reprint is a read.
    expect(inspWrite.data.totalDamageCost).toBe(1350);

    // The result carries the same lines the receipt will print.
    expect(result.damageLines.map((l) => l.key)).toEqual(["window", "wall"]);
    expect(result.totalDamageCost).toBe(1350);

    // Damage does not stop the release being archived: the house left the pool
    // either way, it just went to maintenance rather than back to Active.
    const allocWrite = mockPrisma.houseAllocation.updateMany.mock.calls[0][0];
    expect(allocWrite.data.status).toBe("released");

    expect(client.household.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "h1" },
        data: expect.objectContaining({
          status: "UnderMaintenance",
          occupancyStatus: "Maintenance",
          // Human labels, not raw keys — this note is read by the next inspector.
          damageNotes: expect.stringContaining("Window"),
        }),
      }),
    );
  });

  it("refuses a damaged part with no cost, and writes nothing", async () => {
    mockPrisma.houseInspection.findFirst.mockResolvedValue(openInspection);
    mockPrisma.household.findFirst.mockResolvedValue(household);

    await expect(
      completeInspection({
        organizationId: "org1",
        inspectionId: "insp1",
        decidedBy: "facility1",
        checklist: { ...noDamage, window: true },
        // No cost for the damaged window.
        conditionNote: "Broken window",
      }),
    ).rejects.toThrow(/Window is marked damaged/);

    // No completion, no archive, no partial damage record.
    expect(mockPrisma.houseInspection.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.houseAllocation.updateMany).not.toHaveBeenCalled();
    expect(client.household.update).not.toHaveBeenCalled();
  });

  it("ignores a cost sent for a part that is OK", async () => {
    mockPrisma.houseInspection.findFirst.mockResolvedValue(openInspection);
    mockPrisma.household.findFirst.mockResolvedValue(household);
    mockPrisma.houseInspection.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.houseAllocation.updateMany.mockResolvedValue({ count: 1 });

    const result = await completeInspection({
      organizationId: "org1",
      inspectionId: "insp1",
      decidedBy: "facility1",
      checklist: noDamage,
      // A stale figure for a part that is not damaged.
      costs: { door: "750.00" },
    });

    expect(result.resolvedTo).toBe("Active");
    expect(result.totalDamageCost).toBe(0);
    const inspWrite = client.houseInspection.updateMany.mock.calls[0][0];
    expect(inspWrite.data.costDoor).toBe(0);
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
        checklist: noDamage,
      }),
    ).rejects.toThrow(/just completed/i);
  });

  it("refuses when the release is no longer pending, writing no household change", async () => {
    mockPrisma.houseInspection.findFirst.mockResolvedValue(openInspection);
    mockPrisma.household.findFirst.mockResolvedValue(household);
    mockPrisma.houseInspection.updateMany.mockResolvedValue({ count: 1 });
    // The allocation was finalised (or re-allocated) since the inspection opened.
    mockPrisma.houseAllocation.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      completeInspection({
        organizationId: "org1",
        inspectionId: "insp1",
        decidedBy: "facility1",
        checklist: noDamage,
      }),
    ).rejects.toThrow(/no longer pending/i);

    // The guard runs BEFORE the household write, so a stale submission can never
    // push a house back into the pool for an allocation that is not released.
    expect(client.household.update).not.toHaveBeenCalled();
  });
});
describe("completed inspections are immutable", () => {
  const completedInspection = {
    id: "insp1",
    organizationId: "org1",
    status: "COMPLETED",
    resolvedTo: "Active",
    householdId: "hh1",
    allocationId: "al1",
    inspectorId: "facility1",
    scheduledDate: new Date("2026-01-05"),
    photoUrls: [],
  };

  const household = { id: "hh1", hid: "H-1", houseNumber: "12" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.household.findFirst.mockResolvedValue(household);
    mockPrisma.employee.findFirst.mockResolvedValue({
      id: "emp1",
      employeeNumber: "EMP-1",
      firstname: "A",
      lastname: "B",
      jobGrade: 12,
    });
  });

  it("refuses to re-complete an inspection", async () => {
    mockPrisma.houseInspection.findFirst.mockResolvedValue(completedInspection);

    await expect(
      completeInspection({
        organizationId: "org1",
        inspectionId: "insp1",
        decidedBy: "facility1",
        checklist: {
          window: true,
          door: false,
          waterPanel: false,
          roof: false,
          wall: false,
          electricity: false,
        },
        costs: { window: "250.00" },
      }),
    ).rejects.toThrow(/already completed/i);

    // No write of any kind: the record keeps its original checklist and its
    // original resolution, and nothing is re-finalised behind it.
    expect(mockPrisma.houseInspection.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.houseInspection.update).not.toHaveBeenCalled();
    expect(mockPrisma.houseAllocation.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.household.update).not.toHaveBeenCalled();
  });

  it("reports the conflict, not the body, when a completed inspection is resubmitted", async () => {
    // The damage gate runs after the completion guard on purpose. A second
    // submission is a fact about the record — it can no longer be edited — and
    // telling the caller their cost field was blank would send them back to a
    // form that will never be accepted.
    mockPrisma.houseInspection.findFirst.mockResolvedValue(completedInspection);

    await expect(
      completeInspection({
        organizationId: "org1",
        inspectionId: "insp1",
        decidedBy: "facility1",
        checklist: {
          window: true,
          door: false,
          waterPanel: false,
          roof: false,
          wall: false,
          electricity: false,
        },
        // Deliberately no cost for the damaged window.
      }),
    ).rejects.toThrow(/already completed/i);
  });

  it("refuses to re-schedule a completed inspection", async () => {
    mockPrisma.houseInspection.findFirst.mockResolvedValue(completedInspection);

    await expect(
      scheduleInspection({
        organizationId: "org1",
        inspectionId: "insp1",
        inspectorId: "facility2",
        scheduledDate: "2026-02-01",
        decidedBy: "facility1",
      }),
    ).rejects.toThrow(/already completed/i);

    expect(mockPrisma.houseInspection.updateMany).not.toHaveBeenCalled();
  });

  it("cannot re-finalise an already released allocation", async () => {
    // The archive write is compare-and-set on `status: RELEASE_PENDING` AND
    // `terminatedAt: null`, so a replayed completion cannot rewrite the release
    // or put the house back into the pool a second time.
    mockPrisma.houseInspection.findFirst.mockResolvedValue({
      ...completedInspection,
      resolvedTo: null,
    });
    mockPrisma.household.findFirst.mockResolvedValue(household);
    mockPrisma.houseInspection.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.houseAllocation.updateMany.mockResolvedValue({ count: 0 });

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
    ).rejects.toThrow(/no longer pending/i);

    expect(mockPrisma.household.update).not.toHaveBeenCalled();
  });
});
