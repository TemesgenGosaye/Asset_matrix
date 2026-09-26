import { type NextRequest, NextResponse } from "next/server";
import { streamText } from "ai";
import { google, DEFAULT_AI_MODEL, isGeminiConfigured } from "@/lib/ai/gemini";
import { buildSystemPrompt } from "@/lib/ai/prompts";
import { getScopedAiTools } from "@/lib/ai/tools";
import { tryFastLane } from "@/lib/ai/fast-lane";
import { ASSISTANT_BRAND } from "@/lib/ai/brand";
import {
  NDJSON_CONTENT_TYPE,
  encodeFrame,
  toolLabel,
  type AssistantFrame,
} from "@/lib/ai/protocol";
import { getAuthUser } from "@/lib/api-auth";

export const maxDuration = 45;

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
 */

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
            encodeFrame({ type: "error", message }),
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

    const organizationId = user.organizationId;

    // 2. Parse chat payload
    const body = await req.json().catch(() => null);
    const messages = body?.messages;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Invalid request: messages array is required." },
        { status: 400 },
      );
    }

    const lastUserMessage = [...messages]
      .reverse()
      .find(
        (m: { role?: string }) =>
          m.role === "user" && typeof m.content === "string" && m.content.trim(),
      );
    const question: string = lastUserMessage?.content?.trim() ?? "";

    // 3. Fast lane — deterministic intent, no model, no reasoning pause.
    if (question) {
      try {
        const fast = await tryFastLane(organizationId, question);
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
            yield { type: "done" };
          }
          return ndjsonStream(frames());
        }
      } catch (error: unknown) {
        console.error("[Meri Fast Lane Error]", error);
      }
    }

    // 4. Reasoning lane — the model, with tools that share the portal's engines.
    if (!isGeminiConfigured()) {
      return NextResponse.json(
        {
          error:
            "The reasoning assistant is not configured. Set GEMINI_API_KEY in your environment to enable it. Count and lookup questions still work without it.",
          code: "API_KEY_MISSING",
        },
        { status: 503 },
      );
    }

    const tools = getScopedAiTools(organizationId, user.id || "system");
    const systemPrompt = buildSystemPrompt({
      userId: user.id,
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
      organizationId,
      departmentId: user.departmentId,
    });

    // 5. Reasoning lane.
    //    `fullStream` is consumed exactly once, and it is what lets each tool
    //    call be pushed to the client as a labelled frame as it happens — the
    //    difference between a two-second wait that reads as work and one that
    //    reads as a hang.
    async function* reasoningFrames(): AsyncGenerator<AssistantFrame> {
      yield {
        type: "meta",
        lane: "reasoning",
        intent: "llm",
        ms: Date.now() - started,
        cached: false,
      };

      const result = streamText({
        model: google(DEFAULT_AI_MODEL),
        system: systemPrompt,
        messages,
        tools,
        // Two tool round-trips is enough for "search then explain". The previous
        // ceiling of five allowed the model to wander through redundant calls,
        // which is where most of the perceived latency came from.
        maxSteps: 3,
        temperature: 0.1,
        abortSignal: req.signal,
        onError: ({ error }) => {
          console.error("[Meri Reasoning Error]", error);
        },
      });

      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          yield { type: "text-delta", delta: part.text };
        } else if (part.type === "tool-call" && part.toolName) {
          yield { type: "tool", tool: part.toolName, label: toolLabel(part.toolName) };
        } else if (part.type === "error") {
          // Surfaced as a frame rather than a thrown error so the transcript
          // keeps whatever text already streamed.
          yield { type: "error", message: part.error.message };
        }
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
