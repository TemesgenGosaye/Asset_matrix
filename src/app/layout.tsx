import "./globals.css";
import { Providers } from "../lib/providers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import SkipToContent from "../components/SkipToContent";
import OfflineBanner from "../components/OfflineBanner";
import PWAInstallPrompt from "../components/PWAInstallPrompt";
import ServiceWorkerRegistration from "../components/ServiceWorkerRegistration";
import AppShell from "../components/AppShell";
import { Toaster } from "sonner";
import { UserPreferencesProvider } from "../contexts/UserPreferencesContext";
import { cookies, headers } from "next/headers";

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
  icons: {
    icon: "/icons/icon.svg",
    apple: "/icons/icon.svg",
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
            >
              {children}
            </AppShell>
            <PWAInstallPrompt />
            <Toaster richColors />
          </UserPreferencesProvider>
        </Providers>
      </body>
    </html>
  );
}
