import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockRequest,
  parseResponse,
} from "../../../../../tests/setup/test-helpers";

vi.mock("@/lib/prisma", () => ({ default: {} }));

// `api-route.ts` imports the org context, which transitively initialises auth;
// stub it so the route handler can be imported without a live database.
vi.mock("@/lib/organization-context", () => ({
  getOrganizationContext: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/api-auth", () => ({
  requireApiAuth: vi.fn(),
}));

vi.mock("@/lib/audit-log", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit-log")>();
  return { ...actual, createAuditLog: vi.fn() };
});

// Keep the real pure validators (unknown/locked detection) and stub the two
// database-touching functions so no live connection is required.
vi.mock("@/lib/navigation/preferences", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/navigation/preferences")>();
  return {
    ...actual,
    getNavigationState: vi.fn(),
    setUserHiddenKeys: vi.fn(),
  };
});

import { GET, PUT } from "../preferences/route";
import { requireApiAuth } from "@/lib/api-auth";
import { createAuditLog } from "@/lib/audit-log";
import {
  getNavigationState,
  setUserHiddenKeys,
} from "@/lib/navigation/preferences";

const AUTHED_USER = {
  id: "user-1",
  organizationId: "org-1",
  isAdmin: false,
};

const EMPTY_STATE = {
  hiddenKeys: [],
  userHiddenKeys: null,
  orgHiddenKeys: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireApiAuth).mockResolvedValue(AUTHED_USER);
  vi.mocked(getNavigationState).mockResolvedValue(EMPTY_STATE);
  vi.mocked(setUserHiddenKeys).mockResolvedValue([]);
});

describe("GET /api/navigation/preferences", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireApiAuth).mockRejectedValueOnce(new Error("Unauthorized"));
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the caller's resolved state", async () => {
    vi.mocked(getNavigationState).mockResolvedValueOnce({
      hiddenKeys: ["overview.assets"],
      userHiddenKeys: ["overview.assets"],
      orgHiddenKeys: [],
    });

    const res = await GET();
    const { status, body } = await parseResponse<{
      hiddenKeys: string[];
    }>(res);

    expect(status).toBe(200);
    expect(body.hiddenKeys).toEqual(["overview.assets"]);
    expect(vi.mocked(getNavigationState)).toHaveBeenCalledWith({
      userId: "user-1",
      organizationId: "org-1",
    });
  });
});

describe("PUT /api/navigation/preferences", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireApiAuth).mockRejectedValueOnce(new Error("Unauthorized"));
    const req = createMockRequest(
      "http://localhost:3000/api/navigation/preferences",
      { method: "PUT", body: { hiddenKeys: [] } },
    );
    const res = await PUT(req);
    expect(res.status).toBe(401);
  });

  it("rejects an invalid body with 400", async () => {
    const req = createMockRequest(
      "http://localhost:3000/api/navigation/preferences",
      { method: "PUT", body: { hiddenKeys: "not-an-array" } },
    );
    const res = await PUT(req);
    const { status, body } = await parseResponse<{ code: string }>(res);
    expect(status).toBe(400);
    expect(body.code).toBe("VALIDATION_FAILED");
    expect(vi.mocked(setUserHiddenKeys)).not.toHaveBeenCalled();
  });

  it("rejects unknown menu keys with 422", async () => {
    const req = createMockRequest(
      "http://localhost:3000/api/navigation/preferences",
      { method: "PUT", body: { hiddenKeys: ["ghost.menu"] } },
    );
    const res = await PUT(req);
    const { status, body } = await parseResponse<{
      code: string;
      unknownKeys: string[];
    }>(res);
    expect(status).toBe(422);
    expect(body.code).toBe("UNKNOWN_NAV_KEYS");
    expect(body.unknownKeys).toEqual(["ghost.menu"]);
    expect(vi.mocked(setUserHiddenKeys)).not.toHaveBeenCalled();
  });

  it("refuses to hide a locked item with 422", async () => {
    const req = createMockRequest(
      "http://localhost:3000/api/navigation/preferences",
      { method: "PUT", body: { hiddenKeys: ["overview.dashboard"] } },
    );
    const res = await PUT(req);
    const { status, body } = await parseResponse<{
      code: string;
      lockedKeys: string[];
    }>(res);
    expect(status).toBe(422);
    expect(body.code).toBe("LOCKED_NAV_KEYS");
    expect(body.lockedKeys).toEqual(["overview.dashboard"]);
    expect(vi.mocked(setUserHiddenKeys)).not.toHaveBeenCalled();
  });

  it("saves the caller's own keys and writes an audit entry", async () => {
    const req = createMockRequest(
      "http://localhost:3000/api/navigation/preferences",
      { method: "PUT", body: { hiddenKeys: ["overview.assets"] } },
    );

    const res = await PUT(req);
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
    // The user id is taken from the session, never from the body — a caller
    // cannot write another user's row.
    expect(vi.mocked(setUserHiddenKeys)).toHaveBeenCalledWith(
      "user-1",
      "org-1",
      ["overview.assets"],
    );
    expect(vi.mocked(createAuditLog)).toHaveBeenCalledTimes(1);
  });

  it("accepts an empty list as a deliberate 'show everything' choice", async () => {
    const req = createMockRequest(
      "http://localhost:3000/api/navigation/preferences",
      { method: "PUT", body: { hiddenKeys: [] } },
    );
    const res = await PUT(req);
    expect(res.status).toBe(200);
    expect(vi.mocked(setUserHiddenKeys)).toHaveBeenCalledWith(
      "user-1",
      "org-1",
      [],
    );
  });
});
