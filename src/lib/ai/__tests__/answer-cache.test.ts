import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  buildAnswerCacheKey,
  cachedAnswer,
  getAnswerCacheStats,
  invalidateAnswerCache,
  peekAnswer,
  putAnswer,
  resetAnswerCacheForTests,
} from "../answer-cache";

const parts = {
  organizationId: "org-1",
  userId: "user-1",
  provider: "gemini" as const,
  model: "gemini-3.8-flash",
};

const msgs = (q: string) => [{ role: "user" as const, content: q }];

beforeEach(() => {
  resetAnswerCacheForTests();
  vi.useRealTimers();
});

afterEach(() => {
  resetAnswerCacheForTests();
  vi.useRealTimers();
});

describe("buildAnswerCacheKey", () => {
  it("separates different users on the same question", () => {
    const a = buildAnswerCacheKey(msgs("q"), parts);
    const b = buildAnswerCacheKey(msgs("q"), {
      ...parts,
      userId: "user-2",
    });
    expect(a).not.toBe(b);
  });

  it("separates different organizations", () => {
    expect(buildAnswerCacheKey(msgs("q"), parts)).not.toBe(
      buildAnswerCacheKey(msgs("q"), { ...parts, organizationId: "org-2" }),
    );
  });

  it("separates providers, so an answer is never replayed across models", () => {
    expect(buildAnswerCacheKey(msgs("q"), parts)).not.toBe(
      buildAnswerCacheKey(msgs("q"), { ...parts, provider: "ollama" }),
    );
  });

  it("separates screen context, because the same words mean different records", () => {
    expect(
      buildAnswerCacheKey(msgs("q"), { ...parts, screen: "assets" }),
    ).not.toBe(buildAnswerCacheKey(msgs("q"), { ...parts, screen: "houses" }));
  });

  it("separates different questions", () => {
    expect(buildAnswerCacheKey(msgs("first"), parts)).not.toBe(
      buildAnswerCacheKey(msgs("second"), parts),
    );
  });

  it("is stable for the same turn", () => {
    expect(buildAnswerCacheKey(msgs("q"), parts)).toBe(
      buildAnswerCacheKey(msgs("q"), parts),
    );
  });

  it("changes when the tool set version is bumped", () => {
    expect(buildAnswerCacheKey(msgs("q"), parts)).not.toBe(
      buildAnswerCacheKey(msgs("q"), { ...parts, toolsVersion: "v2" }),
    );
  });
});

describe("putAnswer / peekAnswer", () => {
  it("round-trips a stored answer", () => {
    const key = buildAnswerCacheKey(msgs("q"), parts);
    putAnswer(key, { text: "42 houses", tools: [] });
    expect(peekAnswer(key)?.text).toBe("42 houses");
  });

  it("never stores an empty answer", () => {
    const key = buildAnswerCacheKey(msgs("q"), parts);
    putAnswer(key, { text: "   ", tools: [] });
    expect(peekAnswer(key)).toBeUndefined();
  });

  it("treats an expired entry as a miss", () => {
    vi.useFakeTimers();
    const key = buildAnswerCacheKey(msgs("q"), parts);
    putAnswer(key, { text: "42 houses", tools: [] });
    vi.advanceTimersByTime(5 * 60_000);
    expect(peekAnswer(key)).toBeUndefined();
  });
});

describe("cachedAnswer", () => {
  it("produces once and replays afterwards", async () => {
    const produce = vi.fn().mockResolvedValue({ text: "42", tools: [] });
    const key = buildAnswerCacheKey(msgs("q"), parts);

    const first = await cachedAnswer(key, produce);
    const second = await cachedAnswer(key, produce);

    expect(first.hit).toBe(false);
    expect(second.hit).toBe(true);
    expect(produce).toHaveBeenCalledTimes(1);
    expect(second.value.text).toBe("42");
  });

  it("collapses concurrent identical questions into one model call", async () => {
    let resolve!: (v: { text: string; tools: string[] }) => void;
    const produce = vi.fn(
      () =>
        new Promise<{ text: string; tools: string[] }>((r) => (resolve = r)),
    );
    const key = buildAnswerCacheKey(msgs("q"), parts);

    const both = Promise.all([
      cachedAnswer(key, produce),
      cachedAnswer(key, produce),
    ]);
    resolve({ text: "42", tools: [] });
    const [a, b] = await both;

    expect(produce).toHaveBeenCalledTimes(1);
    expect(a.value.text).toBe("42");
    expect(b.value.text).toBe("42");
  });

  it("does not cache a failure", async () => {
    const produce = vi
      .fn()
      .mockRejectedValueOnce(new Error("provider down"))
      .mockResolvedValueOnce({ text: "recovered", tools: [] });
    const key = buildAnswerCacheKey(msgs("q"), parts);

    await expect(cachedAnswer(key, produce)).rejects.toThrow("provider down");
    const second = await cachedAnswer(key, produce);
    expect(second.hit).toBe(false);
    expect(second.value.text).toBe("recovered");
  });
});

describe("invalidateAnswerCache", () => {
  it("drops every entry", () => {
    const key = buildAnswerCacheKey(msgs("q"), parts);
    putAnswer(key, { text: "42", tools: [] });
    invalidateAnswerCache();
    expect(peekAnswer(key)).toBeUndefined();
  });

  it("leaves other organizations alone", () => {
    const mine = buildAnswerCacheKey(msgs("q"), parts);
    const theirs = buildAnswerCacheKey(msgs("q"), {
      ...parts,
      organizationId: "org-2",
    });
    putAnswer(mine, { text: "mine", tools: [] });
    putAnswer(theirs, { text: "theirs", tools: [] });

    invalidateAnswerCache("org-1");
    expect(peekAnswer(mine)).toBeUndefined();
    expect(peekAnswer(theirs)?.text).toBe("theirs");
  });
});

describe("getAnswerCacheStats", () => {
  it("reports what is currently held", () => {
    putAnswer(buildAnswerCacheKey(msgs("a"), parts), { text: "a", tools: [] });
    const stats = getAnswerCacheStats();
    expect(stats.entries).toBe(1);
    expect(stats.capacity).toBeGreaterThan(0);
    expect(stats.ttlMs).toBeGreaterThan(0);
  });
});
