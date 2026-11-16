"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, LayoutDashboard, Send } from "lucide-react";
import * as Sentry from "@sentry/nextjs";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

const SUPPORT_URL = "https://t.me/Thefluxor";

/**
 * Route-segment error boundary (HTTP 500).
 *
 * Presented as a centred, status-led screen rather than a floating card: the
 * emblem, the code, one sentence of plain language, then exactly two actions —
 * the primary one retries the failed segment, the secondary one is a way out.
 * The digest is surfaced quietly so a user can quote it to support without the
 * raw stack ever reaching the screen.
 */
export default function Error({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    Sentry.captureException(error);
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[100dvh] w-full flex-col items-center justify-center bg-slate-50 px-6 py-12 text-center">
      <div className="grid h-24 w-24 place-items-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 shadow-[0_0_0_12px_rgba(254,242,242,0.6)]">
        <AlertTriangle className="h-11 w-11" strokeWidth={1.9} />
      </div>

      <span className="mt-6 inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-bold tracking-widest text-slate-500 uppercase">
        Error 500
      </span>

      <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
        Something went wrong
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-500">
        We couldn&rsquo;t complete that request. Our team has been notified and
        is looking into it. Please try again in a moment.
      </p>

      {error.digest && (
        <p className="mt-4 max-w-full truncate rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-[11px] text-slate-500">
          Error ID: {error.digest}
        </p>
      )}

      <div className="mt-8 flex w-full max-w-sm flex-col gap-2.5 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 transition-all duration-200 hover:bg-primary/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <RefreshCw className="h-4 w-4" />
          Try again
        </button>
        <Link
          href="/dashboard"
          className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 shadow-sm transition-all duration-200 hover:bg-slate-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <LayoutDashboard className="h-4 w-4" />
          Dashboard
        </Link>
      </div>

      <a
        href={SUPPORT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-7 inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-500 transition-colors hover:text-primary"
      >
        <Send className="h-3.5 w-3.5" />
        Report this to support
      </a>
    </div>
  );
}
