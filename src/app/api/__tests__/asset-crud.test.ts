import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockRequest,
  parseResponse,
} from "../../../../tests/setup/test-helpers";
import {
  mockAsset,
  mockAssetList,
} from "../../../../tests/setup/fixtures/assets";

// Mock all dependencies
const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  asset: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  default: prismaMock,
}));

vi.mock("@/lib/api-auth", () => ({
  requireApiAuth: vi.fn(),
  requirePermission: vi.fn(),
  requireNotDemoMode: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/organization-context", () => ({
  getOrganizationContext: vi.fn().mockResolvedValue({
    organization: { id: "org-uuid-001" },
  }),
  scopeToOrganization: vi.fn((where: any) => ({
    ...where,
    organizationId: "org-uuid-001",
  })),
}));

vi.mock("@/lib/webhooks", () => ({
  triggerWebhook: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/cache", () => ({
  invalidateCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/integrations/slack-teams", () => ({
  notifyIntegrations: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/audit-log", () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  createAuditLogWithDiff: vi.fn().mockResolvedValue(undefined),
  AUDIT_ACTIONS: {},
  AUDIT_ENTITIES: {},
}));

vi.mock("@/lib/asset-pid", () => ({
  generateNextPidAtomic: vi.fn().mockResolvedValue({
    pid: "SN-NEW-001",
    departmentCode: null,
  }),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    securityEvent: vi.fn(),
  },
  logCatchError: vi.fn(() => vi.fn()),
}));

import { GET, POST, PUT } from "@/app/api/asset/route";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";

const mockPrisma = prisma as any;
const mockRequirePermission = vi.mocked(requirePermission);

beforeEach(() => {
  vi.clearAllMocks();
  // Default: authenticated admin user
  mockRequirePermission.mockResolvedValue({
    id: "admin-uuid-001",
    isAdmin: true,
    organizationId: "org-uuid-001",
  } as any);
  // Transactions run against the same mocked client so `prisma.asset.*` and
  // `tx.asset.*` share one set of vi.fn mocks.
  prismaMock.$transaction.mockImplementation((fn: (tx: any) => unknown) =>
    fn(prismaMock),
  );
});

describe("GET /api/asset", () => {
  it("returns all assets when no page param", async () => {
    mockPrisma.asset.findMany.mockResolvedValue(mockAssetList as any);

    const req = createMockRequest("/api/asset");
    const res = await GET(req);
    const { status, body } = await parseResponse<any>(res);

    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
  });

  it("returns paginated assets when page param is set", async () => {
    mockPrisma.asset.findMany.mockResolvedValue(mockAssetList as any);
    mockPrisma.asset.count.mockResolvedValue(2);

    const req = createMockRequest("/api/asset?page=1&pageSize=25");
    const res = await GET(req);
    const { status, body } = await parseResponse<any>(res);

    expect(status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.page).toBe(1);
  });

  it("returns single asset by id", async () => {
    mockPrisma.asset.findFirst.mockResolvedValue(mockAsset as any);

    const req = createMockRequest("/api/asset?id=asset-uuid-001");
    const res = await GET(req);
    const { status, body } = await parseResponse<any>(res);

    expect(status).toBe(200);
    expect(body.assetid).toBe("asset-uuid-001");
  });

  it("returns 404 when asset not found by id", async () => {
    mockPrisma.asset.findFirst.mockResolvedValue(null);

    const req = createMockRequest("/api/asset?id=nonexistent");
    const res = await GET(req);
    const { status } = await parseResponse(res);

    expect(status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequirePermission.mockRejectedValue(new Error("Unauthorized"));

    const req = createMockRequest("/api/asset");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks permission", async () => {
    mockRequirePermission.mockRejectedValue(
      new Error("Forbidden: Insufficient permissions"),
    );

    const req = createMockRequest("/api/asset");
    const res = await GET(req);
    expect(res.status).toBe(403);
  });
});

describe("POST /api/asset", () => {
  it("creates an asset with valid data", async () => {
    mockPrisma.asset.create.mockResolvedValue({
      ...mockAsset,
      assetid: "new-asset-uuid",
    } as any);

    const req = createMockRequest("/api/asset", {
      method: "POST",
      body: {
        assetname: "New Asset",
        assettag: "NEW-001",
        serialnumber: "SN-NEW-001",
      },
    });
    const res = await POST(req);
    const { status } = await parseResponse(res);

    expect(status).toBe(201);
    expect(mockPrisma.asset.create).toHaveBeenCalled();
  });

  it("returns 401 when not authenticated", async () => {
    mockRequirePermission.mockRejectedValue(new Error("Unauthorized"));

    const req = createMockRequest("/api/asset", {
      method: "POST",
      body: {
        assetname: "Test",
        assettag: "T-001",
        serialnumber: "SN-001",
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});

describe("PUT /api/asset", () => {
  it("updates an asset with valid data", async () => {
    mockPrisma.asset.findFirst.mockResolvedValue(mockAsset as any);
    mockPrisma.asset.update.mockResolvedValue({
      ...mockAsset,
      assetname: "Updated Name",
    } as any);

    const req = createMockRequest("/api/asset", {
      method: "PUT",
      body: {
        assetid: "550e8400-e29b-41d4-a716-446655440000",
        assetname: "Updated Name",
      },
    });
    const res = await PUT(req);
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
    expect(mockPrisma.asset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { assetid: mockAsset.assetid },
      }),
    );
  });

  it("returns 401 when not authenticated", async () => {
    mockRequirePermission.mockRejectedValue(new Error("Unauthorized"));

    const req = createMockRequest("/api/asset", {
      method: "PUT",
      body: {
        assetid: "550e8400-e29b-41d4-a716-446655440000",
        assetname: "Updated",
      },
    });
    const res = await PUT(req);
    expect(res.status).toBe(401);
  });
});
