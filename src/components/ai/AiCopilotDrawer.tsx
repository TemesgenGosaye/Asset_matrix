"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  X,
  Send,
  Trash2,
  User,
  Square,
  Sparkles,
  AlertCircle,
  Loader2,
  Building2,
  Clock,
  Laptop,
  ClipboardList,
  HelpCircle,
  Languages,
  Copy,
  Check,
  RotateCw,
  ArrowUpRight,
  ArrowDown,
  Cpu,
  Cloud,
  ChevronDown,
  Monitor,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AssistantCard } from "./AssistantCard";
import { ProviderStatus } from "./ProviderStatus";
import {
  ASSISTANT_BRAND,
  QUICK_ACTIONS,
  quickActionText,
  type QuickAction,
} from "@/lib/ai/brand";
import {
  FrameDecoder,
  type AssistantFrame,
  type AssistantMeta,
  type AssistantProviderKind,
  type FastCard,
} from "@/lib/ai/protocol";
import { describeScreen } from "@/lib/ai/screen";
import { ASK_ASSISTANT_EVENT, TOGGLE_ASSISTANT_EVENT } from "@/lib/ai/events";
import { publishAssistantOpen } from "@/lib/ai/assistant-state";
import { localizeSuggestions, type Suggestion } from "@/lib/ai/suggestions";
import {
  clearConversation,
  loadConversation,
  loadLocale,
  saveConversation,
  saveLocale,
  type PersistedTurn,
} from "@/lib/ai/conversation";
import { cn } from "@/lib/utils";

/**
 * Meri — the portal's system-support assistant.
 *
 * The one rule this component exists to enforce: *the indicator must be earned*.
 * A question that resolves to a prepared aggregate renders as a data card with no
 * thinking state at all, because there is nothing to wait for. Only the
 * reasoning lane — open-ended questions that genuinely need the model and its
 * tools — is allowed to show a pulse, and while it does, it says which model is
 * answering and which tool it is reaching for. A wait that names its work is a
 * wait; a wait that says "Searching portal records & reasoning..." is a stall.
 *
 * Beyond that, four things carry most of the experience:
 *
 *  - **Memory.** The transcript is persisted per user, so the drawer is a
 *    conversation rather than a series of unrelated prompts, and coming back to
 *    a half-finished enquiry does not cost a re-explanation.
 *  - **Grounding.** Every question carries the screen it came from, so "why is
 *    this empty" is answerable and "this one" has an antecedent.
 *  - **Continuity.** Each answer offers the questions worth asking next, derived
 *    from the tools that produced it — no model call, so they cost nothing.
 *  - **Agency.** Copy, retry, stop, and clear are all present, because an
 *    assistant that cannot be corrected is worse than no assistant.
 */

type Locale = "en" | "am";

interface Turn extends PersistedTurn {
  /** True while this turn is receiving frames. */
  streaming?: boolean;
  /** Set between submit and the first frame. */
  awaitingLane?: boolean;
  /** Wall-clock ms once the turn finishes. */
  elapsedMs?: number;
  retryable?: boolean;
  /**
   * Id of the user turn this answers. Lets a retry remove the question it is
   * replacing instead of leaving a duplicate in the transcript.
   */
  questionId?: string;
}

