import "./globals.css";
import { Providers } from "../lib/providers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import SkipToContent from "../components/SkipToContent";
import OfflineBanner from "../components/OfflineBanner";
import PWAInstallPrompt from "../components/PWAInstallPrompt";
import ServiceWorkerRegistration from "../components/ServiceWorkerRegistration";
import AppShell from "../components/AppShell";
import FeedbackProvider from "../components/feedback/FeedbackProvider";
import { UserPreferencesProvider } from "../contexts/UserPreferencesContext";
import { cookies, headers } from "next/headers";
import { getOrganizationContext } from "../lib/organization-context";

/**
 * Resolve the caller's permission strings once, on the server.
 *
 * Passed down to the sidebar purely so permission-gated nav links (e.g. "Pay
 * Rent") are hidden from users who cannot use them. Returns an empty array for
 * anonymous/public routes; every route still re-checks its own permission via
 * `requirePermission`, so this is presentation only.
 */
async function resolvePermissions(): Promise<string[]> {
  try {
    const ctx = await getOrganizationContext();
    return ctx ? Array.from(ctx.permissions) : [];
  } catch {
    return [];
  }
}

export const metadata = {
  title: "MSF Asset and House Portal",
  description:
    "Track and manage your organization's assets, licenses, and consumables",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MSF Asset and House Portal",
  },
  // src/app/icon.png + apple-icon.png + favicon.ico are emitted from
  // public/images/msflogo.jpg by scripts/generate-brand-icons.mjs. Declared
  // explicitly too so the sizing hints survive cached HTML.
  icons: {
    icon: [
      { url: "/icon.png", sizes: "512x512", type: "image/png" },
      { url: "/favicon.ico", sizes: "48x48 32x32 16x16" },
    ],
    apple: "/apple-icon.png",
  },
};

export const viewport = {
  themeColor: "#0f172a",
};

export default async function RootLayout({ children }) {
  const cookieStore = await cookies();
  const headersList = await headers();

  const sidebarPref = cookieStore.get("sidebar_collapsed");
  const initialSidebarCollapsed = sidebarPref?.value === "true";
  const isDemo = process.env.DEMO_MODE === "true";

  const permissions = await resolvePermissions();

  // CSP nonce stamped by src/proxy.ts — passed to next-themes so its inline
  // theme script carries the nonce under the production CSP.
  const nonce = headersList.get("x-nonce") ?? undefined;

  // Pass initial pathname so AppShell can render correctly on first frame
  const pathname = new URL(
    headersList.get("x-url") || headersList.get("x-invoke-path") || "/",
    "http://localhost",
  ).pathname;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
    >
      <body suppressHydrationWarning>
        <SkipToContent />
        <OfflineBanner />
        <ServiceWorkerRegistration />
        <Providers nonce={nonce}>
          <UserPreferencesProvider>
            <AppShell
              initialSidebarCollapsed={initialSidebarCollapsed}
              isDemo={isDemo}
              initialPathname={pathname}
              permissions={permissions}
            >
              {children}
            </AppShell>
            <PWAInstallPrompt />
            {/*
              The one feedback surface. Every `notify.*` call in the app renders
              here, so weight, wording, deduplication and auto-dismiss are decided
              once rather than at 674 call sites.
            */}
            <FeedbackProvider />
          </UserPreferencesProvider>
        </Providers>
      </body>
    </html>
  );
}
