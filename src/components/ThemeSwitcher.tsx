"use client";

/**
 * Appearance picker.
 *
 * Replaces the old two-state sun/moon button. The trigger now opens a menu of
 * every registered theme, each shown with a live colour preview, a label and a
 * one-line rationale, with the active one marked by a radio indicator.
 *
 * Design notes:
 *   * The selected item is `theme` (which may be the `system` sentinel), NOT
 *     `resolvedTheme` — otherwise picking "System" would appear to select
 *     "Light" or "Dark" and the user could never find their own setting again.
 *   * Dark/light is read from the theme REGISTRY (`isDarkTheme`), because
 *     `resolvedTheme === "dark"` is false for OLED, Midnight, Forest and High
 *     Contrast and would render the wrong icon.
 *   * Hydration-safe via `useSyncExternalStore`: the server and the first client
 *     render both render a same-sized placeholder, so nothing shifts.
 */

import {
  useCallback,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  Accessibility,
  Check,
  ChevronDown,
  Contrast,
  FileText,
  Leaf,
  MonitorSmartphone,
  Moon,
  MoonStar,
  Sun,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "next-themes";
import { useUserPreferences } from "@/contexts/UserPreferencesContext";
import { cn } from "@/lib/utils";
import {
  DARK_THEME_IDS,
  DEFAULT_THEME_ID,
  LIGHT_THEME_IDS,
  SYSTEM_THEME_ID,
  THEMES,
  getThemeLabel,
  isDarkTheme,
  type ThemeDefinition,
} from "@/lib/themes";

/** `true` only after hydration; `false` during SSR and the first client render. */
const emptySubscribe = () => () => {};

/** Rendered once per icon at module scope; keeps the elements static. */
function themeIcon(Icon: LucideIcon) {
  return (
    <Icon className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden="true" />
  );
}

/**
 * Trigger icon per theme, so it communicates more than "light vs dark".
 *
 * These are pre-built ELEMENTS, not component types. Keeping component types in
 * a map and rendering `<Icon />` from a variable would create a new component
 * type on every render, which remounts the svg and trips
 * `react-hooks/static-components`.
 */
const THEME_ICONS: Record<string, ReactNode> = {
  light: themeIcon(Sun),
  paper: themeIcon(FileText),
  dark: themeIcon(Moon),
  oled: themeIcon(Contrast),
  midnight: themeIcon(MoonStar),
  forest: themeIcon(Leaf),
  contrast: themeIcon(Accessibility),
  // `system` (and any unrecognised value) gets the device glyph.
  [SYSTEM_THEME_ID]: themeIcon(MonitorSmartphone),
};

/**
 * A miniature of the theme: page background, a surface block and an accent dot.
 *
 * Drawn from inline styles rather than CSS classes because these colours exist
 * only inside the registry - there is no class to hang a `bg-*` on until the
 * theme is actually applied.
 */
function ThemeSwatch({
  theme,
  className,
}: {
  theme: ThemeDefinition;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex h-6 w-9 shrink-0 items-center overflow-hidden rounded-[5px] border",
        className,
      )}
      style={{
        background: `hsl(${theme.swatchBackground})`,
        borderColor: theme.isDark
          ? "rgb(255 255 255 / 0.18)"
          : "rgb(0 0 0 / 0.14)",
      }}
    >
      {/* surface block, echoing a card */}
      <span
        className="absolute top-1 bottom-1 left-1 w-4 rounded-[3px]"
        style={{ background: `hsl(${theme.swatchSurface})` }}
      />
      {/* accent dot, echoing the primary colour */}
      <span
        className="absolute top-1.5 right-1 h-1.5 w-1.5 rounded-full"
        style={{ background: `hsl(${theme.swatchAccent})` }}
      />
      {/* text rule, echoing the foreground */}
      <span
        className="absolute right-1 bottom-1 h-0.5 w-2 rounded-full"
        style={{ background: `hsl(${theme.swatchForeground})`, opacity: 0.55 }}
      />
    </span>
  );
}

/**
 * Row class for every selectable entry.
 *
 * `pl-2` cancels the primitive's default `pl-8`, which reserves room for its
 * own leading `ItemIndicator`. We draw the check on the trailing edge instead,
 * because the check then lines up with the chevron column of the trigger. The
 * primitive's indicator only renders when the item is checked, so overriding
 * the padding alone leaves no double check.
 */
const ROW_CLASS = "cursor-pointer gap-3 py-2 pr-2 pl-2";

/** One selectable row: preview, label, rationale, radio indicator. */
function ThemeRow({
  theme,
  selected,
  onSelect,
}: {
  theme: ThemeDefinition;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuRadioItem
      value={theme.id}
      onSelect={onSelect}
      className={ROW_CLASS}
      // Radix marks the checked row with `data-state` but does not expose the
      // value, so this hook is what lets tests (and anyone debugging) address a
      // specific theme.
      data-theme-id={theme.id}
    >
      <ThemeSwatch theme={theme} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm leading-tight font-medium">{theme.label}</span>
        <span className="text-muted-foreground truncate text-xs leading-tight">
          {theme.description}
        </span>
      </span>
      <Check
        className={cn(
          "text-primary h-4 w-4 shrink-0 transition-opacity",
          selected ? "opacity-100" : "opacity-0",
        )}
        aria-hidden="true"
      />
    </DropdownMenuRadioItem>
  );
}

