import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Regression tests for the engine-config version ledger.
 *
 * Three bugs lived here, and all three made the configuration page unusable:
 *
 *  1. `publishDraft` INSERTED a second row with the same
 *     `(organizationId, versionNumber)` as the draft it was publishing (both
 *     were `active.versionNumber + 1`). The table has a unique constraint on
 *     that pair, so every publish failed with a 409 and no configuration could
 *     ever be released.
 *
 *  2. `rollbackConfig` archived "every row with status active" AFTER creating
 *     the new active row, so it archived the rollback itself and left the
 *     organization with NO live configuration. Every later read then threw
 *     "Active engine configuration is missing for organization".
 *
 *  3. `ensureEngineConfigExists` did not repair that state, so an
 *     organization that hit bug 2 stayed broken.
 *
 * The tests drive the real service against an in-memory fake of the version
 * table, including its unique constraint, so a regression fails here rather
 * than in production.
 */

const { store, prismaMock } = vi.hoisted(() => {
  interface Row {
    id: string;
    organizationId: string;
    versionNumber: number;
    status: string;
    weights: unknown;
    eligibilityBands: unknown;
    recommendationRules: unknown;
    changeSummary: string | null;
    createdBy: string | null;
    createdAt: Date;
    updatedAt: Date;
    publishedBy: string | null;
    publishedAt: Date | null;
    supersededById: string | null;
  }

  const rows: Row[] = [];
  let counter = 0;

  const matches = (row: Row, where: Record<string, any> = {}): boolean => {
    for (const [key, value] of Object.entries(where)) {
      if (value === undefined) continue;
      if (key === "id" && row.id !== value) return false;
      if (key === "organizationId" && row.organizationId !== value) return false;
      if (key === "status" && row.status !== value) return false;
      if (key === "versionNumber" && row.versionNumber !== value) return false;
    }
    return true;
  };

  const engineConfigVersion = {
    findFirst: vi.fn(async ({ where = {}, orderBy }: any = {}) => {
      const found = rows.filter((r) => matches(r, where));
      if (found.length === 0) return null;
      const sorted = [...found].sort(
        (a, b) => (orderBy?.versionNumber === "desc" ? b.versionNumber - a.versionNumber : 0),
      );
      return { ...sorted[0] };
    }),
    findMany: vi.fn(async ({ where = {} }: any = {}) =>
      rows.filter((r) => matches(r, where)).map((r) => ({ ...r })),
    ),
    create: vi.fn(async ({ data }: any) => {
      // The unique constraint the ledger relies on.
      const clash = rows.find(
        (r) =>
          r.organizationId === data.organizationId &&
          r.versionNumber === data.versionNumber,
      );
      if (clash) {
        const error: any = new Error(
          "Unique constraint failed on the fields: (`organizationId`,`versionNumber`)",
        );
        error.code = "P2002";
        throw error;
      }
      counter += 1;
      const row: Row = {
        id: `cfg-${counter}`,
        organizationId: data.organizationId,
        versionNumber: data.versionNumber,
        status: data.status ?? "draft",
        weights: data.weights ?? {},
        eligibilityBands: data.eligibilityBands ?? [],
        recommendationRules: data.recommendationRules ?? {},
        changeSummary: data.changeSummary ?? null,
        createdBy: data.createdBy ?? null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
        publishedBy: data.publishedBy ?? null,
        publishedAt: data.publishedAt ?? null,
        supersededById: data.supersededById ?? null,
      };
      rows.push(row);
      return { ...row };
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const row = rows.find((r) => r.id === where.id);
      if (!row) throw new Error(`No version row ${where.id}`);
      Object.assign(row, data);
      return { ...row };
    }),
    updateMany: vi.fn(async ({ where, data }: any) => {
      const targets = rows.filter((r) => matches(r, where));
      for (const row of targets) Object.assign(row, data);
      return { count: targets.length };
    }),
  };

  const configAuditEntry = {
    createMany: vi.fn(async () => ({ count: 0 })),
    findFirst: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
  };

  const client = {
    engineConfigVersion,
    configAuditEntry,
    $transaction: vi.fn(async (fn: (tx: any) => unknown) =>
      fn({ engineConfigVersion, configAuditEntry }),
    ),
  };

  return {
    store: { rows, reset: () => rows.splice(0, rows.length) },
    prismaMock: client,
  };
});

vi.mock("@/lib/prisma", () => ({ default: prismaMock }));

import {
  ensureEngineConfigExists,
  publishDraft,
  rollbackConfig,
  saveDraft,
} from "@/lib/house-queue/config/service";
import type { EngineConfigPayload } from "@/lib/house-queue/config/types";

