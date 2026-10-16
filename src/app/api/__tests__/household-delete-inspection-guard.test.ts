import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockRequest,
  parseResponse,
} from "../../../../tests/setup/test-helpers";

/**
 * A handback inspection is a permanent record. It is the evidence that a named
 * house was inspected on a named date by a named inspector, and that a specific
 * completed handback that returned it to the available pool.
 *
 * The database protects that with ON DELETE RESTRICT. This suite covers the
 * application-level half: `DELETE /api/household` must refuse *before* the
 * constraint fires, so the caller gets an explanation instead of a raw
 * foreign-key violation, and so no partial write or misleading audit entry is
 * produced.
 */

const mockPrisma = vi.hoisted(() => {
  const prisma = {
    household: {
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
    houseInspection: {
      count: vi.fn(),
    },
  };
  // The real client is an extended Prisma instance; `@/lib/api-route` and
  // friends touch it on import, so the mock has to carry the same shape.
  return { ...prisma, $extends: vi.fn(() => prisma) };
});

vi.mock("@/lib/prisma", () => ({ default: mockPrisma }));

vi.mock("@/lib/api-auth", () => ({
  requirePermission: vi.fn().mockResolvedValue({ id: "user-123" }),
  requireNotDemoMode: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/api-route", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-route")>();
  return { ...actual, requireOrgId: vi.fn().mockResolvedValue("org-1") };
});

vi.mock("@/lib/audit-log", () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  createAuditLogWithDiff: vi.fn().mockResolvedValue(undefined),
  AUDIT_ACTIONS: { CREATE: "CREATE", UPDATE: "UPDATE", DELETE: "DELETE" },
  AUDIT_ENTITIES: { HOUSEHOLD: "HOUSEHOLD" },
}));

vi.mock("@/lib/ai/cache", () => ({
  CACHE_DOMAIN: { housing: "housing", queue: "queue" },
  invalidateAssistantCache: vi.fn(),
}));

import { DELETE as deleteHouseholdRoute } from "@/app/api/household/route";

const HOUSEHOLD_ID = "550e8400-e29b-41d4-a716-4466554400aa";

const sampleHousehold = {
  id: HOUSEHOLD_ID,
  organizationId: "org-1",
  srNo: 12,
  hid: "H-12",
  houseNumber: "12",
};

function deleteRequest() {
  return createMockRequest("/api/household", {
    method: "DELETE",
    body: { id: HOUSEHOLD_ID },
  });
}

describe("DELETE /api/household — permanent inspection records", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.household.findFirst.mockResolvedValue(sampleHousehold);
  });

  it("refuses to delete a house that has an inspection record", async () => {
    mockPrisma.houseInspection.count.mockResolvedValue(1);

    const res = await deleteHouseholdRoute(deleteRequest());
    const { status, body } = await parseResponse<any>(res);

    expect(status).toBe(409);
    expect(body.code).toBe("HOUSE_HAS_INSPECTION_RECORD");
    expect(body.inspectionCount).toBe(1);
    expect(body.error).toMatch(/permanent/i);
  });

  it("never issues the delete when a record exists", async () => {
    mockPrisma.houseInspection.count.mockResolvedValue(3);

    await deleteHouseholdRoute(deleteRequest());

    expect(mockPrisma.household.delete).not.toHaveBeenCalled();
  });

  it("scopes the existence check to the caller's organization", async () => {
    mockPrisma.houseInspection.count.mockResolvedValue(0);
    mockPrisma.household.delete.mockResolvedValue(sampleHousehold);

    await deleteHouseholdRoute(deleteRequest());

    expect(mockPrisma.houseInspection.count).toHaveBeenCalledWith({
      where: { householdId: HOUSEHOLD_ID, organizationId: "org-1" },
    });
  });

  it("deletes normally when no inspection exists", async () => {
    mockPrisma.houseInspection.count.mockResolvedValue(0);
    mockPrisma.household.delete.mockResolvedValue(sampleHousehold);

    const res = await deleteHouseholdRoute(deleteRequest());
    const { status } = await parseResponse<any>(res);

    expect(status).toBe(200);
    expect(mockPrisma.household.delete).toHaveBeenCalledWith({
      where: { id: HOUSEHOLD_ID },
    });
  });
});
