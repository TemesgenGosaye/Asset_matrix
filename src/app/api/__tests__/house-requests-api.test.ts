import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  createMockRequest,
  parseResponse,
} from "../../../../tests/setup/test-helpers";

const mockPrisma = vi.hoisted(() => ({
  employee: { findFirst: vi.fn(), findMany: vi.fn() },
  houseRequest: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  houseAllocation: { findFirst: vi.fn(), findMany: vi.fn() },
  audit_logs: { create: vi.fn(), findMany: vi.fn() },
  engineConfigVersion: { findFirst: vi.fn(), findMany: vi.fn() },
  household: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
  $extends: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ default: mockPrisma }));

vi.mock("@/lib/api-auth", () => ({
  requirePermission: vi.fn(),
  requireNotDemoMode: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/organization-context", () => ({
  getOrganizationContext: vi.fn(),
}));

vi.mock("@/lib/audit-log", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit-log")>();
  return { ...actual, createAuditLog: vi.fn().mockResolvedValue(undefined) };
});

vi.mock("@/lib/employees/access", () => ({
  canViewSensitiveEmployeeData: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/lib/ai/cache", () => ({
  invalidateAssistantCache: vi.fn(),
  CACHE_DOMAIN: {
    housing: "housing",
    queue: "queue",
    assets: "assets",
    tickets: "tickets",
    people: "people",
  },
}));

import { GET as lookupRoute } from "@/app/api/house-requests/lookup/route";
import { POST as submitRoute } from "@/app/api/house-requests/route";
import { POST as cancelRoute } from "@/app/api/house-requests/[id]/cancel/route";
import { requirePermission } from "@/lib/api-auth";
import { getOrganizationContext } from "@/lib/organization-context";

const mockRequirePermission = requirePermission as unknown as ReturnType<
  typeof vi.fn
>;
const mockGetOrgContext = getOrganizationContext as unknown as ReturnType<
  typeof vi.fn
>;

const ORG = "org-1";
const EMPLOYEE_ID = "550e8400-e29b-41d4-a716-446655440000";

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
    organizationId: ORG,
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

const authUser = { id: "user-1", isAdmin: false };

beforeEach(() => {
  vi.clearAllMocks();

  mockRequirePermission.mockResolvedValue(authUser);
  mockGetOrgContext.mockResolvedValue({
    organization: { id: ORG },
    permissions: new Set(["house_request:create"]),
    isAdmin: false,
  });

  mockPrisma.engineConfigVersion.findFirst.mockResolvedValue(activeConfig);
  mockPrisma.engineConfigVersion.findMany.mockResolvedValue([activeConfig]);
  mockPrisma.employee.findFirst.mockResolvedValue(employeeRow());
  mockPrisma.employee.findMany.mockResolvedValue([]);
  mockPrisma.houseRequest.findFirst.mockResolvedValue(null);
  mockPrisma.houseRequest.findMany.mockResolvedValue([]);
  mockPrisma.houseAllocation.findFirst.mockResolvedValue(null);
  mockPrisma.houseRequest.create.mockImplementation(
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
  mockPrisma.houseRequest.update.mockResolvedValue({
    id: "req-1",
    employeeId: EMPLOYEE_ID,
    status: "cancelled",
  });

  mockPrisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
    fn({
      employee: mockPrisma.employee,
      houseRequest: mockPrisma.houseRequest,
      houseAllocation: mockPrisma.houseAllocation,
      audit_logs: mockPrisma.audit_logs,
      household: mockPrisma.household,
      $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    }),
  );
  (
    mockPrisma as unknown as { $extends: ReturnType<typeof vi.fn> }
  ).$extends.mockReturnValue(mockPrisma);
});

// ---------------------------------------------------------------------------
// RBAC
// ---------------------------------------------------------------------------