const TONE_ICON = {
  housing: Building2,
  queue: Clock,
  assets: Laptop,
  support: HelpCircle,
} as const;

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function AiCopilotDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [locale, setLocale] = useState<Locale>("en");
  /** True until the first frame of a turn arrives, so we know the lane. */
  const [awaitingLane, setAwaitingLane] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** Id of the turn currently receiving frames, so only it shows a pulse. */
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const pathname = usePathname();

  /**
   * The question the user is looking at when they ask. Recomputed per turn
   * rather than per render so a route change mid-answer cannot relabel it.
   */
  const screen = useMemo(() => describeScreen(pathname), [pathname]);

  // Restore preferences and the previous conversation once on mount. The read
  // is deferred out of the effect body: localStorage is not available during
  // SSR, and setting state synchronously in an effect cascades a render on
  // every mount.
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setLocale(loadLocale());
      setTurns(loadConversation(currentUserId()));
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveConversation(currentUserId(), turns);
  }, [turns, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveLocale(locale);
  }, [locale, hydrated]);

  const [atBottom, setAtBottom] = useState(true);
  // Mirrored in a ref so the auto-scroll effect can read it without taking a
  // dependency on state, which would re-run the effect on every scroll tick.
  const atBottomRef = useRef(true);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      atBottomRef.current = true;
    }
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
    atBottomRef.current = pinned;
    setAtBottom(pinned);
  }, []);

  // Let the floating launcher know we are open so it can get out of the way.
  // Writing to an external store is what effects are for, so this needs no
  // special handling.
  useEffect(() => {
    publishAssistantOpen(isOpen);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    // Respect a user who has scrolled up to read an earlier answer: yanking them
    // back to the bottom on every token would make that impossible.
    if (atBottomRef.current) scrollToBottom("auto");
    else inputRef.current?.focus();
  }, [isOpen, turns, scrollToBottom]);

  // Close + toggle affordances
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      } else if (e.key === "Escape" && isOpen) {
        // Escape closes the drawer, but never while a turn is mid-flight —
        // losing a streaming answer to a stray keypress is unacceptable.
        if (!isBusy) setIsOpen(false);
      }
    };
    const onToggle = () => setIsOpen((prev) => !prev);
    const onAsk = (event: Event) => {
      const question = (event as CustomEvent<string>).detail;
      setIsOpen(true);
      if (question) {
        // Let the open transition start before the request fires, so the drawer
        // is already on screen when the meta frame arrives.
        window.setTimeout(() => void askRef.current?.(question), 60);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(TOGGLE_ASSISTANT_EVENT, onToggle);
    window.addEventListener(ASK_ASSISTANT_EVENT, onAsk);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(TOGGLE_ASSISTANT_EVENT, onToggle);
      window.removeEventListener(ASK_ASSISTANT_EVENT, onAsk);
    };
  }, [isOpen, isBusy]);

  // Abort any in-flight turn if the drawer unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  const patchTurn = useCallback((id: string, patch: Partial<Turn>) => {
    setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const ask = useCallback(
    async (raw: string, retryOf?: Turn) => {
      const question = raw.trim();
      if (!question || isBusy) return;

      setErrorMessage(null);
      setInput("");

      // A retry reuses the original question and drops both the failed
      // assistant turn and the question it answered, rather than appending a
      // second copy of either.
      const userTurn: Turn = { id: uid(), role: "user", question };
      const replyId = retryOf ? retryOf.id : uid();
      // The reply carries its own question so the footer can offer "retry"
      // without having to find the preceding user turn, and remembers which
      // user turn it belongs to so a retry can remove that one too.
      const reply: Turn = {
        id: replyId,
        role: "assistant",
        question,
        questionId: userTurn.id,
        tools: [],
      };

      const base =
        retryOf && retryOf.questionId
          ? turns.filter(
              (t) => t.id !== retryOf.id && t.id !== retryOf.questionId,
            )
          : turns.filter((t) => t.id !== replyId);

      // Only completed, non-empty turns are replayed to the model. Fast-lane
      // cards are omitted deliberately: they are rendered records, and feeding
      // them back would teach the model to imitate a card format it should not
      // be producing.
      const history = [...base, userTurn]
        .filter((t) => t.role === "user" || (t.text && t.text.trim()))
        .map((t) => ({
          role: t.role,
          content: t.role === "user" ? (t.question ?? "") : (t.text ?? ""),
        }));

      setTurns((prev) => [
        ...prev.filter((t) => t.id !== replyId),
        userTurn,
        reply,
      ]);
      setIsBusy(true);
      setAwaitingLane(true);
      setActiveTurnId(replyId);
      scrollToBottom();

      const controller = new AbortController();
      abortRef.current = controller;
      const startedAt = Date.now();

      try {
        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history, context: screen }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          let detail = `The ${ASSISTANT_BRAND.latin} service did not respond.`;
          let code = "";
          try {
            const data = await response.json();
            if (data?.error) detail = data.error;
            if (data?.code) code = data.code;
          } catch {
            // Non-JSON error body — keep the generic message.
          }
          throw Object.assign(new Error(detail), {
            code,
            status: response.status,
          });
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const frames = new FrameDecoder();
        let streamed = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          for (const frame of frames.push(chunk)) {
            switch (frame.type) {
              case "meta":
                setAwaitingLane(false);
                patchTurn(replyId, {
                  meta: frame,
                  provider: frame.provider
                    ? {
                        id: frame.provider,
                        model: frame.model ?? "",
                        kind: frame.providerKind ?? "cloud",
                      }
                    : undefined,
                });
                break;
              case "provider":
                patchTurn(replyId, {
                  provider: {
                    id: frame.provider,
                    model: frame.model,
                    kind: frame.kind,
                  },
                });
                break;
              case "card":
                setAwaitingLane(false);
                patchTurn(replyId, { card: frame.card, streaming: false });
                break;
              case "text-delta":
                setAwaitingLane(false);
                streamed += frame.delta;
                patchTurn(replyId, { text: streamed, streaming: true });
                break;
              case "tool":
                setAwaitingLane(false);
                // Appended functionally: reading the tools off the `turns`
                // closure would see the state from before this turn, so the
                // second tool frame would overwrite the first.
                setTurns((prev) =>
                  prev.map((t) =>
                    t.id === replyId
                      ? { ...t, tools: [...(t.tools ?? []), frame.label] }
                      : t,
                  ),
                );
                break;
              case "sources":
                patchTurn(replyId, { sources: frame.sources });
                break;
              case "suggestions":
                patchTurn(replyId, { suggestions: frame.suggestions });
                break;
              case "usage":
                patchTurn(replyId, {
                  usage: {
                    inputTokens: frame.inputTokens,
                    outputTokens: frame.outputTokens,
                  },
                } as Partial<Turn>);
                break;
              case "error":
                patchTurn(replyId, {
                  error: frame.message,
                  retryable: frame.retryable,
                  streaming: false,
                });
                break;
              case "done":
                patchTurn(replyId, {
                  done: true,
                  streaming: false,
                  elapsedMs: Date.now() - startedAt,
                });
                break;
            }
          }
        }

        for (const frame of frames.flush()) {
          if (frame.type === "done") {
            patchTurn(replyId, {
              done: true,
              streaming: false,
              elapsedMs: Date.now() - startedAt,
            });
          }
          if (frame.type === "error") {
            patchTurn(replyId, { error: frame.message, retryable: true });
          }
        }

        // A turn that produced neither a card nor text means the lane produced
        // nothing usable. Say so rather than leaving an empty bubble.
        if (!streamed) {
          setTurns((prev) =>
            prev.map((t) =>
              t.id === replyId && !t.card && !t.error
                ? {
                    ...t,
                    streaming: false,
                    retryable: true,
                    error:
                      t.meta?.lane === "reasoning"
                        ? "The assistant returned an empty answer. Try rephrasing the question."
                        : "No answer was produced for that question.",
                  }
                : t,
            ),
          );
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          patchTurn(replyId, {
            done: true,
            streaming: false,
            elapsedMs: Date.now() - startedAt,
          });
          return;
        }
        const message =
          err instanceof Error ? err.message : "An unexpected error occurred.";
        // A 503 with no provider configured is a setup problem, not a
        // conversation problem: keep the question so it can be retried the
        // moment a model is available, rather than deleting the user's turn.
        const status = (err as { status?: number }).status;
        if (status === 503) {
          setTurns((prev) => prev.filter((t) => t.id !== replyId));
        } else {
          setTurns((prev) => prev.filter((t) => t.id !== replyId));
        }
        setErrorMessage(message);
      } finally {
        setAwaitingLane(false);
        setIsBusy(false);
        setActiveTurnId(null);
        abortRef.current = null;
      }
    },
    [isBusy, turns, patchTurn, scrollToBottom, screen],
  );

  // The global event handler needs a stable reference to `ask` without
  // re-registering listeners on every keystroke.
  const askRef = useRef(ask);
  askRef.current = ask;

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setIsBusy(false);
    setAwaitingLane(false);
    setActiveTurnId(null);
    // Finalise whatever turn was streaming, so its partial answer stays and its
    // indicator does not.
    setTurns((prev) =>
      prev.map((t) =>
        t.streaming
          ? { ...t, streaming: false, done: true, retryable: true }
          : t,
      ),
    );
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setTurns([]);
    setErrorMessage(null);
    setIsBusy(false);
    setAwaitingLane(false);
    setActiveTurnId(null);
    clearConversation(currentUserId());
    inputRef.current?.focus();
  }, []);

  const isEmpty = turns.length === 0;
  const transcriptQuestions = useMemo(
    () =>
      turns.flatMap((t) =>
        t.role === "user" && t.question ? [t.question] : [],
      ),
    [turns],
  );

  return (
    <>
      {isOpen && (
        <button
          type="button"
          aria-label={`Close ${ASSISTANT_BRAND.latin}`}
          onClick={() => !isBusy && setIsOpen(false)}
          className="fixed inset-0 z-50 cursor-default bg-black/40 backdrop-blur-[2px]"
        />
      )}

      <aside
        role="dialog"
        aria-modal={isOpen}
        aria-label={`${ASSISTANT_BRAND.lockup} — ${ASSISTANT_BRAND.scope.en}`}
        className={cn(
          "border-border bg-background fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l shadow-2xl transition-transform duration-300 ease-out sm:w-[620px] sm:max-w-full",
          isOpen ? "translate-x-0" : "pointer-events-none translate-x-full",
        )}
      >
        {/* ── Header ──
            Built from the same ingredients as the app's own chrome: a
            translucent `bg-background/95` bar over a `border-b border-border`,
            with an accent-tinted identity chip. The assistant should read as a
            panel of this system, not as a widget that arrived from elsewhere. */}
        <header className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 relative z-20 shrink-0 border-b backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div
                className="border-primary/40 bg-primary/10 relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border"
                title={ASSISTANT_BRAND.meaning[locale]}
              >
                <Sparkles className="text-primary h-5 w-5" />
                {isBusy && (
                  <span className="bg-primary ring-background absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 animate-pulse rounded-full ring-2" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-foreground truncate text-sm font-semibold tracking-tight">
                    {ASSISTANT_BRAND.name}
                  </h2>
                  <span className="bg-primary/15 text-primary shrink-0 rounded px-1.5 py-px font-mono text-[9px] font-medium tracking-[0.16em] uppercase">
                    {ASSISTANT_BRAND.latin}
                  </span>
                </div>
                <p className="text-muted-foreground truncate text-[11px] leading-tight">
                  {ASSISTANT_BRAND.scope[locale]}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-0.5">
              <ProviderStatus />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setLocale((l) => (l === "en" ? "am" : "en"))}
                className="text-muted-foreground hover:bg-primary/10 hover:text-primary h-8 w-8"
                title={locale === "en" ? "አማርኛ ገጽታ" : "English"}
                aria-label={
                  locale === "en" ? "Switch to Amharic" : "Switch to English"
                }
              >
                <Languages className="h-4 w-4" />
              </Button>
              {turns.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={clear}
                  disabled={isBusy}
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive h-8 w-8"
                  title="Clear conversation"
                  aria-label="Clear conversation"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="text-muted-foreground hover:bg-muted hover:text-foreground h-8 w-8"
                title="Close (Esc)"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Grounding strip — states the one thing a user must be able to trust
              before asking anything, and what screen the answer will be about. */}
          <div className="border-border/60 bg-muted/40 flex items-center justify-between gap-3 border-t px-4 py-1.5">
            <p className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-[11px]">
              <ShieldCheck className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span className="truncate">
                {locale === "am"
                  ? "ከድርጅትዎ መዝገብ ብቻ ይነበባል"
                  : "Reads only your organisation's records"}
              </span>
            </p>
            <p className="text-muted-foreground/80 hidden shrink-0 items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] uppercase sm:flex">
              <Monitor className="h-3 w-3" />
              {screen.label}
            </p>
          </div>
        </header>

        {/* ── Transcript ──
            `scroll-shadow` (defined in globals.css, previously unused) gives the
            top and bottom fades that tell the user there is more transcript in
            that direction — which matters most for the tall data cards. */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="scroll-shadow flex-1 space-y-5 overflow-y-auto px-4 py-5"
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
          >
            {isEmpty ? (
              <EmptyState locale={locale} onAsk={ask} />
            ) : (
              <>
                {turns.map((turn, i) => (
                  <TurnView
                    key={turn.id}
                    turn={turn}
                    first={i === 0}
                    busy={isBusy && turn.id === activeTurnId}
                    awaitingLane={awaitingLane && turn.id === activeTurnId}
                    locale={locale}
                    onAsk={ask}
                    onRetry={ask}
                  />
                ))}
                {/* Follow-ups for the newest answer, so the last thing on screen is
                    always a way forward rather than a dead end. */}
                {!isBusy && (
                  <FollowUps turns={turns} locale={locale} onAsk={ask} />
                )}
              </>
            )}

            {errorMessage && (
              <div
                role="alert"
                className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2.5 rounded-lg border p-3 text-xs"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <span className="block font-semibold">
                    {ASSISTANT_BRAND.latin} alert
                  </span>
                  <span>{errorMessage}</span>
                </div>
              </div>
            )}
          </div>

          {/* Appears only when the user has scrolled away from the newest turn. */}
          {!atBottom && !isEmpty && (
            <button
              type="button"
              onClick={() => scrollToBottom("smooth")}
              aria-label="Scroll to latest"
              className="border-border bg-popover text-muted-foreground hover:border-primary/50 hover:text-primary absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border p-1.5 shadow-md transition-colors"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* ── Composer ──
            The input sits inside its own bordered container rather than being
            a bare field, so the whole block reads as one control. Focus is
            signalled on the container with `focus-within`, which is what makes
            it feel composed instead of assembled. */}
        <div className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 shrink-0 border-t px-4 py-3 backdrop-blur-sm">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask(input);
            }}
          >
            <div className="border-input bg-card focus-within:border-primary/60 focus-within:ring-primary/15 flex items-end gap-2 rounded-xl border p-1.5 pl-3 shadow-[var(--shadow-sm)] transition-colors focus-within:ring-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  autoGrow(e.target);
                }}
                onKeyDown={(e) => {
                  // Enter sends; Shift+Enter is a newline. A question that needs
                  // two lines is normal — pasting a house number and a person's
                  // name should not require a single-line field.
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void ask(input);
                  }
                }}
                rows={1}
                placeholder={
                  locale === "am"
                    ? "ስለ ቤት፣ ሕብምብ ወይም ሰልፍ ይጠይቁ…"
                    : "Ask about houses, assets, or the queue…"
                }
                disabled={isBusy}
                aria-label={`Question for ${ASSISTANT_BRAND.latin}`}
                className="text-foreground placeholder:text-muted-foreground max-h-40 min-h-[38px] flex-1 resize-none bg-transparent py-2 text-[13px] leading-relaxed outline-none disabled:opacity-50"
              />
              {isBusy ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={stop}
                  className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive h-8 shrink-0 gap-1.5 rounded-lg px-2.5 text-xs"
                >
                  <Square className="h-3 w-3 fill-current" />
                  Stop
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  disabled={!input.trim()}
                  aria-label="Send question"
                  className="bg-primary text-primary-foreground hover:bg-primary h-8 w-8 shrink-0 rounded-lg shadow-sm"
                >
                  <Send className="h-4 w-4" />
                </Button>
              )}
            </div>
          </form>

          <div className="text-muted-foreground mt-2 flex items-center justify-between gap-3 px-1 text-[10px]">
            <span className="truncate">{ASSISTANT_BRAND.tagline[locale]}</span>
            <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
              <Kbd>Ctrl J</Kbd>
              <span>toggle</span>
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}

