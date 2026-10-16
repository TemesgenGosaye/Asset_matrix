import { type NextRequest, NextResponse } from "next/server";
import {
  PROVIDER_TUNING,
  getProviderStatus,
  listProviders,
  scheduleWarmup,
} from "@/lib/ai/providers";
import { getAnswerCacheStats } from "@/lib/ai/answer-cache";
import { getAssistantCacheStats } from "@/lib/ai/cache";
import { getAuthUser } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Assistant status.
 *
 * The drawer shows which model is answering. That is only useful if the model
 * can be wrong, so this endpoint reports the whole picture: every provider slot,
 * whether it is configured, whether it answered, how fast, and what the caches
 * are doing. It is the difference between "the assistant is slow" and "the
 * assistant is on the local model, which is warming up".
 *
 * Health probes are memoised for 30 s server-side, so this is cheap enough to
 * poll from an open drawer without becoming a load test against a laptop running
 * Ollama.
 */
export async function GET(req: NextRequest) {
  try {
    let user;
    try {
      user = await getAuthUser();
    } catch {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }
    if (!user.organizationId) {
      return NextResponse.json(
        { error: "User is not associated with an active organization." },
        { status: 403 },
      );
    }

    // A client asking for status is almost always about to ask a question, so
    // this doubles as the moment to load a local model into memory.
    scheduleWarmup();
    // `?probe=1` forces fresh probes, for a manual retry in the status panel.
    const status = await getProviderStatus({
      force: req.nextUrl.searchParams.get("probe") === "1",
    });

    return NextResponse.json(
      {
        ...status,
        tuning: PROVIDER_TUNING,
        caches: {
          answers: getAnswerCacheStats(),
          aggregates: getAssistantCacheStats(),
        },
        slots: listProviders().map((d) => ({
          id: d.id,
          label: d.label,
          kind: d.kind,
          model: d.model,
          baseUrl: d.baseUrl,
          configured: d.configured,
          reason: d.reason,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Status unavailable";
    console.error("[Meri Status Error]:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
