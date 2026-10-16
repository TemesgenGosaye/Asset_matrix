import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const { client, txExecuteRawUnsafe } = vi.hoisted(() => {
  const employee = { findFirst: vi.fn(), findMany: vi.fn() };
  const houseRequest = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
  const houseAllocation = { findFirst: vi.fn(), findMany: vi.fn() };
  const audit_logs = { create: vi.fn(), findMany: vi.fn() };
  const engineConfigVersion = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  };
  // The transaction client, captured so tests can assert on lock ordering.
  const txExecuteRawUnsafe = vi.fn().mockResolvedValue(0);

  const mockClient = {
    employee,
    houseRequest,
    houseAllocation,
    audit_logs,
    engineConfigVersion,
    household: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({
        employee,
        houseRequest,
        houseAllocation,
        audit_logs,
        household: mockClient.household,
        $executeRawUnsafe: txExecuteRawUnsafe,
      }),
    ),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    $extends: vi.fn(() => mockClient),
  };
  return { client: mockClient, txExecuteRawUnsafe };
});

vi.mock("@/lib/prisma", () => ({ default: client }));

vi.mock("@/lib/audit-log", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit-log")>();
  return { ...actual, createAuditLog: vi.fn().mockResolvedValue(undefined) };
});

import {
  HouseRequestRejectedError,
  cancelHouseRequest,
  lookupEmployeeForHouseRequest,
  submitHouseRequest,
} from "../service";
import { createAuditLog, AUDIT_ACTIONS, AUDIT_ENTITIES } from "@/lib/audit-log";
import { ConflictError, NotFoundError } from "@/lib/api-route";
import { REMARKS_MAX_LENGTH, houseRequestLockKey } from "../constants";

const ORG = "org-1";
const EMPLOYEE_ID = "550e8400-e29b-41d4-a716-446655440000";

const mock = client as unknown as Record<
  string,
  Record<string, ReturnType<typeof vi.fn>>
>;

/** The default ACTIVE engine-config row (mirrors DEFAULT_ENGINE_CONFIG). */
const activeConfig = {
  id: "cfg-1",
  organizationId: ORG,
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
};

function employeeRow(over: Record<string, unknown> = {}) {
  return {
    id: EMPLOYEE_ID,
    employeeNumber: "EMP-001",
    firstname: "Abebe",
    lastname: "Bikila",
    jobGrade: 13,
    jobTitle: "Senior Agronomist",
    departmentId: "dep-1",
    department: { name: "Agronomy" },
    gender: "male",
    hireDate: new Date("2018-05-01"),
    maritalStatus: "married",
    familySize: 4,
    disabilityStatus: false,
    employmentType: "full_time",
    employmentStatus: "active",
    phone: "+251911000000",
    nationalId: "AB-123456",
    deletedAt: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  mock.engineConfigVersion.findFirst.mockResolvedValue(activeConfig);
  mock.engineConfigVersion.findMany.mockResolvedValue([activeConfig]);

  // Default happy path: one active, grade-13 employee with no request and no
  // allocation. Individual tests override exactly what they exercise.
  mock.employee.findFirst.mockResolvedValue(employeeRow());
  mock.houseRequest.findFirst.mockResolvedValue(null);
  mock.houseRequest.findMany.mockResolvedValue([]);
  mock.houseAllocation.findFirst.mockResolvedValue(null);

  mock.houseRequest.create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: "req-1",
      employeeId: data.employeeId,
      remarks: data.remarks,
      status: data.status,
      createdAt: new Date("2026-09-27T10:00:00Z"),
      employee: {
        employeeNumber: "EMP-001",
        firstname: "Abebe",
        lastname: "Bikila",
      },
    }),
  );

  mock.houseRequest.update.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: "req-1",
      employeeId: EMPLOYEE_ID,
      status: data.status,
    }),
  );

  // The service re-reads the grade for the confirmation band.
  mock.employee.findMany.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

