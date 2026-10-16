import {
  geminiDescriptor,
  getGeminiApiKey,
  getProviderModel,
  isAnyProviderConfigured,
  ollamaDescriptor,
} from "./providers";

/**
 * Backwards-compatible Gemini accessors.
 *
 * The reasoning lane is no longer Gemini-only, so the real implementation moved
 * to `providers.ts`. These re-exports exist so existing imports and the
 * `.env`-driven Gemini configuration keep working without a flag day, and so
 * there is exactly one place that knows how a provider is built.
 */

export { getGeminiApiKey };

/** The Gemini model id the deployment has selected. */
export const DEFAULT_AI_MODEL = geminiDescriptor().model;

/** True when a Gemini key is present. */
export function isGeminiConfigured(): boolean {
  return Boolean(getGeminiApiKey());
}

/**
 * The Gemini model instance.
 *
 * Prefer {@link getProviderModel} with a descriptor: it is the only call site
 * that respects the active provider, so hard-wiring Gemini here would quietly
 * defeat the local-model path.
 */
export function getGeminiModel() {
  return getProviderModel(geminiDescriptor());
}

/** The configured local model, if one is set up. */
export function getOllamaModel() {
  return getProviderModel(ollamaDescriptor());
}

/** True when any provider — cloud or local — can serve a reasoning request. */
export function isAnyAiConfigured(): boolean {
  return isAnyProviderConfigured();
}
