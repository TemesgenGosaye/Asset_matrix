import { describe, it, expect, vi, beforeEach } from "vitest";

// `preferences.ts` imports the Prisma client at module scope; the pure helpers
// under test never touch it, so a minimal stub keeps the import cheap.
vi.mock("@/lib/prisma", () => ({
  default: {
    navigationPreference: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import {
  findLockedKeys,
  findUnknownKeys,
  getNavigationState,
  sanitizeHiddenKeys,
} from "../preferences";
import prisma from "@/lib/prisma";

const mockPrisma = prisma as unknown as {
  navigationPreference: { findUnique: ReturnType<typeof vi.fn> };
  organization: { findUnique: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sanitizeHiddenKeys", () => {
  it("keeps known, non-locked keys", () => {
    expect(sanitizeHiddenKeys(["overview.assets"])).toEqual(["overview.assets"]);
  });

  it("drops keys the registry no longer knows (stale rows)", () => {
    expect(sanitizeHiddenKeys(["overview.assets", "ghost.menu"])).toEqual([
      "overview.assets",
    ]);
  });

  it("drops locked keys so a hand-edited row cannot hide Dashboard", () => {
    expect(
      sanitizeHiddenKeys(["overview.dashboard", "overview.assets"]),
    ).toEqual(["overview.assets"]);
  });

  it("drops non-string entries", () => {
    expect(sanitizeHiddenKeys([42, null, { key: "x" }, "overview.assets"])).toEqual(
      ["overview.assets"],
    );
  });

  it("de-duplicates repeated keys", () => {
    expect(
      sanitizeHiddenKeys(["overview.assets", "overview.assets"]),
    ).toEqual(["overview.assets"]);
  });
});

describe("findUnknownKeys", () => {
  it("returns only the unknown keys", () => {
    expect(findUnknownKeys(["overview.assets", "ghost.menu"])).toEqual([
      "ghost.menu",
    ]);
  });

  it("returns an empty array when every key is known", () => {
    expect(findUnknownKeys(["overview.assets", "overview.dashboard"])).toEqual(
      [],
    );
  });
});

describe("findLockedKeys", () => {
  it("returns only the locked keys", () => {
    expect(
      findLockedKeys(["overview.assets", "overview.dashboard"]),
    ).toEqual(["overview.dashboard"]);
  });

  it("returns an empty array when no key is locked", () => {
    expect(findLockedKeys(["overview.assets"])).toEqual([]);
  });
});

describe("getNavigationState", () => {
  it("returns the empty state when there is no user id", async () => {
    const state = await getNavigationState({ userId: null });
    expect(state.hiddenKeys).toEqual([]);
    expect(state.userHiddenKeys).toBeNull();
    expect(state.orgHiddenKeys).toEqual([]);
    expect(mockPrisma.navigationPreference.findUnique).not.toHaveBeenCalled();
  });

  it("resolves the user preference over the org default", async () => {
    mockPrisma.navigationPreference.findUnique.mockResolvedValue({
      hiddenKeys: ["overview.assets"],
    });
    mockPrisma.organization.findUnique.mockResolvedValue({
      settings: { navigationHiddenKeys: ["overview.accessories"] },
    });

    const state = await getNavigationState({
      userId: "user-1",
      organizationId: "org-1",
    });

    expect(state.userHiddenKeys).toEqual(["overview.assets"]);
    expect(state.orgHiddenKeys).toEqual(["overview.accessories"]);
    expect(state.hiddenKeys).toEqual(["overview.assets"]);
  });

  it("falls back to the org default when the user has no row", async () => {
    mockPrisma.navigationPreference.findUnique.mockResolvedValue(null);
    mockPrisma.organization.findUnique.mockResolvedValue({
      settings: { navigationHiddenKeys: ["overview.accessories"] },
    });

    const state = await getNavigationState({
      userId: "user-1",
      organizationId: "org-1",
    });

    expect(state.userHiddenKeys).toBeNull();
    expect(state.hiddenKeys).toEqual(["overview.accessories"]);
  });

  it("sanitizes stale and locked keys coming from storage", async () => {
    mockPrisma.navigationPreference.findUnique.mockResolvedValue({
      hiddenKeys: ["overview.assets", "ghost.menu", "overview.dashboard"],
    });
    mockPrisma.organization.findUnique.mockResolvedValue({
      settings: {},
    });

    const state = await getNavigationState({
      userId: "user-1",
      organizationId: "org-1",
    });

    expect(state.userHiddenKeys).toEqual(["overview.assets"]);
    expect(state.hiddenKeys).toEqual(["overview.assets"]);
  });
});
