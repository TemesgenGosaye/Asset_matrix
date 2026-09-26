"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserPreferences } from "@/contexts/UserPreferencesContext";

const emptySubscribe = () => () => {};

const ThemeSwitcher = () => {
  // true only after hydration, so SSR and the first client render both show
  // the skeleton placeholder (prevents a hydration mismatch).
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const { resolvedTheme, setTheme } = useTheme();
  const { updatePreferences } = useUserPreferences();

  if (!mounted) {
    // Skeleton placeholder — same size as the real button to prevent layout shift
    return (
      <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
    );
  }

  // Use the resolved theme so "system" reflects the actual appearance
  // instead of always showing the light-mode state.
  const isDark = resolvedTheme === "dark";

  const toggleTheme = () => {
    const next = isDark ? "light" : "dark";
    setTheme(next);
    // Persist the choice so the server preference doesn't snap it back
    // to dark on the next load or pending preferences fetch.
    updatePreferences({ theme: next }).catch(() => {});
  };

  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        // Base pill shape
        "relative inline-flex h-8 w-[54px] shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent",
        "transition-colors duration-300 ease-in-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        // Track colour
        isDark
          ? "bg-slate-700 shadow-inner shadow-slate-900/60"
          : "bg-sky-400 shadow-inner shadow-sky-500/40",
      )}
    >
      {/* Sliding thumb */}
      <span
        className={cn(
          "pointer-events-none relative flex h-6 w-6 items-center justify-center rounded-full shadow-md ring-0",
          "transition-transform duration-300 ease-in-out",
          isDark
            ? "translate-x-[22px] bg-slate-900"
            : "translate-x-0 bg-white",
        )}
      >
        {/* Sun — light mode */}
        <Sun
          className={cn(
            "absolute h-3.5 w-3.5 text-amber-500 transition-all duration-200",
            isDark ? "scale-0 opacity-0" : "scale-100 opacity-100",
          )}
          strokeWidth={2.5}
        />
        {/* Moon — dark mode */}
        <Moon
          className={cn(
            "absolute h-3.5 w-3.5 text-sky-300 transition-all duration-200",
            isDark ? "scale-100 opacity-100" : "scale-0 opacity-0",
          )}
          strokeWidth={2.5}
        />
      </span>

      {/* Decorative icon in the track (opposite side) */}
      <span
        aria-hidden
        className={cn(
          "absolute transition-all duration-300",
          isDark ? "left-1.5" : "right-1.5",
        )}
      >
        {isDark ? (
          <Sun className="h-3 w-3 text-white/40" strokeWidth={2} />
        ) : (
          <Moon className="h-3 w-3 text-white/60" strokeWidth={2} />
        )}
      </span>
    </button>
  );
};

export default ThemeSwitcher;