describe("lookupEmployeeForHouseRequest", () => {
  it("returns the live record for a verified, eligible employee", async () => {
    const result = await lookupEmployeeForHouseRequest({
      organizationId: ORG,
      employeeNumber: "EMP-001",
      canViewSensitive: false,
    });

    expect(result.employee).toMatchObject({
      id: EMPLOYEE_ID,
      employeeNumber: "EMP-001",
      fullName: "Abebe Bikila",
      jobGrade: 13,
      departmentName: "Agronomy",
      gender: "male",
      maritalStatus: "married",
      employmentStatus: "active",
      // Grade 13 → band B under the central rule.
      houseCategory: "B",
    });
    expect(result.existingRequest).toBeNull();
    expect(result.hasAllocatedHouse).toBe(false);
    expect(result.eligibilityLegend).toContain("15 – 17 → A");
  });

  it("derives service years from the hire date rather than storing it", async () => {
    mock.employee.findFirst.mockResolvedValue(
      employeeRow({ hireDate: new Date("2016-01-01") }),
    );
    const result = await lookupEmployeeForHouseRequest({
      organizationId: ORG,
      employeeNumber: "EMP-001",
      canViewSensitive: false,
    });
    expect(result.employee.serviceYears).toBeGreaterThanOrEqual(9);
  });

  it("masks the National ID without the sensitive permission", async () => {
    const masked = await lookupEmployeeForHouseRequest({
      organizationId: ORG,
      employeeNumber: "EMP-001",
      canViewSensitive: false,
    });
    expect(masked.employee.nationalIdMasked).not.toBe("AB-123456");
    expect(masked.employee.nationalIdMasked).toContain("*");
    expect(masked.employee.nationalIdMasked.endsWith("3456")).toBe(true);
  });

  it("returns the unmasked National ID with the sensitive permission", async () => {
    const full = await lookupEmployeeForHouseRequest({
      organizationId: ORG,
      employeeNumber: "EMP-001",
      canViewSensitive: true,
    });
    expect(full.employee.nationalIdMasked).toBe("AB-123456");
  });

  it("scopes the lookup to the caller's organization", async () => {
    await lookupEmployeeForHouseRequest({
      organizationId: "org-tenant-b",
      employeeNumber: "EMP-001",
      canViewSensitive: false,
    });
    expect(mock.employee.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: "org-tenant-b" }),
      }),
    );
  });

  it("falls back to a case-insensitive match", async () => {
    mock.employee.findFirst
      .mockResolvedValueOnce(null) // exact
      .mockResolvedValueOnce(employeeRow()); // insensitive fallback

    const result = await lookupEmployeeForHouseRequest({
      organizationId: ORG,
      employeeNumber: "emp-001",
      canViewSensitive: false,
    });
    expect(result.employee.employeeNumber).toBe("EMP-001");
    expect(mock.employee.findFirst).toHaveBeenCalledTimes(2);
  });

  it("rejects an unknown Employee ID", async () => {
    mock.employee.findFirst.mockResolvedValue(null);
    await expect(
      lookupEmployeeForHouseRequest({
        organizationId: ORG,
        employeeNumber: "NOPE-999",
        canViewSensitive: false,
      }),
    ).rejects.toMatchObject({ code: "EMPLOYEE_NOT_FOUND" });
  });

  it("rejects an archived (soft-deleted) employee", async () => {
    mock.employee.findFirst.mockResolvedValue(
      employeeRow({ deletedAt: new Date() }),
    );
    await expect(
      lookupEmployeeForHouseRequest({
        organizationId: ORG,
        employeeNumber: "EMP-001",
        canViewSensitive: false,
      }),
    ).rejects.toMatchObject({ code: "EMPLOYEE_ARCHIVED" });
  });

  it.each(["on_leave", "terminated", "retired"])(
    "rejects an employee whose status is %s",
    async (status) => {
      mock.employee.findFirst.mockResolvedValue(
        employeeRow({ employmentStatus: status }),
      );
      await expect(
        lookupEmployeeForHouseRequest({
          organizationId: ORG,
          employeeNumber: "EMP-001",
          canViewSensitive: false,
        }),
      ).rejects.toMatchObject({ code: "EMPLOYEE_INACTIVE" });
    },
  );

  it("reports archived ahead of inactive so the message names the root cause", async () => {
    mock.employee.findFirst.mockResolvedValue(
      employeeRow({ deletedAt: new Date(), employmentStatus: "terminated" }),
    );
    await expect(
      lookupEmployeeForHouseRequest({
        organizationId: ORG,
        employeeNumber: "EMP-001",
        canViewSensitive: false,
      }),
    ).rejects.toMatchObject({ code: "EMPLOYEE_ARCHIVED" });
  });

  // The central job-grade rule: every band boundary, both sides.
  it.each([
    [18, "Staff"],
    [30, "Staff"],
    [17, "A"],
    [15, "A"],
    [14, "B"],
    [12, "B"],
    [11, "C"],
    [10, "C"],
    [9, "D"],
    [7, "D"],
    [6, "E"],
    [1, "E"],
  ])("maps job grade %i to the %s band", async (grade, category) => {
    mock.employee.findFirst.mockResolvedValue(employeeRow({ jobGrade: grade }));
    const result = await lookupEmployeeForHouseRequest({
      organizationId: ORG,
      employeeNumber: "EMP-001",
      canViewSensitive: false,
    });
    expect(result.employee.houseCategory).toBe(category);
  });

  it.each([
    ["grade 0", 0],
    ["a negative grade", -3],
    ["an unset grade", null],
  ])("rejects an employee with %s", async (_label, grade) => {
    mock.employee.findFirst.mockResolvedValue(employeeRow({ jobGrade: grade }));
    await expect(
      lookupEmployeeForHouseRequest({
        organizationId: ORG,
        employeeNumber: "EMP-001",
        canViewSensitive: false,
      }),
    ).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
  });

  it("honours re-cut eligibility bands from the ACTIVE engine config", async () => {
    // Policy moved so grade 13 now falls outside every band.
    mock.engineConfigVersion.findFirst.mockResolvedValue({
      ...activeConfig,
      eligibilityBands: [
        { category: "Staff", gradeMin: 20, gradeMax: null },
        { category: "A", gradeMin: 15, gradeMax: 19 },
      ],
    });
    await expect(
      lookupEmployeeForHouseRequest({
        organizationId: ORG,
        employeeNumber: "EMP-001",
        canViewSensitive: false,
      }),
    ).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
  });

  it("reports an existing request as data so the page can still render details", async () => {
    mock.houseRequest.findFirst.mockResolvedValue({
      id: "req-9",
      status: "submitted",
      remarks: "Family of five in a shared camp house.",
      createdAt: new Date("2026-09-20T08:00:00Z"),
    });

    const result = await lookupEmployeeForHouseRequest({
      organizationId: ORG,
      employeeNumber: "EMP-001",
      canViewSensitive: false,
    });

    expect(result.existingRequest).toMatchObject({
      id: "req-9",
      status: "submitted",
      submittedAt: "2026-09-20T08:00:00.000Z",
    });
    expect(result.employee.fullName).toBe("Abebe Bikila");
  });

  it("reports an allocated house as data", async () => {
    mock.houseAllocation.findFirst.mockResolvedValue({
      householdId: "house-1",
    });
    const result = await lookupEmployeeForHouseRequest({
      organizationId: ORG,
      employeeNumber: "EMP-001",
      canViewSensitive: false,
    });
    expect(result.hasAllocatedHouse).toBe(true);
  });

  it("raises instead of reporting when throwOnBlocked is set", async () => {
    mock.houseRequest.findFirst.mockResolvedValue({
      id: "req-9",
      status: "submitted",
      remarks: "Family of five in a shared camp house.",
      createdAt: new Date("2026-09-20T08:00:00Z"),
    });
    await expect(
      lookupEmployeeForHouseRequest({
        organizationId: ORG,
        employeeNumber: "EMP-001",
        canViewSensitive: false,
        throwOnBlocked: true,
      }),
    ).rejects.toMatchObject({ code: "REQUEST_ALREADY_EXISTS" });
  });
});

