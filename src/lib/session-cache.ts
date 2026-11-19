import { Preferences } from "@capacitor/preferences";

export const SESSION_CACHE_KEY = "homedesk_session_cache";

export interface CachedSession {
  authenticated: boolean;
  userId?: string;
  route?: string;
  cachedAt: number;
}

export async function readCachedSession(): Promise<CachedSession | null> {
  try {
    const { value } = await Preferences.get({ key: SESSION_CACHE_KEY });
    if (!value) return null;
    const parsed = JSON.parse(value) as CachedSession;
    if (typeof parsed.authenticated !== "boolean") return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeCachedSession(
  session: Omit<CachedSession, "cachedAt">,
): Promise<void> {
  try {
    await Preferences.set({
      key: SESSION_CACHE_KEY,
      value: JSON.stringify({ ...session, cachedAt: Date.now() }),
    });
  } catch {}
}

export async function clearCachedSession(): Promise<void> {
  try {
    await Preferences.remove({ key: SESSION_CACHE_KEY });
  } catch {}
}
