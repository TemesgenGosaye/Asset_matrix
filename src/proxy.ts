import { getSessionCookie } from "better-auth/cookies";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { generateCorrelationId } from "@/lib/logger";

function buildCspHeader(nonce: string): string {
  const isDev = process.env.NODE_ENV !== "production";
  const directives = [
    "default-src 'self'",
    isDev
      ? `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://analytics.711x.de https://challenges.cloudflare.com`
      : `script-src 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline' 'unsafe-eval'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' https://*.sentry.io https://*.basemaps.cartocdn.com https://*.cartocdn.com https://nominatim.openstreetmap.org https://analytics.711x.de https://challenges.cloudflare.com${isDev ? " ws: wss: http://localhost:* http://127.0.0.1:* http://10.3.12.34:* ws://10.3.12.34:* https://127.0.0.1:41951" : ""}`,
    "worker-src 'self' blob:",
    "frame-src 'self' https://challenges.cloudflare.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  return directives.join("; ");
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = getSessionCookie(req);
  const isLoggedIn = !!session;

  // Generate correlation ID for request tracing
  const correlationId =
    req.headers.get("x-correlation-id") || generateCorrelationId();

  // Generate per-request CSP nonce
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const cspHeader = buildCspHeader(nonce);

  // Stamp security headers (CSP + nonce + correlation ID) on every response.
  function withHeaders<T extends Response>(response: T): T {
    response.headers.set("Content-Security-Policy", cspHeader);
    response.headers.set("x-nonce", nonce);
    response.headers.set("x-correlation-id", correlationId);
    return response;
  }

  // For NextResponse.next(), also pass the nonce as a request header so
  // the app (layout.tsx) can read it via headers().get("x-nonce")
  function nextWithNonce(): NextResponse {
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", cspHeader);
    return withHeaders(
      NextResponse.next({ request: { headers: requestHeaders } }),
    );
  }

  // Public routes that don't require authentication
  const publicRoutes = [
    "/",
    "/login",
    "/register",
    "/setup",
    "/forgot-password",
    "/reset-password",
    "/terms",
    "/privacy",
    "/offline",
    "/invite",
  ];
  const isPublicRoute = publicRoutes.some(
    (r) => pathname === r || pathname.startsWith(r + "/"),
  );

  // Health check endpoints (always allow)
  const isHealthRoute = pathname.startsWith("/api/health");

  // API routes (handle separately - will be protected at the API level)
  const isApiRoute = pathname.startsWith("/api");

  // Static files and Next.js internals (always allow)
  const isStaticFile =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/icons/") ||
    pathname === "/sw.js" ||
    pathname === "/manifest.json" ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp|js|css|woff|woff2|ttf|eot)$/);

  if (isStaticFile) {
    return nextWithNonce();
  }

  // Allow health endpoints without authentication
  if (isHealthRoute) {
    return nextWithNonce();
  }

  // Redirect logged-in users away from login page
  if (isLoggedIn && pathname === "/login") {
    return withHeaders(NextResponse.redirect(new URL("/dashboard", req.url)));
  }

  // Redirect non-logged-in users to login (except for API routes)
  if (!isLoggedIn && !isPublicRoute && !isApiRoute) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return withHeaders(NextResponse.redirect(loginUrl));
  }

  return nextWithNonce();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images and other static assets
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)$).*)",
  ],
};
