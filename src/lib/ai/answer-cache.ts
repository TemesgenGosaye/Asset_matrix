import { createHash } from "crypto";

/**
 * Process-local reasoning answer cache with single-flight request coalescing.
 *
 * Why this exists:
 * Repeated identical questions replay byte-identical answers without hitting
 * the model provider again. When users ask identical questions or refresh the
 * drawer, this cache serves them in ~1 ms instead of waiting for LLM completion.
 *
 * It also coalesces in-flight requests for the exact same prompt and parameters
 * so that concurrent callers wait on the same promise rather than duplicating work.
 */

export interface AnswerCacheKeyParts {
  organizationId: string;
  userId: string;
  provider: string;
  model: string;
  screen?: string | null;
  toolsVersion?: string;
}

export interface CachedAnswer {
  text: string;
  tools: string[];
  sources?: any[];
  suggestions?: any[];
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    inputTokens?: number;
    outputTokens?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface CachedAnswerResult<T> {
  value: T;
  hit: boolean;
}

export interface AnswerCacheStats {
  entries: number;
  capacity: number;
  ttlMs: number;
}

interface CacheEntry {
  answer: CachedAnswer;
  expiresAt: number;
}

interface Flight {
  promise: Promise<unknown>;
}

export const ANSWER_CACHE_CAPACITY = 256;
export const ANSWER_CACHE_TTL_MS = 120_000; // 2 minutes

const store = new Map<string, CacheEntry>();
const inFlight = new Map<string, Flight>();

/** Sweep expired entries from the cache. */
function sweep(now: number = Date.now()): void {
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) {
      store.delete(key);
    }
  }
}

/**
 * Construct a stable cache key incorporating messages, tenant, user, provider,
 * model, screen context, and tools version.
 */
export function buildAnswerCacheKey(
  messages: readonly { role: string; content: string }[],
  parts: AnswerCacheKeyParts,
): string {
  const hash = createHash("sha256")
    .update(JSON.stringify(messages))
    .digest("hex");
  const screen = parts.screen ?? "";
  const toolsVersion = parts.toolsVersion ?? "v1";
  return `ans:${parts.organizationId}:${parts.userId}:${parts.provider}:${parts.model}:${screen}:${toolsVersion}:${hash}`;
}

/**
 * Retrieve an answer from the cache if present and unexpired.
 */
export function peekAnswer<T extends CachedAnswer = CachedAnswer>(
  key: string,
): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.answer as T;
}

/**
 * Store an answer in the cache. Discards empty or whitespace-only answers.
 */
export function putAnswer<T extends CachedAnswer = CachedAnswer>(
  key: string,
  answer: T,
  ttlMs: number = ANSWER_CACHE_TTL_MS,
): void {
  if (!answer || !answer.text || !answer.text.trim()) {
    return;
  }
  sweep();
  if (!store.has(key) && store.size >= ANSWER_CACHE_CAPACITY) {
    const oldestKey = store.keys().next().value;
    if (oldestKey) {
      store.delete(oldestKey);
    }
  }
  store.set(key, {
    answer,
    expiresAt: Date.now() + ttlMs,
  });
}

/**
 * Read-through cache with single-flight request coalescing.
 */
export async function cachedAnswer<T extends CachedAnswer>(
  key: string,
  produce: () => Promise<T>,
  ttlMs: number = ANSWER_CACHE_TTL_MS,
): Promise<CachedAnswerResult<T>> {
  const existing = peekAnswer<T>(key);
  if (existing) {
    return { value: existing, hit: true };
  }

  const pending = inFlight.get(key);
  if (pending) {
    return { value: (await pending.promise) as T, hit: true };
  }

  const flightPromise = produce()
    .then((value) => {
      putAnswer(key, value, ttlMs);
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, { promise: flightPromise });

  const value = await flightPromise;
  return { value, hit: false };
}

/**
 * Invalidate cached answers across the system or scoped to a specific organization.
 */
export function invalidateAnswerCache(organizationId?: string): void {
  if (!organizationId) {
    store.clear();
    inFlight.clear();
    return;
  }
  const prefix = `ans:${organizationId}:`;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
  for (const key of inFlight.keys()) {
    if (key.startsWith(prefix)) {
      inFlight.delete(key);
    }
  }
}

/**
 * Reset answer cache state. Test-only helper.
 */
export function resetAnswerCacheForTests(): void {
  store.clear();
  inFlight.clear();
}

/**
 * Report answer cache metrics for the assistant status endpoint.
 */
export function getAnswerCacheStats(): AnswerCacheStats {
  sweep();
  return {
    entries: store.size,
    capacity: ANSWER_CACHE_CAPACITY,
    ttlMs: ANSWER_CACHE_TTL_MS,
  };
}
