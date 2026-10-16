import { type NextRequest, NextResponse } from "next/server";
import { stepCountIs, streamText } from "ai";
import { buildSystemPrompt, type ScreenContext } from "@/lib/ai/prompts";
import { getScopedAiTools } from "@/lib/ai/tools";
import { tryFastLane } from "@/lib/ai/fast-lane";
import { ASSISTANT_BRAND } from "@/lib/ai/brand";
import {
  getProviderChain,
  getProviderModel,
  pickProviderForRequest,
  scheduleWarmup,
  type ProviderDescriptor,
} from "@/lib/ai/providers";
import {
  lastUserQuestion,
  prepareHistory,
  type ChatMessage,
} from "@/lib/ai/history";
import {
  buildAnswerCacheKey,
  peekAnswer,
  putAnswer,
} from "@/lib/ai/answer-cache";
import { suggestFollowUps } from "@/lib/ai/suggestions";
import {
  NDJSON_CONTENT_TYPE,
  encodeFrame,
  toolLabel,
  type AssistantFrame,
} from "@/lib/ai/protocol";
import { getAuthUser } from "@/lib/api-auth";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Two lanes, one stream.
 * -------------------
 * Every question takes the same wire format so the client has a single parser,
 * and the `meta` frame tells it whether a thinking indicator is warranted at all.
 *
 *  - Fast lane: one intent, one indexed aggregate, no model. Resolves in
 *    single-digit milliseconds and the client renders a data card with no
 *    spinner. This is the lane a question like "how many active houses exist"
 *    belongs on — it is a `COUNT`, not a reasoning problem.
 *  - Reasoning lane: the model with tools that share the portal's own engines,
 *    so its answers cannot drift from the business rules the portal enforces.
 *
 * A fast-lane failure never breaks the turn: it degrades to the reasoning lane
 * rather than surfacing an error, because a fallback answer beats no answer.
 *
 * ## Latency budget
 *
 * The reasoning lane is slow by nature, so the route spends its effort removing
 * everything that is *not* the model:
 *
 *  1. `meta` is yielded before any provider work, so the client can render the
 *     shell of the turn immediately.
 *  2. The history is windowed before it is sent, so prefill cost is bounded no
 *     matter how long the conversation has run.
 *  3. An identical question replays a stored answer in single-digit ms.
 *  4. Local models are kept warm, so a question does not pay the model load.
 *  5. Step count is genuinely capped, so a confused model cannot wander.
 *  6. A provider that fails mid-turn falls through to the next one, because a
 *     slower answer beats no answer.
 */

/** How many tool round-trips a single question may take. */
const MAX_STEPS = 3;

