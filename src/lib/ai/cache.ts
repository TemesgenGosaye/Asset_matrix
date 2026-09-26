/**
 * Process-local TTL cache with single-flight request coalescing.
 *
 * Why this exists: the House Queue decision engine recomputes the whole MCDA
 * ranking over every active employee on each call. When several users (or the
 * same user asking several questions in a row) hit the dashboard, the assistant
 * was paying that cost repeatedly. This cache serves the second caller
 * immediately and, while a computation is in flight, parks extra callers on the
 * same promise instead of launching duplicate work.
 *
 * Deliberately process-local rather than Redis-backed: the portal is a
 * single-tenant-per-deployment Node process (Next.js standalone), the cached
 * values are read-only aggregates, and a short TTL keeps staleness bounded even
 * when a write lands on a different instance. `invalidateAssistantCache()` is
 * wired into the House Queue decision paths so same-process writes drop the
 * entries immediately.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface Flight {
  promise: Promise<unknown>;
}

const store = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Flight>();

let hitCount = 0;
let missCount = 0;

/** Sweep expired entries so a long-lived process cannot grow unbounded. */
function sweep(now: number): void {
  if (store.size < 256) return;
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
}

/**
 * Read a cached value without triggering a computation.
 * Returns `undefined` on miss or expiry.
 */
export function peekCache<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

/**
 * Read-through cache access with single-flight coalescing.
 *
 * @param key    Cache key. Namespace it, e.g. `meri:housing:overview:<org>`.
 * @param ttlMs  Freshness window in milliseconds.
 * @param load   Producer. Only invoked on miss, and only once per key.
 */
export interface CacheRead<T> {
  value: T;
  /** True when a stored entry served the read; false when `load` ran. */
  hit: boolean;
}

/**
 * Read-through cache access with single-flight coalescing.
 *
 * @param key    Cache key. Namespace it, e.g. `meri:org:<id>:housing:overview`.
 * @param ttlMs  Freshness window in milliseconds.
 * @param load   Producer. Only invoked on miss, and only once per key.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> {
  return (await cachedDetailed(key, ttlMs, load)).value;
}

/**
 * As {@link cached}, but also reports whether the stored entry served the read.
 *
 * The assistant surfaces this in its `meta` frame so the user can see *why* an
 * answer was instant. Guessing from elapsed time would label a genuinely cheap
 * uncached query as a cache hit, which is exactly the kind of quiet inaccuracy
 * that erodes trust in a support tool.
 */
export async function cachedDetailed<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<CacheRead<T>> {
  const now = Date.now();
  sweep(now);

  const entry = store.get(key);
  if (entry && entry.expiresAt > now) {
    hitCount += 1;
    return { value: entry.value as T, hit: true };
  }

  const pending = inFlight.get(key);
  if (pending) {
    // A coalesced reader is served by work already in flight, which is
    // indistinguishable from a hit for latency purposes and worth reporting
    // as one.
    return { value: (await pending.promise) as T, hit: true };
  }

  missCount += 1;
  const promise = load()
    .then((value) => {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, { promise });
  return { value: await promise, hit: false };
}

/**
 * Drop cached entries so the next read recomputes.
 *
 * Prefer the domain-scoped overload from a write path: an allocation decision
 * changes housing and queue aggregates, and nothing else, so invalidating the
 * asset estate there would only make the assistant slower.
 *
 * @param organizationId Organization whose aggregates went stale. Omit only for
 *                       a full teardown (tests, deploy hooks).
 * @param domains        Subject areas the write can have changed. Omit to drop
 *                       every domain for that organization.
 */
export function invalidateAssistantCache(
  organizationId?: string,
  domains?: readonly CacheDomain[],
): void {
  // Full teardown.
  if (!organizationId) {
    store.clear();
    inFlight.clear();
    return;
  }

  const prefix = `${orgScope(organizationId)}`;
  const shouldDrop = (key: string) => {
    if (!key.startsWith(prefix)) return false; // another org — leave alone
    if (!domains || domains.length === 0) return true;
    const domain = key.split(":")[3];
    return !domain || domains.includes(domain as CacheDomain);
  };

  for (const key of store.keys()) {
    if (shouldDrop(key)) store.delete(key);
  }
  for (const key of inFlight.keys()) {
    if (shouldDrop(key)) inFlight.delete(key);
  }
}

/**
 * Cache key namespace for one organization.
 *
 * Keys are always `meri:org:<orgId>:<domain>:<detail>`, so an invalidation can
 * target one organization's one domain without disturbing the rest.
 */
export function orgScope(organizationId: string): string {
  return `meri:org:${organizationId}`;
}

/** The domain segment every assistant cache key carries, per subject area. */
export const CACHE_DOMAIN = {
  housing: "housing",
  queue: "queue",
  assets: "assets",
  tickets: "tickets",
  people: "people",
} as const;

export type CacheDomain = (typeof CACHE_DOMAIN)[keyof typeof CACHE_DOMAIN];

/** Build a fully-qualified cache key. */
export function cacheKey(
  organizationId: string,
  domain: CacheDomain,
  detail: string,
): string {
  return `${orgScope(organizationId)}:${domain}:${detail}`;
}

/**
 * Tear the whole cache down. Test-only — exported so suites can assert that
 * a fresh production module instance does not inherit stale aggregates.
 */
export function resetAssistantCacheForTests(): void {
  store.clear();
  inFlight.clear();
  hitCount = 0;
  missCount = 0;
}

/** Cache effectiveness counters, surfaced in the assistant's status line. */
export function getAssistantCacheStats(): {
  entries: number;
  hits: number;
  misses: number;
  hitRate: number;
} {
  const total = hitCount + missCount;
  return {
    entries: store.size,
    hits: hitCount,
    misses: missCount,
    hitRate: total === 0 ? 0 : Math.round((hitCount / total) * 100),
  };
}

/**
 * Freshness windows. Aggregates that move on every allocation decision are kept
 * deliberately short so the assistant never quotes a stale queue; the decision
 * service also invalidates on write, so these TTLs are a safety net rather than
 * the primary invalidation path.
 */
export const CACHE_TTL = {
  /** Housing/asset/ticket counters. */
  aggregates: 15_000,
  /** Full House Queue engine output (MCDA over all employees). */
  queue: 20_000,
  /** Per-record lookups (one house, one employee). */
  lookup: 30_000,
} as const;
