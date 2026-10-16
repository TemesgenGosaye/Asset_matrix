import { describe, it, expect } from "vitest";
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  bulkEmployeeRequestSchema,
  employeeListQuerySchema,
  jobGradeSchema,
  nationalIdSchema,
} from "../schemas";
import { JOB_GRADE_MIN, JOB_GRADE_MAX } from "../constants";

describe("Employee Zod Schemas", () => {
  describe("createEmployeeSchema", () => {
    const validEmployee = {
      employeeNumber: "EMP-001",
      firstname: "Abebe",
      lastname: "Bikila",
      gender: "male" as const,
      jobGrade: 14,
      maritalStatus: "married" as const,
      disabilityStatus: false,
      nationalId: "NAT-123456",
    };

    it("accepts valid employee data with all primary attributes", () => {
      const result = createEmployeeSchema.safeParse(validEmployee);
      expect(result.success).toBe(true);
    });

    it("rejects missing employeeNumber", () => {
      const { employeeNumber, ...rest } = validEmployee;
      const result = createEmployeeSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it("rejects missing firstname or lastname", () => {
      expect(
        createEmployeeSchema.safeParse({ ...validEmployee, firstname: "" })
          .success,
      ).toBe(false);
      expect(
        createEmployeeSchema.safeParse({ ...validEmployee, lastname: "" })
          .success,
      ).toBe(false);
    });

    it("validates jobGrade bounds (1-50)", () => {
      expect(
        createEmployeeSchema.safeParse({
          ...validEmployee,
          jobGrade: JOB_GRADE_MIN,
        }).success,
      ).toBe(true);
      expect(
        createEmployeeSchema.safeParse({
          ...validEmployee,
          jobGrade: JOB_GRADE_MAX,
        }).success,
      ).toBe(true);
      expect(
        createEmployeeSchema.safeParse({ ...validEmployee, jobGrade: 0 })
          .success,
      ).toBe(false);
      expect(
        createEmployeeSchema.safeParse({ ...validEmployee, jobGrade: 51 })
          .success,
      ).toBe(false);
      expect(
        createEmployeeSchema.safeParse({ ...validEmployee, jobGrade: -5 })
          .success,
      ).toBe(false);
    });

    it("validates Gender enum ('male' | 'female')", () => {
      expect(
        createEmployeeSchema.safeParse({ ...validEmployee, gender: "male" })
          .success,
      ).toBe(true);
      expect(
        createEmployeeSchema.safeParse({ ...validEmployee, gender: "female" })
          .success,
      ).toBe(true);
      expect(
        createEmployeeSchema.safeParse({ ...validEmployee, gender: "other" })
          .success,
      ).toBe(false);
    });

    it("validates MaritalStatus enum ('single' | 'married')", () => {
      expect(
        createEmployeeSchema.safeParse({
          ...validEmployee,
          maritalStatus: "single",
        }).success,
      ).toBe(true);
      expect(
        createEmployeeSchema.safeParse({
          ...validEmployee,
          maritalStatus: "married",
        }).success,
      ).toBe(true);
      expect(
        createEmployeeSchema.safeParse({
          ...validEmployee,
          maritalStatus: "divorced",
        }).success,
      ).toBe(false);
    });

    it("normalizes empty nationalId to null", () => {
      const parsed = nationalIdSchema.safeParse("   ");
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data).toBeNull();
      }
    });

    /**
     * `email` is no longer part of the employee contract, so a payload that
     * still carries one is not silently accepted as if it were — the key is
     * ignored rather than persisted, which is the whole point of removing it.
     */
    it("ignores an email key left over from an older client", () => {
      const result = createEmployeeSchema.safeParse({
        ...validEmployee,
        email: "left.over@example.com",
      });
      expect(result.success).toBe(true);
      expect(result.success && "email" in result.data).toBe(false);
    });
  });

  describe("updateEmployeeSchema", () => {
    it("accepts partial updates", () => {
      const result = updateEmployeeSchema.safeParse({
        jobGrade: 18,
        disabilityStatus: true,
      });
      expect(result.success).toBe(true);
    });

    it("rejects an empty update object", () => {
      // The .refine checks Object.keys(data).length > 0 after transforms.
      // Fields with plain .optional() (no .default()) don't add keys for
      // absent inputs, so {} produces an empty output and the refine fires.
      const result = updateEmployeeSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe("bulkEmployeeRequestSchema", () => {
    it("validates bulk create rows", () => {
      const result = bulkEmployeeRequestSchema.safeParse({
        operation: "create",
        rows: [
          {
            employeeNumber: "EMP-101",
            firstname: "Tigist",
            lastname: "Assefa",
            jobGrade: 12,
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("requires id for delete and update operations", () => {
      const result = bulkEmployeeRequestSchema.safeParse({
        operation: "delete",
        rows: [
          {
            employeeNumber: "EMP-101",
          },
        ],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("employeeListQuerySchema", () => {
    it("parses valid pagination and filter query params", () => {
      const result = employeeListQuerySchema.safeParse({
        page: "2",
        pageSize: "50",
        search: "Abebe",
        sortBy: "jobGrade",
        sortOrder: "desc",
        gender: "male",
        jobGradeFrom: "10",
        jobGradeTo: "20",
        disabilityStatus: "true",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(2);
        expect(result.data.pageSize).toBe(50);
        expect(result.data.disabilityStatus).toBe(true);
      }
    });
  });
});
