import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createEmployee,
  updateEmployee,
  archiveEmployee,
  restoreEmployee,
  EmployeeServiceError,
} from "../service";

// Mock dependencies
const mockPrisma = vi.hoisted(() => ({
  employee: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
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

describe("Employee Service Layer", () => {
  const orgId = "org-1234-uuid";
  const actorId = "user-admin-uuid";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createEmployee", () => {
    /**
     * An employee carries no address at all.
     *
     * This used to assert a synthesised `emp-099@placeholder.invalid`, which
     * existed only to satisfy a NOT NULL column. The column is gone (see
     * 20261004000000_drop_employee_email), so the assertion is now that the
     * create payload contains no fabricated contact detail — a placeholder that
     * looks like a real address is worse than no address.
     */
    it("creates an employee without inventing any contact detail", async () => {
      mockPrisma.employee.create.mockImplementation(async ({ data }) => ({
        id: "emp-new-uuid",
        ...data,
      }));

      const result = await createEmployee({
        organizationId: orgId,
        actorId,
        input: {
          employeeNumber: "EMP-099",
          firstname: "Derartu",
          lastname: "Tulu",
          gender: "female",
          jobGrade: 16,
          disabilityStatus: false,
          employmentType: "full_time",
          employmentStatus: "active",
        },
        db: mockPrisma as any,
      });

      expect(result.employee.employeeNumber).toBe("EMP-099");
      expect(mockPrisma.employee.create).toHaveBeenCalledOnce();

      const { data } = mockPrisma.employee.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(data).not.toHaveProperty("email");
      expect(Object.values(data).join(" ")).not.toContain(
        "placeholder.invalid",
      );
    });

    it("fails with friendly 409 error on unique constraint violation", async () => {
      mockPrisma.employee.create.mockRejectedValue({
        code: "P2002",
        meta: { target: ["Employee_org_employeeNumber_key"] },
      });

      await expect(
        createEmployee({
          organizationId: orgId,
          actorId,
          input: {
            employeeNumber: "EMP-DUP",
            firstname: "Kenenisa",
            lastname: "Bekele",
            disabilityStatus: false,
            employmentType: "full_time",
            employmentStatus: "active",
          },
          db: mockPrisma as any,
        }),
      ).rejects.toThrow(EmployeeServiceError);
    });

    it("verifies department belongs to caller organization", async () => {
      mockPrisma.department.findFirst.mockResolvedValue(null);

      await expect(
        createEmployee({
          organizationId: orgId,
          actorId,
          input: {
            employeeNumber: "EMP-100",
            firstname: "Haile",
            lastname: "Gebrselassie",
            departmentId: "foreign-dept-uuid",
            disabilityStatus: false,
            employmentType: "full_time",
            employmentStatus: "active",
          },
          db: mockPrisma as any,
        }),
      ).rejects.toThrow("Department not found in this organization.");
    });
  });

  describe("archiveEmployee (Soft Delete)", () => {
    it("archives employee by setting deletedAt", async () => {
      mockPrisma.employee.findFirst.mockResolvedValue({
        id: "emp-del-uuid",
        organizationId: orgId,
        employeeNumber: "EMP-DEL",
        firstname: "Test",
        lastname: "Person",
        deletedAt: null,
      });
      mockPrisma.employee.count.mockResolvedValue(0); // 0 direct reports
      mockPrisma.employee.update.mockResolvedValue({
        id: "emp-del-uuid",
        deletedAt: new Date(),
      });

      const result = await archiveEmployee({
        organizationId: orgId,
        actorId,
        id: "emp-del-uuid",
        db: mockPrisma as any,
      });

      expect(result.employee.deletedAt).toBeDefined();
      expect(mockPrisma.employee.update).toHaveBeenCalledWith({
        where: { id: "emp-del-uuid" },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it("prevents archiving an employee with active direct reports", async () => {
      mockPrisma.employee.findFirst.mockResolvedValue({
        id: "manager-uuid",
        organizationId: orgId,
      });
      mockPrisma.employee.count.mockResolvedValue(3); // 3 direct reports

      await expect(
        archiveEmployee({
          organizationId: orgId,
          actorId,
          id: "manager-uuid",
          db: mockPrisma as any,
        }),
      ).rejects.toThrow(
        /Cannot archive: this employee is the reporting manager of 3 other employee/,
      );
    });
  });

  describe("restoreEmployee", () => {
    it("restores an archived employee by clearing deletedAt", async () => {
      mockPrisma.employee.findFirst.mockResolvedValue({
        id: "emp-archived-uuid",
        organizationId: orgId,
        deletedAt: new Date("2026-01-01"),
      });
      mockPrisma.employee.update.mockResolvedValue({
        id: "emp-archived-uuid",
        deletedAt: null,
      });

      const restored = await restoreEmployee({
        organizationId: orgId,
        actorId,
        id: "emp-archived-uuid",
        db: mockPrisma as any,
      });

      expect(restored.deletedAt).toBeNull();
      expect(mockPrisma.employee.update).toHaveBeenCalledWith({
        where: { id: "emp-archived-uuid" },
        data: { deletedAt: null },
      });
    });
  });
});
