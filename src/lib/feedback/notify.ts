/**
 * The shared feedback system — one store, one set of rules, one call site API.
 *
 * WHY THIS EXISTS
 * Feedback used to be 674 `toast.*` calls across 130 files, each inventing its
 * own wording, its own duration and its own idea of what counts as important.
 * The result was a user who could not tell a routine save from a failed
 * transaction, because every message had the same weight and none of them
 * carried the detail that would tell them what actually happened.
 *
 * The rules this module enforces, once, for the whole app:
 *
 *  - SERVER-CONFIRMED ONLY. Nothing here reaches the screen optimistically. The
 *    caller decides when the server has committed; `notify` never guesses. This
 *    is why `notify.promise` takes the promise rather than the caller firing a
 *    "working…" toast and a second one on success.
 *  - IDENTICAL MESSAGES NEVER STACK. A double-clicked button, a re-render that
 *    re-runs an effect, or React Strict Mode's double invocation would
 *    otherwise put three copies of the same sentence on screen.
 *  - WEIGHT IS VISIBLE IN TIME. Every variant clears itself, but not in the same
 *    time: a routine save is gone in four seconds, a failure takes seven. The
 *    gap is the weighting. Nothing pins indefinitely — a toast that never
 *    leaves is a dialog nobody chose to open, and a stack of them buries the
 *    work the user was actually doing.
 *  - AT MOST THREE. More than that is a queue of failures the user has stopped
 *    reading; the oldest is dropped rather than the newest.
 *
 * The store is deliberately framework-free and holds no React state, so it can
 * be called from an event handler, a service worker callback or a test, and so
 * a re-render is never the reason a toast appears.
 */

import { t } from "@/lib/i18n";
import { feedbackMessage, type FeedbackOperation } from "./messages";

/** How a message reads, and therefore how it behaves and looks. */
export type FeedbackVariant =
  "success" | "error" | "warning" | "info" | "loading";

/** Short factual line under the description: a reference, an actor, a date. */
export type FeedbackMeta = string[];

export interface FeedbackAction {
  /** i18n-resolved by the caller before it gets here. */
  label: string;
  onClick: () => void;
  /** Renders as a link when present; the handler still runs. */
  href?: string;
}

export interface FeedbackInput {
  /** Bold headline. Short enough to read in one glance. */
  title: string;
  /** One line carrying the detail the headline cannot hold. */
  description?: string;
  /** Reference / actor / timestamp facts, rendered as a quiet footer row. */
  meta?: FeedbackMeta;
  action?: FeedbackAction;
  /**
   * Overrides the auto-dismiss delay. `Infinity` pins the toast until it is
   * dismissed — reserve it for a loading state that has no outcome yet, never
   * for a message the user simply has not got to yet.
   */
  duration?: number;
  /**
   * Distinguishes two legitimately identical messages.
   *
   * Deduplication keys on variant + title + description, so a page that creates
   * two different assets both titled "Kit created" would collapse into one. Pass
   * anything that varies — an asset tag, an employee number — and both survive.
   */
  dedupeKey?: string;
}

export interface FeedbackToast extends FeedbackInput {
  id: string;
  variant: FeedbackVariant;
  /** Epoch ms the toast was first shown, for the meta row. */
  createdAt: number;
}

/** Shorthand: every method also accepts a bare string as the title. */
export type FeedbackArgs = string | FeedbackInput;

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

/**
 * How long each weight is allowed to stay on screen.
 *
 * Four seconds is enough to read one headline and its detail line, and short
 * enough that a burst of successes does not become a wall. Failures and
 * warnings earn roughly double — the user did not ask for them, so they get
 * the longer read — but they are still finite: a card that never leaves the
 * screen centre is a modal in disguise, and it does not block input, so
 * nothing is gained by pinning it. Hovering or tabbing into a card pauses the
 * countdown, so the long tail costs nothing to a user who is reading.
 */
export const FEEDBACK_DURATIONS: Record<FeedbackVariant, number> = {
  success: 4000,
  info: 4500,
  loading: Infinity,
  warning: 6500,
  error: 7000,
};

/** Oldest toasts past this are dropped rather than queued. */
export const FEEDBACK_MAX_VISIBLE = 3;

const listeners = new Set<() => void>();

/** Newest last. The array identity is the store's snapshot — see `subscribe`. */
let toasts: FeedbackToast[] = [];

/** Per-toast timer bookkeeping. Kept out of the snapshot so ticks never re-render. */
interface TimerState {
  /** Milliseconds still to run. */
  remaining: number;
  /** Wall-clock ms at which the toast expires, or null while paused. */
  expiresAt: number | null;
  handle: ReturnType<typeof setTimeout> | null;
}

