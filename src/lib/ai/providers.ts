import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

/**
 * Provider layer for the assistant's reasoning lane.
 * -----------------------------------------------
 * The reasoning lane used to be hard-wired to Google Gemini, which meant the
 * assistant was unavailable on any deployment without outbound internet — a
 * real constraint for field offices. This module makes the model a *deployment
 * decision* instead of a build-time assumption:
 *
 *   - `gemini` — Google Gemini over HTTPS. Strongest tool use, best Amharic,
 *     lowest latency, but requires egress and a key.
 *   - `ollama` — a locally hosted model. No egress, no per-token cost, no data
 *     leaving the organisation. Slower and less reliable at multi-step tool use
 *     than a frontier cloud model, which the prompt profile in `prompts.ts`
 *     compensates for.
 *   - `custom` — any other OpenAI-compatible endpoint (LM Studio, vLLM,
 *     llama.cpp server, OpenRouter, Together, a corporate gateway). One shape
 *     covers most self-hosted and hosted inference stacks.
 *
 * Three design rules hold throughout:
 *
 *  1. **Resolution is pure and synchronous.** Reading env and picking a provider
 *     must never await, because it sits on the hot path of every question and a
 *     promise there would add a scheduling hop for no reason.
 *  2. **Reachability is probed, not assumed.** A local server is a moving
 *     target: it may be booting, swapped out, or simply not installed. The
 *     probe is memoised for a short window so the common case costs nothing.
 *  3. **Local models are kept warm.** A cold Ollama model spends seconds
 *     loading weights before the first token. `keep_alive` holds the model in
 *     memory between questions, which is the single largest latency win
 *     available for a self-hosted deployment.
 */

export type ProviderId = "gemini" | "ollama" | "custom";

/** Where a model runs, which is what the UI actually surfaces to the user. */
export type ProviderKind = "cloud" | "local";

export interface ProviderDescriptor {
  id: ProviderId;
  /** Short human label, e.g. `Gemini` or `Ollama (local)`. */
  label: string;
  kind: ProviderKind;
  /** Model id passed to the provider. */
  model: string;
  /** Endpoint, for local/self-hosted providers. */
  baseUrl?: string;
  /** True when the environment supplies everything this provider needs. */
  configured: boolean;
  /** Why it is not configured — shown in the status panel so setup is actionable. */
  reason?: string;
}

export interface ProviderHealth {
  ok: boolean;
  /** Round-trip time of the probe, in milliseconds. */
  latencyMs: number;
  /** Model ids the provider reports, when it exposes a model list. */
  models?: string[];
  /** Plain-language detail for the status panel. */
  detail?: string;
}