function ndjsonStream(frames: AsyncGenerator<AssistantFrame>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const frame of frames) {
          controller.enqueue(encoder.encode(encodeFrame(frame)));
        }
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Assistant stream failed";
        controller.enqueue(
          encoder.encode(
            encodeFrame({ type: "error", message, retryable: true }),
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": NDJSON_CONTENT_TYPE,
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

/** Coerce the client's screen hint into something the prompt can render. */
function parseScreenContext(value: unknown): ScreenContext | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  const str = (key: string, max: number) => {
    const v = raw[key];
    return typeof v === "string" && v.trim()
      ? v.trim().slice(0, max)
      : undefined;
  };
  const screen: ScreenContext = {
    path: str("path", 200),
    label: str("label", 80),
    recordId: str("recordId", 80),
    recordType: str("recordType", 40),
  };
  return Object.values(screen).some(Boolean) ? screen : undefined;
}

/** A stable fingerprint of the screen, for the answer cache key. */
function screenKey(screen?: ScreenContext): string | undefined {
  if (!screen) return undefined;
  return [screen.recordType, screen.recordId, screen.path, screen.label]
    .filter(Boolean)
    .join("/");
}

interface ResolvedContext {
  organizationId: string;
  userId: string;
  screen?: ScreenContext;
  isAdmin: boolean;
  name?: string | null;
  email?: string | null;
  role?: string;
  departmentId?: string | null;
}

export async function POST(req: NextRequest) {
  const started = Date.now();

  try {
    // 1. Authenticate user and verify organization
    let user;
    try {
      user = await getAuthUser();
    } catch {
      return NextResponse.json(
        { error: "Authentication required to access the assistant." },
        { status: 401 },
      );
    }

    if (!user.organizationId) {
      return NextResponse.json(
        { error: "User is not associated with an active organization." },
        { status: 403 },
      );
    }

    const context: ResolvedContext = {
      organizationId: user.organizationId,
      userId: user.id || "system",
      isAdmin: Boolean(user.isAdmin),
      name: user.name,
      email: user.email,
      role: (user as { role?: string }).role,
      departmentId: user.departmentId,
    };

    // 2. Parse chat payload
    const body = await req.json().catch(() => null);
    const rawMessages = body?.messages;

    if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
      return NextResponse.json(
        { error: "Invalid request: messages array is required." },
        { status: 400 },
      );
    }

    context.screen = parseScreenContext(body?.context);

    // 3. Window the conversation before anything else touches it. Bounded input
    //    is bounded prefill, which is the one latency lever that applies to
    //    every single reasoning turn regardless of provider.
    const messages = prepareHistory(rawMessages);
    const question = lastUserQuestion(messages);

    if (!question) {
      return NextResponse.json(
        { error: "Invalid request: a user message with content is required." },
        { status: 400 },
      );
    }

    // 4. Fast lane — deterministic intent, no model, no reasoning pause.
    if (question) {
      try {
        const fast = await tryFastLane(context.organizationId, question);
        if (fast) {
          async function* frames(): AsyncGenerator<AssistantFrame> {
            yield {
              type: "meta",
              lane: "fast",
              intent: fast.card.intent,
              ms: fast.ms,
              cached: fast.cached,
            };
            yield { type: "card", card: fast.card };
            if (fast.card.actions?.length) {
              yield { type: "sources", sources: fast.card.actions };
            }
            // Follow-ups are derived from the intent, so they cost nothing and
            // make every fast-lane answer a doorway rather than a dead end.
            yield {
              type: "suggestions",
              suggestions: suggestFollowUps([fast.card.intent], [question]),
            };
            yield { type: "done" };
          }
          return ndjsonStream(frames());
        }
      } catch (error: unknown) {
        console.error("[Meri Fast Lane Error]", error);
      }
    }

    // 5. Provider selection. The chain lets a dead local server fall through to
    //    a cloud key, and an air-gapped box keep working with no key at all.
    const chain = getProviderChain();
    if (chain.length === 0) {
      return NextResponse.json(
        {
          error:
            "The reasoning assistant is not configured. Set GEMINI_API_KEY for cloud reasoning, or run a local model and set AI_PROVIDER=ollama. Count and lookup questions still work without either.",
          code: "NO_PROVIDER",
        },
        { status: 503 },
      );
    }

    // Load a local model into memory off the critical path so the first
    // question of the session does not pay the cold start.
    scheduleWarmup();

    const primary = pickProviderForRequest();
    scheduleWarmup(primary);
    const systemPrompt = buildSystemPrompt(
      {
        userId: context.userId,
        name: context.name,
        email: context.email,
        role: context.role,
        isAdmin: context.isAdmin,
        departmentId: context.departmentId,
        organizationId: context.organizationId,
      },
      { kind: primary.kind, screen: context.screen },
    );

    // 6. Answer cache. A repeated question replays byte-identical text, so the
    //    stream below is skipped entirely and the first frame lands in ~1 ms.
    const cacheKey = buildAnswerCacheKey(messages, {
      organizationId: context.organizationId,
      userId: context.userId,
      provider: primary.id,
      model: primary.model,
      screen: screenKey(context.screen),
    });
    const replay = peekAnswer(cacheKey);

    if (replay) {
      async function* frames(): AsyncGenerator<AssistantFrame> {
        yield {
          type: "meta",
          lane: "reasoning",
          intent: "llm",
          ms: Date.now() - started,
          cached: true,
          replayed: true,
          provider: primary.id,
          model: primary.model,
          providerKind: primary.kind,
        };
        yield {
          type: "provider",
          provider: primary.id,
          model: primary.model,
          kind: primary.kind,
          primary: true,
        };
        for (const label of replay.tools)
          yield { type: "tool", tool: label, label };
        yield { type: "text-delta", delta: replay.text };
        if (replay.sources?.length)
          yield { type: "sources", sources: replay.sources };
        if (replay.suggestions?.length) {
          yield { type: "suggestions", suggestions: replay.suggestions };
        }
        if (replay.usage) yield { type: "usage", ...replay.usage };
        yield { type: "done" };
      }
      return ndjsonStream(frames());
    }

    // 7. Reasoning lane.
    //    Frames are pushed to the client *as they are produced* — buffering the
    //    whole answer to cache it would make every turn feel like the old
    //    spinner. The channel below streams live and collects at the same time,
    //    so the cache costs nothing in perceived latency.
    async function* reasoningFrames(): AsyncGenerator<AssistantFrame> {
      yield {
        type: "meta",
        lane: "reasoning",
        intent: "llm",
        ms: Date.now() - started,
        cached: false,
        provider: primary.id,
        model: primary.model,
        providerKind: primary.kind,
      };
      yield {
        type: "provider",
        provider: primary.id,
        model: primary.model,
        kind: primary.kind,
        primary: true,
      };

      const channel = new FrameChannel();
      const run = runReasoning({
        provider: primary,
        systemPrompt,
        messages,
        question,
        organizationId: context.organizationId,
        userId: context.userId,
        abortSignal: req.signal,
        push: (frame) => channel.push(frame),
        close: () => channel.close(),
      });

      // Drain until the producer closes, then await it for the cache write.
      for (;;) {
        const frame = await channel.next();
        if (!frame) break;
        yield frame;
      }

      const answer = await run;
      if (answer.error) {
        yield { type: "error", message: answer.error, retryable: !answer.text };
      } else if (answer.text.trim()) {
        putAnswer(cacheKey, {
          text: answer.text,
          tools: answer.tools,
          sources: answer.sources,
          suggestions: answer.suggestions,
          usage: answer.usage,
        });
      }
      yield { type: "done" };
    }

    return ndjsonStream(reasoningFrames());
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal assistant error";
    console.error("[Meri Route Error]:", error);
    return NextResponse.json(
      { error: `${ASSISTANT_BRAND.latin} service error: ${message}` },
      { status: 500 },
    );
  }
}

