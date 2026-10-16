"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Check,
  Cloud,
  Cpu,
  RefreshCw,
  Server,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ASSISTANT_BRAND } from "@/lib/ai/brand";
import { cn } from "@/lib/utils";

/**
 * Provider status indicator.
 *
 * The single most useful thing this can tell a user is *where the answer is
 * coming from*. A cloud model and a laptop running a 7B model look identical
 * from inside the transcript — same bubble, same typography — yet one returns a
 * first token in 400 ms and the other in 4 s. Labelling that difference is what
 * turns "the assistant is slow" into "the assistant is on the local model", which
 * is a fact the user can act on.
 *
 * It doubles as a setup surface. When nothing is configured, or a local server
 * is not running, the exact missing variable is shown here rather than surfacing
 * later as a 503 on the first real question.
 */

export interface ProviderStatusResponse {
  active: {
    id: string;
    label: string;
    kind: "cloud" | "local";
    model: string;
    baseUrl?: string;
    configured: boolean;
    reason?: string;
  };
  chain: { id: string; label: string }[];
  health: Record<
    string,
    { ok: boolean; latencyMs: number; models?: string[]; detail?: string }
  >;
  healthy: boolean;
  setupHint?: string;
  caches: {
    answers: { entries: number; capacity: number; ttlMs: number };
    aggregates: { entries: number; hitRate: number };
  };
  tuning: { ollamaKeepAlive: string };
  slots: {
    id: string;
    label: string;
    kind: "cloud" | "local";
    model: string;
    baseUrl?: string;
    configured: boolean;
    reason?: string;
  }[];
}

interface ProviderStatusProps {
  /** Called when the status is asked for, so the caller can force a refresh. */
  onProviderChange?: (id: string) => void;
  className?: string;
}

const POLL_MS = 60_000;

export function ProviderStatus({ className }: ProviderStatusProps = {}) {
  const [status, setStatus] = useState<ProviderStatusResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (opts: { force?: boolean; showLoading?: boolean } = {}) => {
      // Only a user-initiated refresh shows a spinner. Background polls must not
      // set state synchronously, or every mount cascades an extra render.
      if (opts.showLoading) setLoading(true);
      try {
        const response = await fetch(
          `/api/ai/status${opts.force ? "?probe=1" : ""}`,
          { cache: "no-store" },
        );
        if (!response.ok) return;
        setStatus((await response.json()) as ProviderStatusResponse);
      } catch {
        // A status panel that cannot reach its own endpoint should say nothing
        // rather than an error — the assistant may still be working fine.
      } finally {
        if (opts.showLoading) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    // Kick the first poll from a timer callback rather than inline, so the
    // effect body itself only subscribes and never sets state.
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  const kind = status?.active.kind ?? "cloud";
  const Icon = kind === "local" ? Cpu : Cloud;
  const healthy = status?.healthy ?? true;

  const tone = !status
    ? "border-border text-muted-foreground"
    : healthy
      ? kind === "local"
        ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
        : "border-primary/30 text-primary dark:text-primary"
      : "border-amber-500/40 text-amber-600 dark:text-amber-400";

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void load();
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={`${ASSISTANT_BRAND.latin} model status`}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] tracking-[0.14em] uppercase transition-colors",
          tone,
          "hover:bg-muted",
        )}
      >
        <Icon className="h-3 w-3" />
        <span className="hidden sm:inline">
          {status ? status.active.label : ASSISTANT_BRAND.latin}
        </span>
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            healthy ? "bg-current" : "animate-pulse bg-amber-500",
          )}
        />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close status"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="dialog"
            aria-label={`${ASSISTANT_BRAND.latin} model status`}
            className="border-border bg-popover text-popover-foreground absolute top-full right-0 z-50 mt-2 w-[19rem] rounded-xl border p-3 shadow-xl"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="housing-serif text-foreground text-sm font-semibold">
                  Model status
                </h4>
                <p className="text-muted-foreground mt-0.5 text-[11px]">
                  Where {ASSISTANT_BRAND.lockup} answers from.
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void load({ force: true, showLoading: true })}
                disabled={loading}
                aria-label="Re-check providers"
                className="text-muted-foreground h-7 w-7 shrink-0"
              >
                <RefreshCw
                  className={cn("h-3.5 w-3.5", loading && "animate-spin")}
                />
              </Button>
            </div>

            {status?.setupHint && (
              <p className="mt-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
                {status.setupHint}
              </p>
            )}

            <ul className="mt-3 space-y-1.5">
              {status?.slots.map((slot) => {
                const health = status.health[slot.id];
                const isActive = status.active.id === slot.id;
                return (
                  <li
                    key={slot.id}
                    className={cn(
                      "rounded-lg border px-2.5 py-2",
                      isActive
                        ? "border-primary/40 bg-primary/[0.06]"
                        : "border-border",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        {slot.kind === "local" ? (
                          <Cpu className="text-muted-foreground h-3 w-3 shrink-0" />
                        ) : (
                          <Cloud className="text-muted-foreground h-3 w-3 shrink-0" />
                        )}
                        <span className="text-foreground truncate text-[12px] font-medium">
                          {slot.label}
                        </span>
                        {isActive && (
                          <span className="bg-primary/20 text-primary shrink-0 rounded px-1 text-[9px] tracking-wide uppercase">
                            active
                          </span>
                        )}
                      </span>
                      {!slot.configured ? (
                        <span className="text-muted-foreground shrink-0">
                          <X className="h-3.5 w-3.5" />
                        </span>
                      ) : health?.ok ? (
                        <span className="shrink-0 text-emerald-600 dark:text-emerald-400">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      ) : (
                        <span className="shrink-0 text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </div>
                    <div className="text-muted-foreground mt-1 font-mono text-[10px]">
                      {slot.model}
                      {slot.baseUrl && ` · ${slot.baseUrl}`}
                    </div>
                    {!slot.configured && slot.reason && (
                      <p className="text-muted-foreground mt-1 text-[10px]">
                        {slot.reason}
                      </p>
                    )}
                    {slot.configured &&
                      health &&
                      !health.ok &&
                      health.detail && (
                        <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">
                          {health.detail}
                        </p>
                      )}
                    {slot.configured && health?.ok && (
                      <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                        <Activity className="h-2.5 w-2.5" />
                        {health.latencyMs} ms
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="border-border text-muted-foreground mt-3 space-y-1 border-t pt-2 text-[10px]">
              <p className="flex items-center gap-1.5">
                <Server className="h-3 w-3" />
                {status?.caches.aggregates.entries ?? 0} aggregates cached ·{" "}
                {status?.caches.aggregates.hitRate ?? 0}% hit rate
              </p>
              <p className="flex items-center gap-1.5">
                <ZapIcon />
                {status?.caches.answers.entries ?? 0} answers remembered
              </p>
              {status?.active.kind === "local" && status.tuning && (
                <p className="text-muted-foreground/70 pt-0.5">
                  Kept warm for {status.tuning.ollamaKeepAlive} between
                  questions, so the next answer does not wait on a model reload.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ZapIcon() {
  return <Activity className="h-3 w-3" />;
}

export default ProviderStatus;
