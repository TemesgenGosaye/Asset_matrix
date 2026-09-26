"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  X,
  Send,
  Trash2,
  User,
  Square,
  Compass,
  AlertCircle,
  Loader2,
  Building2,
  Clock,
  Laptop,
  ClipboardList,
  HelpCircle,
  Languages,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AssistantCard } from "./AssistantCard";
import { ASSISTANT_BRAND, QUICK_ACTIONS, quickActionText } from "@/lib/ai/brand";
import { FrameDecoder, type AssistantMeta, type FastCard } from "@/lib/ai/protocol";
import { cn } from "@/lib/utils";

/**
 * Meri — the portal's system-support assistant.
 *
 * The one rule this component exists to enforce: *the indicator must be earned*.
 * A question that resolves to a prepared aggregate renders as a data card with no
 * thinking state at all, because there is nothing to wait for. Only the
 * reasoning lane — open-ended questions that genuinely need the model and its
 * tools — is allowed to show a pulse, and while it does, it names the tool it is
 * reaching for. A wait that says what it is doing is a wait; a wait that says
 * "Searching portal records & reasoning..." is a stall.
 *
 * The transcript is lane-aware, so the user can always tell a quoted record from
 * a reasoned answer.
 */

type Locale = "en" | "am";

interface Turn {
  id: string;
  role: "user" | "assistant";
  /** User turns only. */
  question?: string;
  /** Reasoning-lane markdown. */
  text?: string;
  /** Fast-lane payload. */
  card?: FastCard;
  meta?: AssistantMeta;
  /** Reasoning-lane tool activity, most recent last. */
  tools?: string[];
  error?: string;
  done?: boolean;
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

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** Id of the turn currently receiving frames, so only it shows a pulse. */
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    scrollToBottom("auto");
    inputRef.current?.focus();
  }, [isOpen, turns, scrollToBottom]);

  // Close + toggle affordances
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      } else if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    const onToggle = () => setIsOpen((prev) => !prev);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("toggle-ai-copilot", onToggle);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("toggle-ai-copilot", onToggle);
    };
  }, [isOpen]);

  // Abort any in-flight turn if the drawer unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  const patchTurn = useCallback(
    (id: string, patch: Partial<Turn>) => {
      setTurns((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      );
    },
    [],
  );

  const ask = useCallback(
    async (raw: string) => {
      const question = raw.trim();
      if (!question || isBusy) return;

      setErrorMessage(null);
      setInput("");

      const userTurn: Turn = { id: uid(), role: "user", question };
      const replyId = uid();
      const reply: Turn = { id: replyId, role: "assistant", tools: [] };

      // Only completed, non-empty turns are replayed to the model. Fast-lane
      // cards are omitted deliberately: they are rendered records, and feeding
      // them back would teach the model to imitate a card format it should not
      // be producing.
      const history = [...turns, userTurn]
        .filter((t) => t.role === "user" || (t.text && t.text.trim()))
        .map((t) => ({
          role: t.role,
          content: t.role === "user" ? (t.question ?? "") : (t.text ?? ""),
        }));

      setTurns((prev) => [...prev, userTurn, reply]);
      setIsBusy(true);
      setAwaitingLane(true);
      setActiveTurnId(replyId);
      scrollToBottom();

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          let detail = `The ${ASSISTANT_BRAND.latin} service did not respond.`;
          try {
            const data = await response.json();
            if (data?.error) detail = data.error;
          } catch {
            // Non-JSON error body — keep the generic message.
          }
          throw new Error(detail);
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
                patchTurn(replyId, { meta: frame });
                break;
              case "card":
                setAwaitingLane(false);
                patchTurn(replyId, { card: frame.card });
                break;
              case "text-delta":
                setAwaitingLane(false);
                streamed += frame.delta;
                patchTurn(replyId, { text: streamed });
                break;
              case "tool":
                setAwaitingLane(false);
                setTurns((prev) =>
                  prev.map((t) =>
                    t.id === replyId
                      ? { ...t, tools: [...(t.tools ?? []), frame.label] }
                      : t,
                  ),
                );
                break;
              case "error":
                patchTurn(replyId, { error: frame.message });
                break;
              case "done":
                patchTurn(replyId, { done: true });
                break;
            }
          }
        }

        for (const frame of frames.flush()) {
          if (frame.type === "done") patchTurn(replyId, { done: true });
          if (frame.type === "error") patchTurn(replyId, { error: frame.message });
        }

        // A turn that produced neither a card nor text means the lane produced
        // nothing usable. Say so rather than leaving an empty bubble.
        if (!streamed) {
          setTurns((prev) =>
            prev.map((t) =>
              t.id === replyId && !t.card && !t.error
                ? {
                    ...t,
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
          patchTurn(replyId, { done: true });
          return;
        }
        const message =
          err instanceof Error ? err.message : "An unexpected error occurred.";
        setErrorMessage(message);
        setTurns((prev) => prev.filter((t) => t.id !== replyId));
      } finally {
        setAwaitingLane(false);
        setIsBusy(false);
        setActiveTurnId(null);
        abortRef.current = null;
      }
    },
    [isBusy, turns, patchTurn, scrollToBottom],
  );

  const stop = () => {
    abortRef.current?.abort();
    setIsBusy(false);
    setAwaitingLane(false);
    setActiveTurnId(null);
  };

  const clear = () => {
    abortRef.current?.abort();
    setTurns([]);
    setErrorMessage(null);
    setIsBusy(false);
    setAwaitingLane(false);
    setActiveTurnId(null);
  };

  const isEmpty = turns.length === 0;

  return (
    <>
      {isOpen && (
        <button
          type="button"
          aria-label={`Close ${ASSISTANT_BRAND.latin}`}
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-50 cursor-default bg-slate-950/40 backdrop-blur-[2px]"
        />
      )}

      <aside
        role="dialog"
        aria-modal={isOpen}
        aria-label={`${ASSISTANT_BRAND.lockup} — ${ASSISTANT_BRAND.scope.en}`}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-slate-800/80 bg-background shadow-2xl transition-transform duration-300 ease-out sm:w-[520px] sm:max-w-full",
          isOpen ? "translate-x-0" : "pointer-events-none translate-x-full",
        )}
      >
        {/* ── Terminal header ── */}
        <header className="relative shrink-0 border-b border-brass-500/25 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 px-4 py-3.5 text-slate-100">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-brass-500/40 bg-slate-950/60">
                <Compass className="h-5 w-5 text-brass-300" />
                {isBusy && (
                  <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-brass-300 ring-2 ring-slate-900" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <h2 className="housing-serif truncate text-[15px] font-semibold text-brass-300">
                    {ASSISTANT_BRAND.name}
                  </h2>
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">
                    {ASSISTANT_BRAND.latin}
                  </span>
                </div>
                <p className="truncate text-[11px] text-slate-400">
                  {ASSISTANT_BRAND.scope[locale]}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setLocale((l) => (l === "en" ? "am" : "en"))}
                className="h-8 w-8 text-slate-400 hover:bg-brass-500/10 hover:text-brass-300"
                title={locale === "en" ? "አማርኛ ገጽታ" : "English"}
                aria-label={locale === "en" ? "Switch to Amharic" : "Switch to English"}
              >
                <Languages className="h-4 w-4" />
              </Button>
              {turns.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={clear}
                  disabled={isBusy}
                  className="h-8 w-8 text-slate-400 hover:bg-destructive/15 hover:text-destructive"
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
                className="h-8 w-8 text-slate-400 hover:bg-white/10 hover:text-slate-100"
                title="Close (Esc)"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Meaning strip — the one line that explains the name. */}
          <p className="mt-2.5 truncate border-t border-brass-500/15 pt-2 text-[10px] text-slate-500">
            {ASSISTANT_BRAND.meaning[locale]} · {ASSISTANT_BRAND.tagline[locale]}
          </p>
        </header>

        {/* ── Transcript ── */}
        <div
          ref={scrollRef}
          className="flex-1 space-y-4 overflow-y-auto px-4 py-4"
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
        >
          {isEmpty ? (
            <div className="flex h-full flex-col justify-center">
              <div className="mb-4 text-center">
                <h3 className="housing-serif text-base font-semibold text-foreground">
                  {locale === "am" ? "ምን ልታወቅኝ ይችላሉ?" : "What do you need to know?"}
                </h3>
                <p className="mx-auto mt-1.5 max-w-xs text-xs leading-relaxed text-muted-foreground">
                  {locale === "am"
                    ? "ብዛታና ምልከታ ጥያቄዎች ወዲያውኑ ይመለሳሉ። ከዚያ በላይ ያለውን ጥያቄ በአንድ ምላሽ እንገብራለን።"
                    : "Counts and lookups answer instantly from live records. Anything more involved, ask in plain language."}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-1.5">
                {QUICK_ACTIONS.map((action) => {
                  const { label, prompt } = quickActionText(action, locale);
                  const Icon = TONE_ICON[action.tone];
                  return (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => ask(prompt)}
                      className="group flex items-center gap-2.5 rounded-lg border border-border bg-card/70 px-3 py-2 text-left transition-colors hover:border-brass-500/50 hover:bg-brass-500/[0.05]"
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-brass-500" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-foreground">
                          {label}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {prompt}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            turns.map((turn) => (
              <TurnView
                key={turn.id}
                turn={turn}
                busy={isBusy && turn.id === activeTurnId}
                awaitingLane={awaitingLane && turn.id === activeTurnId}
              />
            ))
          )}

          {errorMessage && (
            <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <span className="block font-semibold">{ASSISTANT_BRAND.latin} alert</span>
                <span>{errorMessage}</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Composer ── */}
        <div className="shrink-0 border-t border-border bg-background/95 p-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
            className="flex items-center gap-2"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                locale === "am"
                  ? "ስለ ቤት፣ ሕብምብ ወይም ሰልፍ ይጠይቁ…"
                  : "Ask about houses, assets, or the queue…"
              }
              disabled={isBusy}
              aria-label={`Question for ${ASSISTANT_BRAND.latin}`}
              className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-brass-500 focus:outline-none focus:ring-2 focus:ring-brass-500/20 disabled:opacity-50"
            />
            {isBusy ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={stop}
                className="h-9 shrink-0 gap-1.5 rounded-lg border-destructive/40 text-destructive hover:bg-destructive/10"
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
                className="h-9 w-9 shrink-0 rounded-lg bg-slate-900 text-brass-300 hover:bg-slate-800 dark:bg-brass-500 dark:text-slate-950 dark:hover:bg-brass-400"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </form>

          <div className="mt-1.5 flex items-center justify-between px-0.5 text-[10px] text-muted-foreground">
            <span>Ctrl+J to toggle</span>
            <span>Scoped to your organization</span>
          </div>
        </div>
      </aside>
    </>
  );
}

/**
 * One transcript row.
 *
 * Three shapes: the user's question, a fast-lane data card, or a streamed
 * reasoning answer. The pending state only ever appears for a turn that has
 * declared itself the reasoning lane — the whole point of the exercise.
 */
function TurnView({
  turn,
  busy,
  awaitingLane,
}: {
  turn: Turn;
  busy: boolean;
  awaitingLane: boolean;
}) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end gap-2">
        <div className="max-w-[85%] rounded-xl rounded-br-sm bg-slate-900 px-3.5 py-2 text-sm leading-relaxed text-slate-100 dark:bg-slate-800">
          <p className="whitespace-pre-wrap">{turn.question}</p>
        </div>
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <User className="h-3.5 w-3.5" />
        </div>
      </div>
    );
  }

  // Fast lane: a card is the answer. No bubble, no thinking state.
  if (turn.card) {
    return (
      <div className="flex gap-2">
        <AssistantMark />
        <div className="min-w-0 flex-1">
          <AssistantCard card={turn.card} ms={turn.meta?.ms} cached={turn.meta?.cached} />
        </div>
      </div>
    );
  }

  const showPulse = busy && (awaitingLane || !turn.text);

  return (
    <div className="flex gap-2">
      <AssistantMark />
      <div className="min-w-0 flex-1 space-y-2">
        {turn.error ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{turn.error}</span>
          </div>
        ) : (
          <>
            {turn.text ? (
              <div className="prose prose-sm max-w-none rounded-xl rounded-bl-sm border border-border bg-card px-3.5 py-2.5 text-xs leading-relaxed [&_a]:text-brass-600 [&_a]:underline dark:[&_a]:text-brass-300 [&_ol]:list-decimal [&_ol]:pl-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border-b [&_td]:border-border/50 [&_td]:py-1 [&_th]:border-b [&_th]:border-border [&_th]:py-1 [&_ul]:list-disc [&_ul]:pl-4">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.text}</ReactMarkdown>
              </div>
            ) : null}

            {/* Reasoning lane indicator — labelled with the work in progress. */}
            {showPulse && (
              <div className="flex items-center gap-2 rounded-xl rounded-bl-sm border border-brass-500/25 bg-brass-500/[0.05] px-3.5 py-2.5 text-xs text-muted-foreground">
                {awaitingLane ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-brass-500" />
                ) : (
                  <span className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                    <span className="absolute h-3.5 w-3.5 animate-ping rounded-full bg-brass-500/60" />
                    <span className="relative h-1.5 w-1.5 rounded-full bg-brass-500" />
                  </span>
                )}
                <span>
                  {turn.tools?.length
                    ? turn.tools[turn.tools.length - 1]
                    : "Reading portal records"}
                  …
                </span>
              </div>
            )}

            {turn.tools && turn.tools.length > 0 && turn.text && (
              <p className="flex items-center gap-1.5 px-1 text-[10px] text-muted-foreground">
                <ClipboardList className="h-3 w-3" />
                {turn.tools.join(" · ")}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function AssistantMark() {
  return (
    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-brass-500/40 bg-slate-900">
      <Compass className="h-3.5 w-3.5 text-brass-300" />
    </div>
  );
}