const timers = new Map<string, TimerState>();

let counter = 0;
function nextId(): string {
  counter += 1;
  return `fb-${counter}`;
}

// ---------------------------------------------------------------------------
// Snapshot / subscription
// ---------------------------------------------------------------------------

/**
 * Subscribe to the toast list.
 *
 * The snapshot is the array itself and is replaced (never mutated) on every
 * change, so `useSyncExternalStore` sees a new reference exactly when something
 * happened. Nothing else in this module mutates it.
 */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): FeedbackToast[] {
  return toasts;
}

/** The current list, for imperative callers outside React. */
export function list(): FeedbackToast[] {
  return toasts;
}

function emit(): void {
  for (const listener of listeners) listener();
}

function resolve(args: FeedbackArgs): FeedbackInput {
  return typeof args === "string" ? { title: args } : args;
}

// ---------------------------------------------------------------------------
// Timers
// ---------------------------------------------------------------------------

function clearHandle(id: string): void {
  const state = timers.get(id);
  if (state?.handle) clearTimeout(state.handle);
}

function arm(id: string, ms: number): void {
  const state = timers.get(id);
  if (!state) return;
  clearHandle(id);
  state.remaining = ms;
  if (!Number.isFinite(ms) || ms <= 0) return;
  state.expiresAt = Date.now() + ms;
  state.handle = setTimeout(() => {
    timers.delete(id);
    dismiss(id);
  }, ms);
}

/**
 * Remaining lifetime, 0–1, read by the progress bar.
 *
 * Deliberately imperative and outside the snapshot: the bar animates every
 * frame, and routing that through React state would re-render the whole toast
 * list sixty times a second to move two hundred pixels.
 */
export function getProgress(id: string): number {
  const state = timers.get(id);
  const toast = toasts.find((t) => t.id === id);
  if (!state || !toast) return 0;
  if (state.expiresAt === null) return 0;
  const total = toast.duration ?? FEEDBACK_DURATIONS[toast.variant];
  if (!Number.isFinite(total) || total <= 0) return 0;
  const left = Math.max(0, state.expiresAt - Date.now());
  return Math.min(1, left / total);
}

/** Freeze a toast's countdown — the user is reading it. */
export function pause(id: string): void {
  const state = timers.get(id);
  if (!state || state.expiresAt === null) return;
  state.remaining = Math.max(0, state.expiresAt - Date.now());
  state.expiresAt = null;
  clearHandle(id);
}

