import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `GET /api/house-requests/verify?empId=…` and the service behind it.
 *
 * The verification step is the one the whole feature rests on: everything after
 * it is a consequence of what this returns. So the cases pinned here are the ones
 * where being wrong writes the wrong record — a band that does not match the one
 * the request is filed into, a blocked employee who is told they may file, or a
 * 404 that tells an officer their Employee ID is wrong when it is merely inactive.
 */

const { client } = vi.hoisted(() => {
  const employee = { findFirst: vi.fn(), findMany: vi.fn() };
  const houseRequest = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
  const houseAllocation = { findFirst: vi.fn(), findMany: vi.fn() };
  const audit_logs = { create: vi.fn(), findMany: vi.fn() };
  const engineConfigVersion = { findFirst: vi.fn(), findMany: vi.fn() };
  const household = { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() };

  const mockClient = {
    employee,
    houseRequest,
    houseAllocation,
    audit_logs,
    engineConfigVersion,
    household,
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({
        employee,
        houseRequest,
        houseAllocation,
        audit_logs,
        household,
        $executeRawUnsafe: vi.fn().mockResolvedValue(0),
      }),
    ),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    $extends: vi.fn(() => mockClient),
  };
  return { client: mockClient };
});

vi.mock("@/lib/prisma", () => ({ default: client }));

vi.mock("@/lib/api-auth", () => ({
  requirePermission: vi.fn(),
  requireNotDemoMode: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/organization-context", () => ({
  getOrganizationContext: vi.fn(),
}));

vi.mock("@/lib/employees/access", () => ({
  canViewSensitiveEmployeeData: vi.fn().mockResolvedValue(false),
}));

import { verifyEmployeeForHouseRequest } from "../service";
import { GET as verifyRoute } from "@/app/api/house-requests/verify/route";
import { requirePermission } from "@/lib/api-auth";
import { getOrganizationContext } from "@/lib/organization-context";
import {
  createMockRequest,
  parseResponse,
} from "../../../../../tests/setup/test-helpers";
import type { HouseRequestVerifyResult } from "../types";

const mockRequirePermission = requirePermission as unknown as ReturnType<
  typeof vi.fn
>;
const mockGetOrgContext = getOrganizationContext as unknown as ReturnType<
  typeof vi.fn
>;

const mock = client as unknown as Record<
  string,
  Record<string, ReturnType<typeof vi.fn>>
>;

const ORG = "org-1";
const EMPLOYEE_ID = "550e8400-e29b-41d4-a716-446655440000";

/** The ACTIVE engine config, whose eligibility bands mirror the central rule. */
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
    locationSortOrder: "asc",
    houseNumberSortMode: "numeric_aware",
  },
};

/** A live employee row as `findEmployeeByNumber` receives it. */
function employeeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: EMPLOYEE_ID,
    employeeNumber: "EMP-0042",
    firstname: "Aster",
    lastname: "Bekele",
    jobGrade: 14,
    jobTitle: "Machine Operator",
    departmentId: "dep-1",
    department: { name: "Factory Maintenance" },
    gender: "female",
    hireDate: new Date("2019-03-01"),
    maritalStatus: "married",
    familySize: 4,
    disabilityStatus: false,
    employmentType: "full_time",
    employmentStatus: "active",
    phone: "0911223344",
    nationalId: "AB-1234567890",
    deletedAt: null,
    ...overrides,
  };
}

function activeRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: "req-1",
    employeeId: EMPLOYEE_ID,
    status: "submitted",
    remarks: "Family of four with no accommodation.",
    createdAt: new Date("2026-01-05T08:00:00.000Z"),
    ...overrides,
  };
}

function liveAllocation(overrides: Record<string, unknown> = {}) {
  return {
    id: "alloc-1",
    employeeId: EMPLOYEE_ID,
    householdId: "hh-9",
    decidedAt: new Date("2025-06-01T08:00:00.000Z"),
    moveCount: 0,
    household: {
      hid: "H-202",
      houseNumber: "B-202",
      houseType: "B",
      locationName: "Factory main camp",
      status: "Active",
      occupancyStatus: "Occupied",
    },
    ...overrides,
  };
}

