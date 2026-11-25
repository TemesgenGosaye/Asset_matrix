import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockRequest,
  parseResponse,
} from "../../../../tests/setup/test-helpers";

const prismaMock = vi.hoisted(() => ({
  $queryRawUnsafe: vi.fn(),
  $transaction: vi.fn(),
  location: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  statusType: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  assetCategoryType: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
  },
  manufacturer: {
    findFirst: vi.fn(),
  },
  model: {
    findFirst: vi.fn(),
  },
  supplier: {
    findFirst: vi.fn(),
  },
  department: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  asset: {
    updateMany: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  default: prismaMock,
}));

vi.mock("@/lib/api-auth", () => ({
  requirePermission: vi.fn().mockResolvedValue({ id: "user-1", isAdmin: true }),
}));

vi.mock("@/lib/organization-context", () => ({
  getOrganizationContext: vi.fn().mockResolvedValue({
    organization: { id: "org-1" },
    userId: "user-1",
    isAdmin: true,
  }),
}));

vi.mock("@/lib/audit-log", () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { validateMasterReferences } from "@/lib/master-validation";
import {
  GET as getMasterOptions,
  POST as createMasterOption,
} from "@/app/api/master-options/route";
import { POST as mergeMasterData } from "@/app/api/master-data/merge/route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Server-side master validation", () => {
  it("rejects an unknown location1Id", async () => {
    prismaMock.location.findFirst.mockResolvedValueOnce(null);
    const res = await validateMasterReferences(
      { location1Id: "00000000-0000-0000-0000-000000000099" },
      "org-1",
    );
    expect(res).not.toBeNull();
    expect(res?.status).toBe(400);
    const body = await res?.json();
    expect(body.error).toContain("Location (1st)");
  });

  it("rejects an inactive location2 unless unchanged on edit", async () => {
    prismaMock.location.findFirst.mockResolvedValue({
      locationid: "loc-inactive",
      isActive: false,
    });

    // Rejected when newly selected
    const resNew = await validateMasterReferences(
      { locationid: "loc-inactive" },
      "org-1",
    );
    expect(resNew?.status).toBe(400);

    // Allowed when unchanged on existing asset
    const resUnchanged = await validateMasterReferences(
      { locationid: "loc-inactive" },
      "org-1",
      { locationid: "loc-inactive" },
    );
    expect(resUnchanged).toBeNull();
  });

  it("rejects unknown condition1StatusId and category", async () => {
    prismaMock.statusType.findFirst.mockResolvedValueOnce(null);
    const res1 = await validateMasterReferences(
      { condition1StatusId: "bad-status" },
      "org-1",
    );
    expect(res1?.status).toBe(400);

    prismaMock.assetCategoryType.findFirst.mockResolvedValueOnce(null);
    const res2 = await validateMasterReferences(
      { assetcategorytypeid: "bad-cat" },
      "org-1",
    );
    expect(res2?.status).toBe(400);
  });
});

