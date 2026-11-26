/**
 * master-options-cache.ts
 *
 * Module-level in-memory cache for master-list dropdowns.
 * - Fetches are keyed by `type|departmentId|query`.
 * - Each entry stores the promise (so concurrent callers share one in-flight request)
 *   and the resolved data with a timestamp for stale-while-revalidate.
 * - `prefetchMasterOptions()` fires parallel fetches for all static lists so
 *   dropdowns open instantly when the form mounts.
 */

export interface MasterOption {
  id: string;
  name: string;
  code?: string | null;
  color?: string | null;
  usageCount: number;
  departmentUsageCount?: number;
  isLegacy?: boolean;
  isCurrent?: boolean;
}

export type MasterOptionType =
  | "location1"
  | "location2"
  | "location"
  | "category"
  | "department"
  | "status"
  | "assetName"
  | "employee";

interface CacheEntry {
  promise: Promise<MasterOption[]>;
  data?: MasterOption[];
  error?: string;
  fetchedAt?: number;
}

/** How long (ms) a cache entry is considered fresh — revalidate silently after this. */
const STALE_MS = 5 * 60 * 1000; // 5 minutes

const cache = new Map<string, CacheEntry>();

function cacheKey(
  type: MasterOptionType,
  departmentId: string | null,
  query: string,
  currentId?: string,
  currentValue?: string,
): string {
  return `${type}|${departmentId ?? ""}|${query}|${currentId ?? ""}|${currentValue ?? ""}`;
}

async function doFetch(
  type: MasterOptionType,
  departmentId: string | null,
  query: string,
  currentId?: string,
  currentValue?: string,
): Promise<MasterOption[]> {
  const params = new URLSearchParams({
    type,
    q: query,
    limit: type === "status" ? "50" : "5000",
  });
  if (departmentId) params.set("departmentId", departmentId);
  if (currentId) params.set("currentId", currentId);
  if (currentValue) params.set("currentValue", currentValue);

  const res = await fetch(`/api/master-options?${params.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as Record<string, string>).error || "Failed to load options",
    );
  }
  const data = await res.json();
  return (data.items || []) as MasterOption[];
}

/**
 * Fetch options for a given type, using the cache.
 * - If a fresh entry exists, returns it immediately.
 * - If a stale entry exists, returns it immediately AND triggers a background revalidate.
 * - If no entry exists, fetches and caches.
 */
export async function fetchMasterOptions(
  type: MasterOptionType,
  departmentId: string | null = null,
  query = "",
  currentId?: string,
  currentValue?: string,
): Promise<MasterOption[]> {
  const key = cacheKey(type, departmentId, query, currentId, currentValue);
  const existing = cache.get(key);

  const now = Date.now();

  if (existing) {
    // Fresh or stale-but-resolved: return resolved data, revalidate if stale
    if (existing.data !== undefined) {
      if (existing.fetchedAt && now - existing.fetchedAt > STALE_MS) {
        // Silently revalidate
        revalidate(key, type, departmentId, query, currentId, currentValue);
      }
      return existing.data;
    }
    // In-flight — await same promise
    return existing.promise;
  }

  // No cache entry yet — start fetch
  const promise = doFetch(type, departmentId, query, currentId, currentValue);
  const entry: CacheEntry = { promise };
  cache.set(key, entry);

  try {
    const data = await promise;
    entry.data = data;
    entry.fetchedAt = Date.now();
  } catch (err) {
    entry.error = err instanceof Error ? err.message : "Error loading options";
    // Remove failed entry so next call retries
    cache.delete(key);
    throw err;
  }

  return entry.data!;
}

function revalidate(
  key: string,
  type: MasterOptionType,
  departmentId: string | null,
  query: string,
  currentId?: string,
  currentValue?: string,
) {
  const promise = doFetch(type, departmentId, query, currentId, currentValue);
  const entry: CacheEntry = { promise };
  cache.set(key, entry);
  promise
    .then((data) => {
      entry.data = data;
      entry.fetchedAt = Date.now();
    })
    .catch(() => {
      // Keep old entry on revalidation failure — don't delete
      const old = cache.get(key);
      if (old === entry) cache.delete(key);
    });
}

/**
 * Invalidate a cache key so the next fetch goes to the network.
 * Call after creating a new master-list entry.
 */
export function invalidateMasterOptions(
  type: MasterOptionType,
  departmentId: string | null = null,
) {
  for (const key of cache.keys()) {
    if (key.startsWith(`${type}|${departmentId ?? ""}|`)) {
      cache.delete(key);
    }
  }
}

/**
 * Prefetch all static master lists in parallel.
 * Call this when the form mounts (or on page load) so dropdowns open instantly.
 */
export function prefetchMasterOptions(departmentId?: string | null) {
  const staticTypes: MasterOptionType[] = [
    "assetName",
    "department",
    "category",
    "status",
    "location1",
    "location2",
  ];

  for (const type of staticTypes) {
    fetchMasterOptions(type, null, "").catch(() => {
      /* silent */
    });

    // Also prefetch department-scoped variants if we know the department
    if (departmentId && (type === "location1" || type === "location2")) {
      fetchMasterOptions(type, departmentId, "").catch(() => {
        /* silent */
      });
    }
  }
}
