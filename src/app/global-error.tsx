"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

const SUPPORT_URL = "https://t.me/Thefluxor";

/**
 * Root error boundary — the last line of defence.
 *
 * This replaces the entire document (including the root layout), so it cannot
 * rely on the app's stylesheet, Tailwind, or any component. Everything here is
 * therefore self-contained inline CSS, and it still renders the same brand,
 * wording and single primary action as `error.tsx` so the failure never looks
 * like a different product.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      {/*
        This document replaces the root layout, so the usual `viewport` export
        is gone. React 19 hoists these tags into <head> automatically, which is
        what keeps the crash screen correctly scaled on a phone.
      */}
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1, viewport-fit=cover"
      />
      <meta name="theme-color" content="#0b2b57" />
      <title>Something went wrong — HomeDesk</title>
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px 24px",
          textAlign: "center",
          background: "#f8fafc",
          color: "#0f172a",
          fontFamily:
            'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          WebkitFontSmoothing: "antialiased",
        }}
      >
        <div
          style={{
            display: "grid",
            placeItems: "center",
            width: 96,
            height: 96,
            borderRadius: "9999px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            boxShadow: "0 0 0 12px rgba(254,242,242,0.6)",
          }}
        >
          <svg
            width="44"
            height="44"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#dc2626"
            strokeWidth={1.9}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
        </div>

        <h1
          style={{
            margin: "28px 0 0",
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: "-0.01em",
          }}
        >
          Something went wrong
        </h1>
        <p
          style={{
            margin: "12px 0 0",
            maxWidth: 420,
            fontSize: 14,
            lineHeight: 1.65,
            color: "#64748b",
          }}
        >
          HomeDesk hit an unexpected problem and could not recover on its own.
          Please try again — if it keeps happening, contact support.
        </p>

        {error.digest && (
          <p
            style={{
              margin: "16px 0 0",
              padding: "6px 12px",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              background: "#ffffff",
              fontFamily: 'Consolas, "Cascadia Mono", monospace',
              fontSize: 11,
              color: "#64748b",
            }}
          >
            Error ID: {error.digest}
          </p>
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            width: "100%",
            maxWidth: 320,
            marginTop: 30,
          }}
        >
          <button
            type="button"
            onClick={reset}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: 48,
              border: "1px solid #0a2450",
              borderRadius: 12,
              background: "#0b2b57",
              color: "#ffffff",
              font: "inherit",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          <a
            href="/login"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: 48,
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              background: "#ffffff",
              color: "#334155",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Back to sign in
          </a>
        </div>

        <a
          href={SUPPORT_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            marginTop: 26,
            fontSize: 13,
            fontWeight: 600,
            color: "#0b2b57",
            textDecoration: "none",
          }}
        >
          Report this to support
        </a>
      </body>
    </html>
  );
}
