"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useUserPreferences } from "@/contexts/UserPreferencesContext";
import { cn } from "@/lib/utils";
import {
  DEFAULT_THEME_ID,
  isDarkTheme,
  normalizeThemeId,
} from "@/lib/themes";

const emptySubscribe = () => () => {};

export default function ThemeSwitcher({
  className,
}: {
  className?: string;
} = {}) {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { updatePreferences } = useUserPreferences();

  const activeId = useMemo(() => {
    if (!mounted) return DEFAULT_THEME_ID;
    return normalizeThemeId(theme, resolvedTheme ?? DEFAULT_THEME_ID);
  }, [mounted, theme, resolvedTheme]);

  const isDark = useMemo(
    () => isDarkTheme(activeId, resolvedTheme === "dark"),
    [activeId, resolvedTheme],
  );

  const toggleTheme = useCallback(() => {
    const nextTheme = isDark ? "light" : "dark";
    setTheme(nextTheme);
    updatePreferences({ theme: nextTheme }).catch(() => {});
  }, [isDark, setTheme, updatePreferences]);

  if (!mounted) {
    return (
      <div
        className={cn(
          "h-9 w-9 shrink-0 rounded-lg bg-transparent",
          className,
        )}
        aria-hidden="true"
      />
    );
  }

  const label = isDark ? "Switch to light theme" : "Switch to dark theme";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className={cn(
        "relative inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border/60 bg-background/80 text-foreground transition-all duration-200 ease-in-out hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95",
        className,
      )}
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all duration-300 dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all duration-300 dark:rotate-0 dark:scale-100" />
      <span className="sr-only">{label}</span>
    </button>
  );
}
