"use client";

/**
 * Live navigation-visibility state for the whole chrome.
 *
 * The sidebar, the mobile sheet and the Navigation Settings page all read from
 * this one store, which is what makes the settings page a LIVE PREVIEW: toggling
 * a switch updates `working` immediately, so the real sidebar changes before the
 * user saves. Saving persists `working`; discarding snaps it back to the last
 * saved value.
 *
 * The provider is seeded on the server (see `app/layout.tsx`) so the first paint
 * already reflects the saved preference — there is no window in which hidden
 * items flash on screen.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { notify } from "@/lib/feedback/notify";
import {
  getAllNavKeys,
  getLockedNavKeys,
  getRegistryDefaultHiddenKeys,
} from "@/lib/navigation/registry";

export interface NavigationPreferencesValue {
  /** Effective hidden keys — drives the sidebar. */
  hiddenKeys: ReadonlySet<string>;
  /** Sorted array form of `hiddenKeys`, for memo-friendly comparisons. */
  hiddenKeyList: string[];
  /** The last saved set; what "Discard" restores. */
  savedHiddenKeys: string[];
  /** The organisation-wide default currently in effect (admin context). */
  orgHiddenKeys: string[];
  /** `working` differs from the last saved set. */
  isDirty: boolean;
  saving: boolean;
  /** Replace the working set without saving (live preview). */
  setHiddenKeys: (keys: Iterable<string>) => void;
  /** Set one key's visibility in the working set. */
  toggleKey: (key: string, hidden: boolean) => void;
  /** Persist the working set. Resolves true on success. */
  save: () => Promise<boolean>;
  /** Revert the working set to the last saved set. */
  discard: () => void;
  /** Set the working set to the registry default (does not save). */
  resetToDefaults: () => void;
  /** Re-read the saved state from the server. */
  refresh: () => Promise<void>;
  /** Persist the working set as the org-wide default (admin only). */
  saveAsOrgDefault: () => Promise<boolean>;
  /** Clear the org-wide default (admin only). */
  clearOrgDefault: () => Promise<boolean>;
}

const NOOP = () => {};

const DEFAULT_VALUE: NavigationPreferencesValue = {
  hiddenKeys: new Set<string>(),
  hiddenKeyList: [],
  savedHiddenKeys: [],
  orgHiddenKeys: [],
  isDirty: false,
  saving: false,
  setHiddenKeys: NOOP,
  toggleKey: NOOP,
  save: async () => false,
  discard: NOOP,
  resetToDefaults: NOOP,
  refresh: async () => {},
  saveAsOrgDefault: async () => false,
  clearOrgDefault: async () => false,
};

const NavigationPreferencesContext =
  createContext<NavigationPreferencesValue | null>(null);

