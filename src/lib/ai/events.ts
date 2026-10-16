"use client";

/**
 * The window event bus between the assistant and the pages that trigger it.
 *
 * A page that wants to open Meri with a question should not have to import the
 * drawer — doing so puts the whole assistant UI in that page's bundle for the
 * sake of one string constant. Both ends agree on the names here instead.
 */

/** Toggle the drawer open or closed, with no question. */
export const TOGGLE_ASSISTANT_EVENT = "toggle-ai-copilot";

/** Open the drawer and ask `detail` (a question) immediately. */
export const ASK_ASSISTANT_EVENT = "ask-meri";

/** Dispatch a question to Meri. Safe to call from any client component. */
export function askAssistant(question: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<string>(ASK_ASSISTANT_EVENT, { detail: question }));
}
