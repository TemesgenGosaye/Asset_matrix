"use client";

import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import Sidebar from "./Sidebar";
import Navigation from "./Navigation";
import MobileNav from "./MobileNav";
import KeyboardShortcuts from "./KeyboardShortcuts";
import DemoBanner from "./DemoBanner";
import OfflineSyncIndicator from "./OfflineSyncIndicator";
import PageTransition from "./PageTransition";
import { isActivePath } from "@/lib/nav-config";

const OnboardingWizard = dynamic(() => import("./OnboardingWizard"), {
  ssr: false,
});

const AiCopilotDrawer = dynamic(() => import("./ai/AiCopilotDrawer"), {
  ssr: false,
});

const AssistantLauncher = dynamic(() => import("./ai/AssistantLauncher"), {
  ssr: false,
});

const PUBLIC_ROUTES = [
  "/login",
  "/register",
  "/setup",
  "/forgot-password",
  "/reset-password",
  "/mfa-verify",
  "/offline",
];

interface AppShellProps {
  children: React.ReactNode;
  initialSidebarCollapsed: boolean;
  isDemo: boolean;
  initialPathname?: string;
  /**
   * The signed-in user's permission strings, resolved once on the server.
   *
   * Used only to decide which nav links to render. Every route re-checks its own
   * permission via `requirePermission`, so a permission-gated link is a courtesy,
   * never the enforcement.
   */
  permissions?: string[];
}

export default function AppShell({
  children,
  initialSidebarCollapsed,
  isDemo,
  initialPathname,
  permissions,
}: AppShellProps) {
  const clientPathname = usePathname();
  const pathname = clientPathname || initialPathname || "/";

  const isPublicRoute =
    pathname === "/" ||
    PUBLIC_ROUTES.some((route) => isActivePath(pathname, route));

  if (isPublicRoute) {
    return <>{children}</>;
  }

  return (
    <>
      <KeyboardShortcuts />
      <DemoBanner isDemo={isDemo} />
      {/* Outer shell — uses CSS variable bg so dark mode flips the whole canvas */}
      <div className="relative flex h-screen overflow-hidden bg-background transition-colors duration-300">
        {/* Subtle ambient radial — barely visible in light, nearly gone in dark */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-100/20 via-transparent to-transparent dark:from-blue-900/5" />
        </div>
        <Sidebar
          initialCollapsed={initialSidebarCollapsed}
          permissions={permissions}
        />
        <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <Navigation />
          <OfflineSyncIndicator />
          <main
            id="main-content"
            className="flex-1 overflow-y-auto bg-background p-4 pb-20 transition-colors duration-300 md:p-8 md:pb-8"
          >
            <PageTransition>{children}</PageTransition>
          </main>
          <MobileNav permissions={permissions} />
        </div>
      </div>
      <OnboardingWizard />
      <AiCopilotDrawer />
      <AssistantLauncher />
    </>
  );
}
