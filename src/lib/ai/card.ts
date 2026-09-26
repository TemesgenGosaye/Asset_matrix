/**
 * Structured answer shapes for the fast lane.
 *
 * A fast-lane hit never touches an LLM. It returns one of these payloads and
 * the client renders it directly, which is why a question like "how many active
 * houses exist" resolves in a single Postgres aggregate instead of two model
 * round-trips plus a full MCDA recomputation.
 */

export type CardTone = "neutral" | "positive" | "caution" | "critical";

export interface CardStat {
  label: string;
  value: string | number;
  /** Optional secondary line rendered under the value. */
  hint?: string;
  tone?: CardTone;
}

export interface CardTable {
  columns: string[];
  rows: (string | number | null)[][];
  /** Optional per-row emphasis (index-aligned with `rows`). */
  rowTones?: CardTone[];
}

export interface CardAction {
  label: string;
  href: string;
}

export interface FastCard {
  /** Machine-readable intent id, e.g. `housing.activeHouses`. */
  intent: string;
  title: string;
  /** Optional one-line lead above the stats. */
  summary?: string;
  /** Up to 3 hero numbers. */
  stats: CardStat[];
  table?: CardTable;
  /** Deep links into the portal that back this answer. */
  actions?: CardAction[];
  /** Closing caveat, e.g. what the number does *not* include. */
  footnote?: string;
}

export type FastCardResult =
  | { kind: "card"; card: FastCard }
  | { kind: "unsupported" };

export interface AssistantMeta {
  /** Which lane answered. */
  lane: "fast" | "reasoning";
  /** Intent id for fast lane, `llm` for reasoning. */
  intent: string;
  /** Server-side milliseconds spent producing the answer. */
  ms: number;
  /** Whether a cached aggregate served the request. */
  cached: boolean;
}