/** Resume a paused countdown with the time it had left. */
export function resume(id: string): void {
  const state = timers.get(id);
  if (!state) return;
  arm(id, state.remaining);
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

/**
 * Identity for "the same message".
 *
 * Title plus description is the pair a reader actually perceives, so two
 * toasts agreeing on both are indistinguishable to them. `dedupeKey` lets a
 * caller say they are not.
 */
function dedupeKeyOf(variant: FeedbackVariant, input: FeedbackInput): string {
  return `${variant} ${input.dedupeKey ?? ""} ${input.title} ${
    input.description ?? ""
  }`;
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

function push(variant: FeedbackVariant, args: FeedbackArgs): string {
  const input = resolve(args);

  // Dedupe BEFORE adding: a repeat should not consume a slot in a stack of
  // three, and it should not restart the clock on a message already on screen.
  const key = dedupeKeyOf(variant, input);
  const existing = toasts.find((t) => dedupeKeyOf(t.variant, t) === key);
  if (existing) return existing.id;

  const duration = input.duration ?? FEEDBACK_DURATIONS[variant];
  const toast: FeedbackToast = {
    ...input,
    id: nextId(),
    variant,
    createdAt: Date.now(),
  };

  const next = [...toasts, toast];
  // Oldest first out: a queue of failures is not a feature.
  while (next.length > FEEDBACK_MAX_VISIBLE) {
    const dropped = next.shift();
    if (dropped) {
      clearHandle(dropped.id);
      timers.delete(dropped.id);
    }
  }
  toasts = next;

  timers.set(toast.id, { remaining: duration, expiresAt: null, handle: null });
  arm(toast.id, duration);

  emit();
  return toast.id;
}

/**
 * Replace a toast in place.
 *
 * Used by `notify.promise` to turn the "working…" toast into its outcome, which
 * is the whole reason loading toasts exist: the user watches one card change
 * rather than seeing a card vanish and another appear.
 */
function patch(
  id: string,
  args: FeedbackArgs,
  variant: FeedbackVariant,
): string {
  const index = toasts.findIndex((t) => t.id === id);
  if (index === -1) return push(variant, args);

  const input = resolve(args);
  const duration = input.duration ?? FEEDBACK_DURATIONS[variant];
  const next = [...toasts];
  next[index] = { ...next[index], ...input, variant };
  toasts = next;

  // A new outcome is a new countdown, and it must not inherit a pause the user
  // applied while the operation was still running.
  timers.set(id, { remaining: duration, expiresAt: null, handle: null });
  arm(id, duration);

  emit();
  return id;
}

function dismiss(id: string): void {
  clearHandle(id);
  timers.delete(id);
  if (!toasts.some((t) => t.id === id)) return;
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function dismissAll(): void {
  for (const id of [...timers.keys()]) clearHandle(id);
  timers.clear();
  if (toasts.length === 0) return;
  toasts = [];
  emit();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PromiseFeedback<T> {
  /** Shown while the promise is pending. Return a string for a custom title. */
  loading: string | FeedbackInput;
  /** Shown on resolve. Receives the resolved value. */
  success: string | FeedbackInput | ((value: T) => string | FeedbackInput);
  /** Shown on reject. Receives the rejection reason. */
  error: string | FeedbackInput | ((reason: unknown) => string | FeedbackInput);
  /** Run after a successful resolve, before the toast is written. */
  onSuccess?: (value: T) => void;
  /** Run after a rejection, before the toast is written. */
  onError?: (reason: unknown) => void;
}

function resolveBranch<T>(
  branch: string | FeedbackInput | ((value: T) => string | FeedbackInput),
  value: T,
): FeedbackInput {
  return resolve(typeof branch === "function" ? branch(value) : branch);
}

export const notify = {
  /** A committed change. Clears itself in four seconds. */
  success(args: FeedbackArgs): string {
    return push("success", args);
  },

  /** Something did not happen. Outlives a success, then leaves on its own. */
  error(args: FeedbackArgs): string {
    return push("error", args);
  },

  /** It happened, but not entirely. Outlives a success, then leaves. */
  warning(args: FeedbackArgs): string {
    return push("warning", args);
  },

  /** Context the user asked for. Clears itself. */
  info(args: FeedbackArgs): string {
    return push("info", args);
  },

  /**
   * An operation is in flight. Never clears itself — `notify.promise` turns
   * this same card into its outcome, and a spinner that vanished mid-request
   * would be worse than one that lingers.
   */
  loading(args: FeedbackArgs): string {
    return push("loading", args);
  },

  /** Rewrite a toast already on screen. */
  update(id: string, args: FeedbackArgs, variant?: FeedbackVariant): string {
    const existing = toasts.find((t) => t.id === id);
    return patch(id, args, variant ?? existing?.variant ?? "info");
  },

  dismiss,
  clear: dismissAll,

  /**
   * Bind one toast's whole life to one promise.
   *
   * The success toast is written only after the promise resolves, which is what
   * makes "server-confirmed only" structural rather than a discipline: there is
   * no code path here that can report a success the server did not grant.
   */
  async promise<T>(
    promise: Promise<T>,
    handlers: PromiseFeedback<T>,
  ): Promise<T> {
    const id = notify.loading(handlers.loading);
    try {
      const value = await promise;
      handlers.onSuccess?.(value);
      patch(id, resolveBranch(handlers.success, value), "success");
      return value;
    } catch (reason) {
      handlers.onError?.(reason);
      patch(id, resolveBranch(handlers.error, reason), "error");
      throw reason;
    }
  },

  /**
   * Raise a catalog operation.
   *
   * The page supplies only what it knows — the entity, the person, the numbers —
   * and the catalog supplies the sentence, the icon and the weight, in whatever
   * language the user is reading. This is how a call site avoids hardcoding
   * text without every page inventing its own phrasing.
   */
  operation(
    operation: FeedbackOperation,
    params?: {
      /** Interpolation for the catalog's description template. */
      values?: Record<string, string>;
      /** Override the catalog title when the sentence must name the subject. */
      title?: string;
      description?: string;
      meta?: FeedbackMeta;
      action?: FeedbackAction;
      duration?: number;
      dedupeKey?: string;
    },
  ): string {
    const spec = feedbackMessage(operation);
    const { values = {}, title, description, ...rest } = params ?? {};
    return push(spec.variant, {
      title: title ?? t(spec.titleKey, values),
      description:
        description ??
        (spec.descriptionKey ? t(spec.descriptionKey, values) : undefined),
      ...rest,
    });
  },
};
