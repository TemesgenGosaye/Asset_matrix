"use client";

import { useSyncExternalStore } from "react";
import { TOGGLE_ASSISTANT_EVENT } from "./events";

/**
 * Whether the assistant drawer is open, readable from outside the drawer.
 *
 * The drawer owns this state internally, but a floating launcher anchored to the
 * page corner has to get out of the way when the drawer slides in — otherwise
 * the button floats on top of the conversation it just opened. Rather than lift
 * the state into a context (which would force the whole tree to re-render on
 * every keystroke) or duplicate it (which drifts), the drawer publishes it here
 * and the launcher subscribes.
 *
 * This is a plain external store rather than component state: writing to it from
 * an effect is exactly what effects are for — synchronising with a system outside
 * React — and `useSyncExternalStore` reads it without a subscription leak or a
 * post-hydration flash.
 */

type Listener = () => void;

let open = false;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => open;
const getServerSnapshot = () => false;

/** Publish the drawer's open state. Called by the drawer; safe to call often. */
export function publishAssistantOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  emit();
}

/** Subscribe to the drawer's open state. */
export function useAssistantOpen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Open the drawer from outside it.
 *
 * Uses the same event the keyboard shortcut uses, so there is one code path into
 * the drawer and the launcher cannot drift from it. The store is *not* written
 * here: the drawer is the authority on its own state and will publish it on the
 * next effect, which keeps a single source of truth.
 */
export function requestAssistantOpen(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TOGGLE_ASSISTANT_EVENT));
}

/** Test-only. */
export function resetAssistantStateForTests(): void {
  open = false;
  listeners.clear();
}
