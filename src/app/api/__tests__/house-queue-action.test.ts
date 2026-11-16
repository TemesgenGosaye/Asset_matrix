import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockRequest,
  parseResponse,
} from "../../../../tests/setup/test-helpers";

vi.mock("@/lib/api-auth", () => ({
  requireNotDemoMode: vi.fn(() => null),
  requirePermission: vi.fn().mockResolvedValue({ id: "user-1", isAdmin: true }),
}));

vi.mock("@/lib/api-route", () => ({
  handleRouteError: vi.fn((e: unknown) =>
    Response.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 500 },
    ),
  ),
  requireOrgId: vi.fn().mockResolvedValue("org-1"),
}));

vi.mock("@/lib/house-queue/service", () => ({
  approveAllocation: vi.fn().mockResolvedValue({
    employeeId: "11111111-1111-4111-8111-111111111111",
    allocationId: "22222222-2222-4222-8222-222222222222",
    houseNumber: "A-1",
  }),
  setSkipOrDefer: vi.fn().mockResolvedValue({
    employeeId: "11111111-1111-4111-8111-111111111111",
  }),
}));

vi.mock("@/lib/notify", () => ({
  notifyOrgAdmins: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "@/app/api/house-queue/action/route";
import { requirePermission } from "@/lib/api-auth";
import { setSkipOrDefer } from "@/lib/house-queue/service";

const EMPLOYEE_ID = "11111111-1111-4111-8111-111111111111";
const URL = "http://localhost:3000/api/house-queue/action";

function post(body: Record<string, unknown>) {
  return createMockRequest(URL, { method: "POST", body });
}

describe("POST /api/house-queue/action skip/defer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(["skip", "defer"] as const)(
    "accepts action=%s without a separate mode field",
    async (action) => {
      const { status } = await parseResponse(
        await POST(post({ action, employeeId: EMPLOYEE_ID, reason: "test" })),
      );

      expect(status).toBe(200);
      expect(setSkipOrDefer).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: action,
          employeeId: EMPLOYEE_ID,
          reason: "test",
        }),
      );
    },
  );

  it("requires house_queue:manage, not house_queue:allocate, for skip/defer", async () => {
    await POST(post({ action: "skip", employeeId: EMPLOYEE_ID }));

    const calls = vi.mocked(requirePermission).mock.calls.flat();
    expect(calls).toContain("house_queue:manage");
    expect(calls).not.toContain("house_queue:allocate");
  });

  it("still requires house_queue:allocate for approve", async () => {
    await POST(
      post({
        action: "approve",
        employeeId: EMPLOYEE_ID,
        householdId: "33333333-3333-4333-8333-333333333333",
      }),
    );

    expect(requirePermission).toHaveBeenCalledWith("house_queue:allocate");
  });
});
