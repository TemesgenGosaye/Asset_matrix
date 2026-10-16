"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { AlertTriangle, Info, Loader2, X } from "lucide-react";

import { useT } from "@/lib/i18n/react";
import {
  getProgress,
  getSnapshot,
  list,
  notify,
  pause,
  resume,
  subscribe,
  type FeedbackToast,
  type FeedbackVariant,
} from "@/lib/feedback/notify";

// ---------------------------------------------------------------------------
// SVG animated icons
// ---------------------------------------------------------------------------

/**
 * Success: a check mark that draws itself.
 *
 * The stroke is revealed by animating `stroke-dashoffset` down to zero, so the
 * line appears to be laid down by a pen rather than appearing all at once —
 * the same technique Lottie, Motion and every native platform uses for a
 * confirmation tick.
 *
 * `pathLength="1"` normalises the path to a length of exactly 1 unit, which is
 * what lets the dash maths in CSS be a pair of literal 1s. Without it the
 * lengths have to be the path's real measurement, and a stroke-dasharray
 * longer than the path makes the dash offset swallow the whole glyph: the
 * check silently renders as nothing.
 */
function AnimatedCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-11 w-11">
      <path
        d="M5 12.5l4.75 4.75L19 7"
        pathLength={1}
        stroke="white"
        strokeWidth={2.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="toast-check-path"
      />
    </svg>
  );
}

/**
 * Error: an × whose two strokes draw simultaneously, landing just after the
 * badge's shake has begun so the card reads as one event rather than two.
 *
 * Normalised the same way as the check.
 */
function AnimatedX() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-11 w-11">
      <path
        d="M7.5 7.5l9 9"
        pathLength={1}
        stroke="white"
        strokeWidth={2.75}
        strokeLinecap="round"
        className="toast-x-path"
      />
      <path
        d="M16.5 7.5l-9 9"
        pathLength={1}
        stroke="white"
        strokeWidth={2.75}
        strokeLinecap="round"
        className="toast-x-path"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Per-variant wiring
//
// Colours, gradients and motion all live in globals.css (`.toast-badge-*`,
// `.toast-badge-*`, `.toast-badge-anim-*`). This module only decides which
// variant gets which class, so a design change never needs a component change.
// ---------------------------------------------------------------------------

/** Icon badge. Carries the variant's hue. */
const BADGE: Record<FeedbackVariant, string> = {
  success: "toast-badge-success",
  error: "toast-badge-error",
  warning: "toast-badge-warning",
  info: "toast-badge-info",
  loading: "toast-badge-loading",
};

/** Badge entrance (spring-in, plus a shake for failures). */
const BADGE_ANIM: Record<FeedbackVariant, string> = {
  success: "toast-badge-anim-success",
  error: "toast-badge-anim-error",
  warning: "toast-badge-anim-warning",
  info: "toast-badge-anim-info",
  loading: "",
};

/** Expanding halo behind the badge. Supplies the ripple's colour. */
const RIPPLE: Record<FeedbackVariant, string> = {
  success: "toast-ripple-success",
  error: "toast-ripple-error",
  warning: "toast-ripple-warning",
  info: "toast-ripple-info",
  loading: "toast-ripple-loading",
};

/** Countdown bar at the foot of the card. */
const PROGRESS: Record<FeedbackVariant, string> = {
  success: "toast-progress-success",
  error: "toast-progress-error",
  warning: "toast-progress-warning",
  info: "toast-progress-info",
  loading: "toast-progress-loading",
};

/** Screen-reader weight label spoken before the title. */
const WEIGHT_KEY: Record<FeedbackVariant, string> = {
  success: "feedback.weight.success",
  error: "feedback.weight.error",
  warning: "feedback.weight.warning",
  info: "feedback.weight.info",
  loading: "feedback.weight.loading",
};

/**
 * How long a dismissed card is kept in the DOM for its exit animation.
 * Must match `toast-out` in globals.css — the card is removed the instant the
 * animation ends, so this is the only thing keeping a reflow from clipping it.
 */
const EXIT_MS = 200;

// ---------------------------------------------------------------------------
// Countdown bar
// ---------------------------------------------------------------------------

/**
 * A hairline that drains as the toast's timer runs down.
 *
 * Driven imperatively from `requestAnimationFrame` rather than through React
 * state: it moves on every frame, and routing that through the store would
 * re-render the whole stack sixty times a second to shift two pixels. The
 * transform is written straight to the node instead.
 */
