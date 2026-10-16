"use client";

import type { AssistantMeta, FastCard } from "./protocol";
import type { Suggestion } from "./suggestions";

/**
 * Client-side conversation memory.
 *
 * The assistant used to forget everything the moment the drawer closed, which
 * made it feel like a slot machine: the same setup cost on every question, and
 * no way to come back to an answer you were still thinking about. Persisting the
 * transcript in `localStorage` fixes both, and costs nothing on the server.
 *
 * What is deliberately *not* persisted:
 *  - The streaming state (`streaming`, `pending`) — a restored turn that claims
 *    to be mid-answer is worse than a restored turn that is simply finished.
 *  - Anything identifying beyond the transcript itself. This is a support tool
 *    for records the user can already see; it is not an analytics store.
 *
 * The store is namespaced per browser profile so a shared machine does not leak
 * one person's questions to the next sign-in, and a schema version means an
 * older cached shape is discarded rather than crashing the drawer.
 */

const KEY_PREFIX = "meri:conversation";
const LOCALE_KEY = "meri:locale";
const SCHEMA_VERSION = 2;

/** Turns older than this are pruned — an unbounded transcript is its own bug. */
const MAX_PERSISTED_TURNS = 40;

export interface PersistedTurn {
  id: string;
  role: "user" | "assistant";
  question?: string;
  /** Id of the user turn this answers, so a retry can replace both. */
  questionId?: string;
  text?: string;
  card?: FastCard;
  meta?: AssistantMeta;
  tools?: string[];
  sources?: { label: string; href: string }[];
  suggestions?: Suggestion[];
  error?: string;
  done?: boolean;
  /** Total ms, kept so a restored answer still shows its cost honestly. */
  ms?: number;
  usage?: { inputTokens?: number; outputTokens?: number };
  provider?: { id: string; model: string; kind: "cloud" | "local" };
}

interface StoredConversation {
  v: number;
  turns: PersistedTurn[];
  savedAt: number;
}

function storageKey(userId: string): string {
  return `${KEY_PREFIX}:${userId}`;
}

/**
 * `localStorage` is unavailable in SSR, in private-mode Safari, and whenever a
 * quota is exhausted. Every access goes through here so a missing or throwing
 * store degrades to "no memory" rather than a blank screen.
 */
function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const store = window.localStorage;
    const probe = `${KEY_PREFIX}:probe`;
    store.setItem(probe, "1");
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}

export function loadConversation(userId: string): PersistedTurn[] {
  const store = safeStorage();
  if (!store || !userId) return [];
  try {
    const raw = store.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredConversation;
    if (parsed?.v !== SCHEMA_VERSION || !Array.isArray(parsed.turns)) return [];
    return parsed.turns.filter((t) => t && typeof t.id === "string");
  } catch {
    return [];
  }
}

export function saveConversation(userId: string, turns: PersistedTurn[]): void {
  const store = safeStorage();
  if (!store || !userId) return;
  try {
    // Only completed turns are worth keeping. A turn that errored mid-flight is
    // noise on the next visit, and an unfinished one would restore as a
    // permanent thinking indicator.
    const keepable = turns
      .filter((t) => t.role === "user" || Boolean(t.text?.trim() || t.card))
      .slice(-MAX_PERSISTED_TURNS);
    if (keepable.length === 0) {
      store.removeItem(storageKey(userId));
      return;
    }
    const payload: StoredConversation = {
      v: SCHEMA_VERSION,
      turns: keepable,
      savedAt: Date.now(),
    };
    store.setItem(storageKey(userId), JSON.stringify(payload));
  } catch {
    // Quota exceeded. Drop the oldest turns and try once more; if that still
    // fails, give up quietly rather than interrupting the user.
    try {
      const trimmed = turns.slice(-8);
      store.setItem(
        storageKey(userId),
        JSON.stringify({ v: SCHEMA_VERSION, turns: trimmed, savedAt: Date.now() }),
      );
    } catch {
      /* no memory available */
    }
  }
}

export function clearConversation(userId: string): void {
  const store = safeStorage();
  if (!store || !userId) return;
  try {
    store.removeItem(storageKey(userId));
  } catch {
    /* nothing to clear */
  }
}

/** The UI language toggle is a preference, so it survives the drawer closing. */
export function loadLocale(): "en" | "am" {
  const store = safeStorage();
  if (!store) return "en";
  try {
    return store.getItem(LOCALE_KEY) === "am" ? "am" : "en";
  } catch {
    return "en";
  }
}

export function saveLocale(locale: "en" | "am"): void {
  const store = safeStorage();
  if (!store) return;
  try {
    store.setItem(LOCALE_KEY, locale);
  } catch {
    /* preference is best-effort */
  }
}
