import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs";
import bundleAnalyzer from "@next/bundle-analyzer";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

// Read the app version once at build time instead of bundling package.json
// into client bundles (previously imported by src/components/Sidebar.tsx).
const appVersion = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
).version;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Temporarily disable standalone for faster builds during development
  // Re-enable for Docker deployment: output: "standalone",
  // output: "standalone",

  // Hide the floating Next.js dev-tools indicator (the "N" button shown in the
  // bottom corner during development).
  devIndicators: false,

  // Enable gzip compression for responses (enabled by default, explicit for clarity)
  compress: true,

  // Allow cross-origin access to dev resources from network IP
  allowedDevOrigins: ["10.3.12.34", "26.174.35.123"],

  // Inject build-time values without shipping package.json to the client.
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },

  // Pin Turbopack to this project. A stray package-lock.json in the home
  // directory made Next.js detect C:\Users\<user> as the workspace root,
  // so Turbopack watched/indexed the whole home folder, slowing routing
  // and leaving a stale route index in the dev cache.
  turbopack: {
    root: projectRoot,
  },

  // Deep-import heavyweight icon/component libs so tree-shaking drops the
  // unused barrel exports from the client bundle (lucide-react is imported
  // from 127 files; recharts and date libs only get their used entry points).
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "maplibre-gl",
      "@radix-ui/react-icons",
      "idb-keyval",
    ],
    optimizeCss: true,
  },

  async headers() {
    // Security headers applied to every route.
    // CSP is handled by middleware (src/middleware.ts) for per-request nonce generation.
    // The HSTS header is only included when NOT on localhost.
    const isLocal =
      !process.env.VERCEL_URL && process.env.NODE_ENV !== "production";

    /** @type {import('next').Header["headers"]} */
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-XSS-Protection", value: "1; mode=block" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        // camera=(self) is required by the QR/barcode scanner
        // (src/app/scanner). The Capacitor Android WebView loads this same
        // origin, so `self` unblocks it inside the APK too. Keep microphone
        // and geolocation denied.
        key: "Permissions-Policy",
        value: "camera=(self), microphone=(), geolocation=()",
      },
    ];

    if (!isLocal) {
      securityHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains",
      });
    }

    return [
      {
        // Apply to all routes
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default withBundleAnalyzer(withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: process.env.SENTRY_ORG,

  project: process.env.SENTRY_PROJECT,

  url: process.env.SENTRY_URL,

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // GlitchTip does not support sentry-cli source map uploads
  sourcemaps: {
    disable: true,
  },

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
}));
