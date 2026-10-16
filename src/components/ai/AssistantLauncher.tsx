"use client";

import { useSyncExternalStore } from "react";
import { Sparkles } from "lucide-react";
import { ASSISTANT_BRAND } from "@/lib/ai/brand";
import {
  requestAssistantOpen,
  useAssistantOpen,
} from "@/lib/ai/assistant-state";
import { cn } from "@/lib/utils";

/**
 * The floating assistant launcher.
 *
 * Placed bottom-right, the one corner of this layout that is reliably empty: the
 * sidebar is on the left, the header is at the top, and the mobile tab bar
 * occupies the bottom edge only below `md`. On desktop the launcher sits clear of
 * everything; on mobile it lifts above the tab bar so the two never overlap.
 *
 * Design notes, since a floating button is the most-abused control in this class
 * of app:
 *
 *  - **It is a launcher, not a mascot.** No waving hand, no bouncing, no speech
 *    bubble nagging the user. A single mark in the system accent that matches
 *    the header trigger, so the assistant reads as part of the product rather
 *    than an overlay bolted on top of it.
 *  - **One gentle attention cue, not several.** A single slow ring, drawn once,
 *    that stops the moment the user has used the assistant. It is an invitation
 *    to discover, not an alarm.
 *  - **It leaves when it is not needed.** Hidden entirely while the drawer is
 *    open, so it never covers the conversation it opened.
 *  - **Keyboard-reachable.** A real `<button>`, focus-visible ring, and a label
 *    that describes the action rather than the glyph.
 */

/** Local key so the "seen it" nudge is remembered per browser. */
const SEEN_KEY = "meri:launcher:seen";

/** Notifies React when the flag flips, so the nudge retires itself. */
const SEEN_EVENT = "meri:launcher:seen-changed";

function subscribeToSeen(onChange: () => void): () => void {
  window.addEventListener(SEEN_EVENT, onChange);
  // `storage` covers the other tab writing the same key.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SEEN_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function hasSeenLauncher(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

function markLauncherSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* private mode: the nudge simply shows again next visit */
  }
  window.dispatchEvent(new Event(SEEN_EVENT));
}

export interface AssistantLauncherProps {
  className?: string;
}

export function AssistantLauncher({ className }: AssistantLauncherProps) {
  const isOpen = useAssistantOpen();

  // `localStorage` is an external store, so read it as one. The server snapshot
  // reports "already seen", which keeps the first paint identical on both sides
  // and avoids a hydration mismatch — and it means no effect is needed to load
  // the flag, only a subscription-free read that React re-checks on its own.
  const seen = useSyncExternalStore(
    subscribeToSeen,
    hasSeenLauncher,
    () => true,
  );

  if (isOpen) return null;

  const handleClick = () => {
    markLauncherSeen();
    requestAssistantOpen();
  };

  return (
    <div
      className={cn(
        // `bottom-20` clears the mobile tab bar; `md:bottom-6` drops back to the
        // corner once that bar is gone. `z-40` keeps it above page content but
        // below the drawer (z-50) and its scrim.
        "assistant-rise pointer-events-none fixed right-4 bottom-20 z-40 md:right-6 md:bottom-6",
        className,
      )}
    >
      <button
        type="button"
        onClick={handleClick}
        title={`Open ${ASSISTANT_BRAND.lockup} (Ctrl+J)`}
        aria-label={`Open ${ASSISTANT_BRAND.latin}, ${ASSISTANT_BRAND.tagline.en}`}
        className={cn(
          // Brass is this assistant's identity colour everywhere else in the
          // component set, so the launcher carries it too — one glance should be
          // enough to know the floating button and the drawer are the same thing.
          "group pointer-events-auto relative flex h-12 w-12 items-center justify-center rounded-full",
          "border-primary/40 bg-primary text-primary-foreground border",
          "shadow-[var(--shadow-md)] ring-1 ring-white/20 ring-inset",
          "transition-all duration-200 ease-out",
          "hover:bg-primary hover:shadow-lg",
          "active:scale-95",
          "focus-visible:ring-primary focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
          "dark:border-primary/50 dark:bg-primary dark:hover:bg-primary",
        )}
      >
        {/* Attention ring — one slow pulse, and only until the assistant is used. */}
        {!seen && (
          <span
            aria-hidden
            className="border-primary/50 pointer-events-none absolute inset-0 animate-ping rounded-full border [animation-duration:3s]"
          />
        )}

        <Sparkles className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />

        {/* Desktop-only label. Grows on hover; on touch there is no hover state
            to reveal it, so it stays hidden. */}
        <span
          className={cn(
            "pointer-events-none absolute top-1/2 right-full mr-3 hidden -translate-y-1/2",
            "border-border bg-popover rounded-md border px-2.5 py-1 whitespace-nowrap",
            "text-foreground text-[11px] font-medium opacity-0 shadow-md",
            "transition-opacity duration-200 group-hover:opacity-100 md:block",
          )}
        >
          {ASSISTANT_BRAND.latin} · {ASSISTANT_BRAND.tagline.en}
        </span>
      </button>
    </div>
  );
}

export default AssistantLauncher;
