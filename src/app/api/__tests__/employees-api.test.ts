import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockRequest,
  parseResponse,
} from "../../../../tests/setup/test-helpers";

// Mock dependencies
const mockPrisma = vi.hoisted(() => ({
  employee: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
    delete: vi.fn(),
  },
  department: {
    findFirst: vi.fn(),
  },
  user: {
    findFirst: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  default: mockPrisma,
}));

vi.mock("@/lib/api-auth", () => ({
  requirePermission: vi.fn(),
  requireNotDemoMode: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/organization-context", () => ({
  getOrganizationContext: vi.fn().mockResolvedValue({
    organization: { id: "org-1234-uuid" },
    permissions: new Set([
      "employee:view",
      "employee:create",
      "employee:edit",
      "employee:delete",
      "employee:restore",
    ]),
    isAdmin: false,
  }),
}));

vi.mock("@/lib/employees/access", () => ({
  canViewSensitiveEmployeeData: vi.fn(),
}));

vi.mock("@/lib/audit-log", () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  createAuditLogWithDiff: vi.fn().mockResolvedValue(undefined),
  AUDIT_ACTIONS: {
    CREATE: "CREATE",
    UPDATE: "UPDATE",
    DELETE: "DELETE",
  },
  AUDIT_ENTITIES: {
    EMPLOYEE: "EMPLOYEE",
  },
}));

vi.mock("@/lib/cache", () => ({
  invalidateCacheByPrefix: vi.fn().mockResolvedValue(undefined),
}));

import {
  GET as getEmployees,
  POST as createEmployeeRoute,
} from "@/app/api/employees/route";
import {
  GET as getEmployeeById,
  PUT as updateEmployeeRoute,
  DELETE as deleteEmployeeRoute,
  PATCH as restoreEmployeeRoute,
} from "@/app/api/employees/[id]/route";
import { requirePermission } from "@/lib/api-auth";
import { canViewSensitiveEmployeeData } from "@/lib/employees/access";

const mockRequirePermission = requirePermission as unknown as ReturnType<
  typeof vi.fn
>;
const mockCanViewSensitive =
  canViewSensitiveEmployeeData as unknown as ReturnType<typeof vi.fn>;

