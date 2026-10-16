import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  customDescriptor,
  geminiDescriptor,
  getActiveProvider,
  getProviderChain,
  isAnyProviderConfigured,
  listProviders,
  ollamaDescriptor,
  pickProviderForRequest,
  resetProviderHealthForTests,
} from "../providers";

/**
 * The provider module reads `process.env` on every descriptor call, so each test
 * sets exactly the variables it needs and restores the originals afterwards.
 */
const ORIGINAL = { ...process.env };

function setEnv(vars: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

beforeEach(() => {
  resetProviderHealthForTests();
  setEnv({
    AI_PROVIDER: undefined,
    GEMINI_API_KEY: undefined,
    GOOGLE_GENERATIVE_AI_API_KEY: undefined,
    GEMINI_MODEL: undefined,
    OLLAMA_ENABLED: undefined,
    OLLAMA_BASE_URL: undefined,
    OLLAMA_MODEL: undefined,
    AI_BASE_URL: undefined,
    AI_MODEL: undefined,
    AI_PROVIDER_LABEL: undefined,
    AI_PROVIDER_KIND: undefined,
  });
});

afterEach(() => {
  process.env = { ...ORIGINAL };
  resetProviderHealthForTests();
});

describe("descriptors", () => {
  it("reports Gemini as unconfigured without a key", () => {
    const d = geminiDescriptor();
    expect(d.configured).toBe(false);
    expect(d.reason).toMatch(/GEMINI_API_KEY/);
  });

  it("reports Gemini as configured with a key", () => {
    setEnv({ GEMINI_API_KEY: "test-key" });
    expect(geminiDescriptor().configured).toBe(true);
  });

  it("accepts the alternate Google key name", () => {
    setEnv({ GOOGLE_GENERATIVE_AI_API_KEY: "test-key" });
    expect(geminiDescriptor().configured).toBe(true);
  });

  it("honours an explicit model override", () => {
    setEnv({ GEMINI_API_KEY: "k", GEMINI_MODEL: "gemini-custom" });
    expect(geminiDescriptor().model).toBe("gemini-custom");
  });

  it("defaults Ollama to a local provider on the standard port", () => {
    const d = ollamaDescriptor();
    expect(d.kind).toBe("local");
    expect(d.baseUrl).toBe("http://127.0.0.1:11434/v1");
  });

  it("strips a trailing slash from a configured base URL", () => {
    setEnv({ OLLAMA_BASE_URL: "http://box.lan:11434/v1///" });
    expect(ollamaDescriptor().baseUrl).toBe("http://box.lan:11434/v1");
  });

  it("lets Ollama be switched off", () => {
    setEnv({ OLLAMA_ENABLED: "false" });
    const d = ollamaDescriptor();
    expect(d.configured).toBe(false);
    expect(d.reason).toMatch(/OLLAMA_ENABLED/);
  });

  it("requires a base URL before the custom slot is usable", () => {
    expect(customDescriptor().configured).toBe(false);
    setEnv({ AI_BASE_URL: "http://localhost:1234/v1", AI_MODEL: "m" });
    const d = customDescriptor();
    expect(d.configured).toBe(true);
    expect(d.model).toBe("m");
  });
});

describe("listProviders", () => {
  it("exposes all three slots", () => {
    expect(
      listProviders()
        .map((p) => p.id)
        .sort(),
    ).toEqual(["custom", "gemini", "ollama"]);
  });
});

describe("provider selection", () => {
  it("prefers Gemini when a key is present", () => {
    setEnv({ GEMINI_API_KEY: "k" });
    expect(getActiveProvider().id).toBe("gemini");
  });

  it("falls back to Ollama when no key is present", () => {
    expect(getActiveProvider().id).toBe("ollama");
  });

  it("honours an explicit pin, which is how an air-gapped office forces local", () => {
    setEnv({ GEMINI_API_KEY: "k", AI_PROVIDER: "ollama" });
    expect(getActiveProvider().id).toBe("ollama");
    // The chain still contains the other providers as fallback, so losing the
    // local server does not take the assistant offline.
    expect(getProviderChain().map((p) => p.id)).toContain("gemini");
  });

  it("ignores an unrecognised preference and behaves as auto", () => {
    setEnv({ AI_PROVIDER: "not-a-provider", GEMINI_API_KEY: "k" });
    expect(getActiveProvider().id).toBe("gemini");
  });

  it("omits Gemini from the chain when it has no key", () => {
    expect(getProviderChain().map((p) => p.id)).not.toContain("gemini");
  });

  it("omits a disabled provider from the chain", () => {
    setEnv({ OLLAMA_ENABLED: "false" });
    expect(getProviderChain().map((p) => p.id)).not.toContain("ollama");
  });

  it("puts the active provider first in the request chain", () => {
    setEnv({ GEMINI_API_KEY: "k" });
    expect(getProviderChain()[0].id).toBe(getActiveProvider().id);
  });

  it("never returns an unconfigured provider", () => {
    for (const p of getProviderChain()) expect(p.configured).toBe(true);
  });

  it("agrees with isAnyProviderConfigured", () => {
    expect(isAnyProviderConfigured()).toBe(getProviderChain().length > 0);
  });

  it("reports a provider for a request even with no health data yet", () => {
    const p = pickProviderForRequest();
    expect(p).toBeDefined();
    expect(p.configured).toBe(true);
  });
});