/** Only registry keys, never locked, de-duplicated, stably ordered. */
function normalize(keys: Iterable<string>): string[] {
  const known = new Set(getAllNavKeys());
  const locked = getLockedNavKeys();
  const set = new Set<string>();
  for (const key of keys) {
    if (known.has(key) && !locked.has(key)) set.add(key);
  }
  return Array.from(set).sort();
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const seen = new Set(b);
  return a.every((key) => seen.has(key));
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

interface NavigationPreferencesProviderProps {
  children: React.ReactNode;
  /** Server-resolved effective hidden keys (see `app/layout.tsx`). */
  initialHiddenKeys: string[];
  /** Server-resolved org default, for the admin card. */
  initialOrgHiddenKeys?: string[];
}

export function NavigationPreferencesProvider({
  children,
  initialHiddenKeys,
  initialOrgHiddenKeys = [],
}: NavigationPreferencesProviderProps) {
  const [baseline, setBaseline] = useState<string[]>(() =>
    normalize(initialHiddenKeys),
  );
  const [working, setWorking] = useState<string[]>(() =>
    normalize(initialHiddenKeys),
  );
  const [orgHiddenKeys, setOrgHiddenKeys] = useState<string[]>(() =>
    normalize(initialOrgHiddenKeys),
  );
  const [saving, setSaving] = useState(false);

  const setHiddenKeys = useCallback((keys: Iterable<string>) => {
    setWorking(normalize(keys));
  }, []);

  const toggleKey = useCallback((key: string, hidden: boolean) => {
    setWorking((prev) => {
      const next = new Set(prev);
      if (hidden) next.add(key);
      else next.delete(key);
      return normalize(next);
    });
  }, []);

  const applyServerState = useCallback((body: unknown) => {
    const state = (body ?? {}) as {
      hiddenKeys?: unknown;
      orgHiddenKeys?: unknown;
    };
    if (Array.isArray(state.hiddenKeys)) {
      const next = normalize(state.hiddenKeys as string[]);
      setBaseline(next);
      setWorking(next);
    }
    if (Array.isArray(state.orgHiddenKeys)) {
      setOrgHiddenKeys(normalize(state.orgHiddenKeys as string[]));
    }
  }, []);

  const save = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    try {
      const res = await fetch("/api/navigation/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hiddenKeys: working }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (body as { error?: string } | null)?.error ??
            "Failed to save navigation settings",
        );
      }
      applyServerState(body);
      notify.success("Navigation settings saved");
      return true;
    } catch (error) {
      notify.error({
        title: "Couldn't save navigation settings",
        description: messageOf(error, "Something went wrong."),
      });
      return false;
    } finally {
      setSaving(false);
    }
  }, [applyServerState, working]);

  const discard = useCallback(() => {
    setWorking(baseline);
  }, [baseline]);

  const resetToDefaults = useCallback(() => {
    setWorking(normalize(getRegistryDefaultHiddenKeys()));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/navigation/preferences");
      if (!res.ok) return;
      applyServerState(await res.json());
    } catch {
      // Keep the current state; a failed refresh is not worth a toast.
    }
  }, [applyServerState]);

  const saveAsOrgDefault = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    try {
      const res = await fetch("/api/navigation/organization", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hiddenKeys: working }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (body as { error?: string } | null)?.error ??
            "Failed to save the organization default",
        );
      }
      setOrgHiddenKeys(
        normalize((body as { hiddenKeys?: string[] }).hiddenKeys ?? working),
      );
      notify.success("Saved as the organization default");
      return true;
    } catch (error) {
      notify.error({
        title: "Couldn't save the organization default",
        description: messageOf(error, "Something went wrong."),
      });
      return false;
    } finally {
      setSaving(false);
    }
  }, [working]);

  const clearOrgDefault = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    try {
      const res = await fetch("/api/navigation/organization", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hiddenKeys: [] }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          (body as { error?: string } | null)?.error ??
            "Failed to clear the organization default",
        );
      }
      setOrgHiddenKeys([]);
      notify.success("Organization default cleared");
      return true;
    } catch (error) {
      notify.error({
        title: "Couldn't clear the organization default",
        description: messageOf(error, "Something went wrong."),
      });
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  const value = useMemo<NavigationPreferencesValue>(
    () => ({
      hiddenKeys: new Set(working),
      hiddenKeyList: working,
      savedHiddenKeys: baseline,
      orgHiddenKeys,
      isDirty: !sameSet(baseline, working),
      saving,
      setHiddenKeys,
      toggleKey,
      save,
      discard,
      resetToDefaults,
      refresh,
      saveAsOrgDefault,
      clearOrgDefault,
    }),
    [
      working,
      baseline,
      orgHiddenKeys,
      saving,
      setHiddenKeys,
      toggleKey,
      save,
      discard,
      resetToDefaults,
      refresh,
      saveAsOrgDefault,
      clearOrgDefault,
    ],
  );

  return (
    <NavigationPreferencesContext.Provider value={value}>
      {children}
    </NavigationPreferencesContext.Provider>
  );
}

/**
 * Read the navigation preference store.
 *
 * Returns a safe default outside a provider rather than throwing: the chrome is
 * rendered in isolation by tests and previews, and a missing provider there must
 * degrade to "nothing hidden", not crash the shell.
 */
export function useNavigationPreferences(): NavigationPreferencesValue {
  return useContext(NavigationPreferencesContext) ?? DEFAULT_VALUE;
}
