import { createGoogleGenerativeAI } from "@ai-sdk/google";

/**
 * Resolves the Google Gemini API key from environment variables.
 * Supports both GEMINI_API_KEY and GOOGLE_GENERATIVE_AI_API_KEY.
 */
export function getGeminiApiKey(): string | undefined {
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    undefined
  );
}

/**
 * Checks if the Gemini AI integration is enabled with an active key.
 */
export function isGeminiConfigured(): boolean {
  return Boolean(getGeminiApiKey());
}

/**
 * Initialized Google AI provider instance.
 */
export const google = createGoogleGenerativeAI({
  apiKey: getGeminiApiKey(),
});

/**
 * Primary model used by the assistant.
 * Defaults to gemini-3.8-flash or configured GEMINI_MODEL.
 */
export const DEFAULT_AI_MODEL =
  process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";