/* ─────────────────────────── configuration ─────────────────────────── */

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function envInt(name: string, fallback: number): number {
  const raw = env(name);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Google Gemini accepts either of these; the first one set wins. */
export function getGeminiApiKey(): string | undefined {
  return env("GEMINI_API_KEY") ?? env("GOOGLE_GENERATIVE_AI_API_KEY");
}

/**
 * Keep the model resident in memory after a request.
 *
 * Ollama unloads a model after `keep_alive` seconds of idleness and reloads the
 * full weight set on the next request, which costs several seconds of dead air
 * before the first token. Five minutes comfortably covers an active work
 * session while still releasing the GPU/CPU when people stop asking questions.
 */
const OLLAMA_KEEP_ALIVE = env("OLLAMA_KEEP_ALIVE") ?? "5m";

/**
 * Context window requested from a local model.
 *
 * This is the other half of the latency story: prefill cost scales with the KV
 * cache the runner has to allocate, and a local server defaults to whatever the
 * model's training maximum is (often 32k+), which on CPU is a very large
 * allocation. Capping it at a value that comfortably holds the system prompt plus
 * a long conversation keeps the first token fast without truncating real turns.
 */
const OLLAMA_NUM_CTX = envInt("OLLAMA_NUM_CTX", 8192);

/** Upper bound on generated tokens. Bounds tail latency for rambling answers. */
const OLLAMA_NUM_PREDICT = envInt("OLLAMA_NUM_PREDICT", 1024);

/** The requested provider, or `auto` to let configuration decide. */
export type ProviderPreference = ProviderId | "auto";

function requestedProvider(): ProviderPreference {
  const raw = (env("AI_PROVIDER") ?? "auto").toLowerCase();
  return raw === "gemini" || raw === "ollama" || raw === "custom"
    ? raw
    : "auto";
}

/** Ollama's default is port 11434 and the `/v1` prefix for OpenAI compatibility. */
function ollamaBaseUrl(): string {
  return (env("OLLAMA_BASE_URL") ?? "http://127.0.0.1:11434/v1").replace(
    /\/+$/,
    "",
  );
}

/** Stable identifier for the custom OpenAI-compatible slot. */
function customBaseUrl(): string {
  return (env("AI_BASE_URL") ?? "http://127.0.0.1:1234/v1").replace(/\/+$/, "");
}

/* ──────────────────────────── descriptors ──────────────────────────── */

export function geminiDescriptor(): ProviderDescriptor {
  const key = getGeminiApiKey();
  return {
    id: "gemini",
    label: "Gemini",
    kind: "cloud",
    model: env("GEMINI_MODEL") ?? "gemini-3.8-flash",
    configured: Boolean(key),
    reason: key ? undefined : "Set GEMINI_API_KEY to enable cloud reasoning.",
  };
}

export function ollamaDescriptor(): ProviderDescriptor {
  const model = env("OLLAMA_MODEL") ?? "qwen2.5:7b-instruct";
  const disabled = (env("OLLAMA_ENABLED") ?? "true").toLowerCase() === "false";
  return {
    id: "ollama",
    label: "Ollama (local)",
    kind: "local",
    model,
    baseUrl: ollamaBaseUrl(),
    configured: !disabled,
    reason: disabled
      ? "Ollama is disabled via OLLAMA_ENABLED=false."
      : undefined,
  };
}

export function customDescriptor(): ProviderDescriptor {
  const baseUrl = env("AI_BASE_URL");
  return {
    id: "custom",
    label: env("AI_PROVIDER_LABEL") ?? "Self-hosted model",
    kind: (env("AI_PROVIDER_KIND") ?? "local") === "cloud" ? "cloud" : "local",
    model: env("AI_MODEL") ?? "local-model",
    baseUrl: customBaseUrl(),
    configured: Boolean(baseUrl),
    reason: baseUrl
      ? undefined
      : "Set AI_BASE_URL to use a self-hosted or third-party OpenAI-compatible endpoint.",
  };
}

/** Every provider slot, in the order they are considered. */
export function listProviders(): ProviderDescriptor[] {
  return [geminiDescriptor(), ollamaDescriptor(), customDescriptor()];
}

/**
 * Provider precedence.
 *
 * `auto` prefers Gemini when a key is present, because it is the stronger model
 * and the faster one. It falls back to a local model rather than failing, so a
 * deployment that loses its key degrades to slower answers instead of none.
 * An explicit `AI_PROVIDER` pins the choice — which is how an air-gapped
 * office forces `ollama` and never touches the network.
 */
function providerOrder(): ProviderDescriptor[] {
  const all = listProviders();
  const requested = requestedProvider();
  if (requested !== "auto") {
    const pinned = all.find((p) => p.id === requested);
    return pinned ? [pinned, ...all.filter((p) => p.id !== requested)] : all;
  }
  // `auto`: cloud first when a key exists, otherwise local-only.
  return all.find((p) => p.id === "gemini" && p.configured)
    ? all
    : all.filter((p) => p.id !== "gemini");
}

/** The provider that will serve the next question. Never throws. */
export function getActiveProvider(): ProviderDescriptor {
  const [first] = providerOrder();
  return first;
}

/**
 * Providers worth trying, in order, for a question that actually needs a model.
 *
 * The first entry is always the active provider, so the common case performs no
 * extra work. The remainder exist so a single provider outage does not take the
 * assistant offline — a local server that is not running should not mean "no
 * reasoning lane" on a machine that also holds a Gemini key.
 */
export function getProviderChain(): ProviderDescriptor[] {
  return providerOrder().filter((p) => p.configured);
}

/** True when at least one provider can serve a reasoning request. */
export function isAnyProviderConfigured(): boolean {
  return getProviderChain().length > 0;
}

/* ─────────────────────────── model factories ─────────────────────────── */

/**
 * Injects Ollama's native tuning fields into an OpenAI-compatible request.
 *
 * The AI SDK's OpenAI-compatible provider validates `providerOptions` against a
 * closed schema, so `keep_alive` and `options.num_ctx` are dropped before they
 * reach the wire. Wrapping `fetch` is the one place they can still be added,
 * and it keeps the whole thing provider-agnostic — the same wrapper works for
 * any server that understands the Ollama extension fields and is a no-op
 * elsewhere.
 */
function ollamaTunedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (!init?.body || typeof init.body !== "string") {
    return fetch(input, init);
  }
  try {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    body.keep_alive = OLLAMA_KEEP_ALIVE;
    body.options = {
      ...((body.options as Record<string, unknown> | undefined) ?? {}),
      num_ctx: OLLAMA_NUM_CTX,
      num_predict: OLLAMA_NUM_PREDICT,
    };
    return fetch(input, { ...init, body: JSON.stringify(body) });
  } catch {
    // A body we cannot parse is not a body we should rewrite.
    return fetch(input, init);
  }
}

