import "./globals.css";
import { Providers } from "../lib/providers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import SkipToContent from "../components/SkipToContent";
import OfflineBanner from "../components/OfflineBanner";
import NativeSessionSync from "../components/NativeSessionSync";
import AppBootstrap from "../components/AppBootstrap";
import { NetworkStatusProvider } from "../contexts/NetworkStatusContext";
import PWAInstallPrompt from "../components/PWAInstallPrompt";
import ServiceWorkerRegistration from "../components/ServiceWorkerRegistration";
import AppShell from "../components/AppShell";
import FeedbackProvider from "../components/feedback/FeedbackProvider";
import { UserPreferencesProvider } from "../contexts/UserPreferencesContext";
import { NavigationPreferencesProvider } from "../contexts/NavigationPreferencesContext";
import { cookies, headers } from "next/headers";
import { getOrganizationContext } from "../lib/organization-context";
import { getNavigationState } from "../lib/navigation/preferences";

interface ChromeState {
  permissions: string[];
  isAdmin: boolean;
  hiddenKeys: string[];
  orgHiddenKeys: string[];
}

const EMPTY_CHROME_STATE: ChromeState = {
  permissions: [],
  isAdmin: false,
  hiddenKeys: [],
  orgHiddenKeys: [],
};

/**
 * Resolve everything the application chrome needs, once, on the server.
 *
 * Permissions and the admin flag decide which nav links are reachable; the
 * hidden keys decide which of those the user has turned off. Resolving all three
 * here — rather than in the client — is what stops the sidebar from flashing
 * links that are about to disappear.
 *
 * Returns an empty state for anonymous/public routes. Every route still
 * re-checks its own permission via `requirePermission`, so this is presentation
 * only.
 */
async function resolveChromeState(): Promise<ChromeState> {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return EMPTY_CHROME_STATE;

    const nav = await getNavigationState({
      userId: ctx.userId,
      organizationId: ctx.organization?.id ?? null,
    });

    return {
      permissions: Array.from(ctx.permissions),
      isAdmin: ctx.isAdmin,
      hiddenKeys: nav.hiddenKeys,
      orgHiddenKeys: nav.orgHiddenKeys,
    };
  } catch {
    return EMPTY_CHROME_STATE;
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
  // Brand icons are served from public/icons (stable, cacheable files) rather
  // than the unhashed /icon.png, /apple-icon.png and /favicon.ico routes, which
  // Next regenerates and revalidates on every request.
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#090d16" },
  ],
};

export default async function RootLayout({ children }) {
  const cookieStore = await cookies();
  const headersList = await headers();

  const sidebarPref = cookieStore.get("sidebar_collapsed");
  const initialSidebarCollapsed = sidebarPref?.value === "true";

  const chrome = await resolveChromeState();

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
        <AppBootstrap>
          <NetworkStatusProvider>
            <SkipToContent />
            <NativeSessionSync />
            <OfflineBanner />
            <ServiceWorkerRegistration />
            <Providers nonce={nonce}>
              <UserPreferencesProvider>
                {/*
                  Navigation visibility is seeded from the server so the sidebar's
                  first paint already matches the saved preference — there is no
                  window in which hidden links flash before the fetch resolves.
                */}
                <NavigationPreferencesProvider
                  initialHiddenKeys={chrome.hiddenKeys}
                  initialOrgHiddenKeys={chrome.orgHiddenKeys}
                >
                  <AppShell
                    initialSidebarCollapsed={initialSidebarCollapsed}
                    initialPathname={pathname}
                    permissions={chrome.permissions}
                    isAdmin={chrome.isAdmin}
                  >
                    {children}
                  </AppShell>
                </NavigationPreferencesProvider>
                <PWAInstallPrompt />
                {/*
                  The one feedback surface. Every `notify.*` call in the app renders
                  here, so weight, wording, deduplication and auto-dismiss are decided
                  once rather than at 674 call sites.
                */}
                <FeedbackProvider />
              </UserPreferencesProvider>
            </Providers>
          </NetworkStatusProvider>
        </AppBootstrap>
      </body>
    </html>
  );
}
