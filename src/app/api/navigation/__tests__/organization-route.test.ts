import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockRequest,
  parseResponse,
} from "../../../../../tests/setup/test-helpers";

vi.mock("@/lib/prisma", () => ({ default: {} }));

vi.mock("@/lib/api-auth", () => ({
  requireApiAuth: vi.fn(),
  requireApiAdmin: vi.fn(),
  requireNotDemoMode: vi.fn(),
}));

vi.mock("@/lib/organization-context", () => ({
  getOrganizationContext: vi.fn().mockResolvedValue({
    organization: { id: "org-1" },
    permissions: new Set<string>(),
    isAdmin: true,
  }),
}));

vi.mock("@/lib/audit-log", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit-log")>();
  return { ...actual, createAuditLog: vi.fn() };
});

vi.mock("@/lib/navigation/preferences", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/navigation/preferences")>();
  return {
    ...actual,
    getOrgHiddenKeys: vi.fn(),
    setOrgHiddenKeys: vi.fn(),
  };
});

import { GET, PUT } from "../organization/route";
import {
  requireApiAdmin,
  requireApiAuth,
  requireNotDemoMode,
} from "@/lib/api-auth";
import { createAuditLog } from "@/lib/audit-log";
import {
  getOrgHiddenKeys,
  setOrgHiddenKeys,
} from "@/lib/navigation/preferences";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireApiAuth).mockResolvedValue({ id: "admin-1", isAdmin: true });
  vi.mocked(requireApiAdmin).mockResolvedValue({
    id: "admin-1",
    isAdmin: true,
  });
  vi.mocked(requireNotDemoMode).mockReturnValue(null);
  vi.mocked(getOrgHiddenKeys).mockResolvedValue(null);
  vi.mocked(setOrgHiddenKeys).mockResolvedValue([]);
});

describe("GET /api/navigation/organization", () => {
  it("returns the org default (empty when unset)", async () => {
    const res = await GET();
    const { status, body } = await parseResponse<{ hiddenKeys: string[] }>(res);
    expect(status).toBe(200);
    expect(body.hiddenKeys).toEqual([]);
  });
});

describe("PUT /api/navigation/organization", () => {
  it("rejects a non-admin caller with 403", async () => {
    vi.mocked(requireApiAdmin).mockRejectedValueOnce(
      new Error("Forbidden: Admin access required"),
    );
    const req = createMockRequest(
      "http://localhost:3000/api/navigation/organization",
      { method: "PUT", body: { hiddenKeys: [] } },
    );
    const res = await PUT(req);
    expect(res.status).toBe(403);
    expect(vi.mocked(setOrgHiddenKeys)).not.toHaveBeenCalled();
  });

  it("is blocked in demo mode", async () => {
    const { NextResponse } = await import("next/server");
    vi.mocked(requireNotDemoMode).mockReturnValueOnce(
      NextResponse.json(
        { error: "This action is disabled in demo mode" },
        { status: 403 },
      ),
    );
    const req = createMockRequest(
      "http://localhost:3000/api/navigation/organization",
      { method: "PUT", body: { hiddenKeys: [] } },
    );
    const res = await PUT(req);
    expect(res.status).toBe(403);
  });

  it("rejects unknown menu keys with 422", async () => {
    const req = createMockRequest(
      "http://localhost:3000/api/navigation/organization",
      { method: "PUT", body: { hiddenKeys: ["ghost.menu"] } },
    );
    const res = await PUT(req);
    const { status, body } = await parseResponse<{ code: string }>(res);
    expect(status).toBe(422);
    expect(body.code).toBe("UNKNOWN_NAV_KEYS");
    expect(vi.mocked(setOrgHiddenKeys)).not.toHaveBeenCalled();
  });

  it("refuses to hide a locked item with 422", async () => {
    const req = createMockRequest(
      "http://localhost:3000/api/navigation/organization",
      { method: "PUT", body: { hiddenKeys: ["overview.dashboard"] } },
    );
    const res = await PUT(req);
    const { status, body } = await parseResponse<{ code: string }>(res);
    expect(status).toBe(422);
    expect(body.code).toBe("LOCKED_NAV_KEYS");
    expect(vi.mocked(setOrgHiddenKeys)).not.toHaveBeenCalled();
  });

  it("saves the org default and writes an audit entry", async () => {
    vi.mocked(setOrgHiddenKeys).mockResolvedValueOnce(["overview.assets"]);
    const req = createMockRequest(
      "http://localhost:3000/api/navigation/organization",
      { method: "PUT", body: { hiddenKeys: ["overview.assets"] } },
    );

    const res = await PUT(req);
    const { status, body } = await parseResponse<{ hiddenKeys: string[] }>(res);

    expect(status).toBe(200);
    expect(body.hiddenKeys).toEqual(["overview.assets"]);
    expect(vi.mocked(setOrgHiddenKeys)).toHaveBeenCalledWith("org-1", [
      "overview.assets",
    ]);
    expect(vi.mocked(createAuditLog)).toHaveBeenCalledTimes(1);
  });
});