/* ──────────────────────────────── helpers ──────────────────────────────── */

/**
 * A stable per-browser identity for the conversation store.
 *
 * Deliberately not the user id: the drawer renders above the auth boundary and
 * must not depend on a session prop to persist a conversation. The server is
 * still the only thing that can read data — this key just stops two people
 * sharing a machine from seeing each other's questions.
 */
function currentUserId(): string {
  if (typeof window === "undefined") return "anonymous";
  const KEY = "meri:uid";
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing) return existing;
    const id = uid();
    window.localStorage.setItem(KEY, id);
    return id;
  } catch {
    return "anonymous";
  }
}

/** Grow a textarea to fit its content, up to the CSS max-height. */
function autoGrow(el: HTMLTextAreaElement): void {
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
}

function formatMs(ms?: number): string {
  if (typeof ms !== "number") return "";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
}

/* ────────────────────────────── empty state ────────────────────────────── */

/**
 * Openings, grouped by what they read.
 *
 * Seven flat buttons is a wall; four labelled groups is a table of contents. The
 * grouping is not cosmetic — it tells the user which half of the assistant to
 * expect, and the `instant` marker on the data groups is the honest version of
 * the same promise the header makes. Each group is a bordered panel with its own
 * header, which is the `RecentActivity` card pattern the rest of HAMS uses.
 */