describe("House Request API — RBAC", () => {
  it("401s the lookup route without an authenticated caller", async () => {
    mockRequirePermission.mockRejectedValue(new Error("Unauthorized"));
    const res = await lookupRoute(
      createMockRequest(
        "http://localhost/api/house-requests/lookup?employeeNumber=EMP-001",
      ),
    );
    expect(res.status).toBe(401);
  });

  it("403s the lookup route without house_request:create", async () => {
    mockRequirePermission.mockRejectedValue(
      new Error("Forbidden: Insufficient permissions"),
    );
    const res = await lookupRoute(
      createMockRequest(
        "http://localhost/api/house-requests/lookup?employeeNumber=EMP-001",
      ),
    );
    expect(res.status).toBe(403);
  });

  it("403s the submit route without house_request:create", async () => {
    mockRequirePermission.mockRejectedValue(
      new Error("Forbidden: Insufficient permissions"),
    );
    const res = await submitRoute(
      createMockRequest("http://localhost/api/house-requests", {
        method: "POST",
        body: { employeeNumber: "EMP-001", remarks: "Family of five." },
      }),
    );
    expect(res.status).toBe(403);
    expect(mockPrisma.houseRequest.create).not.toHaveBeenCalled();
  });

  it("403s the cancel route without house_request:manage", async () => {
    mockRequirePermission.mockRejectedValue(
      new Error("Forbidden: Insufficient permissions"),
    );
    const res = await cancelRoute(
      createMockRequest("http://localhost/api/house-requests/req-1/cancel", {
        method: "POST",
        body: {},
      }),
      { params: Promise.resolve({ id: "req-1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("400s when the caller has no organization context", async () => {
    mockGetOrgContext.mockResolvedValue(null);
    const res = await submitRoute(
      createMockRequest("http://localhost/api/house-requests", {
        method: "POST",
        body: { employeeNumber: "EMP-001", remarks: "Family of five." },
      }),
    );
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Lookup route
// ---------------------------------------------------------------------------

describe("GET /api/house-requests/lookup", () => {
  it("returns the verified employee record", async () => {
    const res = await lookupRoute(
      createMockRequest(
        "http://localhost/api/house-requests/lookup?employeeNumber=EMP-001",
      ),
    );
    const { status, body } = await parseResponse<{
      employee: {
        employeeNumber: string;
        fullName: string;
        houseCategory: string;
      };
      existingRequest: unknown;
      hasAllocatedHouse: boolean;
    }>(res);

    expect(status).toBe(200);
    expect(body.employee).toMatchObject({
      employeeNumber: "EMP-001",
      fullName: "Abebe Bikila",
      houseCategory: "B",
    });
    expect(body.existingRequest).toBeNull();
    expect(body.hasAllocatedHouse).toBe(false);
  });

  it("400s with EMPLOYEE_NOT_FOUND for an unknown ID", async () => {
    mockPrisma.employee.findFirst.mockResolvedValue(null);
    const res = await lookupRoute(
      createMockRequest(
        "http://localhost/api/house-requests/lookup?employeeNumber=NOPE-999",
      ),
    );
    const { status, body } = await parseResponse<{
      code: string;
      error: string;
    }>(res);
    expect(status).toBe(400);
    expect(body.code).toBe("EMPLOYEE_NOT_FOUND");
    expect(body.error).toMatch(/No employee with this Employee ID was found/i);
  });

  it("400s with EMPLOYEE_INACTIVE for a terminated employee", async () => {
    mockPrisma.employee.findFirst.mockResolvedValue(
      employeeRow({ employmentStatus: "terminated" }),
    );
    const res = await lookupRoute(
      createMockRequest(
        "http://localhost/api/house-requests/lookup?employeeNumber=EMP-001",
      ),
    );
    const { status, body } = await parseResponse<{ code: string }>(res);
    expect(status).toBe(400);
    expect(body.code).toBe("EMPLOYEE_INACTIVE");
  });

  it("400s with NOT_ELIGIBLE for a grade outside every band", async () => {
    mockPrisma.employee.findFirst.mockResolvedValue(
      employeeRow({ jobGrade: 0 }),
    );
    const res = await lookupRoute(
      createMockRequest(
        "http://localhost/api/house-requests/lookup?employeeNumber=EMP-001",
      ),
    );
    const { status, body } = await parseResponse<{ code: string }>(res);
    expect(status).toBe(400);
    expect(body.code).toBe("NOT_ELIGIBLE");
  });

  it("400s when the employeeNumber query param is missing", async () => {
    const res = await lookupRoute(
      createMockRequest("http://localhost/api/house-requests/lookup"),
    );
    const { status, body } = await parseResponse<{
      error: string;
      fields: Record<string, string[]>;
    }>(res);
    expect(status).toBe(400);
    expect(body.fields).toHaveProperty("employeeNumber");
  });

  it("400s for an over-long employeeNumber", async () => {
    const res = await lookupRoute(
      createMockRequest(
        `http://localhost/api/house-requests/lookup?employeeNumber=${"x".repeat(60)}`,
      ),
    );
    expect(res.status).toBe(400);
  });

  it("reports an existing request with HTTP 200 so the form can still render", async () => {
    mockPrisma.houseRequest.findFirst.mockResolvedValue({
      id: "req-9",
      status: "submitted",
      remarks: "Family of five in a shared camp house.",
      createdAt: new Date("2026-09-20T08:00:00Z"),
    });
    const res = await lookupRoute(
      createMockRequest(
        "http://localhost/api/house-requests/lookup?employeeNumber=EMP-001",
      ),
    );
    const { status, body } = await parseResponse<{
      existingRequest: { id: string } | null;
      employee: { fullName: string };
    }>(res);
    expect(status).toBe(200);
    expect(body.existingRequest?.id).toBe("req-9");
    expect(body.employee.fullName).toBe("Abebe Bikila");
  });

  it("reports a live allocation with HTTP 200", async () => {
    mockPrisma.houseAllocation.findFirst.mockResolvedValue({
      householdId: "h-1",
    });
    const res = await lookupRoute(
      createMockRequest(
        "http://localhost/api/house-requests/lookup?employeeNumber=EMP-001",
      ),
    );
    const { status, body } = await parseResponse<{
      hasAllocatedHouse: boolean;
    }>(res);
    expect(status).toBe(200);
    expect(body.hasAllocatedHouse).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Submit route
// ---------------------------------------------------------------------------

describe("POST /api/house-requests", () => {
  const validBody = {
    employeeNumber: "EMP-001",
    remarks: "Family of five currently sharing a camp house.",
  };

  it("creates the request and returns 201", async () => {
    const res = await submitRoute(
      createMockRequest("http://localhost/api/house-requests", {
        method: "POST",
        body: validBody,
      }),
    );
    const { status, body } = await parseResponse<{
      requestId: string;
      status: string;
      houseCategory: string;
    }>(res);

    expect(status).toBe(201);
    expect(body.requestId).toBe("req-1");
    expect(body.status).toBe("submitted");
    expect(body.houseCategory).toBe("B");
  });

  it("400s on a missing remarks field and never writes", async () => {
    const res = await submitRoute(
      createMockRequest("http://localhost/api/house-requests", {
        method: "POST",
        body: { employeeNumber: "EMP-001" },
      }),
    );
    const { status, body } = await parseResponse<{
      fields: Record<string, string[]>;
    }>(res);
    expect(status).toBe(400);
    expect(body.fields).toHaveProperty("remarks");
    expect(mockPrisma.houseRequest.create).not.toHaveBeenCalled();
  });

  it("400s on remarks below the minimum length", async () => {
    const res = await submitRoute(
      createMockRequest("http://localhost/api/house-requests", {
        method: "POST",
        body: { ...validBody, remarks: "short" },
      }),
    );
    expect(res.status).toBe(400);
    expect(mockPrisma.houseRequest.create).not.toHaveBeenCalled();
  });

  it("400s on a malformed JSON body", async () => {
    const res = await submitRoute(
      new NextRequest("http://localhost/api/house-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{ not json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("400s with REQUEST_ALREADY_EXISTS for a duplicate", async () => {
    mockPrisma.houseRequest.findFirst.mockResolvedValue({ id: "req-existing" });
    const res = await submitRoute(
      createMockRequest("http://localhost/api/house-requests", {
        method: "POST",
        body: validBody,
      }),
    );
    const { status, body } = await parseResponse<{
      code: string;
      error: string;
    }>(res);
    expect(status).toBe(400);
    expect(body.code).toBe("REQUEST_ALREADY_EXISTS");
    expect(mockPrisma.houseRequest.create).not.toHaveBeenCalled();
  });

  it("400s with ALREADY_ALLOCATED when the employee holds a house", async () => {
    mockPrisma.houseAllocation.findFirst.mockResolvedValue({ id: "al-1" });
    const res = await submitRoute(
      createMockRequest("http://localhost/api/house-requests", {
        method: "POST",
        body: validBody,
      }),
    );
    const { status, body } = await parseResponse<{ code: string }>(res);
    expect(status).toBe(400);
    expect(body.code).toBe("ALREADY_ALLOCATED");
  });

  it("400s with NOT_ELIGIBLE for a grade outside every band", async () => {
    mockPrisma.employee.findFirst.mockResolvedValue(
      employeeRow({ jobGrade: 0 }),
    );
    const res = await submitRoute(
      createMockRequest("http://localhost/api/house-requests", {
        method: "POST",
        body: validBody,
      }),
    );
    const { status, body } = await parseResponse<{ code: string }>(res);
    expect(status).toBe(400);
    expect(body.code).toBe("NOT_ELIGIBLE");
  });

  it("400s with EMPLOYEE_NOT_FOUND for an unknown ID", async () => {
    mockPrisma.employee.findFirst.mockResolvedValue(null);
    const res = await submitRoute(
      createMockRequest("http://localhost/api/house-requests", {
        method: "POST",
        body: validBody,
      }),
    );
    const { status, body } = await parseResponse<{ code: string }>(res);
    expect(status).toBe(400);
    expect(body.code).toBe("EMPLOYEE_NOT_FOUND");
  });

  it("discards client-asserted employee attributes", async () => {
    await submitRoute(
      createMockRequest("http://localhost/api/house-requests", {
        method: "POST",
        body: { ...validBody, jobGrade: 50, firstname: "Mallory" },
      }),
    );
    const call = mockPrisma.houseRequest.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(call.data).not.toHaveProperty("jobGrade");
    expect(call.data).not.toHaveProperty("firstname");
  });
});

// ---------------------------------------------------------------------------
// Cancel route
// ---------------------------------------------------------------------------

describe("POST /api/house-requests/[id]/cancel", () => {
  it("cancels the request and returns 200", async () => {
    mockRequirePermission.mockResolvedValue({ id: "user-9", isAdmin: true });
    mockPrisma.houseRequest.findFirst.mockResolvedValue({
      id: "req-1",
      employeeId: EMPLOYEE_ID,
      status: "submitted",
      remarks: "Family of five.",
    });

    const res = await cancelRoute(
      createMockRequest("http://localhost/api/house-requests/req-1/cancel", {
        method: "POST",
        body: { reason: "Filed in error" },
      }),
      { params: Promise.resolve({ id: "req-1" }) },
    );
    const { status, body } = await parseResponse<{ status: string }>(res);

    expect(status).toBe(200);
    expect(body.status).toBe("cancelled");
  });

  it("404s for a request outside the organization", async () => {
    mockRequirePermission.mockResolvedValue({ id: "user-9", isAdmin: true });
    mockPrisma.houseRequest.findFirst.mockResolvedValue(null);
    const res = await cancelRoute(
      createMockRequest("http://localhost/api/house-requests/req-x/cancel", {
        method: "POST",
        body: {},
      }),
      { params: Promise.resolve({ id: "req-x" }) },
    );
    expect(res.status).toBe(404);
  });

  it("400s on an over-long cancellation reason", async () => {
    mockRequirePermission.mockResolvedValue({ id: "user-9", isAdmin: true });
    const res = await cancelRoute(
      createMockRequest("http://localhost/api/house-requests/req-1/cancel", {
        method: "POST",
        body: { reason: "x".repeat(1200) },
      }),
      { params: Promise.resolve({ id: "req-1" }) },
    );
    expect(res.status).toBe(400);
  });
});
