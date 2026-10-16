/**
 * PostgreSQL-backed caching layer with TTL expiration.
 *
 * Uses an UNLOGGED table ("cache") for fast key-value storage with automatic
 * expiry. This replaces the previous in-memory Map, which was ineffective in
 * serverless environments (Vercel) where each invocation gets its own memory.
 *
 * Public API:
 *  - `cache.get(key)`                      — retrieve a cached value
 *  - `cache.set(key, value, ttlSeconds)`   — store a value with TTL
 *  - `cache.del(key)`                      — delete a single key
 *  - `cache.invalidatePattern(prefix)`     — delete all keys matching a prefix
 *  - `cache.clear()`                       — remove all cached entries
 *  - `cached(key, fetcher, ttlMs)`         — fetch-through helper (backward compatible)
 *  - `invalidateCache(key)`                — delete a single key (alias)
 *  - `invalidateCacheByPrefix(prefix)`     — delete keys by prefix (alias)
 *  - `clearCache()`                        — remove all cached entries
 */

import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { invalidateAnswerCache } from "@/lib/ai/answer-cache";
import { invalidateAssistantCache } from "@/lib/ai/cache";

// ---------------------------------------------------------------------------
// Schema-qualified table name — ensures raw queries work regardless of
// the connection's search_path setting.
// ---------------------------------------------------------------------------
const S = process.env.DB_SCHEMA || "assettool";
if (!/^[a-zA-Z0-9_]+$/.test(S)) {
  throw new Error(
    `Invalid DB_SCHEMA: "${S}". Only alphanumeric and underscores allowed.`,
  );
}
const CACHE_TABLE = `"${S}"."cache"`;

/** Row shape returned by SELECT on the cache table. */
interface CacheRow {
  value: unknown;
  expires_at?: Date;
}

// ---------------------------------------------------------------------------
// Self-healing: ensure cache table exists on first use.
// Uses a shared promise so parallel calls on cold start only run once.
// ---------------------------------------------------------------------------
let tableChecked = false;
let _ensurePromise: Promise<void> | null = null;

async function ensureCacheTable(): Promise<void> {
  if (tableChecked) return;
  if (_ensurePromise) return _ensurePromise;

  _ensurePromise = (async () => {
    try {
      await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${S}"`);
      await prisma.$executeRawUnsafe(`
        CREATE UNLOGGED TABLE IF NOT EXISTS ${CACHE_TABLE} (
          "key" VARCHAR(255) PRIMARY KEY,
          "value" JSONB NOT NULL,
          "expires_at" TIMESTAMPTZ NOT NULL
        )
      `);
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS idx_cache_expires ON ${CACHE_TABLE} ("expires_at")`,
      );
      tableChecked = true;
    } catch (e) {
      logger.error("[cache] ensureCacheTable failed", { error: e });
    } finally {
      _ensurePromise = null;
    }
  })();

  return _ensurePromise;
}

// ---------------------------------------------------------------------------
// In-memory L1 cache (fast path for persistent/hosted servers).
//
// The app runs as a long-lived Node server, so an in-process map is the
// fastest L1 for page-to-page / sidebar-to-sidebar navigation. The PostgreSQL
// cache remains as the L2 persistence layer for compatibility with multi-node
// / serverless deployments. Reads prefer memory and only fall through to PG on
// a miss; writes go to both layers.
// ---------------------------------------------------------------------------

interface MemoryEntry {
  value: unknown;
  expiresAt: number; // epoch ms
}

// Bounded LRU-ish map: cap total entries and evict oldest on overflow.
const MEMORY = new Map<string, MemoryEntry>();
const MEMORY_MAX = 5000;

function memoryGet(key: string): unknown | undefined {
  const entry = MEMORY.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    MEMORY.delete(key);
    return undefined;
  }
  return entry.value;
}

function memorySet(key: string, value: unknown, ttlMs: number): void {
  // Prevent unbounded growth: evict least-recently-used when at capacity.
  if (MEMORY.size >= MEMORY_MAX) {
    const oldest = MEMORY.keys().next();
    if (!oldest.done) MEMORY.delete(oldest.value);
  }
  MEMORY.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function memoryDel(key: string): void {
  MEMORY.delete(key);
}

function memoryClearPrefix(prefix: string): void {
  for (const key of MEMORY.keys()) {
    if (key.startsWith(prefix)) MEMORY.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Public cache object
// ---------------------------------------------------------------------------

export const cache = {
  /**
   * Retrieve a cached value by key.
   * Returns null on cache miss or if the entry has expired.
   */
  async get<T>(key: string): Promise<T | null> {
    // L1 fast path: in-process, zero round-trips.
    const mem = memoryGet(key);
    if (mem !== undefined) return mem as T;

    try {
      await ensureCacheTable();
      const rows = await prisma.$queryRawUnsafe<CacheRow[]>(
        `SELECT "value", "expires_at" FROM ${CACHE_TABLE} WHERE "key" = $1 AND "expires_at" > NOW()`,
        key,
      );
      if (rows.length === 0) return null;
      const value = rows[0].value as T;
      // Backfill L1 with the remaining PG TTL so subsequent calls are instant.
      const residualMs = rows[0].expires_at
        ? rows[0].expires_at.getTime() - Date.now()
        : 0;
      memorySet(key, value, Math.max(0, residualMs));
      return value;
    } catch (error) {
      logger.error("[cache] get failed", { error });
      return null;
    }
  },

  /**
   * Store a value with a TTL in seconds (default 300 = 5 minutes).
   * Uses an upsert so existing keys are updated atomically.
   */
  async set<T>(key: string, value: T, ttlSeconds: number = 300): Promise<void> {
    const ttlMs = Math.max(1, Math.round(ttlSeconds)) * 1000;
    memorySet(key, value, ttlMs);
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO ${CACHE_TABLE} ("key", "value", "expires_at")
         VALUES ($1, $2::jsonb, NOW() + make_interval(secs => $3))
         ON CONFLICT ("key")
         DO UPDATE SET "value" = $2::jsonb,
                       "expires_at" = NOW() + make_interval(secs => $3)`,
        key,
        JSON.stringify(value),
        ttlSeconds,
      );
    } catch (error) {
      logger.error("[cache] set failed", { error });
    }
  },

  /**
   * Delete a single cache entry by exact key.
   */
  async del(key: string): Promise<void> {
    memoryDel(key);
    try {
      await prisma.$executeRawUnsafe(
        `DELETE FROM ${CACHE_TABLE} WHERE "key" = $1`,
        key,
      );
    } catch (error) {
      logger.error("[cache] del failed", { error });
    }
  },

  /**
   * Delete all cache entries whose key starts with the given prefix.
   */
  async invalidatePattern(prefix: string): Promise<void> {
    memoryClearPrefix(prefix);
    try {
      await prisma.$executeRawUnsafe(
        `DELETE FROM ${CACHE_TABLE} WHERE "key" LIKE $1`,
        prefix + "%",
      );
    } catch (error) {
      logger.error("[cache] invalidatePattern failed", { error });
    }
  },

  /**
   * Remove all entries from the cache table and memory.
   */
  async clear(): Promise<void> {
    MEMORY.clear();
    try {
      await prisma.$executeRawUnsafe(`DELETE FROM ${CACHE_TABLE}`);
    } catch (error) {
      logger.error("[cache] clear failed", { error });
    }
  },
};

