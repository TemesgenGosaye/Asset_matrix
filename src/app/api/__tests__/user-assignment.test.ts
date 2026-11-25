import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockRequest,
  parseResponse,
} from "../../../../tests/setup/test-helpers";

const prismaMock = vi.hoisted(() => ({
  asset: { findUnique: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn() },
  statusType: { findFirst: vi.fn() },
  userAssets: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(),
}));

const txMock = vi.hoisted(() => ({
  statusType: { findFirst: vi.fn() },
  userAssets: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  asset: { update: vi.fn() },
}));

const createAuditLogMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined),
);

vi.mock("@/lib/prisma", () => ({ default: prismaMock }));

vi.mock("@/lib/api-auth", () => ({
  requireApiAdmin: vi.fn().mockResolvedValue({
    id: "admin-1",
    isAdmin: true,
    organizationId: "org-1",
  }),
  requireNotDemoMode: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/audit-log", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/audit-log")>("@/lib/audit-log");
  return { ...actual, createAuditLog: createAuditLogMock };
});

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { POST as assignAsset } from "@/app/api/userAssets/assign/route";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (callback: any) =>
    callback(txMock),
  );
  txMock.statusType.findFirst.mockResolvedValue({
    statustypeid: "status-active",
  });
  txMock.userAssets.create.mockImplementation(async (args: any) => args.data);
  txMock.userAssets.update.mockImplementation(async (args: any) => args.data);
  txMock.asset.update.mockResolvedValue({});
});

describe("POST /api/userAssets/assign", () => {
  it("assigns an asset to an active linked user", async () => {
    prismaMock.asset.findUnique.mockResolvedValueOnce({
      assetid: "asset-1",
      organizationId: "org-1",
    });
    prismaMock.user.findUnique.mockResolvedValueOnce({
      userid: "user-2",
      organizationId: "org-1",
      isActive: true,
    });
    txMock.userAssets.findFirst.mockResolvedValueOnce(null);

    const req = createMockRequest("/api/userAssets/assign", {
      method: "POST",
      body: { assetId: "asset-1", userId: "user-2" },
    });
    const res = await assignAsset(req);
    const { status, body } = await parseResponse<any>(res);

    expect(status).toBe(200);
    expect(txMock.userAssets.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userid: "user-2" }),
      }),
    );
    expect(createAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ASSIGN", entityId: "asset-1" }),
    );
    expect(body.userAsset).toBeTruthy();
  });

  it("records a reassign with a change date", async () => {
    prismaMock.asset.findUnique.mockResolvedValueOnce({
      assetid: "asset-1",
      organizationId: "org-1",
    });
    prismaMock.user.findUnique.mockResolvedValueOnce({
      userid: "user-2",
      organizationId: "org-1",
      isActive: true,
    });
    txMock.userAssets.findFirst.mockResolvedValueOnce({
      userassetsid: "ua-1",
      userid: "user-1",
    });

    const req = createMockRequest("/api/userAssets/assign", {
      method: "POST",
      body: { assetId: "asset-1", userId: "user-2" },
    });
    const res = await assignAsset(req);

    expect(res.status).toBe(200);
    expect(txMock.userAssets.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userid: "user-2",
          change_date: expect.any(Date),
        }),
      }),
    );
    expect(createAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "REASSIGN" }),
    );
  });

  it("rejects inactive users", async () => {
    prismaMock.asset.findUnique.mockResolvedValueOnce({
      assetid: "asset-1",
      organizationId: "org-1",
    });
    prismaMock.user.findUnique.mockResolvedValueOnce({
      userid: "user-2",
      organizationId: "org-1",
      isActive: false,
    });

    const req = createMockRequest("/api/userAssets/assign", {
      method: "POST",
      body: { assetId: "asset-1", userId: "user-2" },
    });
    const res = await assignAsset(req);
    const { status, body } = await parseResponse<any>(res);

    expect(status).toBe(400);
    expect(body.error).toContain("inactive");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