async function verify(
  overrides: {
    empId?: string;
    employee?: Record<string, unknown> | null;
    request?: Record<string, unknown> | null;
    allocation?: Record<string, unknown> | null;
  } = {},
) {
  mock.employee.findFirst.mockResolvedValue(
    overrides.employee === undefined ? employeeRow() : overrides.employee,
  );
  mock.houseRequest.findFirst.mockResolvedValue(
    overrides.request === undefined ? null : overrides.request,
  );
  mock.houseAllocation.findFirst.mockResolvedValue(
    overrides.allocation === undefined ? null : overrides.allocation,
  );
  return verifyEmployeeForHouseRequest({
    organizationId: ORG,
    empId: overrides.empId ?? "EMP-0042",
    canViewSensitive: false,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequirePermission.mockResolvedValue({ id: "user-9", isAdmin: false });
  mockGetOrgContext.mockResolvedValue({ organization: { id: ORG } });
  mock.engineConfigVersion.findFirst.mockResolvedValue(activeConfig);
  mock.engineConfigVersion.findMany.mockResolvedValue([activeConfig]);
  mock.employee.findFirst.mockResolvedValue(employeeRow());
  mock.houseRequest.findFirst.mockResolvedValue(null);
  mock.houseAllocation.findFirst.mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// The happy path
// ---------------------------------------------------------------------------

describe("verifyEmployeeForHouseRequest — a valid Employee ID", () => {
  it("returns the employee's record as read from the Employee table", async () => {
    const result = await verify();

    expect(result.empId).toBe("EMP-0042");
    expect(result.fullName).toBe("Aster Bekele");
    expect(result.department).toBe("Factory Maintenance");
    expect(result.employee.jobGrade).toBe(14);
    expect(result.gender).toBe("female");
    expect(result.maritalStatus).toBe("married");
    expect(result.disabilityStatus).toBe(false);
    expect(result.hireDate).toBe("2019-03-01T00:00:00.000Z");
    expect(result.serviceYears).toBeGreaterThan(0);
  });

  it("resolves the band from the central job grade rule, not a second copy", async () => {
    // Grade 14 sits in band B under the published rule.
    const result = await verify();
    expect(result.isEligible).toBe(true);
    expect(result.eligibleHouseType).toBe("B");
    expect(result.eligibilityReason).toContain("Type B");
    // The same answer the snapshot carries, so the badge and the request agree.
    expect(result.employee.houseCategory).toBe("B");
  });

  it("reports no blockers for somebody who can file", async () => {
    const result = await verify();
    expect(result.alreadyHasActiveAllocation).toBe(false);
    expect(result.hasOpenRequest).toBe(false);
  });

  it("masks the National ID unless the caller may see it", async () => {
    const result = await verify();
    expect(result.employee.nationalIdMasked).toBe("*********7890");
  });

  it("falls back to a case-insensitive match rather than reporting not found", async () => {
    mock.employee.findFirst
      .mockResolvedValueOnce(null) // exact
      .mockResolvedValueOnce(employeeRow()); // insensitive fallback
    mock.houseRequest.findFirst.mockResolvedValue(null);
    mock.houseAllocation.findFirst.mockResolvedValue(null);

    const result = await verifyEmployeeForHouseRequest({
      organizationId: ORG,
      empId: "emp-0042",
      canViewSensitive: false,
    });
    expect(result.empId).toBe("EMP-0042");
  });
});

// ---------------------------------------------------------------------------
// The refusals
// ---------------------------------------------------------------------------

describe("verifyEmployeeForHouseRequest — refusals that are still answers", () => {
  it("reports a not-eligible grade rather than refusing to answer", async () => {
    // Job grade 0 falls outside every published band.
    const result = await verify({ employee: employeeRow({ jobGrade: 0 }) });

    expect(result.isEligible).toBe(false);
    expect(result.eligibleHouseType).toBeNull();
    expect(result.eligibilityReason).toContain(
      "does not fall inside any published house band",
    );
    // The record is still returned — the page needs it to explain the block.
    expect(result.fullName).toBe("Aster Bekele");
  });

  it("reports an unset grade as unmapped", async () => {
    const result = await verify({ employee: employeeRow({ jobGrade: null }) });
    expect(result.isEligible).toBe(false);
    expect(result.eligibilityReason).toContain("is not set");
  });

  it("flags an employee who already holds a house", async () => {
    const result = await verify({ allocation: liveAllocation() });

    expect(result.alreadyHasActiveAllocation).toBe(true);
    expect(result.hasAllocatedHouse).toBe(true);
    expect(result.allocation?.houseNumber).toBe("B-202");
    expect(result.eligibilityReason).toContain(
      "already holds an allocated house",
    );
  });

  it("flags an employee who already has an open request", async () => {
    const result = await verify({ request: activeRequest() });

    expect(result.hasOpenRequest).toBe(true);
    expect(result.existingRequest?.id).toBe("req-1");
    expect(result.existingRequest?.remarks).toBe(
      "Family of four with no accommodation.",
    );
    expect(result.eligibilityReason).toContain(
      "already open in the House Queue",
    );
  });

  it("reports an inactive employee as a person, not as a missing ID", async () => {
    const result = await verify({
      employee: employeeRow({ employmentStatus: "on_leave" }),
    });

    expect(result.employee.employmentStatus).toBe("on_leave");
    expect(result.fullName).toBe("Aster Bekele");
    expect(result.eligibilityReason).toContain("not currently active");
  });

  it("names the liveness problem before any downstream one", async () => {
    // Inactive AND already allocated: the reader only needs to hear about the
    // employment status, because fixing that is what releases what is behind it.
    const result = await verify({
      employee: employeeRow({ employmentStatus: "retired" }),
      allocation: liveAllocation(),
    });
    expect(result.eligibilityReason).toContain("not currently active");
  });
});

// ---------------------------------------------------------------------------
// The route
// ---------------------------------------------------------------------------

describe("GET /api/house-requests/verify", () => {
  it("200s with the employee record and the eligibility verdict", async () => {
    const res = await verifyRoute(
      createMockRequest(
        "http://localhost/api/house-requests/verify?empId=EMP-0042",
      ),
    );
    const { status, body } = await parseResponse<HouseRequestVerifyResult>(res);

    expect(status).toBe(200);
    expect(body.empId).toBe("EMP-0042");
    expect(body.isEligible).toBe(true);
    expect(body.eligibleHouseType).toBe("B");
    expect(body.alreadyHasActiveAllocation).toBe(false);
    expect(body.hasOpenRequest).toBe(false);
  });

  it("404s an unknown Employee ID with the documented message", async () => {
    mock.employee.findFirst.mockResolvedValue(null);
    const res = await verifyRoute(
      createMockRequest(
        "http://localhost/api/house-requests/verify?empId=NOPE",
      ),
    );
    const { status, body } = await parseResponse<{
      error: string;
      code: string;
    }>(res);

    expect(status).toBe(404);
    expect(body.error).toBe("Employee ID not found");
    expect(body.code).toBe("EMPLOYEE_NOT_FOUND");
  });

  it("404s an archived record, with the same message and a distinct code", async () => {
    mock.employee.findFirst.mockResolvedValue(
      employeeRow({ deletedAt: new Date("2025-01-01") }),
    );
    const res = await verifyRoute(
      createMockRequest(
        "http://localhost/api/house-requests/verify?empId=EMP-0042",
      ),
    );
    const { status, body } = await parseResponse<{
      error: string;
      code: string;
    }>(res);

    // An archived record must not be displayable as if it were live.
    expect(status).toBe(404);
    expect(body.error).toBe("Employee ID not found");
    expect(body.code).toBe("EMPLOYEE_ARCHIVED");
  });

  it("404s an empty Employee ID without touching the database", async () => {
    const res = await verifyRoute(
      createMockRequest("http://localhost/api/house-requests/verify?empId="),
    );
    const { status, body } = await parseResponse<{ error: string }>(res);

    expect(status).toBe(404);
    expect(body.error).toBe("Employee ID not found");
    expect(mock.employee.findFirst).not.toHaveBeenCalled();
  });

  it("200s an inactive employee rather than hiding a real person", async () => {
    mock.employee.findFirst.mockResolvedValue(
      employeeRow({ employmentStatus: "on_leave" }),
    );
    const res = await verifyRoute(
      createMockRequest(
        "http://localhost/api/house-requests/verify?empId=EMP-0042",
      ),
    );
    const { status, body } = await parseResponse<HouseRequestVerifyResult>(res);

    expect(status).toBe(200);
    expect(body.fullName).toBe("Aster Bekele");
    expect(body.eligibilityReason).toContain("not currently active");
  });

  it("refuses a caller without the house request permission", async () => {
    mockRequirePermission.mockRejectedValue(new Error("Forbidden"));
    const res = await verifyRoute(
      createMockRequest(
        "http://localhost/api/house-requests/verify?empId=EMP-0042",
      ),
    );

    expect(res.status).toBe(403);
    expect(mock.employee.findFirst).not.toHaveBeenCalled();
  });

  it("asks for exactly the permission the submit action needs", async () => {
    await verifyRoute(
      createMockRequest(
        "http://localhost/api/house-requests/verify?empId=EMP-0042",
      ),
    );
    expect(mockRequirePermission).toHaveBeenCalledWith("house_request:create");
  });

  it("scopes the lookup to the caller's organization", async () => {
    await verifyRoute(
      createMockRequest(
        "http://localhost/api/house-requests/verify?empId=EMP-0042",
      ),
    );
    expect(mock.employee.findFirst.mock.calls[0][0].where.organizationId).toBe(
      ORG,
    );
  });
});