// ---------------------------------------------------------------------------
// Backward-compatible helpers (used by data.ts and API routes)
// ---------------------------------------------------------------------------

/**
 * Get or set cached data with TTL.
 * @param key    Cache key
 * @param fetcher Async function to fetch data on cache miss
 * @param ttlMs  Time to live in milliseconds (default 5 minutes)
 */
export async function cached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = 5 * 60 * 1000,
): Promise<T> {
  // Try the cache first; on PG failure we still fall through to fetcher.
  const existing = await cache.get<T>(key);
  if (existing !== null) {
    return existing;
  }

  const data = await fetcher();

  // Store in cache (fire-and-forget; errors are logged inside cache.set).
  const ttlSeconds = Math.max(1, Math.round(ttlMs / 1000));
  await cache.set(key, data, ttlSeconds);

  return data;
}

/**
 * Invalidate a specific cache key.
 */
export async function invalidateCache(key: string): Promise<void> {
  await cache.del(key);
  dropAssistantCaches();
}

/**
 * Invalidate all cache keys matching a prefix.
 */
export async function invalidateCacheByPrefix(prefix: string): Promise<void> {
  await cache.invalidatePattern(prefix);
  dropAssistantCaches();
}

/**
 * Clear entire cache.
 */
export async function clearCache(): Promise<void> {
  await cache.clear();
  dropAssistantCaches();
}

/**
 * Drop the assistant's own read caches.
 *
 * The assistant keeps two in-memory layers that are invisible to `@/lib/cache`:
 * the aggregate layer the fast lane reads (`invalidateAssistantCache`) and the
 * finished-answer layer the reasoning lane replays (`invalidateAnswerCache`).
 * Both are TTL-bounded, but a TTL is a fallback, not a correctness mechanism —
 * "how many assets do we have" answered from a snapshot taken before the write
 * is simply wrong.
 *
 * Every write path in the app already calls one of the three functions above, so
 * this is the single place to hook rather than a call to add to hundreds of
 * routes. Both modules are dependency-free in-memory stores, so importing them
 * here costs nothing and introduces no cycle.
 */
function dropAssistantCaches(): void {
  try {
    invalidateAssistantCache();
    invalidateAnswerCache();
  } catch {
    // Cache teardown must never fail a write that already succeeded.
  }
}

/**
 * Cache invalidation guide for API routes:
 *
 * When an API route modifies reference data (create, update, or delete),
 * call invalidateCache() with the appropriate key after the successful
 * database operation.
 *
 * Cache keys used by reference data functions in src/lib/data.ts:
 *   - "status_types"   -> invalidate after modifying statusType records
 *   - "categories"     -> invalidate after modifying assetCategoryType records
 *   - "manufacturers"  -> invalidate after modifying manufacturer records
 *   - "models"         -> invalidate after modifying model records
 *   - "locations"      -> invalidate after modifying location records
 *   - "suppliers"      -> invalidate after modifying supplier records
 *   - "users"          -> invalidate after modifying user records
 *
 * Example usage in an API route:
 *
 *   import { invalidateCache } from "@/lib/cache";
 *
 *   // After a successful create/update/delete:
 *   await prisma.statusType.create({ data: { ... } });
 *   await invalidateCache("status_types");
 */
