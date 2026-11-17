"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "@/lib/auth-client";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUserPreferences } from "@/contexts/UserPreferencesContext";
import { Sparkles } from "lucide-react";

export default function OnboardingWizard() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const { preferences, preferencesReady, preferencesError } =
    useUserPreferences();

  useEffect(() => {
    if (!session?.user || loaded) return;

    const forceShow = searchParams.get("onboarding") === "1";

    if (forceShow) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-time initialization
      setOpen(true);
      setLoaded(true);
      // Clean up the URL param
      const url = new URL(window.location.href);
      url.searchParams.delete("onboarding");
      router.replace(url.pathname + url.search, { scroll: false });
      return;
    }

    // Wait for the preferences fetch (resolved by UserPreferencesContext) so
    // behavior matches the previous own-fetch flow: open only when the user
    // hasn't completed onboarding and the load didn't fail.
    if (!preferencesReady) return;

    if (!preferencesError && !preferences.onboardingCompleted) {
      setOpen(true);
    }
    setLoaded(true);
  }, [
    session,
    loaded,
    searchParams,
    router,
    preferences,
    preferencesReady,
    preferencesError,
  ]);

  const completeOnboarding = useCallback(async () => {
    setOpen(false);
    try {
      await fetch("/api/user/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingCompleted: true }),
      });
    } catch {
      // Non-critical — wizard closes regardless
    }
  }, []);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) completeOnboarding();
      }}
    >
      <DialogContent className="top-auto bottom-[env(safe-area-inset-bottom)] w-[calc(100%-1.5rem)] max-w-lg translate-y-0 gap-4 overflow-y-auto rounded-2xl p-5 pt-8 sm:p-6 sm:pt-8 md:top-[50%] md:bottom-auto md:max-h-[85dvh] md:translate-y-[-50%]">
        <DialogHeader className="items-center text-center">
          <div className="bg-primary/10 mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full">
            <Sparkles className="text-primary h-7 w-7" />
          </div>
          <DialogTitle className="text-lg sm:text-xl">
            Welcome to Metehara Sugar Factory Portal
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            Your platform for employee housing allocation and organizational
            asset management — requests and approvals, inspections, asset
            tracking, and reports, all in one place.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex-row items-center justify-center sm:justify-center">
          <Button
            onClick={completeOnboarding}
            className="w-full cursor-pointer sm:w-auto"
          >
            Get Started
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