const ORG = "org-1";

const PAYLOAD: EngineConfigPayload = {
  weights: { serviceYears: 40, maritalStatus: 30, disability: 20, gender: 10 },
  eligibilityBands: [
    { category: "A", gradeMin: 1, gradeMax: 5 },
    { category: "B", gradeMin: 6, gradeMax: 10 },
  ],
  recommendation: {
    preferRegularOverGuest: true,
    locationSortDirection: "asc",
    houseNumberSortMode: "numeric_aware",
  },
};

const changedPayload: EngineConfigPayload = {
  ...PAYLOAD,
  weights: { serviceYears: 50, maritalStatus: 20, disability: 20, gender: 10 },
};

beforeEach(() => {
  store.reset();
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (fn: (tx: any) => unknown) =>
    fn({
      engineConfigVersion: prismaMock.engineConfigVersion,
      configAuditEntry: prismaMock.configAuditEntry,
    }),
  );
});

describe("engine config version ledger", () => {
  it("seeds v1 as the active version for a new organization", async () => {
    await ensureEngineConfigExists(ORG);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].status).toBe("active");
    expect(store.rows[0].versionNumber).toBe(1);
  });

  it("publishes a draft without colliding with the draft's version number", async () => {
    await ensureEngineConfigExists(ORG);
    await saveDraft({
      organizationId: ORG,
      payload: changedPayload,
      createdBy: "user-1",
    });

    // The draft owns a version number of its own.
    const draft = store.rows.find((r) => r.status === "draft");
    expect(draft).toBeDefined();

    const published = await publishDraft({
      organizationId: ORG,
      createdBy: "user-1",
      changeSummary: "New weights",
    });

    // Exactly one active row, and it is the version that was published.
    const active = store.rows.filter((r) => r.status === "active");
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(published.id);
    expect(active[0].publishedBy).toBe("user-1");
    expect(active[0].publishedAt).toBeTruthy();

    // No two rows may share a version number.
    const numbers = store.rows.map((r) => r.versionNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("archives the outgoing version and keeps the published one live", async () => {
    await ensureEngineConfigExists(ORG);
    await saveDraft({
      organizationId: ORG,
      payload: changedPayload,
      createdBy: "user-1",
    });
    await publishDraft({
      organizationId: ORG,
      createdBy: "user-1",
      changeSummary: "New weights",
    });

    const archived = store.rows.filter((r) => r.status === "archived");
    expect(archived).toHaveLength(1);
    expect(archived[0].versionNumber).toBe(1);
  });

  it("rolls back without archiving the version it just created", async () => {
    await ensureEngineConfigExists(ORG);
    await saveDraft({
      organizationId: ORG,
      payload: changedPayload,
      createdBy: "user-1",
    });
    await publishDraft({
      organizationId: ORG,
      createdBy: "user-1",
      changeSummary: "New weights",
    });

    const v1 = store.rows.find((r) => r.versionNumber === 1)!;
    const rolledBack = await rollbackConfig({
      organizationId: ORG,
      targetVersionId: v1.id,
      createdBy: "user-1",
      changeSummary: "Back to v1",
    });

    // The organization must still have exactly ONE live version - the one the
    // rollback published. Archiving it too left the organization with no
    // configuration at all.
    const active = store.rows.filter((r) => r.status === "active");
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(rolledBack.id);

    const numbers = store.rows.map((r) => r.versionNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("rolls back while a draft is pending, without a version-number clash", async () => {
    await ensureEngineConfigExists(ORG);
    await saveDraft({
      organizationId: ORG,
      payload: changedPayload,
      createdBy: "user-1",
    });
    await publishDraft({
      organizationId: ORG,
      createdBy: "user-1",
      changeSummary: "New weights",
    });
    // A second draft, sitting on top of the live version.
    await saveDraft({
      organizationId: ORG,
      payload: PAYLOAD,
      createdBy: "user-2",
    });

    const v1 = store.rows.find((r) => r.versionNumber === 1)!;
    await rollbackConfig({
      organizationId: ORG,
      targetVersionId: v1.id,
      createdBy: "user-1",
      changeSummary: "Back to v1",
    });

    expect(store.rows.filter((r) => r.status === "active")).toHaveLength(1);
    const numbers = store.rows.map((r) => r.versionNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("repairs an organization that has versions but no active one", async () => {
    await ensureEngineConfigExists(ORG);
    // Simulate the broken state a rollback used to leave behind.
    store.rows[0].status = "archived";

    await ensureEngineConfigExists(ORG);

    expect(store.rows.filter((r) => r.status === "active")).toHaveLength(1);
  });
});
