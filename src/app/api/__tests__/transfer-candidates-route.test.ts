import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockRequest,
  parseResponse,
} from "../../../../tests/setup/test-helpers";
import { BadRequestError, NotFoundError } from "@/lib/api-route";

const mockListEligibleTransferHouses = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requirePermission: vi.fn().mockResolvedValue({ id: "user-1" }),
  requireNotDemoMode: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/organization-context", () => ({
  getOrganizationContext: vi.fn().mockResolvedValue({
    organization: { id: "org-1" },
    permissions: new Set([
      "house_queue:view",
      "house_queue:allocate",
      "house_queue:manage",
    ]),
    isAdmin: false,
  }),
}));

vi.mock("@/lib/house-queue/service", () => ({
  listEligibleTransferHouses: (...args: unknown[]) =>
    mockListEligibleTransferHouses(...args),
}));

import { GET } from "../house-queue/transfer/candidates/route";
import { requirePermission } from "@/lib/api-auth";

describe("GET /api/house-queue/transfer/candidates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enforces RBAC permission check", async () => {
    vi.mocked(requirePermission).mockRejectedValueOnce(new Error("Forbidden"));
    const req = createMockRequest(
      "http://localhost:3000/api/house-queue/transfer/candidates?employeeId=e1",
    );
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 if employeeId parameter is missing", async () => {
    const req = createMockRequest(
      "http://localhost:3000/api/house-queue/transfer/candidates",
    );
    const res = await GET(req);
    const { status, body } = await parseResponse<{ error: string }>(res);
    expect(status).toBe(400);
    expect(body.error).toContain("employeeId is required");
  });

  it("returns candidate houses and derived category from employee grade", async () => {
    mockListEligibleTransferHouses.mockResolvedValueOnce({
      employeeId: "e1",
      jobGrade: 12,
      eligibleCategory: "B",
      candidates: [
        {
          id: "h1",
          houseNumber: "B1",
          hid: "106-90-001",
          rgType: "Regular",
          locationName: "Main",
          houseType: "B",
        },
      ],
    });

    const req = createMockRequest(
      "http://localhost:3000/api/house-queue/transfer/candidates?employeeId=e1",
    );
    const res = await GET(req);
    const { status, body } = await parseResponse<{
      jobGrade: number;
      eligibleCategory: string;
      houses: Array<{ houseNumber: string }>;
    }>(res);

    expect(status).toBe(200);
    expect(body.jobGrade).toBe(12);
    expect(body.eligibleCategory).toBe("B");
    expect(body.houses).toHaveLength(1);
    expect(body.houses[0]?.houseNumber).toBe("B1");
    expect(mockListEligibleTransferHouses).toHaveBeenCalledWith("org-1", "e1");
  });

  it("maps MISSING_EMPLOYEE_GRADE into 400 error", async () => {
    mockListEligibleTransferHouses.mockRejectedValueOnce(
      new BadRequestError(
        "MISSING_EMPLOYEE_GRADE: this employee has no job grade on file, so no house category can be determined.",
      ),
    );

    const req = createMockRequest(
      "http://localhost:3000/api/house-queue/transfer/candidates?employeeId=e-nograde",
    );
    const res = await GET(req);
    const { status, body } = await parseResponse<{ error: string }>(res);

    expect(status).toBe(400);
    expect(body.error).toContain("MISSING_EMPLOYEE_GRADE");
  });

  it("maps INELIGIBLE_HOUSE_TYPE into 400 error", async () => {
    mockListEligibleTransferHouses.mockRejectedValueOnce(
      new BadRequestError(
        "INELIGIBLE_HOUSE_TYPE: job grade 0 does not qualify for a house under the current policy.",
      ),
    );

    const req = createMockRequest(
      "http://localhost:3000/api/house-queue/transfer/candidates?employeeId=e-ineligible",
    );
    const res = await GET(req);
    const { status, body } = await parseResponse<{ error: string }>(res);

    expect(status).toBe(400);
    expect(body.error).toContain("INELIGIBLE_HOUSE_TYPE");
  });

  it("maps NO_ELIGIBLE_HOUSE into 400 error", async () => {
    mockListEligibleTransferHouses.mockRejectedValueOnce(
      new BadRequestError(
        "NO_ELIGIBLE_HOUSE: no B house is currently available for this employee.",
      ),
    );

    const req = createMockRequest(
      "http://localhost:3000/api/house-queue/transfer/candidates?employeeId=e-nohouse",
    );
    const res = await GET(req);
    const { status, body } = await parseResponse<{ error: string }>(res);

    expect(status).toBe(400);
    expect(body.error).toContain("NO_ELIGIBLE_HOUSE");
  });

  it("maps NotFoundError to 404 when employee is not in organization", async () => {
    mockListEligibleTransferHouses.mockRejectedValueOnce(
      new NotFoundError("Employee not found in this organization."),
    );

    const req = createMockRequest(
      "http://localhost:3000/api/house-queue/transfer/candidates?employeeId=e-missing",
    );
    const res = await GET(req);
    const { status, body } = await parseResponse<{ error: string }>(res);

    expect(status).toBe(404);
    expect(body.error).toContain("Employee not found");
  });
});
