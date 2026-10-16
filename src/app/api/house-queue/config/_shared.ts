import { type NextRequest } from "next/server";
import {
  diffSections,
  includesAdminOnlySection,
  type EngineConfigSection,
} from "@/lib/house-queue/config/types";
import type {
  EngineConfigState,
  EngineConfigVersionRow,
} from "@/lib/house-queue/config/service";
import prisma from "@/lib/prisma";

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
  publishGate: PublishGateView;
}

/**
 * What the publish button is allowed to attempt, decided server-side.
 *
 * This exists because the decision used to be duplicated on the client, which
 * got it wrong in a way that was invisible and unfixable from the UI:
 *
 *   - the client diffed its own LOCAL payload against the baseline, while
 *     `POST /publish` diffs the SAVED draft against ACTIVE. Edit without
 *     saving and the two disagree;
 *   - when they disagreed in the direction "client thinks no re-auth needed,
 *     server thinks it does", the client skipped the identity prompt and the
 *     server answered `403 REAUTH_REQUIRED` — with nothing on screen saying a
 *     password box was needed at all.
 *
 * So the server states the requirement instead, and the client renders what it
 * is told. `mfaRequired` is here for the same reason: the re-auth endpoint
 * demands a second factor whenever the account has one, and the UI could not
 * label the code field "required" because it never knew.
 */
export interface PublishGateView {
  /** Sections that differ between the active version and the saved draft. */
  changedSections: EngineConfigSection[];
  /** True when any changed section is admin-only, so re-auth is required. */
  requiresReauth: boolean;
  /** True when the caller has a second factor, so a code is required too. */
  mfaRequired: boolean;
  /** False when there is no saved draft, or the draft matches the active one. */
  hasPublishableChanges: boolean;
}

/**
 * Compute the publish gate for a requester.
 *
 * The MFA lookup is a single indexed read of the caller's own row, and the
 * answer is returned only to that caller after their permission check.
 */
export async function buildPublishGate(
  state: EngineConfigState,
  requesterId: string | null,
): Promise<PublishGateView> {
  const changedSections = state.draft
    ? diffSections(state.active.payload, state.draft.payload)
    : [];

  const mfaRequired = requesterId
    ? await prisma.user
        .findUnique({
          where: { userid: requesterId },
          select: { mfaEnabled: true, mfaSecret: true },
        })
        // Mirrors the re-auth endpoint's own condition, so the UI's "code
        // required" label is true exactly when the endpoint will demand one.
        .then((u) => Boolean(u?.mfaEnabled && u.mfaSecret))
        .catch(() => false)
    : false;

  return {
    changedSections,
    requiresReauth: includesAdminOnlySection(changedSections),
    mfaRequired,
    hasPublishableChanges: changedSections.length > 0,
  };
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

/**
 * Serialize the state together with the caller's publish gate.
 *
 * The gate takes the requester rather than being derived from the state alone,
 * because one of its fields (whether a second factor is required) is a fact
 * about the caller, not about the configuration.
 */
export function serializeState(
  state: EngineConfigState,
  publishGate: PublishGateView,
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
    publishGate,
  };
}
