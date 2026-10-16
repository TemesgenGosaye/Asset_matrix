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
import {
  Sparkles,
  LayoutDashboard,
  Package,
  PanelLeft,
  QrCode,
  BarChart3,
} from "lucide-react";

const STEPS = [
  {
    icon: Sparkles,
    title: "Welcome to Metehara Sugar Factory Portal",
    description:
      "Your comprehensive platform for managing employee housing allocation and organizational assets. This system helps you efficiently allocate houses to employees using a fair MCDA scoring system, while also tracking hardware assets, software licences, and office supplies.",
  },
  {
    icon: LayoutDashboard,
    title: "House Allocation Queue",
    description:
      "The heart of the housing system — view eligible employees ranked by multiple criteria including marital status, family size, distance from factory, and years of service. The queue automatically prioritizes employees based on configurable weights, ensuring fair and transparent house allocation decisions.",
  },
  {
    icon: Package,
    title: "House Request & Approval Process",
    description:
      "Employees can submit house requests through the portal, providing their justification and eligibility details. Managers review requests, approve allocations, and assign available houses from the inventory. Track the complete lifecycle from request to handover to release.",
  },
  {
    icon: PanelLeft,
    title: "House Inspection & Handback",
    description:
      "When employees vacate houses, conduct structured inspections with damage checklists (windows, doors, roof, walls, water panel, electricity). Completing the inspection finalises the handback and files the termination. Print termination receipts with complete inspection records for legal documentation.",
  },
  {
    icon: QrCode,
    title: "Asset Management & Tracking",
    description:
      "Manage factory assets including computers, machinery, furniture, and office equipment. Generate QR code labels for quick scanning and tracking. Assign assets to employees, schedule maintenance, track warranties, and manage software licences — all integrated with the housing system.",
  },
  {
    icon: BarChart3,
    title: "Reports & Administration",
    description:
      "Run detailed reports on house occupancy, allocation history, MCDA scores, and asset inventory. Configure queue weights and eligibility criteria through the secure configuration interface. Manage user roles, departments, and system permissions from the admin panel.",
  },
];

export default function OnboardingWizard() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const { preferences, preferencesReady, preferencesError } =
    useUserPreferences();

  useEffect(() => {
    if (!session?.user || loaded) return;

    const forceShow = searchParams.get("onboarding") === "1";

    if (forceShow) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-time initialization
      setOpen(true);
      setStep(0);
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

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      completeOnboarding();
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const currentStep = STEPS[step];
  const Icon = currentStep.icon;
  const [animating, setAnimating] = useState(false);
  const [direction, setDirection] = useState<"next" | "back">("next");

  const animatedNext = () => {
    setDirection("next");
    setAnimating(true);
    setTimeout(() => {
      handleNext();
      setAnimating(false);
    }, 150);
  };

  const animatedBack = () => {
    setDirection("back");
    setAnimating(true);
    setTimeout(() => {
      handleBack();
      setAnimating(false);
    }, 150);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) completeOnboarding();
      }}
    >
      <DialogContent
        className="max-w-lg"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        {/* Step indicator dots */}
        <div className="flex justify-center gap-1.5 pt-1">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? "bg-primary w-4" : "bg-muted-foreground/25 w-1.5"
              }`}
            />
          ))}
        </div>

        <div
          className="transition-all duration-200 ease-in-out"
          style={{
            opacity: animating ? 0 : 1,
            transform: animating
              ? `translateX(${direction === "next" ? "-12px" : "12px"})`
              : "translateX(0)",
          }}
        >
          <DialogHeader className="items-center text-center">
            <div className="bg-primary/10 mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full">
              <Icon className="text-primary h-7 w-7" />
            </div>
            <DialogTitle className="text-xl">{currentStep.title}</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              {currentStep.description}
            </DialogDescription>
          </DialogHeader>
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={completeOnboarding}>
            Skip
          </Button>

          <span className="text-muted-foreground text-xs">
            {step + 1} / {STEPS.length}
          </span>

          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={animatedBack}>
                Back
              </Button>
            )}
            <Button
              size="sm"
              onClick={step === STEPS.length - 1 ? handleNext : animatedNext}
            >
              {step === STEPS.length - 1 ? "Get Started" : "Next"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