/* ───────────────────────────── reasoning core ───────────────────────────── */

/**
 * A one-consumer async queue for frames.
 *
 * The model produces frames on its own schedule; the HTTP response body has to
 * write them on the connection's schedule. This is the seam between the two, and
 * it is what lets an answer stream to the user *and* be accumulated for the
 * cache without the producer having to know which consumer is reading.
 */
class FrameChannel {
  private queue: AssistantFrame[] = [];
  private closed = false;
  private waiter: (() => void) | null = null;

  push(frame: AssistantFrame): void {
    if (this.closed) return;
    this.queue.push(frame);
    this.wake();
  }

  close(): void {
    this.closed = true;
    this.wake();
  }

  /** Next frame, or `null` once the channel is closed and drained. */
  async next(): Promise<AssistantFrame | null> {
    for (;;) {
      const frame = this.queue.shift();
      if (frame) return frame;
      if (this.closed) return null;
      await new Promise<void>((resolve) => {
        this.waiter = resolve;
      });
    }
  }

  private wake(): void {
    const resolve = this.waiter;
    this.waiter = null;
    resolve?.();
  }
}

interface ReasoningInput {
  provider: ProviderDescriptor;
  systemPrompt: string;
  messages: ChatMessage[];
  question: string;
  organizationId: string;
  userId: string;
  abortSignal: AbortSignal;
  push: (frame: AssistantFrame) => void;
  close: () => void;
}

interface ReasoningOutput {
  text: string;
  tools: string[];
  toolNames: string[];
  sources?: { label: string; href: string }[];
  suggestions?: { label: string; prompt: string }[];
  usage?: { inputTokens?: number; outputTokens?: number };
  error?: string;
}

/**
 * Run one model turn, streaming frames out and trying each provider in turn
 * until one produces text.
 *
 * A turn that fails on its first provider is retried on the next one. A local
 * server that dies between the health probe and the request should cost a retry,
 * not a failed question — and a machine with both a local model and a cloud key
 * gets whichever is actually working.
 */