function ToastProgress({
  id,
  variant,
}: {
  id: string;
  variant: FeedbackVariant;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      const value = getProgress(id);
      // A paused or pinned toast reports 0 and the loop stops; a reduced-motion
      // user gets four updates a second, which is enough to read as draining.
      if (reduced && now - last < 250) return;
      last = now;
      node.style.transform = `scaleX(${value})`;
      if (value > 0) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [id]);

  return (
    <span
      ref={ref}
      aria-hidden
      className={`absolute inset-x-0 bottom-0 h-[3px] origin-left ${PROGRESS[variant]}`}
      style={{ transform: "scaleX(1)" }}
    />
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

interface ToastCardProps {
  toast: FeedbackToast;
  exiting: boolean;
  onDismiss: (id: string) => void;
}

function ToastCard({ toast, exiting, onDismiss }: ToastCardProps) {
  const t = useT();
  const variant = toast.variant;
  const hasDetail = Boolean(toast.description);
  const meta = toast.meta ?? [];

  const dismiss = useCallback(() => onDismiss(toast.id), [onDismiss, toast.id]);

  const action = toast.action;
  const actionClass =
    "inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--fb-foreground))] px-5 py-2.5 text-[13px] font-semibold text-[hsl(var(--fb-surface))] transition-transform duration-150 hover:scale-[1.03] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--fb-muted))]";

  return (
    <div
      data-feedback-variant={variant}
      role={variant === "error" ? "alert" : "status"}
      aria-live={variant === "error" ? "assertive" : "polite"}
      className={[
        // `fb-card` is the theme-aware surface; `fb-square` locks width and
        // height to the same value, so the card is a true square whatever the
        // message length.
        "fb-card fb-square pointer-events-auto relative flex flex-col items-center justify-center gap-6 overflow-hidden rounded-[28px] px-7 py-10 text-center backdrop-blur-2xl",
        exiting ? "toast-exit" : "toast-enter",
      ].join(" ")}
      /* Hover or keyboard focus means the user is reading — hold the countdown
         so the tail of the duration is never spent on someone mid-sentence. */
      onMouseEnter={() => pause(toast.id)}
      onMouseLeave={() => resume(toast.id)}
      onFocusCapture={() => pause(toast.id)}
      onBlurCapture={() => resume(toast.id)}
    >
      {/* ── Icon: the focal point of the card ─────────────────────────── */}
      <span className="relative flex h-20 w-20 shrink-0 items-center justify-center">
        {/* Ripple. A sibling of the badge rather than part of it, because the
            badge animates its own box-shadow and two animations writing the
            same property would overwrite one another. */}
        <span
          aria-hidden
          className={`toast-ripple absolute inset-0 rounded-full ${RIPPLE[variant]}`}
          style={{ boxShadow: "0 0 0 2px rgb(var(--ripple) / 0.5)" }}
        />
        <span
          aria-hidden
          className={[
            "toast-badge relative flex h-20 w-20 items-center justify-center rounded-full",
            BADGE[variant],
            BADGE_ANIM[variant],
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {variant === "success" && <AnimatedCheck />}
          {variant === "error" && <AnimatedX />}
          {variant === "warning" && (
            <AlertTriangle className="h-10 w-10 text-white" strokeWidth={2} />
          )}
          {variant === "info" && (
            <Info className="h-10 w-10 text-white" strokeWidth={2} />
          )}
          {variant === "loading" && (
            <Loader2
              className="h-10 w-10 animate-spin text-white"
              strokeWidth={2}
            />
          )}
        </span>
      </span>

      {/* ── Message ───────────────────────────────────────────────────── */}
      <div className="flex w-full min-w-0 flex-col items-center gap-2">
        <p className="text-[17px] leading-snug font-semibold tracking-[-0.01em] text-balance text-[hsl(var(--fb-foreground))]">
          {/* The badge is decorative, so screen readers get the weight as a
              word instead: "Error: Failed to save". */}
          <span className="sr-only">{t(WEIGHT_KEY[variant])}: </span>
          {toast.title}
        </p>

        {hasDetail ? (
          <p className="text-[14px] leading-relaxed text-balance text-[hsl(var(--fb-muted))]">
            {toast.description}
          </p>
        ) : null}

        {meta.length > 0 ? (
          <p className="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[12px] text-[hsl(var(--fb-faint))]">
            {meta.map((entry, i) => (
              <React.Fragment key={`${entry}-${i}`}>
                {i > 0 ? (
                  <span aria-hidden className="opacity-40">
                    ·
                  </span>
                ) : null}
                <span className="font-mono">{entry}</span>
              </React.Fragment>
            ))}
          </p>
        ) : null}

        {action ? (
          <div className="mt-3">
            {action.href ? (
              <Link
                href={action.href}
                onClick={() => {
                  action.onClick();
                  dismiss();
                }}
                className={actionClass}
              >
                {action.label}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => {
                  action.onClick();
                  dismiss();
                }}
                className={actionClass}
              >
                {action.label}
              </button>
            )}
          </div>
        ) : null}
      </div>

      {/* Dismiss. A 40px target with a resting background rather than a
          hover-only one: there is no hover on the device most of this is read
          on, so a control that only appears on hover does not exist. */}
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("feedback.dismissLabel")}
        className="absolute top-3 right-3 flex h-10 w-10 items-center justify-center rounded-full text-[hsl(var(--fb-faint))] transition-colors duration-150 hover:bg-[hsl(var(--fb-hover))] hover:text-[hsl(var(--fb-foreground))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--fb-muted))] focus-visible:outline-none"
      >
        <X className="h-5 w-5" strokeWidth={2.25} />
      </button>

      <ToastProgress id={toast.id} variant={variant} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Viewport
// ---------------------------------------------------------------------------

interface RenderedSlot {
  toast: FeedbackToast;
  exiting: boolean;
}

/**
 * The single feedback surface for the whole app.
 *
 * Every `notify.*` call renders here, which is what makes position, weight,
 * animation and dismissal identical everywhere: there is nowhere else for a
 * toast to come from.
 */
export default function FeedbackProvider() {
  const t = useT();
  const storeToasts = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const [slots, setSlots] = useState<RenderedSlot[]>([]);
  const [seenToasts, setSeenToasts] = useState(storeToasts);
  const exitTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  /**
   * Store → rendered slots, reconciled during render rather than in an effect.
   *
   * The store's array identity changes exactly when a toast is added or
   * dropped, so comparing it against the last one seen is a complete signal —
   * and reconciling here rather than in an effect keeps the two in the same
   * commit, so a new toast is never painted once without its card.
   *
   * A toast the store has dropped becomes `exiting` instead of vanishing, which
   * is what gives it the chance to finish its animation; one the store has
   * gained is appended.
   */
  if (storeToasts !== seenToasts) {
    setSeenToasts(storeToasts);
    setSlots((prev) => {
      const storeIds = new Set(storeToasts.map((toast) => toast.id));
      const next = prev.map((slot) =>
        !storeIds.has(slot.toast.id) && !slot.exiting
          ? { ...slot, exiting: true }
          : slot,
      );
      const localIds = new Set(next.map((slot) => slot.toast.id));
      for (const toast of storeToasts) {
        if (!localIds.has(toast.id)) next.push({ toast, exiting: false });
      }
      return next;
    });
  }

  // Remove each exiting card once its exit animation has run its course.
  useEffect(() => {
    for (const slot of slots) {
      if (slot.exiting && !exitTimers.current.has(slot.toast.id)) {
        const id = slot.toast.id;
        const timer = setTimeout(() => {
          exitTimers.current.delete(id);
          setSlots((prev) => prev.filter((s) => s.toast.id !== id));
        }, EXIT_MS);
        exitTimers.current.set(id, timer);
      }
    }
  }, [slots]);

  useEffect(() => {
    const pending = exitTimers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
    };
  }, []);

  /**
   * Dismiss: play the exit, then drop it from the store.
   *
   * The removal is deliberately deferred rather than immediate — removing at
   * once would cut the animation off mid-flight, which reads as a glitch
   * rather than a dismissal.
   */
  const handleDismiss = useCallback((id: string) => {
    setSlots((prev) =>
      prev.map((slot) =>
        slot.toast.id === id ? { ...slot, exiting: true } : slot,
      ),
    );
    setTimeout(() => notify.dismiss(id), EXIT_MS);
  }, []);

  // Escape dismisses the newest card, matching the order they are read in.
  useEffect(() => {
    if (slots.length === 0) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const visible = list();
      const newest = visible[visible.length - 1];
      if (!newest) return;
      event.stopPropagation();
      handleDismiss(newest.id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [slots.length, handleDismiss]);

  if (slots.length === 0) return null;

  return (
    /**
     * Full-viewport overlay, centred on both axes.
     *
     * `pointer-events-none` is what keeps a toast from blocking the page: every
     * click, scroll and keystroke falls through to the app underneath. Only the
     * cards themselves opt back in, so their action and dismiss buttons work
     * while the rest of the screen stays live.
     */
    <div
      aria-label={t("feedback.regionLabel")}
      className="pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center px-5"
    >
      <div className="flex flex-col items-center gap-5">
        {slots.map(({ toast, exiting }) => (
          <ToastCard
            key={toast.id}
            toast={toast}
            exiting={exiting}
            onDismiss={handleDismiss}
          />
        ))}
      </div>
    </div>
  );
}