// ---------------------------------------------------------------------------
// Submission
// ---------------------------------------------------------------------------

describe("submitHouseRequest", () => {
  const base = {
    organizationId: ORG,
    employeeNumber: "EMP-001",
    remarks: "Family of five currently sharing a camp house.",
    submittedBy: "user-1",
  };

  it("creates the request and returns a confirmation payload", async () => {
    const result = await submitHouseRequest(base);

    expect(result).toMatchObject({
      requestId: "req-1",
      employeeId: EMPLOYEE_ID,
      employeeNumber: "EMP-001",
      fullName: "Abebe Bikila",
      status: "submitted",
      houseCategory: "B",
      submittedAt: "2026-09-27T10:00:00.000Z",
    });

    expect(mock.houseRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: ORG,
          employeeId: EMPLOYEE_ID,
          status: "submitted",
          submittedBy: "user-1",
        }),
      }),
    );
  });

  it("writes the remarks exactly as validated (already trimmed)", async () => {
    await submitHouseRequest({ ...base, remarks: "  Family of five.  " });
    const call = mock.houseRequest.create.mock.calls[0][0] as {
      data: { remarks: string };
    };
    expect(call.data.remarks).toBe("Family of five.");
  });

  it("re-reads the employee INSIDE the transaction rather than trusting a snapshot", async () => {
    await submitHouseRequest(base);
    // Two employee reads: one on the transaction client (authoritative), and the
    // grade re-read for the confirmation band.
    expect(mock.employee.findFirst).toHaveBeenCalled();
    expect(
      mock.houseRequest.create.mock.invocationCallOrder[0],
    ).toBeGreaterThan(mock.employee.findFirst.mock.invocationCallOrder[0]);
  });

  it("records the submission in the audit log inside the same transaction", async () => {
    await submitHouseRequest(base);

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        action: AUDIT_ACTIONS.REQUEST,
        entity: AUDIT_ENTITIES.HOUSE_REQUEST,
        entityId: "req-1",
        details: expect.objectContaining({
          employeeId: EMPLOYEE_ID,
          employeeNumber: "EMP-001",
          employeeName: "Abebe Bikila",
          jobGrade: 13,
          houseCategory: "B",
          remarks: base.remarks,
        }),
        tx: expect.any(Object),
      }),
    );
  });

  it("rejects a duplicate active request found in the transaction", async () => {
    mock.houseRequest.findFirst.mockResolvedValue({ id: "req-existing" });
    await expect(submitHouseRequest(base)).rejects.toMatchObject({
      code: "REQUEST_ALREADY_EXISTS",
    });
    expect(mock.houseRequest.create).not.toHaveBeenCalled();
  });

  it("rejects an employee who already holds a live allocation", async () => {
    mock.houseAllocation.findFirst.mockResolvedValue({ id: "al-1" });
    await expect(submitHouseRequest(base)).rejects.toMatchObject({
      code: "ALREADY_ALLOCATED",
    });
    expect(mock.houseRequest.create).not.toHaveBeenCalled();
  });

  it("rejects an ineligible employee before writing anything", async () => {
    mock.employee.findFirst.mockResolvedValue(employeeRow({ jobGrade: 0 }));
    await expect(submitHouseRequest(base)).rejects.toMatchObject({
      code: "NOT_ELIGIBLE",
    });
    expect(mock.houseRequest.create).not.toHaveBeenCalled();
  });

  it("rejects an employee who went inactive between render and submit", async () => {
    mock.employee.findFirst.mockResolvedValue(
      employeeRow({ employmentStatus: "terminated" }),
    );
    await expect(submitHouseRequest(base)).rejects.toMatchObject({
      code: "EMPLOYEE_INACTIVE",
    });
  });

  it("rejects an employee who was archived between render and submit", async () => {
    mock.employee.findFirst.mockResolvedValue(
      employeeRow({ deletedAt: new Date() }),
    );
    await expect(submitHouseRequest(base)).rejects.toMatchObject({
      code: "EMPLOYEE_ARCHIVED",
    });
  });

  /**
   * The lock is what turns a check-then-insert race into a clean 409 instead of
   * a raw unique violation. It must therefore be taken BEFORE the duplicate
   * re-check and before the INSERT, on the TRANSACTION client (so it is released
   * at commit/rollback rather than leaking a session-level lock).
   */
  it("takes a transaction-scoped advisory lock before re-checking and inserting", async () => {
    await submitHouseRequest(base);

    expect(txExecuteRawUnsafe).toHaveBeenCalledTimes(1);
    const [sql, namespace, key] = txExecuteRawUnsafe.mock.calls[0];
    expect(String(sql)).toContain("pg_advisory_xact_lock");

    expect(namespace).toBe(7282711);
    expect(key).toBe(houseRequestLockKey(EMPLOYEE_ID));

    const lockOrder = txExecuteRawUnsafe.mock.invocationCallOrder[0];
    const duplicateCheckOrder =
      mock.houseRequest.findFirst.mock.invocationCallOrder[0];
    const insertOrder = mock.houseRequest.create.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(duplicateCheckOrder);
    expect(lockOrder).toBeLessThan(insertOrder);
  });

  it("translates a unique-index violation (concurrent double submit) into a 409", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError("unique", {
      code: "P2002",
      clientVersion: "7.0.0",
      meta: { target: ["organizationId", "employeeId"] },
    });
    mock.houseRequest.create.mockRejectedValue(p2002);

    await expect(submitHouseRequest(base)).rejects.toBeInstanceOf(
      ConflictError,
    );
    await expect(submitHouseRequest(base)).rejects.toThrow(
      /already has an active house request/i,
    );
  });

  it("surfaces a missing employee as a 404 when the driver reports P2025", async () => {
    const p2025 = new Prisma.PrismaClientKnownRequestError("not found", {
      code: "P2025",
      clientVersion: "7.0.0",
    });
    mock.houseRequest.create.mockRejectedValue(p2025);
    await expect(submitHouseRequest(base)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("never stores a client-asserted grade — only the re-read one", async () => {
    mock.employee.findFirst.mockResolvedValue(employeeRow({ jobGrade: 15 }));
    const result = await submitHouseRequest(base);
    expect(result.houseCategory).toBe("A");
    const call = mock.houseRequest.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(call.data).not.toHaveProperty("jobGrade");
    expect(call.data).not.toHaveProperty("firstname");
  });

  it("rejects remarks longer than the column allows at the service boundary", async () => {
    // The service re-validates its own input, so this holds even when the
    // caller skipped the route's Zod schema.
    await expect(
      submitHouseRequest({
        ...base,
        remarks: "x".repeat(REMARKS_MAX_LENGTH + 1),
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(mock.houseRequest.create).not.toHaveBeenCalled();
  });

  it("rejects blank remarks at the service boundary", async () => {
    await expect(
      submitHouseRequest({ ...base, remarks: "     " }),
    ).rejects.toMatchObject({ status: 400 });
    expect(mock.houseRequest.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

describe("cancelHouseRequest", () => {
  it("closes a live request and audits the transition", async () => {
    mock.houseRequest.findFirst.mockResolvedValue({
      id: "req-1",
      employeeId: EMPLOYEE_ID,
      status: "submitted",
      remarks: "Family of five.",
    });

    const result = await cancelHouseRequest({
      organizationId: ORG,
      requestId: "req-1",
      decidedBy: "user-9",
      reason: "Filed in error",
    });

    expect(result).toEqual({
      requestId: "req-1",
      employeeId: EMPLOYEE_ID,
      status: "cancelled",
    });
    expect(mock.houseRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "req-1" },
        data: expect.objectContaining({
          status: "cancelled",
          decidedBy: "user-9",
        }),
      }),
    );
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ACTIONS.CANCEL,
        entity: AUDIT_ENTITIES.HOUSE_REQUEST,
        details: expect.objectContaining({ reason: "Filed in error" }),
      }),
    );
  });

  it("404s for a request outside the organization", async () => {
    mock.houseRequest.findFirst.mockResolvedValue(null);
    await expect(
      cancelHouseRequest({
        organizationId: ORG,
        requestId: "req-x",
        decidedBy: "u",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("409s when the request is already cancelled", async () => {
    mock.houseRequest.findFirst.mockResolvedValue({
      id: "req-1",
      employeeId: EMPLOYEE_ID,
      status: "cancelled",
      remarks: "Family of five.",
    });
    await expect(
      cancelHouseRequest({
        organizationId: ORG,
        requestId: "req-1",
        decidedBy: "u",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses to cancel a request whose employee already holds a house", async () => {
    mock.houseRequest.findFirst.mockResolvedValue({
      id: "req-1",
      employeeId: EMPLOYEE_ID,
      status: "submitted",
      remarks: "Family of five.",
    });
    mock.houseAllocation.findFirst.mockResolvedValue({ id: "al-1" });

    await expect(
      cancelHouseRequest({
        organizationId: ORG,
        requestId: "req-1",
        decidedBy: "u",
      }),
    ).rejects.toMatchObject({ code: "ALREADY_ALLOCATED" });
    expect(mock.houseRequest.update).not.toHaveBeenCalled();
  });
});

describe("HouseRequestRejectedError", () => {
  it("is a BadRequestError so the route maps it to HTTP 400", () => {
    const error = new HouseRequestRejectedError("NOT_ELIGIBLE", "nope");
    expect(error.status).toBe(400);
    expect(error.code).toBe("NOT_ELIGIBLE");
    expect(error.name).toBe("HouseRequestRejectedError");
  });
});