const google = createGoogleGenerativeAI({ apiKey: getGeminiApiKey() });

const ollama = createOpenAICompatible({
  name: "ollama",
  baseURL: ollamaBaseUrl(),
  // Ollama ignores the key, but sending one keeps middleware happy.
  apiKey: env("OLLAMA_API_KEY") ?? "ollama",
  fetch: ollamaTunedFetch,
});

const custom = createOpenAICompatible({
  name: env("AI_PROVIDER_LABEL") ?? "custom",
  baseURL: customBaseUrl(),
  apiKey: env("AI_API_KEY") ?? "not-required",
});

/**
 * Build the language model for a provider.
 *
 * Resolved per call rather than at module load so that changing the active
 * provider — or a health-based fallback — does not require re-importing the
 * module graph. Construction is cheap: no network, no key validation.
 */
export function getProviderModel(
  descriptor: ProviderDescriptor,
): LanguageModel {
  switch (descriptor.id) {
    case "gemini":
      return google(descriptor.model);
    case "ollama":
      return ollama(descriptor.model);
    default:
      return custom(descriptor.model);
  }
}

/* ───────────────────────────── health probe ───────────────────────────── */

const healthCache = new Map<
  ProviderId,
  { at: number; health: ProviderHealth }
>();
const inflight = new Map<ProviderId, Promise<ProviderHealth>>();

/**
 * How long a probe result is trusted.
 *
 * Long enough that a burst of questions probes once, short enough that starting
 * a local server is noticed within a minute without a redeploy.
 */
const HEALTH_TTL_MS = 30_000;

/** A local probe must fail fast — a cold server should not hold a question open. */
const PROBE_TIMEOUT_MS = envInt("AI_PROBE_TIMEOUT_MS", 2_500);

function probeUrl(descriptor: ProviderDescriptor): string | undefined {
  if (descriptor.id === "gemini") {
    const key = getGeminiApiKey();
    return key
      ? `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`
      : undefined;
  }
  if (!descriptor.baseUrl) return undefined;
  return `${descriptor.baseUrl.replace(/\/+$/, "")}/models`;
}

function firstSentence(value: string, max = 160): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

