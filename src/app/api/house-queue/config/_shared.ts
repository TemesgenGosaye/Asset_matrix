import { type NextRequest } from "next/server";
import type {
  EngineConfigState,
  EngineConfigVersionRow,
} from "@/lib/house-queue/config/service";

/**
 * First client IP from a proxied request. Mirrors the convention used by
 * `audit-log.ts` / `auth-server.ts` (x-forwarded-for may contain a comma
 * separated chain — only the first hop is the caller).
 */
export function getClientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

// ---------------------------------------------------------------------------
// JSON-safe serialization of the engine-config state (Date → ISO string).
// ---------------------------------------------------------------------------

export interface EngineConfigVersionView {
  id: string;
  versionNumber: number;
  status: string;
  payload: EngineConfigPayloadView;
  changeSummary: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  publishedBy: string | null;
  publishedAt: string | null;
  supersededById: string | null;
}

export interface EngineConfigPayloadView {
  weights: {
    serviceYears: number;
    maritalStatus: number;
    disability: number;
    gender: number;
  };
  eligibilityBands: Array<{
    category: string;
    gradeMin: number;
    gradeMax: number | null;
  }>;
  recommendation: {
    preferRegularOverGuest: boolean;
    locationSortDirection: string;
    houseNumberSortMode: string;
  };
}

export interface EngineConfigStateView {
  active: EngineConfigVersionView;
  draft: EngineConfigVersionView | null;
  history: EngineConfigVersionView[];
  editingBase: EngineConfigVersionView;
  lastAuditAt: string | null;
  lastPublishedAt: string | null;
  lastRunAt: string | null;
}

function serializeRow(row: EngineConfigVersionRow): EngineConfigVersionView {
  return {
    ...row,
    payload: serializePayload(row.payload),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
  };
}

function serializePayload(
  payload: EngineConfigVersionRow["payload"],
): EngineConfigPayloadView {
  return payload as unknown as EngineConfigPayloadView;
}

export function serializeState(
  state: EngineConfigState,
): EngineConfigStateView {
  return {
    active: serializeRow(state.active),
    draft: state.draft ? serializeRow(state.draft) : null,
    history: state.history.map(serializeRow),
    editingBase: serializeRow(state.editingBase),
    lastAuditAt: state.lastAuditAt ? state.lastAuditAt.toISOString() : null,
    lastPublishedAt: state.lastPublishedAt
      ? state.lastPublishedAt.toISOString()
      : null,
    lastRunAt: state.lastRunAt ? state.lastRunAt.toISOString() : null,
  };
}
