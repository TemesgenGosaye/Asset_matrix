"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useUserPreferences } from "@/contexts/UserPreferencesContext";
import { cn } from "@/lib/utils";
import { DEFAULT_THEME_ID, isDarkTheme, normalizeThemeId } from "@/lib/themes";

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
        className={cn("h-9 w-9 shrink-0 rounded-lg bg-transparent", className)}
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
        "border-border/60 bg-background/80 text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring relative inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border transition-all duration-200 ease-in-out focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-95",
        className,
      )}
    >
      <Sun className="h-4 w-4 scale-100 rotate-0 transition-all duration-300 dark:scale-0 dark:-rotate-90" />
      <Moon className="absolute h-4 w-4 scale-0 rotate-90 transition-all duration-300 dark:scale-100 dark:rotate-0" />
      <span className="sr-only">{label}</span>
    </button>
  );
}