describe("Employees API Endpoints (/api/employees)", () => {
  const orgId = "org-1234-uuid";
  const authUser = {
    id: "user-123",
    email: "hr@metahara.com",
    isAdmin: false,
  };

  const sampleDbEmployee = {
    id: "550e8400-e29b-41d4-a716-446655440001",
    organizationId: orgId,
    employeeNumber: "EMP-001",
    firstname: "Abebe",
    lastname: "Bikila",
    phone: "+251911000000",
    dateOfBirth: new Date("1990-01-01"),
    gender: "male",
    nationalId: "NAT-123456",
    jobGrade: 14,
    maritalStatus: "married",
    disabilityStatus: false,
    jobTitle: "Senior Agronomist",
    employmentType: "full_time",
    employmentStatus: "active",
    familySize: 3,
    hireDate: new Date("2020-01-01"),
    terminationDate: null,
    address: "Wonji Camp",
    city: "Metahara",
    state: "Oromia",
    country: "Ethiopia",
    postalCode: "1000",
    notes: null,
    departmentId: "550e8400-e29b-41d4-a716-446655440002",
    managerId: null,
    userid: null,
    deletedAt: null,
    createdAt: new Date("2020-01-01"),
    updatedAt: new Date("2020-01-01"),
    department: {
      id: "550e8400-e29b-41d4-a716-446655440002",
      name: "Plantation",
      code: "15",
    },
    manager: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(authUser);
    mockCanViewSensitive.mockResolvedValue(false); // Default to masked
  });

  describe("GET /api/employees", () => {
    it("returns paginated employees with masked National ID for unprivileged users", async () => {
      mockPrisma.employee.findMany.mockResolvedValue([sampleDbEmployee]);
      mockPrisma.employee.count.mockResolvedValue(1);

      const req = createMockRequest("/api/employees?page=1&pageSize=25");
      const res = await getEmployees(req);
      const { status, body } = await parseResponse<any>(res);

      expect(status).toBe(200);
      expect(body.total).toBe(1);
      expect(body.data[0].employeeNumber).toBe("EMP-001");
      expect(body.data[0].srNo).toBe(1);
      expect(body.data[0].nationalId).toBe("******3456"); // Masked: only last 4 chars
      expect(body.data[0].nationalIdMasked).toBe(true);
      expect(body.unmaskedNationalIds).toBe(false);
    });

    it("returns unmasked National ID when user has sensitive view clearance", async () => {
      mockCanViewSensitive.mockResolvedValue(true);
      mockPrisma.employee.findMany.mockResolvedValue([sampleDbEmployee]);
      mockPrisma.employee.count.mockResolvedValue(1);

      const req = createMockRequest("/api/employees?page=1&pageSize=25");
      const res = await getEmployees(req);
      const { status, body } = await parseResponse<any>(res);

      expect(status).toBe(200);
      expect(body.data[0].nationalId).toBe("NAT-123456");
      expect(body.data[0].nationalIdMasked).toBe(false);
      expect(body.unmaskedNationalIds).toBe(true);
    });
  });

  describe("POST /api/employees", () => {
    it("creates an employee successfully", async () => {
      mockPrisma.employee.create.mockImplementation(async ({ data }) => ({
        id: "new-emp-uuid",
        ...data,
      }));

      const req = createMockRequest("/api/employees", {
        method: "POST",
        body: {
          employeeNumber: "EMP-002",
          firstname: "Derartu",
          lastname: "Tulu",
          gender: "female",
          jobGrade: 16,
          maritalStatus: "single",
        },
      });

      const res = await createEmployeeRoute(req);
      const { status, body } = await parseResponse<any>(res);

      expect(status).toBe(201);
      expect(body.employee.employeeNumber).toBe("EMP-002");
      // The response carries no invented address. It used to include a
      // `generatedEmail` placeholder for a NOT NULL column that no longer exists.
      expect(body).not.toHaveProperty("generatedEmail");
      expect(JSON.stringify(body)).not.toContain("placeholder.invalid");
    });

    it("rejects invalid jobGrade exceeding 50", async () => {
      const req = createMockRequest("/api/employees", {
        method: "POST",
        body: {
          employeeNumber: "EMP-003",
          firstname: "Haile",
          lastname: "Gebrselassie",
          jobGrade: 99,
        },
      });

      const res = await createEmployeeRoute(req);
      const { status, body } = await parseResponse<any>(res);

      expect(status).toBe(422);
      // mapErrorToResponse puts the top-level message in body.error and field
      // issues in body.details — check details for the range constraint message
      const details = body.details as Array<{ message: string }> | undefined;
      expect(
        details?.some((d) =>
          d.message.includes("Job Grade must be between 1 and 50"),
        ),
      ).toBe(true);
    });
  });

  describe("PUT /api/employees/[id]", () => {
    it("updates employee details", async () => {
      const id = "550e8400-e29b-41d4-a716-446655440001";
      mockPrisma.employee.findFirst.mockResolvedValue(sampleDbEmployee);
      mockPrisma.employee.update.mockResolvedValue({
        ...sampleDbEmployee,
        jobGrade: 18,
      });

      const req = createMockRequest(`/api/employees/${id}`, {
        method: "PUT",
        body: { jobGrade: 18 },
      });

      const res = await updateEmployeeRoute(req, {
        params: Promise.resolve({ id }),
      });
      const { status, body } = await parseResponse<any>(res);

      expect(status).toBe(200);
      expect(body.jobGrade).toBe(18);
    });
  });

  describe("DELETE /api/employees/[id]", () => {
    it("archives (soft deletes) employee", async () => {
      const id = "550e8400-e29b-41d4-a716-446655440001";
      mockPrisma.employee.findFirst.mockResolvedValue(sampleDbEmployee);
      mockPrisma.employee.count.mockResolvedValue(0); // 0 direct reports
      mockPrisma.employee.update.mockResolvedValue({
        ...sampleDbEmployee,
        deletedAt: new Date(),
      });

      const req = createMockRequest(`/api/employees/${id}`, {
        method: "DELETE",
      });
      const res = await deleteEmployeeRoute(req, {
        params: Promise.resolve({ id }),
      });
      const { status, body } = await parseResponse<any>(res);

      expect(status).toBe(200);
      expect(body.message).toContain("Employee archived successfully");
    });
  });

  describe("PATCH /api/employees/[id]", () => {
    it("restores an archived employee", async () => {
      const id = "550e8400-e29b-41d4-a716-446655440001";
      mockPrisma.employee.findFirst.mockResolvedValue({
        ...sampleDbEmployee,
        deletedAt: new Date("2026-01-01"),
      });
      mockPrisma.employee.update.mockResolvedValue({
        ...sampleDbEmployee,
        deletedAt: null,
      });

      const req = createMockRequest(`/api/employees/${id}`, {
        method: "PATCH",
      });
      const res = await restoreEmployeeRoute(req, {
        params: Promise.resolve({ id }),
      });
      const { status, body } = await parseResponse<any>(res);

      expect(status).toBe(200);
      expect(body.message).toContain("Employee restored successfully");
    });
  });
});