describe("/api/master-options", () => {
  it("returns search results and appends legacy currentValue when unmapped", async () => {
    prismaMock.location.findMany.mockResolvedValueOnce([
      {
        locationid: "loc-1",
        locationname: "Workers Club",
        usageCount: 15,
      },
    ]);
    prismaMock.asset.groupBy.mockResolvedValueOnce([
      { location1Id: "loc-1", _count: { _all: 5 } },
    ]);

    const req = createMockRequest(
      "/api/master-options?type=location1&q=workers&departmentId=dept-1&currentValue=Old%20Club",
      {
        method: "GET",
      },
    );
    const res = await getMasterOptions(req);
    const { status, body } = await parseResponse<any>(res);

    expect(status).toBe(200);
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({
      id: "legacy:Old Club",
      name: "Old Club",
      isLegacy: true,
    });
    expect(body.items[1]).toMatchObject({
      id: "loc-1",
      name: "Workers Club",
      usageCount: 15,
      departmentUsageCount: 5,
    });
  });

  it("returns status colors from master data", async () => {
    prismaMock.statusType.findMany.mockResolvedValueOnce([
      {
        statustypeid: "status-good",
        statustypename: "Good",
        color: "#22c55e",
        usageCount: 7,
      },
    ]);

    const req = createMockRequest("/api/master-options?type=status", {
      method: "GET",
    });
    const res = await getMasterOptions(req);
    const { body } = await parseResponse<any>(res);

    expect(body.items[0]).toMatchObject({
      id: "status-good",
      name: "Good",
      color: "#22c55e",
    });
  });

  it("allows large limits for DB-backed dropdowns", async () => {
    prismaMock.location.findMany.mockResolvedValueOnce([]);

    const req = createMockRequest(
      "/api/master-options?type=location&limit=5000",
      { method: "GET" },
    );
    await getMasterOptions(req);

    expect(prismaMock.location.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5000 }),
    );
  });

  it("returns distinct asset names from the asset register", async () => {
    prismaMock.asset.groupBy.mockResolvedValueOnce([
      { assetname: "Tractor", _count: { _all: 12 } },
      { assetname: "Water pump", _count: { _all: 4 } },
    ]);

    const req = createMockRequest("/api/master-options?type=assetName", {
      method: "GET",
    });
    const res = await getMasterOptions(req);
    const { body } = await parseResponse<any>(res);

    expect(body.items).toMatchObject([
      { id: "Tractor", name: "Tractor", usageCount: 12 },
      { id: "Water pump", name: "Water pump", usageCount: 4 },
    ]);
  });

  it("keeps a current inactive status visible", async () => {
    prismaMock.statusType.findMany.mockResolvedValueOnce([]);
    prismaMock.statusType.findFirst.mockResolvedValueOnce({
      statustypeid: "status-old",
      statustypename: "Out for Repair",
      color: "#f59e0b",
      usageCount: 2,
      isActive: false,
    });

    const req = createMockRequest(
      "/api/master-options?type=status&currentId=status-old",
      { method: "GET" },
    );
    const res = await getMasterOptions(req);
    const { body } = await parseResponse<any>(res);

    expect(body.items[0]).toMatchObject({
      id: "status-old",
      name: "Out for Repair",
      color: "#f59e0b",
      isCurrent: true,
    });
  });

  it("warns on near-duplicate location and allows force create", async () => {
    prismaMock.location.findFirst.mockResolvedValue(null);
    prismaMock.location.findMany.mockResolvedValue([
      {
        locationid: "loc-1",
        locationname: "Workers Club",
        normalizedName: "workers club",
      },
    ]);

    const reqWarn = createMockRequest("/api/master-options", {
      method: "POST",
      body: { type: "location1", name: "Worker Club", force: false },
    });
    const resWarn = await createMasterOption(reqWarn);
    const warnParsed = await parseResponse<any>(resWarn);
    expect(warnParsed.status).toBe(409);
    expect(warnParsed.body.requiresConfirmation).toBe(true);
    expect(warnParsed.body.nearMatch.name).toBe("Workers Club");

    prismaMock.location.create.mockResolvedValue({
      locationid: "loc-2",
      locationname: "Worker Club",
      usageCount: 0,
    });

    const reqForce = createMockRequest("/api/master-options", {
      method: "POST",
      body: { type: "location1", name: "Worker Club", force: true },
    });
    const resForce = await createMasterOption(reqForce);
    const forceParsed = await parseResponse<any>(resForce);
    expect(forceParsed.status).toBe(201);
    expect(forceParsed.body.item.name).toBe("Worker Club");
  });
});

describe("/api/master-data/merge", () => {
  it("merges source locations into target and deactivates sources", async () => {
    prismaMock.location.findFirst.mockResolvedValue({
      locationid: "loc-target",
      locationname: "Workers Club",
    });

    prismaMock.$transaction.mockImplementation(
      async (cb: (tx: typeof prismaMock) => unknown) => {
        prismaMock.asset.updateMany
          .mockResolvedValueOnce({ count: 3 })
          .mockResolvedValueOnce({ count: 2 });
        prismaMock.location.updateMany.mockResolvedValueOnce({ count: 1 });
        prismaMock.asset.count
          .mockResolvedValueOnce(10)
          .mockResolvedValueOnce(5);
        prismaMock.location.update.mockResolvedValueOnce({
          locationid: "loc-target",
          locationname: "Workers Club",
          usageCount: 15,
        });
        return cb(prismaMock);
      },
    );

    const req = createMockRequest("/api/master-data/merge", {
      method: "POST",
      body: {
        type: "location",
        sourceIds: ["loc-source"],
        targetId: "loc-target",
      },
    });
    const res = await mergeMasterData(req);
    const { status, body } = await parseResponse<any>(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.details.repointedLocation1).toBe(3);
    expect(body.details.repointedLocation2).toBe(2);
    expect(body.details.targetLocation.usageCount).toBe(15);
  });
});
