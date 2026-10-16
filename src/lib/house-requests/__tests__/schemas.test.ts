import { describe, it, expect } from "vitest";
import {
  createHouseRequestSchema,
  employeeIdLookupSchema,
  houseRequestRemarksSchema,
  listHouseRequestsQuerySchema,
} from "../schemas";
import {
  ACTIVE_HOUSE_REQUEST_STATUS,
  HOUSE_REQUEST_STATUSES,
  REMARKS_MAX_LENGTH,
  REMARKS_MIN_LENGTH,
  houseRequestLockKey,
  isActiveHouseRequestStatus,
} from "../constants";

describe("employeeIdLookupSchema", () => {
  it("accepts a normal Employee ID", () => {
    const parsed = employeeIdLookupSchema.parse({ employeeNumber: "EMP-001" });
    expect(parsed.employeeNumber).toBe("EMP-001");
  });

  it("trims surrounding whitespace before matching", () => {
    const parsed = employeeIdLookupSchema.parse({
      employeeNumber: "  EMP-14  ",
    });
    expect(parsed.employeeNumber).toBe("EMP-14");
  });

  it("preserves case (the server does the case-insensitive match)", () => {
    expect(
      employeeIdLookupSchema.parse({ employeeNumber: "emp-001" })
        .employeeNumber,
    ).toBe("emp-001");
  });

  it("rejects an empty / whitespace-only ID", () => {
    expect(
      employeeIdLookupSchema.safeParse({ employeeNumber: "" }).success,
    ).toBe(false);
    expect(
      employeeIdLookupSchema.safeParse({ employeeNumber: "   " }).success,
    ).toBe(false);
  });

  it("rejects a missing ID", () => {
    expect(employeeIdLookupSchema.safeParse({}).success).toBe(false);
  });

  it("rejects an ID longer than the Employee.employeeNumber column", () => {
    expect(
      employeeIdLookupSchema.safeParse({ employeeNumber: "x".repeat(51) })
        .success,
    ).toBe(false);
    expect(
      employeeIdLookupSchema.safeParse({ employeeNumber: "x".repeat(50) })
        .success,
    ).toBe(true);
  });
});

describe("houseRequestRemarksSchema", () => {
  it("accepts a reason at the minimum length", () => {
    const reason = "a".repeat(REMARKS_MIN_LENGTH);
    expect(houseRequestRemarksSchema.parse(reason)).toBe(reason);
  });

  it("accepts a reason at the maximum length", () => {
    const reason = "b".repeat(REMARKS_MAX_LENGTH);
    expect(houseRequestRemarksSchema.parse(reason)).toBe(reason);
  });

  it("rejects a reason one character below the minimum", () => {
    const tooShort = "c".repeat(REMARKS_MIN_LENGTH - 1);
    expect(houseRequestRemarksSchema.safeParse(tooShort).success).toBe(false);
  });

  it("rejects a reason above the varchar(1000) ceiling", () => {
    expect(
      houseRequestRemarksSchema.safeParse("d".repeat(REMARKS_MAX_LENGTH + 1))
        .success,
    ).toBe(false);
  });

  it("measures length after trimming, so padding cannot fake compliance", () => {
    // 9 real characters padded to 1000 would slip past a naive length check.
    const padded = `   ${"e".repeat(REMARKS_MIN_LENGTH - 1)}   `;
    expect(padded.length).toBeGreaterThan(REMARKS_MIN_LENGTH);
    expect(houseRequestRemarksSchema.safeParse(padded).success).toBe(false);
  });

  it("rejects an empty or whitespace-only reason", () => {
    expect(houseRequestRemarksSchema.safeParse("").success).toBe(false);
    expect(houseRequestRemarksSchema.safeParse("        ").success).toBe(false);
  });

  it("returns the trimmed reason so storage never keeps padding", () => {
    expect(houseRequestRemarksSchema.parse("  needs a house badly  ")).toBe(
      "needs a house badly",
    );
  });
});

describe("createHouseRequestSchema", () => {
  const valid = {
    employeeNumber: "EMP-001",
    remarks: "Family of five currently in a shared camp house.",
  };

  it("accepts a well-formed submission", () => {
    expect(createHouseRequestSchema.parse(valid)).toEqual(valid);
  });

  /**
   * The single most important guarantee: the body must not be able to assert
   * anything about the employee. If a browser could name a grade or a
   * department, the server would be trusting client data.
   */
  it("ignores client-asserted employee attributes rather than persisting them", () => {
    const tampered = {
      ...valid,
      jobGrade: 50,
      department: "Finance",
      firstname: "Somebody",
      lastname: "Else",
      serviceYears: 99,
      employeeId: "00000000-0000-0000-0000-000000000000",
    };
    const parsed = createHouseRequestSchema.parse(tampered);

    expect(Object.keys(parsed).sort()).toEqual(["employeeNumber", "remarks"]);
    expect(parsed).not.toHaveProperty("jobGrade");
    expect(parsed).not.toHaveProperty("employeeId");
    expect(parsed).not.toHaveProperty("serviceYears");
  });

  it("rejects a body missing the employee number", () => {
    const parsed = createHouseRequestSchema.safeParse({
      remarks: valid.remarks,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a body missing the remarks", () => {
    const parsed = createHouseRequestSchema.safeParse({
      employeeNumber: "EMP-001",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("listHouseRequestsQuerySchema", () => {
  it("coerces and bounds the limit", () => {
    expect(listHouseRequestsQuerySchema.parse({}).limit).toBe(50);
    expect(listHouseRequestsQuerySchema.parse({ limit: "10" }).limit).toBe(10);
    expect(listHouseRequestsQuerySchema.safeParse({ limit: "0" }).success).toBe(
      false,
    );
    expect(
      listHouseRequestsQuerySchema.safeParse({ limit: "500" }).success,
    ).toBe(false);
  });

  it("only accepts a known status", () => {
    expect(
      listHouseRequestsQuerySchema.parse({ status: "submitted" }).status,
    ).toBe("submitted");
    expect(
      listHouseRequestsQuerySchema.safeParse({ status: "deleted" }).success,
    ).toBe(false);
  });
});

describe("request status model", () => {
  it("exposes exactly the two persisted statuses", () => {
    expect(HOUSE_REQUEST_STATUSES).toEqual(["submitted", "cancelled"]);
  });

  it("treats only `submitted` as active queue entry", () => {
    expect(ACTIVE_HOUSE_REQUEST_STATUS).toBe("submitted");
    expect(isActiveHouseRequestStatus("submitted")).toBe(true);
    expect(isActiveHouseRequestStatus("cancelled")).toBe(false);
    expect(isActiveHouseRequestStatus(null)).toBe(false);
    expect(isActiveHouseRequestStatus(undefined)).toBe(false);
  });
});

describe("houseRequestLockKey", () => {
  it("is deterministic for the same employee", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    expect(houseRequestLockKey(id)).toBe(houseRequestLockKey(id));
  });

  it("differs between employees so requests do not block each other", () => {
    expect(houseRequestLockKey("employee-a")).not.toBe(
      houseRequestLockKey("employee-b"),
    );
  });

  it("stays inside PostgreSQL's signed 32-bit advisory-lock key space", () => {
    for (const id of [
      "a",
      "employee-1",
      "550e8400-e29b-41d4-a716-446655440000",
      "x".repeat(64),
    ]) {
      const key = houseRequestLockKey(id);
      expect(Number.isInteger(key)).toBe(true);
      expect(key).toBeGreaterThan(0);
      expect(key).toBeLessThanOrEqual(2_147_483_647);
    }
  });
});
