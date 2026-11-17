/**
 * Server-side navigation preference resolution.
 *
 * Everything here is read/write against `navigation_preferences` plus the
 * organisation-wide default held in `Organization.settings.navigationHiddenKeys`.
 * The pure visibility logic lives in `./registry`; this module only decides
 * which of the three sources is authoritative and produces the effective set
 * the chrome renders.
 *
 * Resolution order: user preference → organisation default → registry default.
 */

import prisma from "@/lib/prisma";
import { getAllNavKeys, getLockedNavKeys, resolveHiddenKeys } from "./registry";

export interface NavigationState {
  /** Effective hidden keys applied to the sidebar for this user. */
  hiddenKeys: string[];
  /** The caller's own stored keys, or null when they have never saved. */
  userHiddenKeys: string[] | null;
  /** The organisation-wide default, if one has been set. */
  orgHiddenKeys: string[];
}

const EMPTY_STATE: NavigationState = {
  hiddenKeys: [],
  userHiddenKeys: null,
  orgHiddenKeys: [],
};

const ORG_SETTINGS_KEY = "navigationHiddenKeys";

/**
 * Keep only keys the registry still knows and that are not locked.
 *
 * Stored data outlives the code: a menu can be removed or renamed in a later
 * release, and an old row would otherwise carry a key nothing renders. Filtering
 * on read makes stale keys harmless without a migration, and dropping locked
 * keys means a hand-edited row can never hide Settings.
 */
export function sanitizeHiddenKeys(keys: readonly unknown[]): string[] {
  const known = new Set(getAllNavKeys());
  const locked = getLockedNavKeys();
  const out = new Set<string>();
  for (const key of keys) {
    if (typeof key === "string" && known.has(key) && !locked.has(key)) {
      out.add(key);
    }
  }
  return Array.from(out);
}

/** Keys in the payload that the registry does not know. */
export function findUnknownKeys(keys: readonly string[]): string[] {
  const known = new Set(getAllNavKeys());
  return keys.filter((key) => !known.has(key));
}

/** Keys in the payload that are locked and therefore cannot be hidden. */
export function findLockedKeys(keys: readonly string[]): string[] {
  const locked = getLockedNavKeys();
  return keys.filter((key) => locked.has(key));
}

/**
 * Read the org default, distinguishing "not configured" (null) from
 * "configured as empty" (`[]`). The difference is load-bearing: only a null
 * default lets the registry default show through.
 */
function readOrgHiddenKeys(settings: unknown): string[] | null {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return null;
  }
  const value = (settings as Record<string, unknown>)[ORG_SETTINGS_KEY];
  if (!Array.isArray(value)) return null;
  return sanitizeHiddenKeys(value);
}

/** The caller's stored hidden keys, or null when they have never saved. */
export async function getUserHiddenKeys(
  userId: string,
): Promise<string[] | null> {
  const row = await prisma.navigationPreference.findUnique({
    where: { userId },
    select: { hiddenKeys: true },
  });
  if (!row) return null;
  return sanitizeHiddenKeys(row.hiddenKeys);
}

/**
 * The organisation-wide default hidden keys.
 *
 * Returns null when no default is configured (so the registry default applies),
 * or an array — possibly empty — when the org has explicitly set one.
 */
export async function getOrgHiddenKeys(
  organizationId: string | null | undefined,
): Promise<string[] | null> {
  if (!organizationId) return null;
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  return readOrgHiddenKeys(org?.settings);
}

/** Merge a new organisation default into `Organization.settings`. */
export async function setOrgHiddenKeys(
  organizationId: string,
  keys: readonly string[],
): Promise<string[]> {
  const clean = sanitizeHiddenKeys(keys);
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });

  const current =
    org?.settings &&
    typeof org.settings === "object" &&
    !Array.isArray(org.settings)
      ? (org.settings as Record<string, unknown>)
      : {};

  await prisma.organization.update({
    where: { id: organizationId },
    data: { settings: { ...current, [ORG_SETTINGS_KEY]: clean } },
  });

  return clean;
}

/** Upsert the caller's own hidden keys and return the sanitized result. */
export async function setUserHiddenKeys(
  userId: string,
  organizationId: string | null,
  keys: readonly string[],
): Promise<string[]> {
  const clean = sanitizeHiddenKeys(keys);
  await prisma.navigationPreference.upsert({
    where: { userId },
    create: {
      userId,
      organizationId,
      hiddenKeys: clean,
      updatedAt: new Date(),
    },
    update: {
      organizationId,
      hiddenKeys: clean,
      updatedAt: new Date(),
    },
  });
  return clean;
}

/**
 * Resolve the full navigation state for one user.
 *
 * Returns the effective hidden keys already resolved through the precedence
 * chain, plus the two raw sources so the settings UI can tell what is inherited
 * and what the user has overridden.
 */
export async function getNavigationState(input: {
  userId?: string | null;
  organizationId?: string | null;
}): Promise<NavigationState> {
  if (!input.userId) return EMPTY_STATE;

  const [userHiddenKeys, orgHiddenKeys] = await Promise.all([
    getUserHiddenKeys(input.userId),
    getOrgHiddenKeys(input.organizationId),
  ]);

  return {
    hiddenKeys: Array.from(
      resolveHiddenKeys({
        userHidden: userHiddenKeys,
        orgHidden: orgHiddenKeys,
      }),
    ),
    userHiddenKeys,
    orgHiddenKeys: orgHiddenKeys ?? [],
  };
}