async function runReasoning(input: ReasoningInput): Promise<ReasoningOutput> {
  const chain = [
    input.provider,
    ...getProviderChain().filter((p) => p.id !== input.provider.id),
  ];
  const tools = getScopedAiTools(input.organizationId, input.userId);
  let lastError = "The assistant could not finish this answer.";

  try {
    for (const [index, descriptor] of chain.entries()) {
      const isFallback = index > 0;
      let text = "";
      let toolLabels: string[] = [];
      let toolNames: string[] = [];
      let usage: ReasoningOutput["usage"];
      let error: string | undefined;
      let produced = false;

      if (isFallback) {
        // Say the answer moved to a different model rather than silently
        // changing the latency profile mid-answer.
        input.push({
          type: "provider",
          provider: descriptor.id,
          model: descriptor.model,
          kind: descriptor.kind,
          primary: false,
        });
      }

      try {
        const result = streamText({
          model: getProviderModel(descriptor),
          system: input.systemPrompt,
          messages: input.messages,
          tools,
          // A real step cap. `maxSteps` was silently ignored by this SDK
          // version, which left the tool loop uncapped — the single largest
          // source of runaway latency in the reasoning lane.
          stopWhen: stepCountIs(MAX_STEPS),
          temperature: 0.1,
          abortSignal: input.abortSignal,
          onError: ({ error: streamError }) => {
            console.error(
              `[Meri Reasoning Error · ${descriptor.id}]`,
              streamError,
            );
          },
        });

        for await (const part of result.fullStream) {
          if (part.type === "text-delta") {
            produced = true;
            text += part.text;
            input.push({ type: "text-delta", delta: part.text });
          } else if (part.type === "tool-call" && part.toolName) {
            produced = true;
            toolNames.push(part.toolName);
            const label = toolLabel(part.toolName);
            toolLabels.push(label);
            input.push({ type: "tool", tool: part.toolName, label });
          } else if (part.type === "error") {
            // Surfaced as a frame rather than a thrown error so the transcript
            // keeps whatever text already streamed. The SDK types `error` as
            // `unknown`, so it is narrowed here instead of being trusted.
            error =
              part.error instanceof Error
                ? part.error.message
                : "The assistant could not finish this answer.";
          }
        }

        const finalUsage = await result.usage;
        usage = {
          inputTokens: finalUsage.inputTokens,
          outputTokens: finalUsage.outputTokens,
        };
      } catch (err: unknown) {
        if (input.abortSignal.aborted) {
          // The user pressed stop. Not an error, and not a reason to try the
          // next provider — they asked for it to end.
          return { text, tools: toolLabels, toolNames, usage };
        }
        lastError = err instanceof Error ? err.message : lastError;
        console.error(`[Meri Provider Failure · ${descriptor.id}]`, err);
        if (produced) {
          // Partial output is still an answer; falling through would restart it.
          break;
        }
        continue;
      }

      if (!text.trim() && !error) {
        error =
          "The assistant returned an empty answer. Try rephrasing the question.";
      }
      if (error && !text.trim()) {
        // Nothing usable came back. On anything but the last provider, try the
        // next one; on the last one, report it.
        if (!isFallback) {
          lastError = error;
          continue;
        }
        error = lastError;
      }

      const sources = collectSources(toolLabels);
      const suggestions = suggestFollowUps(toolNames, [input.question]);

      return {
        text,
        tools: toolLabels,
        toolNames,
        sources,
        suggestions,
        usage,
        error: text.trim() ? undefined : error,
      };
    }

    return { text: "", tools: [], toolNames: [], error: lastError };
  } finally {
    input.close();
  }
}

/** Deep links implied by the tools that ran, so the answer is verifiable. */
const TOOL_SOURCES: {
  match: RegExp;
  sources: { label: string; href: string }[];
}[] = [
  {
    match: /queue/i,
    sources: [{ label: "House queue", href: "/house-queue" }],
  },
  {
    match: /eligibility/i,
    sources: [{ label: "Queue rules", href: "/house-queue" }],
  },
  {
    match: /inspection/i,
    sources: [{ label: "Handback inspections", href: "/houses/inspections" }],
  },
  {
    match: /house/i,
    sources: [{ label: "House register", href: "/household" }],
  },
  {
    match: /licence|license|seat/i,
    sources: [{ label: "Licences", href: "/licences" }],
  },
  {
    match: /stock|consumable/i,
    sources: [{ label: "Stock", href: "/consumables" }],
  },
  {
    match: /warranty/i,
    sources: [{ label: "Asset register", href: "/assets" }],
  },
  {
    match: /asset/i,
    sources: [{ label: "Asset register", href: "/assets" }],
  },
  {
    match: /ticket/i,
    sources: [{ label: "Tickets", href: "/user/tickets" }],
  },
];

function collectSources(
  toolLabelsRun: string[],
): { label: string; href: string }[] {
  const out: { label: string; href: string }[] = [];
  const seen = new Set<string>();
  for (const label of toolLabelsRun) {
    for (const rule of TOOL_SOURCES) {
      if (!rule.match.test(label)) continue;
      for (const source of rule.sources) {
        if (seen.has(source.href)) continue;
        seen.add(source.href);
        out.push(source);
      }
    }
  }
  return out.slice(0, 4);
}
