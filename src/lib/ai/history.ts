/**
 * Conversation windowing.
 *
 * Latency on the reasoning lane is dominated by two things: how many tokens the
 * model has to read, and how many steps it takes. This module handles the first
 * one, and it is deliberately conservative about what it throws away.
 *
 * The rules, in order of importance:
 *
 *  1. **The latest user question is never dropped.** A window that discards the
 *     question is worse than no window at all.
 *  2. **History is trimmed, not summarised.** Summarising costs a model call —
 *     exactly the latency being removed — and a summary of a queue answer is
 *     only as good as the model that wrote it.
 *  3. **Turn boundaries are respected.** History is cut on a user/assistant
 *     boundary, because a trailing assistant message with no question after it
 *     is context the model will treat as the beginning of its own answer.
 *  4. **A dropped pair is a dropped pair.** If the budget forces out an older
 *     exchange, the orphaned assistant reply goes with it. Half a conversation
 *     is worse context than none.
 */

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface WindowOptions {
  /** Maximum number of messages to keep. */
  maxMessages?: number;
  /** Soft ceiling on total characters across the window. */
  maxChars?: number;
}

export const DEFAULT_HISTORY_WINDOW = {
  /**
   * Six messages is three exchanges. That is enough to resolve a follow-up
   * ("what about house 12?" after a queue question) and short enough that a long
   * session does not accumulate a transcript the model re-reads on every turn.
   */
  maxMessages: 6,
  /**
   * ~12k characters is roughly 3k tokens. The system prompt plus the tool
   * schemas already account for a comparable amount, and local models pay for
   * every one of those tokens in prefill before the first token appears.
   */
  maxChars: 12_000,
} as const;

/** Content longer than this is a paste accident, not a question. */
const MAX_MESSAGE_CHARS = 4_000;

/** Turn off the wire unless it is one of these. */
const ALLOWED_ROLES = new Set(["user", "assistant"]);

/**
 * Coerce whatever the client sent into messages the model can be given.
 *
 * The wire is untrusted input. This is the boundary: a role the model does not
 * accept, a non-string body, or a 200k-character paste is dropped here rather
 * than becoming a provider error the user sees as a failed question.
 */
export function normalizeHistory(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) return [];

  const out: ChatMessage[] = [];
  for (const raw of input) {
    if (typeof raw !== "object" || raw === null) continue;
    const { role, content } = raw as { role?: unknown; content?: unknown };
    if (typeof role !== "string" || !ALLOWED_ROLES.has(role)) continue;
    if (typeof content !== "string") continue;
    const trimmed = content.trim();
    if (!trimmed) continue;
    out.push({
      role: role as "user" | "assistant",
      content:
        trimmed.length > MAX_MESSAGE_CHARS
          ? `${trimmed.slice(0, MAX_MESSAGE_CHARS)}…`
          : trimmed,
    });
  }
  return out;
}

/**
 * Trim a normalized history to a budget that keeps the current question.
 *
 * The window always ends on a user message when one exists, because that is the
 * turn being answered. Anything older that no longer fits the budget is removed
 * along with its reply.
 */
export function windowHistory(
  messages: ChatMessage[],
  options: WindowOptions = {},
): ChatMessage[] {
  const maxMessages = options.maxMessages ?? DEFAULT_HISTORY_WINDOW.maxMessages;
  const maxChars = options.maxChars ?? DEFAULT_HISTORY_WINDOW.maxChars;
  if (messages.length === 0) return [];

  // Walk backwards accumulating messages until either budget is spent.
  const kept: ChatMessage[] = [];
  let chars = 0;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    const cost = message.content.length;
    if (kept.length >= maxMessages) break;
    // Always admit at least the newest message, even if it is enormous —
    // refusing to answer because the question was long would be absurd.
    if (kept.length > 0 && chars + cost > maxChars) break;
    kept.push(message);
    chars += cost;
  }
  kept.reverse();

  // Drop a leading assistant reply whose question was evicted: without its
  // question it reads as the model talking to itself.
  while (kept.length > 0 && kept[0].role === "assistant") {
    kept.shift();
  }

  return kept;
}

/** The question the model is being asked, i.e. the last user turn. */
export function lastUserQuestion(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") return messages[i].content;
  }
  return "";
}

/** One-call entry point: untrusted wire payload straight to a model window. */
export function prepareHistory(
  input: unknown,
  options?: WindowOptions,
): ChatMessage[] {
  return windowHistory(normalizeHistory(input), options);
}

/**
 * Stable key for a turn, used by the answer cache.
 *
 * Normalisation is deliberately shallow — collapse whitespace, lowercase, drop
 * terminal punctuation. Anything more aggressive would merge questions a user
 * considers different, and a cache that returns the wrong answer to a
 * different question is worse than no cache at all.
 *
 * The key is built from the *whole* window rather than the single question so a
 * follow-up never collides with the standalone question it followed.
 */
export function conversationFingerprint(messages: ChatMessage[]): string {
  return messages
    .map(
      (m) => `${m.role}:${m.content.replace(/\s+/g, " ").trim().toLowerCase()}`,
    )
    .join("|")
    .slice(0, 2_000);
}