export default function ThemeSwitcher() {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { updatePreferences } = useUserPreferences();

  /**
   * The id we persist and highlight.
   *
   * `theme` is undefined until next-themes has read localStorage, so fall back
   * to the portal default rather than reporting "no selection".
   */
  const activeId = mounted ? (theme ?? DEFAULT_THEME_ID) : DEFAULT_THEME_ID;

  /**
   * Dark or not, resolved from the registry.
   *
   * `resolvedTheme` is next-themes' own answer for the `system` case and it
   * re-renders when the OS flips, so reading it here keeps the trigger in sync
   * for free. Reading the OS preference directly would need a `matchMedia`
   * subscription that the registry would then have to be told about.
   */
  const effectiveIsDark = useMemo(
    () => isDarkTheme(activeId, resolvedTheme === "dark"),
    [activeId, resolvedTheme],
  );

  const select = useCallback(
    (id: string) => {
      setTheme(id);
      // Persist so the choice survives a different device / a cleared
      // localStorage. A failure here must not undo the visual change, hence the
      // swallowed rejection - next-themes has already applied it locally.
      updatePreferences({ theme: id }).catch(() => {});
    },
    [setTheme, updatePreferences],
  );

  if (!mounted) {
    // Same box as the real trigger, so the navbar does not shift on hydration.
    return (
      <div
        className="bg-muted h-9 w-9 animate-pulse rounded-md"
        aria-hidden="true"
      />
    );
  }

  const activeIcon = THEME_ICONS[activeId] ?? THEME_ICONS[DEFAULT_THEME_ID];
  const activeLabel = getThemeLabel(activeId);
  const lightThemes = THEMES.filter((t) => LIGHT_THEME_IDS.includes(t.id));
  const darkThemes = THEMES.filter((t) => DARK_THEME_IDS.includes(t.id));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Appearance: ${activeLabel}. Change theme`}
          title={`Appearance: ${activeLabel}`}
          className={cn(
            "inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2",
            "transition-colors duration-200 ease-in-out",
            "hover:bg-accent hover:text-accent-foreground",
            "focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
            // `text-primary` only for a genuinely dark theme, so the trigger
            // reads as "currently dark" at a glance.
            effectiveIsDark && "text-primary",
          )}
        >
          {activeIcon}
          {/* The name is hidden on the smallest screens so the navbar keeps its
              single-line layout on phones. */}
          <span className="hidden text-sm font-medium lg:inline">
            {activeLabel}
          </span>
          <ChevronDown
            className="text-muted-foreground hidden h-3.5 w-3.5 shrink-0 lg:inline"
            aria-hidden="true"
          />
          <span className="sr-only">{activeLabel}</span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Appearance
        </DropdownMenuLabel>

        {/* System first: it is a different KIND of choice (follow the OS), not
            another colour. */}
        <DropdownMenuRadioGroup
          value={activeId}
          onValueChange={(value) => select(value)}
        >
          <DropdownMenuRadioItem
            value={SYSTEM_THEME_ID}
            onSelect={() => select(SYSTEM_THEME_ID)}
            className={ROW_CLASS}
            data-theme-id={SYSTEM_THEME_ID}
          >
            <span
              aria-hidden="true"
              className="bg-muted flex h-6 w-9 shrink-0 items-center justify-center rounded-[5px] border"
            >
              <MonitorSmartphone className="text-muted-foreground h-3.5 w-3.5" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm leading-tight font-medium">System</span>
              <span className="text-muted-foreground truncate text-xs leading-tight">
                Match this device&apos;s setting
              </span>
            </span>
            <Check
              className={cn(
                "text-primary h-4 w-4 shrink-0 transition-opacity",
                activeId === SYSTEM_THEME_ID ? "opacity-100" : "opacity-0",
              )}
              aria-hidden="true"
            />
          </DropdownMenuRadioItem>

          {lightThemes.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Light
              </DropdownMenuLabel>
              {lightThemes.map((themeOption) => (
                <ThemeRow
                  key={themeOption.id}
                  theme={themeOption}
                  selected={activeId === themeOption.id}
                  onSelect={() => select(themeOption.id)}
                />
              ))}
            </>
          ) : null}

          {darkThemes.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Dark
              </DropdownMenuLabel>
              {darkThemes.map((themeOption) => (
                <ThemeRow
                  key={themeOption.id}
                  theme={themeOption}
                  selected={activeId === themeOption.id}
                  onSelect={() => select(themeOption.id)}
                />
              ))}
            </>
          ) : null}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
