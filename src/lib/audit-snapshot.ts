import { createAuditLog } from "./audit-log";

/**
 * Create an audit log entry with before/after snapshots.
 * The `details` field stores JSON with { before, after, changes }.
 */
export async function createAuditLogWithSnapshot(params: {
  userId: string;
  action: string;
  entity: string;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}): Promise<void> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  if (params.before && params.after) {
    for (const key of Object.keys(params.after)) {
      if (
        JSON.stringify(params.before[key]) !== JSON.stringify(params.after[key])
      ) {
        changes[key] = { from: params.before[key], to: params.after[key] };
      }
    }
  }

  await createAuditLog({
    userId: params.userId,
    action: params.action,
    entity: params.entity,
    entityId: params.entityId,
    details: {
      before: params.before,
      after: params.after,
      changes,
    },
  });
}
