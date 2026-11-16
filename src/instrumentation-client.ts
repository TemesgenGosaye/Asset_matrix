// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const isDev = process.env.NODE_ENV === "development";
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

// Disable Sentry in development and when DSN is absent so client-side instrumentation
// hook executes instantly (<1ms) without slow execution warnings (129ms) or dev telemetry.
if (!isDev && dsn) {
  Sentry.init({
    dsn,
    integrations: [Sentry.replayIntegration()],
    tracesSampleRate: 0.1,
    enableLogs: true,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    sendDefaultPii: false,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
