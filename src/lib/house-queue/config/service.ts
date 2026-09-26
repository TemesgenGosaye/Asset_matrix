/**
 * House Queue engine configuration — server-side store and state machine.
 *
 * Manages the EngineConfigVersion lifecycle:
 *   DRAFT (at most one per org) → ACTIVE (at most one per org) → ARCHIVED.
 *
 *  - Seeds v1 (ACTIVE, default payload) on first access.
 *  - `saveDraft` never touches the live version; every change is recorded as
 *    a FIELD-LEVEL ConfigAuditEntry diffed against the ACTIVE payload, so the
 *    audit shows exactly what a draft would change vs the live configuration.
 *  - `publishDraft` supersedes the outgoing active version (marks it archived
 *    — never deleted → rollback stays possible) and archives the draft.
 *  - `rollback` re-publishes a copy of an archived version's payload as a new
 *    version number (Admin-only).
 *
 * Server-only: imports prisma and the audit/route domain helpers.
 */

import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import {
  DEFAULT_ENGINE_CONFIG,
  type EngineConfigPayload,
  type EngineConfigSection,
} from "./types";

// ───────────────────────────────────────────────────────────────────────────
// Version view + payload plumbing
// ───────────────────────────────────────────────────────────────────────────

export type ConfigVersionStatus = "draft" | "active" | "archived";

export interface EngineConfigVersionRow {
  id: string;
  versionNumber: number;
  status: ConfigVersionStatus;
  payload: EngineConfigPayload;
  changeSummary: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  publishedBy: string | null;
  publishedAt: Date | null;
  supersededById: string | null;
}

function fromPrismaRow(row: {
  id: string;
  versionNumber: number;
  status: string;
  weights: Prisma.JsonValue;
  eligibilityBands: Prisma.JsonValue;
  recommendationRules: Prisma.JsonValue;
  changeSummary: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  publishedBy: string | null;
  publishedAt: Date | null;
  supersededById: string | null;
}): EngineConfigVersionRow {
  return {
    id: row.id,
    versionNumber: row.versionNumber,
    status: row.status as ConfigVersionStatus,
    payload: {
      weights: row.weights as unknown as EngineConfigPayload["weights"],
      eligibilityBands:
        row.eligibilityBands as unknown as EngineConfigPayload["eligibilityBands"],
      recommendation:
        row.recommendationRules as unknown as EngineConfigPayload["recommendation"],
    },
    changeSummary: row.changeSummary,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    publishedBy: row.publishedBy,
    publishedAt: row.publishedAt,
    supersededById: row.supersededById,
  };
}

const VERSION_SELECT = {
  id: true,
  versionNumber: true,
  status: true,
  weights: true,
  eligibilityBands: true,
  recommendationRules: true,
  changeSummary: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
  publishedBy: true,
  publishedAt: true,
  supersededById: true,
} as const;