const TONE_GROUPS: {
  tone: QuickAction["tone"];
  label: { en: string; am: string };
  /** True when every opening in the group resolves on the fast lane. */
  instant: boolean;
}[] = [
  {
    tone: "housing",
    label: { en: "Houses & occupancy", am: "ቤትና መኖሪያ" },
    instant: true,
  },
  {
    tone: "queue",
    label: { en: "Allocation queue", am: "የምደባ ሰልፍ" },
    instant: true,
  },
  {
    tone: "assets",
    label: { en: "Assets & licences", am: "ሕብምብና ፈቃድ" },
    instant: true,
  },
  {
    tone: "support",
    label: { en: "Anything else", am: "ሌላ ሁሉም" },
    instant: false,
  },
];

function EmptyState({
  locale,
  onAsk,
}: {
  locale: Locale;
  onAsk: (q: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-foreground text-base font-semibold tracking-tight">
          {locale === "am" ? "ምን ልታወቅኝ ይችላሉ?" : "What do you need to know?"}
        </h3>
        <p className="text-muted-foreground mt-1.5 text-[13px] leading-relaxed">
          {locale === "am"
            ? "ብዛታና ምልከታ ጥያቄዎች ወዲያውኑ ይመለሳሉ። ከዚያ በላይ ያለውን ጥያቄ በአንድ ምላሽ እንገብራለን።"
            : "Counts and lookups answer instantly from live records. Anything more involved, ask in plain language."}
        </p>
      </div>

      <div className="space-y-3">
        {TONE_GROUPS.map((group) => {
          const actions = QUICK_ACTIONS.filter((a) => a.tone === group.tone);
          if (actions.length === 0) return null;
          const Icon = TONE_ICON[group.tone];
          return (
            <section
              key={group.tone}
              className="border-border bg-card overflow-hidden rounded-xl border shadow-[var(--shadow-sm)]"
            >
              <div className="border-border/60 bg-muted/40 flex items-center gap-2 border-b px-3 py-2">
                <Icon className="text-primary h-3.5 w-3.5 shrink-0" />
                <h4 className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
                  {group.label[locale]}
                </h4>
                {group.instant && (
                  <span className="ml-auto inline-flex items-center gap-1 font-mono text-[9px] tracking-[0.14em] text-emerald-600 uppercase dark:text-emerald-400">
                    <Zap className="h-2.5 w-2.5" />
                    instant
                  </span>
                )}
              </div>
              <div className="divide-border/60 divide-y">
                {actions.map((action) => {
                  const { label, prompt } = quickActionText(action, locale);
                  return (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => onAsk(prompt)}
                      className="group hover:bg-primary/[0.06] flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="text-foreground block text-[13px] leading-tight font-medium">
                          {label}
                        </span>
                        <span className="text-muted-foreground mt-0.5 block truncate text-[11px]">
                          {prompt}
                        </span>
                      </span>
                      <ArrowUpRight className="text-muted-foreground/50 group-hover:text-primary h-3.5 w-3.5 shrink-0 transition-colors" />
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <p className="text-muted-foreground/80 flex items-start gap-2 px-1 text-[11px] leading-relaxed">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        {locale === "am"
          ? "ሁሉም መልስ ከድርጅትዎ መዝገብ ብቻ ይሰራል። ምንም ለውጥ ካለ፣ ከመረጃው በፊት ይጠይቅዎታል።"
          : "Every answer is drawn only from this organisation's records. Anything that would change a record is confirmed with you first."}
      </p>
    </div>
  );
}

/* ────────────────────────────── follow-ups ────────────────────────────── */

/**
 * Follow-up chips for the most recent answer.
 *
 * Attached to the last turn only. Chunks after every answer would multiply into
 * a wall of buttons and none of them would be read.
 */
function FollowUps({
  turns,
  locale,
  onAsk,
}: {
  turns: Turn[];
  locale: Locale;
  onAsk: (q: string) => void;
}) {
  const last = [...turns].reverse().find((t) => t.role === "assistant");
  const suggestions = localizeSuggestions(
    (last?.suggestions ?? []) as Suggestion[],
    locale,
  );
  if (suggestions.length === 0) return null;

  return (
    <div className="pl-9">
      <p className="text-muted-foreground/70 mb-1.5 font-mono text-[9px] tracking-[0.16em] uppercase">
        {locale === "am" ? "ቀጣይ" : "Next"}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s.prompt}
            type="button"
            onClick={() => onAsk(s.prompt)}
            className="group border-primary/30 bg-primary/[0.05] text-primary hover:border-primary/60 hover:bg-primary/15 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors"
          >
            {s.label}
            <ArrowUpRight className="h-3 w-3 opacity-50 transition-opacity group-hover:opacity-100" />
          </button>
        ))}
      </div>
    </div>
  );
}

/** Keyboard hint chip — the same treatment Navigation uses for its search kbd. */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="bg-muted text-muted-foreground inline-flex h-5 items-center gap-0.5 rounded border px-1.5 font-mono text-[10px] font-medium select-none">
      {children}
    </kbd>
  );
}

/* ──────────────────────────────── turn row ──────────────────────────────── */

function TurnView({
  turn,
  first,
  busy,
  awaitingLane,
  locale,
  onAsk,
  onRetry,
}: {
  turn: Turn;
  first: boolean;
  busy: boolean;
  awaitingLane: boolean;
  locale: Locale;
  onAsk: (q: string) => void;
  onRetry: (q: string, turn: Turn) => void;
}) {
  // A hairline between exchanges. It gives the transcript the rhythm of a
  // conversation instead of one undifferentiated column of blocks.
  const group = first ? "" : "turn-in border-t border-border/50 pt-5";

  if (turn.role === "user") {
    return (
      <div className={cn("flex justify-end gap-2.5", group)}>
        <div className="border-border/70 bg-secondary text-secondary-foreground max-w-[85%] rounded-xl rounded-br-md border px-3.5 py-2.5 text-[13px] leading-relaxed">
          <p className="whitespace-pre-wrap">{turn.question}</p>
        </div>
        <div className="border-border bg-muted text-muted-foreground mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border">
          <User className="h-3.5 w-3.5" />
        </div>
      </div>
    );
  }

  // Fast lane: a card is the answer. No bubble, no thinking state.
  if (turn.card) {
    return (
      <div className={cn("flex gap-2.5", group)}>
        <AssistantMark />
        <div className="min-w-0 flex-1 space-y-2">
          <AssistantCard
            card={turn.card as FastCard}
            ms={turn.meta?.ms}
            cached={turn.meta?.cached}
          />
          {!busy && <TurnFooter turn={turn} onRetry={onRetry} />}
        </div>
      </div>
    );
  }

  const showPulse = busy && (awaitingLane || !turn.text);
  const isStreaming = Boolean(turn.streaming);

  return (
    <div className={cn("flex gap-2.5", group)}>
      <AssistantMark />
      <div className="min-w-0 flex-1 space-y-2">
        {turn.error ? (
          <div
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg border p-3 text-xs"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <p>{turn.error}</p>
              {turn.retryable && turn.question && (
                <button
                  type="button"
                  onClick={() => onRetry(turn.question!, turn)}
                  className="border-destructive/40 hover:bg-destructive/15 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors"
                >
                  <RotateCw className="h-3 w-3" />
                  {locale === "am" ? "እንደገና ሞክር" : "Try again"}
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            {turn.text ? (
              <div className="assistant-prose border-border bg-card rounded-xl rounded-bl-md border px-3.5 py-3 shadow-[var(--shadow-sm)]">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {turn.text}
                </ReactMarkdown>
                {/* Streaming caret. A block cursor is the cheapest possible
                    signal that tokens are still arriving. */}
                {isStreaming && (
                  <span
                    aria-hidden
                    className="bg-primary ml-0.5 inline-block h-3 w-[2px] animate-pulse align-text-bottom"
                  />
                )}
              </div>
            ) : null}

            {/* Reasoning lane indicator — labelled with the work in progress. */}
            {showPulse && (
              <div className="border-primary/25 bg-primary/[0.05] text-muted-foreground flex items-center gap-2 rounded-xl rounded-bl-md border px-3.5 py-3 text-[13px]">
                {awaitingLane ? (
                  <Loader2 className="text-primary h-3.5 w-3.5 shrink-0 animate-spin" />
                ) : (
                  <span className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                    <span className="bg-primary/60 absolute h-3.5 w-3.5 animate-ping rounded-full" />
                    <span className="bg-primary relative h-1.5 w-1.5 rounded-full" />
                  </span>
                )}
                <span className="min-w-0 truncate">
                  {turn.tools?.length
                    ? turn.tools[turn.tools.length - 1]
                    : "Reading portal records"}
                  …
                </span>
              </div>
            )}

            {!busy && <TurnFooter turn={turn} onRetry={onRetry} />}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Per-answer metadata and actions.
 *
 * Tool activity collapses to a single line once the answer has arrived — during
 * the answer it is the progress indicator, afterwards it is provenance, and
 * provenance does not need three lines of screen space.
 */
function TurnFooter({
  turn,
  onRetry,
}: {
  turn: Turn;
  onRetry: (q: string, turn: Turn) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const hasTools = (turn.tools?.length ?? 0) > 0;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(turn.text ?? "");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked (insecure origin, denied permission). Not worth an
      // alert — the text is selectable in the transcript.
    }
  };

  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        {(hasExpandedRow(turn) || hasTools) && (
          <div className="border-border text-muted-foreground flex flex-wrap items-center gap-x-2.5 gap-y-1 border-l-2 pl-2.5 text-[10px]">
            {hasTools && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                className="hover:text-primary inline-flex items-center gap-1 transition-colors"
              >
                <ClipboardList className="h-3 w-3" />
                {turn.tools!.length === 1
                  ? turn.tools![0]
                  : `Read ${turn.tools!.length} sources`}
                <ChevronDown
                  className={cn(
                    "h-3 w-3 transition-transform",
                    expanded && "rotate-180",
                  )}
                />
              </button>
            )}
            <ProviderStamp turn={turn} />
            {typeof turn.elapsedMs === "number" && (
              <span className="font-mono tabular-nums">
                {formatMs(turn.elapsedMs)}
              </span>
            )}
            {turn.meta?.replayed && (
              <span className="text-primary inline-flex items-center gap-0.5">
                <Zap className="h-3 w-3" />
                remembered
              </span>
            )}
          </div>
        )}

        {expanded && hasTools && (
          <ul className="border-border bg-muted/30 text-muted-foreground ml-2.5 space-y-0.5 rounded-lg border px-3 py-2 text-[11px]">
            {turn.tools!.map((label, i) => (
              <li key={`${label}-${i}`} className="flex items-center gap-1.5">
                <Check className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                {label}
              </li>
            ))}
          </ul>
        )}

        {turn.sources && turn.sources.length > 0 && (
          <div className="ml-2.5 flex flex-wrap gap-1.5">
            {turn.sources.map((source) => (
              <a
                key={source.href}
                href={source.href}
                className="border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-primary inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] transition-colors"
              >
                {source.label}
                <ArrowUpRight className="h-2.5 w-2.5" />
              </a>
            ))}
          </div>
        )}

        {turn.text && (
          <div className="ml-2.5 flex items-center gap-1">
            <button
              type="button"
              onClick={() => void copy()}
              className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  Copy
                </>
              )}
            </button>
            {turn.question && (
              <button
                type="button"
                onClick={() => onRetry(turn.question!, turn)}
                className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors"
              >
                <RotateCw className="h-3 w-3" />
                Ask again
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function hasExpandedRow(turn: Turn): boolean {
  return Boolean(turn.elapsedMs !== undefined || turn.meta?.replayed);
}

/** Which model produced this answer, and where it runs. */
function ProviderStamp({ turn }: { turn: Turn }): React.ReactElement | null {
  const provider = turn.provider;
  if (!provider?.model) return null;
  const Icon = provider.kind === "local" ? Cpu : Cloud;
  return (
    <span
      className="inline-flex items-center gap-1"
      title={
        provider.kind === "local"
          ? "Answered by a model running on your own machine"
          : "Answered by a hosted model"
      }
    >
      <Icon className="h-3 w-3" />
      {provider.model}
    </span>
  );
}

function AssistantMark() {
  return (
    <div className="border-primary/30 bg-primary/10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border">
      <Sparkles className="text-primary h-3.5 w-3.5" />
    </div>
  );
}

export type { AssistantFrame, AssistantMeta, AssistantProviderKind };
