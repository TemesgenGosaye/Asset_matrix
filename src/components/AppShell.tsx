"use client";

import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import Sidebar from "./Sidebar";
import Navigation from "./Navigation";
import MobileNav from "./MobileNav";
import KeyboardShortcuts from "./KeyboardShortcuts";
import OfflineSyncIndicator from "./OfflineSyncIndicator";
import PageTransition from "./PageTransition";
import { isActivePath } from "@/lib/navigation/registry";

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
  "/forgot-password",
  "/reset-password",
  "/mfa-verify",
  "/offline",
  "/terms",
  "/privacy",
];

interface AppShellProps {
  children: React.ReactNode;
  initialSidebarCollapsed: boolean;
  initialPathname?: string;
  /**
   * The signed-in user's permission strings, resolved once on the server.
   *
   * Used only to decide which nav links to render. Every route re-checks its own
   * permission via `requirePermission`, so a permission-gated link is a courtesy,
   * never the enforcement.
   */
  permissions?: string[];
  /**
   * Server-resolved admin flag. Passed to the nav so admin-only links are
   * decided on the first paint rather than after `useSession()` resolves.
   */
  isAdmin?: boolean;
}

export default function AppShell({
  children,
  initialSidebarCollapsed,
  initialPathname,
  permissions,
  isAdmin = false,
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
      {/*
        Outer shell. `bg-background` is the canvas and nothing else — the content
        area is one flat surface, so the chrome around it has something definite
        to contrast with.

        The ambient radial this replaced (`from-blue-100/20 dark:from-blue-900/5`)
        tinted the whole canvas toward blue, which meant the "page background"
        was a fourth colour that matched neither the chrome nor the cards, and
        never matched itself across the seven themes.
      */}
      <div className="bg-background relative flex h-screen overflow-hidden transition-colors duration-300">
        <Sidebar
          initialCollapsed={initialSidebarCollapsed}
          permissions={permissions}
          isAdmin={isAdmin}
        />
        <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <Navigation />
          <OfflineSyncIndicator />
          <main
            id="main-content"
            className="bg-background flex-1 overflow-y-auto p-4 pb-20 transition-colors duration-300 md:p-8 md:pb-8"
          >
            <PageTransition>{children}</PageTransition>
          </main>
          <MobileNav permissions={permissions} isAdmin={isAdmin} />
        </div>
      </div>
      <OnboardingWizard />
      <AiCopilotDrawer />
      <AssistantLauncher />
    </>
  );
}