async function runProbe(
  descriptor: ProviderDescriptor,
): Promise<ProviderHealth> {
  if (!descriptor.configured) {
    return { ok: false, latencyMs: 0, detail: descriptor.reason };
  }
  const url = probeUrl(descriptor);
  if (!url) {
    return { ok: false, latencyMs: 0, detail: descriptor.reason };
  }

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers:
        descriptor.id === "gemini" ? {} : { Authorization: "Bearer probe" },
    });
    const latencyMs = Date.now() - started;

    if (!response.ok) {
      return {
        ok: false,
        latencyMs,
        detail:
          `Endpoint answered ${response.status} ${response.statusText}`.trim(),
      };
    }

    // Model lists are a bonus, not a requirement: several compatible servers do
    // not implement `/models` and still serve chat perfectly well.
    let models: string[] | undefined;
    try {
      const payload = (await response.json()) as {
        data?: { id?: string }[];
        models?: { name?: string; model?: string }[];
      };
      const ids = [
        ...(payload.data ?? []).map((m) => m.id),
        ...(payload.models ?? []).map((m) => m.name ?? m.model),
      ].filter((id): id is string => Boolean(id));
      if (ids.length > 0) models = ids;
    } catch {
      // No machine-readable body — connectivity is still proven.
    }

    const known = models?.includes(descriptor.model);
    return {
      ok: true,
      latencyMs,
      models,
      detail: known
        ? undefined
        : models
          ? `Reachable, but \`${descriptor.model}\` is not in its model list.`
          : undefined,
    };
  } catch (error: unknown) {
    const latencyMs = Date.now() - started;
    if (error instanceof Error && error.name === "AbortError") {
      return {
        ok: false,
        latencyMs,
        detail: `No response within ${PROBE_TIMEOUT_MS} ms.`,
      };
    }
    return {
      ok: false,
      latencyMs,
      detail: firstSentence(
        error instanceof Error ? error.message : "Unreachable",
      ),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probe a provider, memoised for {@link HEALTH_TTL_MS}.
 *
 * Concurrent callers for the same provider share one probe, so a dashboard full
 * of users opening the assistant at once produces a single request to Ollama
 * rather than one each.
 */
export async function probeProvider(
  descriptor: ProviderDescriptor,
  options: { force?: boolean } = {},
): Promise<ProviderHealth> {
  const cached = healthCache.get(descriptor.id);
  const now = Date.now();
  if (!options.force && cached && now - cached.at < HEALTH_TTL_MS) {
    return cached.health;
  }

  const pending = inflight.get(descriptor.id);
  if (pending) return pending;

  const promise = runProbe(descriptor)
    .then((health) => {
      healthCache.set(descriptor.id, { at: Date.now(), health });
      return health;
    })
    .finally(() => {
      inflight.delete(descriptor.id);
    });

  inflight.set(descriptor.id, promise);
  return promise;
}

/** Probe every configured provider at once. */
export async function probeAllProviders(
  options: {
    force?: boolean;
  } = {},
): Promise<Record<ProviderId, ProviderHealth>> {
  const descriptors = listProviders();
  const results = await Promise.all(
    descriptors.map((d) => probeProvider(d, options)),
  );
  return descriptors.reduce(
    (acc, descriptor, index) => {
      acc[descriptor.id] = results[index];
      return acc;
    },
    {} as Record<ProviderId, ProviderHealth>,
  );
}

/* ─────────────────────────────── warmup ─────────────────────────────── */

/**
 * Ask a local server to load the model now so the first real question is not
 * the one that pays the cold-start.
 *
 * `keep_alive` holds the weights afterwards, so this is a one-time cost paid
 * during idle time rather than a cost paid by whichever user happens to ask
 * first. Failures are swallowed: warmup is an optimisation, and a server that
 * is not up yet is not an error.
 */
export async function warmProvider(
  descriptor: ProviderDescriptor,
): Promise<boolean> {
  if (
    descriptor.kind !== "local" ||
    !descriptor.configured ||
    !descriptor.baseUrl
  ) {
    return false;
  }
  const health = await probeProvider(descriptor);
  if (!health.ok) return false;

  // `/api/chat` is the native Ollama surface. It is the only endpoint that
  // accepts a bare `model` with a trivial prompt, which is exactly what a
  // warmup needs. A non-Ollama compatible server will simply 404 here, which is
  // harmless — it is already warm if it is serving anything.
  const nativeRoot = descriptor.baseUrl.replace(/\/v1$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`${nativeRoot}/api/chat`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: descriptor.model,
        stream: false,
        keep_alive: OLLAMA_KEEP_ALIVE,
        options: { num_predict: 1 },
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Warm the active local provider in the background.
 *
 * Deliberately not awaited by callers. Warmup runs at most once per process per
 * provider, on a timer, and cannot delay or fail a user request.
 */
let warmed = new Set<ProviderId>();

export function scheduleWarmup(descriptor?: ProviderDescriptor): void {
  const target = descriptor ?? getActiveProvider();
  if (warmed.has(target.id) || target.kind !== "local") return;
  warmed.add(target.id);
  // Off the critical path and off the microtask queue: `setTimeout(0)` would
  // still compete with the first request's own scheduling.
  const timer = setTimeout(() => {
    void warmProvider(target).catch(() => undefined);
  }, 250);
  // Never hold the process open for a warmup.
  if (typeof timer.unref === "function") timer.unref();
}

/** Drop memoised health. Test-only and used after a provider config change. */
export function resetProviderHealthForTests(): void {
  healthCache.clear();
  inflight.clear();
  warmed = new Set();
}

/* ────────────────────────── capability summary ────────────────────────── */

export interface ProviderStatus {
  active: ProviderDescriptor;
  chain: ProviderDescriptor[];
  health: Record<ProviderId, ProviderHealth>;
  /** True when the active provider answered its last probe. */
  healthy: boolean;
  /** Set when nothing at all is configured — the setup instructions. */
  setupHint?: string;
}

/** Everything the status endpoint and the UI badge need, in one call. */
export async function getProviderStatus(
  options: { force?: boolean } = {},
): Promise<ProviderStatus> {
  const chain = getProviderChain();
  const health = await probeAllProviders(options);
  const configured = getActiveProvider();

  // Prefer a provider that is configured *and* reachable, so a dead local
  // server silently promotes the cloud model instead of failing the question.
  const effective = chain.find((p) => health[p.id]?.ok) ?? configured;

  return {
    active: effective,
    chain,
    health,
    healthy: Boolean(health[effective.id]?.ok),
    setupHint: chain.length
      ? undefined
      : "No reasoning provider is configured. Count and lookup questions still work — everything else needs GEMINI_API_KEY, a running Ollama server, or AI_BASE_URL.",
  };
}

/**
 * Provider selection honouring live health, for the request path.
 *
 * Returns the first configured provider whose last probe succeeded, falling
 * back to the first configured provider when nothing has been probed yet —
 * better to attempt a request than to refuse one.
 */
export function pickProviderForRequest(): ProviderDescriptor {
  const chain = getProviderChain();
  if (chain.length === 0) return getActiveProvider();
  for (const descriptor of chain) {
    const health = healthCache.get(descriptor.id)?.health;
    if (health?.ok) return descriptor;
  }
  return chain[0];
}

/** Numeric settings, exposed for the status panel and tests. */
export const PROVIDER_TUNING = {
  ollamaKeepAlive: OLLAMA_KEEP_ALIVE,
  ollamaNumCtx: OLLAMA_NUM_CTX,
  ollamaNumPredict: OLLAMA_NUM_PREDICT,
  probeTimeoutMs: PROBE_TIMEOUT_MS,
  healthTtlMs: HEALTH_TTL_MS,
} as const;