function payloadToPrisma(payload: EngineConfigPayload): {
  weights: Prisma.InputJsonValue;
  eligibilityBands: Prisma.InputJsonValue;
  recommendationRules: Prisma.InputJsonValue;
} {
  return {
    weights: payload.weights as unknown as Prisma.InputJsonValue,
    eligibilityBands:
      payload.eligibilityBands as unknown as Prisma.InputJsonValue,
    recommendationRules:
      payload.recommendation as unknown as Prisma.InputJsonValue,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// JSON diff → field-level audit rows
// ───────────────────────────────────────────────────────────────────────────

export interface FieldDiff {
  fieldPath: string;
  oldValue: string;
  newValue: string;
}

/** Coerce a single payload node to a comparable string. */
function stringifyNode(value: unknown): string {
  return JSON.stringify(value ?? null);
}

/**
 * Walk two payloads and produce dotted-path field diffs, treating each leaf of
 * the top-level sections as a field (e.g. `weights.service_years`). Arrays
 * (eligibilityBands, photo urls) compare by serialization — a band membership
 * change is a full-field diff, which is acceptable granularity for audit.
 */
export function diffPayloads(
  before: EngineConfigPayload,
  after: EngineConfigPayload,
): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  const sections: EngineConfigSection[] = [
    "weights",
    "eligibilityBands",
    "recommendation",
  ];

  for (const section of sections) {
    const b = before[section];
    const a = after[section];

    if (Array.isArray(b) || Array.isArray(a)) {
      const oldValue = stringifyNode(b);
      const newValue = stringifyNode(a);
      if (oldValue !== newValue) {
        diffs.push({ fieldPath: section, oldValue, newValue });
      }
      continue;
    }

    if (
      typeof b === "object" &&
      b !== null &&
      typeof a === "object" &&
      a !== null
    ) {
      const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
      for (const key of [...keys].sort()) {
        const oldValue = stringifyNode(
          (b as unknown as Record<string, unknown>)[key],
        );
        const newValue = stringifyNode(
          (a as unknown as Record<string, unknown>)[key],
        );
        if (oldValue !== newValue) {
          diffs.push({ fieldPath: `${section}.${key}`, oldValue, newValue });
        }
      }
      continue;
    }

    const oldValue = stringifyNode(b);
    const newValue = stringifyNode(a);
    if (oldValue !== newValue) {
      diffs.push({ fieldPath: section, oldValue, newValue });
    }
  }

  return diffs;
}

// ───────────────────────────────────────────────────────────────────────────
// Audit writes (append-only)
// ───────────────────────────────────────────────────────────────────────────

export type ConfigAuditAction =
  | "draft_save"
  | "publish"
  | "rollback"
  | "manual_run"
  | "auto_run"
  | "manual_purge"
  | "auto_purge";

interface WriteAuditInput {
  organizationId: string;
  versionId: string;
  actor: string | null;
  ipAddress?: string | null;
  changeSummary?: string | null;
}

function auditRows(
  input: WriteAuditInput &
    (
      | { diffs: FieldDiff[] }
      | { meta: { fieldPath: string; oldValue: string; newValue: string } }
    ),
  action: ConfigAuditAction,
  tx: Prisma.TransactionClient,
) {
  const base = {
    organizationId: input.organizationId,
    versionId: input.versionId,
    action,
    changedBy: input.actor,
    ipAddress: input.ipAddress ?? null,
    changeSummary: input.changeSummary ?? null,
  };
  const rows: Prisma.ConfigAuditEntryCreateManyInput[] = [];
  if ("meta" in input) {
    rows.push({
      ...base,
      fieldPath: input.meta.fieldPath,
      oldValue: input.meta.oldValue,
      newValue: input.meta.newValue,
    });
  }
  if ("diffs" in input) {
    for (const diff of input.diffs) {
      rows.push({
        ...base,
        fieldPath: diff.fieldPath,
        oldValue: diff.oldValue,
        newValue: diff.newValue,
      });
    }
  }
  if (rows.length === 0) return;
  return tx.configAuditEntry.createMany({ data: rows });
}

// ───────────────────────────────────────────────────────────────────────────
// Seed + read
// ───────────────────────────────────────────────────────────────────────────

/**
 * Create v1 (ACTIVE, defaults) for an organization when none exists.
 * Idempotent and race-safe (partial unique index rejects a concurrent second
 * 'active' row; the constraint error is swallowed).
 */
export async function ensureEngineConfigExists(
  organizationId: string,
): Promise<void> {
  const existing = await prisma.engineConfigVersion.findFirst({
    where: { organizationId },
    select: { id: true },
  });
  if (existing) return;

  try {
    const version = await prisma.engineConfigVersion.create({
      data: {
        organizationId,
        versionNumber: 1,
        status: "active",
        ...payloadToPrisma(DEFAULT_ENGINE_CONFIG),
        changeSummary: "Initial configuration",
      },
    });
    await prisma.configAuditEntry.createMany({
      data: [
        {
          organizationId,
          versionId: version.id,
          fieldPath: "__meta",
          oldValue: "v0 (implicit)",
          newValue: "v1",
          action: "publish",
          changeSummary: "Initial configuration",
        },
      ],
    });
  } catch (e) {
    // Concurrent seed — a row already exists now, ignore.
    const existingAfter = await prisma.engineConfigVersion.findFirst({
      where: { organizationId },
      select: { id: true },
    });
    if (!existingAfter) throw e;
  }
}

/** The live (ACTIVE) version, seeding v1 if needed. */
export async function getActiveConfig(
  organizationId: string,
): Promise<EngineConfigVersionRow> {
  await ensureEngineConfigExists(organizationId);
  const active = await prisma.engineConfigVersion.findFirst({
    where: { organizationId, status: "active" },
    select: VERSION_SELECT,
  });
  if (!active) {
    // Partial constraint guarantees at most one active; a missing row here is
    // a logical invariant violation.
    throw new Error("Active engine configuration is missing for organization");
  }
  return fromPrismaRow(active);
}

/** Convenience: only the payload of the active version. */
export async function getActiveConfigPayload(
  organizationId: string,
): Promise<EngineConfigPayload> {
  const active = await getActiveConfig(organizationId);
  return active.payload;
}

/** The current DRAFT payload if one exists (draft edits), else null. */
export async function getDraftConfig(
  organizationId: string,
): Promise<EngineConfigVersionRow | null> {
  const draft = await prisma.engineConfigVersion.findFirst({
    where: { organizationId, status: "draft" },
    select: VERSION_SELECT,
  });
  return draft ? fromPrismaRow(draft) : null;
}

export interface EngineConfigState {
  active: EngineConfigVersionRow;
  draft: EngineConfigVersionRow | null;
  /** Version history, newest first (archived versions; draft excluded). */
  history: EngineConfigVersionRow[];
  /** Currently valid draft payload to edit against (draft ?? active). */
  editingBase: EngineConfigVersionRow;
  lastAuditAt: Date | null;
  lastPublishedAt: Date | null;
  lastRunAt: Date | null;
}

/**
 * Full snapshot used by the config page and all preview endpoints.
 * Baseline for a fresh draft is the ACTIVE payload (diffs = vs live config).
 */
export async function getConfigState(
  organizationId: string,
): Promise<EngineConfigState> {
  await ensureEngineConfigExists(organizationId);

  const [versions, latestAudit] = await Promise.all([
    prisma.engineConfigVersion.findMany({
      where: { organizationId },
      select: VERSION_SELECT,
      orderBy: [{ versionNumber: "desc" }],
    }),
    prisma.configAuditEntry.findFirst({
      where: { organizationId },
      orderBy: { changedAt: "desc" },
      select: { changedAt: true },
    }),
  ]);

  const active = versions.find((v) => v.status === "active");
  const draft = versions.find((v) => v.status === "draft") ?? null;
  const history = versions.filter(
    (v) => v.status === "archived" && v.id !== draft?.id,
  );
  const lastPublished = versions.find((v) => v.publishedAt !== null);

  if (!active) {
    throw new Error("Active engine configuration is missing for organization");
  }

  return {
    active: fromPrismaRow(active),
    draft: draft ? fromPrismaRow(draft) : null,
    history: history.map(fromPrismaRow),
    editingBase: draft ? fromPrismaRow(draft) : fromPrismaRow(active),
    lastAuditAt: latestAudit?.changedAt ?? null,
    lastPublishedAt: lastPublished?.publishedAt ?? null,
    lastRunAt: latestAudit?.changedAt ?? null,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Draft editing
// ───────────────────────────────────────────────────────────────────────────

/**
 * Merge a partial section update over the current editing baseline.
 * Non-provided sections are carried forward from `base`.
 */
export function mergeConfigPayload(
  base: EngineConfigPayload,
  partial: Partial<EngineConfigPayload>,
): EngineConfigPayload {
  return {
    weights: partial.weights ?? base.weights,
    eligibilityBands: partial.eligibilityBands ?? base.eligibilityBands,
    recommendation: partial.recommendation ?? base.recommendation,
  };
}

export interface SaveDraftInput {
  organizationId: string;
  payload: EngineConfigPayload;
  createdBy: string | null;
  ipAddress?: string | null;
}

/**
 * Create or update the draft from a fully-validated payload. Never touches
 * the ACTIVE version. Every field that differs from the ACTIVE payload is
 * recorded as a field-level `draft_save` audit entry.
 *
 * Resets the draft after a publish: when the previous draft was already
 * published (archived), a fresh one is created instead.
 */
export async function saveDraft(
  input: SaveDraftInput,
): Promise<EngineConfigVersionRow> {
  const active = await getActiveConfig(input.organizationId);

  const existing = await getDraftConfig(input.organizationId);
  const diffs = diffPayloads(active.payload, input.payload);

  const data = {
    organizationId: input.organizationId,
    ...payloadToPrisma(input.payload),
  };

  let draft: EngineConfigVersionRow;
  if (existing) {
    const updated = await prisma.engineConfigVersion.update({
      where: { id: existing.id },
      data: { ...data, changeSummary: undefined },
      select: VERSION_SELECT,
    });
    draft = fromPrismaRow(updated);
  } else {
    const created = await prisma.engineConfigVersion.create({
      data: {
        ...data,
        versionNumber: active.versionNumber + 1,
        status: "draft",
        createdBy: input.createdBy,
      },
      select: VERSION_SELECT,
    });
    draft = fromPrismaRow(created);
  }

  if (diffs.length > 0) {
    await auditRows(
      {
        organizationId: input.organizationId,
        versionId: draft.id,
        actor: input.createdBy,
        ipAddress: input.ipAddress,
        diffs,
      },
      "draft_save",
      prisma,
    );
  }

  return draft;
}

// ───────────────────────────────────────────────────────────────────────────
// Publish + rollback
// ───────────────────────────────────────────────────────────────────────────

export interface PublishInput {
  organizationId: string;
  createdBy: string;
  ipAddress?: string | null;
  changeSummary?: string | null;
}

/**
 * Publish the current draft: it becomes the new ACTIVE version, the previous
 * ACTIVE is archived (soft — retained for rollback), and the draft row is
 * archived. Field-level `publish` audit entries diff the new live config
 * against the one it replaced.
 */
export async function publishDraft(
  input: PublishInput,
): Promise<EngineConfigVersionRow> {
  const state = await getConfigState(input.organizationId);
  const draft = state.draft;
  if (!draft) {
    throw new Error("No draft to publish — save the draft first");
  }
  if (draft.payload === state.editingBase.payload) {
    throw new Error("Draft has no changes to publish");
  }

  const newVersionNumber = state.active.versionNumber + 1;
  const diffAgainstRelease = diffPayloads(state.active.payload, draft.payload);

  return prisma.$transaction(async (tx) => {
    const released = await tx.engineConfigVersion.create({
      data: {
        organizationId: input.organizationId,
        versionNumber: newVersionNumber,
        status: "active",
        ...payloadToPrisma(draft.payload),
        changeSummary: input.changeSummary ?? null,
        createdBy: draft.createdBy ?? input.createdBy,
        publishedBy: input.createdBy,
        publishedAt: new Date(),
        supersededById: state.active.id,
      },
      select: VERSION_SELECT,
    });

    // Soft-archive the outgoing live version AND the draft row.
    await tx.engineConfigVersion.updateMany({
      where: { organizationId: input.organizationId, status: "active" },
      data: { status: "archived" },
    });
    await tx.engineConfigVersion.updateMany({
      where: { organizationId: input.organizationId, status: "draft" },
      data: { status: "archived" },
    });

    await auditRows(
      {
        organizationId: input.organizationId,
        versionId: released.id,
        actor: input.createdBy,
        ipAddress: input.ipAddress,
        changeSummary: input.changeSummary ?? null,
        diffs: diffAgainstRelease,
      },
      "publish",
      tx,
    );
    await auditRows(
      {
        organizationId: input.organizationId,
        versionId: released.id,
        actor: input.createdBy,
        ipAddress: input.ipAddress,
        changeSummary: input.changeSummary ?? null,
        meta: {
          fieldPath: "version",
          oldValue: `v${state.active.versionNumber}`,
          newValue: `v${newVersionNumber}`,
        },
      },
      "publish",
      tx,
    );

    return fromPrismaRow(released);
  });
}

export interface RollbackInput {
  organizationId: string;
  /** The archived version whose payload should be re-published. */
  targetVersionId: string;
  createdBy: string;
  ipAddress?: string | null;
  changeSummary: string;
}

/**
 * Re-publish a copy of an archived version's payload as a NEW version number.
 * The current active version is archived. Right now the Admin has to supply a
 * changeSummary — routes reject empty.
 */
export async function rollbackConfig(
  input: RollbackInput,
): Promise<EngineConfigVersionRow> {
  const [active, target] = await Promise.all([
    getActiveConfig(input.organizationId),
    prisma.engineConfigVersion.findFirst({
      where: {
        organizationId: input.organizationId,
        id: input.targetVersionId,
        status: "archived",
      },
      select: VERSION_SELECT,
    }),
  ]);

  if (!target) {
    throw new Error("Target version not found (must be an archived version)");
  }
  if (!input.changeSummary?.trim()) {
    throw new Error("A change summary is required for rollback");
  }

  const newVersionNumber = active.versionNumber + 1;
  const targetRow = fromPrismaRow(target);
  const diffAgainstRelease = diffPayloads(active.payload, targetRow.payload);

  return prisma.$transaction(async (tx) => {
    const released = await tx.engineConfigVersion.create({
      data: {
        organizationId: input.organizationId,
        versionNumber: newVersionNumber,
        status: "active",
        ...payloadToPrisma(targetRow.payload),
        changeSummary: input.changeSummary,
        createdBy: input.createdBy,
        publishedBy: input.createdBy,
        publishedAt: new Date(),
        supersededById: active.id,
      },
      select: VERSION_SELECT,
    });

    await tx.engineConfigVersion.updateMany({
      where: { organizationId: input.organizationId, status: "active" },
      data: { status: "archived" },
    });
    await tx.engineConfigVersion.updateMany({
      where: { organizationId: input.organizationId, status: "draft" },
      data: { status: "archived" },
    });

    await auditRows(
      {
        organizationId: input.organizationId,
        versionId: released.id,
        actor: input.createdBy,
        ipAddress: input.ipAddress,
        changeSummary: input.changeSummary,
        diffs: diffAgainstRelease,
      },
      "rollback",
      tx,
    );
    await auditRows(
      {
        organizationId: input.organizationId,
        versionId: released.id,
        actor: input.createdBy,
        ipAddress: input.ipAddress,
        changeSummary: input.changeSummary,
        meta: {
          fieldPath: "version",
          oldValue: `v${active.versionNumber}`,
          newValue: `v${newVersionNumber}`,
        },
      },
      "rollback",
      tx,
    );

    return fromPrismaRow(released);
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Manual "Run Now" rate limiting + audit
// ───────────────────────────────────────────────────────────────────────────

export const MANUAL_RUN_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * True when `actor` manually ran the engine within the last 5 minutes.
 * The spec limits "Run Now" to 1 per 5 minutes per user.
 */
export async function isManualRunRateLimited(
  organizationId: string,
  actor: string,
): Promise<boolean> {
  const last = await prisma.configAuditEntry.findFirst({
    where: {
      organizationId,
      action: "manual_run",
      changedBy: actor,
    },
    orderBy: { changedAt: "desc" },
    select: { changedAt: true },
  });
  if (!last) return false;
  return Date.now() - last.changedAt.getTime() < MANUAL_RUN_COOLDOWN_MS;
}

/** Append an audit entry for a manual/automatic queue recompute. */
export async function recordConfigRun(input: {
  organizationId: string;
  action: "manual_run" | "auto_run";
  actor: string | null;
  ipAddress?: string | null;
}): Promise<void> {
  const active = await prisma.engineConfigVersion.findFirst({
    where: { organizationId: input.organizationId, status: "active" },
    select: { id: true, versionNumber: true },
  });
  if (!active) return;

  await prisma.configAuditEntry.create({
    data: {
      organizationId: input.organizationId,
      versionId: active.id,
      // Runs execute against the active config from the moment they fire.
      fieldPath: "__meta",
      oldValue: null,
      newValue: `v${active.versionNumber}`,
      action: input.action,
      changedBy: input.actor,
      ipAddress: input.ipAddress ?? null,
    },
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Audit read (for the History / Audit panel)
// ───────────────────────────────────────────────────────────────────────────

export interface ConfigAuditView {
  id: string;
  versionId: string;
  versionNumber: number | null;
  fieldPath: string;
  oldValue: string | null;
  newValue: string | null;
  action: string;
  changedBy: string | null;
  changedAt: Date;
  ipAddress: string | null;
  changeSummary: string | null;
}

/** Chronologically newest-first, optionally scoped to a single version. */
export async function getConfigAudit(
  organizationId: string,
  options: { versionId?: string; limit?: number } = {},
): Promise<ConfigAuditView[]> {
  const entries = await prisma.configAuditEntry.findMany({
    where: {
      organizationId,
      ...(options.versionId ? { versionId: options.versionId } : {}),
    },
    orderBy: { changedAt: "desc" },
    take: options.limit ?? 100,
    include: {
      version: { select: { versionNumber: true } },
    },
  });

  return entries.map((e) => ({
    id: e.id,
    versionId: e.versionId,
    versionNumber: e.version.versionNumber,
    fieldPath: e.fieldPath,
    oldValue: e.oldValue,
    newValue: e.newValue,
    action: e.action,
    changedBy: e.changedBy,
    changedAt: e.changedAt,
    ipAddress: e.ipAddress,
    changeSummary: e.changeSummary,
  }));
}
