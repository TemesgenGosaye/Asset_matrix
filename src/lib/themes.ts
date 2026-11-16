/**
 * Theme registry — the single source of truth for the portal's appearance.
 *
 * WHY A REGISTRY RATHER THAN AN ENUM: a theme is not just an id. The switcher has
 * to render a label, a one-line description, a live colour preview and a
 * light/dark flag for every option, and `next-themes` will happily apply any
 * string you hand it. Keeping the metadata beside the id means a theme cannot be
 * half-registered, and `isThemeId()` lets the preferences API reject a value the
 * UI never offered.
 *
 * HOW THEMES ARE APPLIED: `next-themes` writes the theme id as a CLASS on <html>
 * (`attribute="class"`), and globals.css defines one token block per class.
 * Because every "is this a dark theme?" question in the app is answered by
 * Tailwind's `dark:` variant, the registry's `isDark` flag is mirrored into the
 * `@custom-variant dark` selector list in globals.css — `src/lib/__tests__/
 * themes.test.ts` asserts the two never drift.
 */

/** A selectable appearance. `id` becomes the class on `<html>`. */
export interface ThemeDefinition {
  /** Stable identifier. Also the `localStorage` value and the CSS class name. */
  id: string;
  /** Short name shown in the picker. */
  label: string;
  /** One-line rationale shown under the label. */
  description: string;
  /**
   * True for dark appearances. Drives the `dark:` variant membership in
   * globals.css and the preview swatch's chrome.
   */
  isDark: boolean;
  /** Preview: page background, as an `hsl()` string. */
  swatchBackground: string;
  /** Preview: surface (card) colour, as an `hsl()` string. */
  swatchSurface: string;
  /** Preview: accent colour, as an `hsl()` string. */
  swatchAccent: string;
  /** Preview: text colour, as an `hsl()` string. */
  swatchForeground: string;
}

/**
 * Every theme, in the order the picker shows them.
 *
 * Exactly two: the portal ships a single light palette and a single dark
 * palette. The registry stays a registry (rather than a two-value enum) so the
 * picker can keep rendering a live colour preview, a label and a light/dark
 * flag per option, and so `isThemeId()` can still reject a value the UI never
 * offered.
 */
export const THEMES: readonly ThemeDefinition[] = [
  {
    id: "light",
    label: "Light",
    description: "Default daylight palette",
    isDark: false,
    swatchBackground: "0 0% 100%",
    swatchSurface: "220 6% 96%",
    swatchAccent: "200 100% 30%",
    swatchForeground: "220 9% 12%",
  },
  {
    id: "dark",
    label: "Dark",
    description: "Neutral slate, easy on the eyes",
    isDark: true,
    swatchBackground: "220 13% 6%",
    swatchSurface: "220 10% 16%",
    swatchAccent: "200 85% 45%",
    swatchForeground: "0 0% 98%",
  },
] as const;

/** Every selectable id, e.g. `["light", "dark", "oled", …]`. */
export const THEME_IDS = THEMES.map((t) => t.id);

/** Ids that render as a dark UI. */
export const DARK_THEME_IDS = THEMES.filter((t) => t.isDark).map((t) => t.id);

/** Ids that render as a light UI. */
export const LIGHT_THEME_IDS = THEMES.filter((t) => !t.isDark).map((t) => t.id);

/**
 * The pseudo-theme that follows the operating system. Not a real appearance and
 * not offered in the picker: it is what `next-themes` stores while the user has
 * not made an explicit choice, and it resolves to `light` or `dark` at paint
 * time. Kept in the registry because it is still a legal stored preference
 * (every user who never picked a theme has it) and because the OS default is
 * what a fresh visitor gets.
 */
export const SYSTEM_THEME_ID = "system";

/** `localStorage` key. Must match the `storageKey` on the ThemeProvider. */
export const THEME_STORAGE_KEY = "msf-theme";

/** The theme used before anything is chosen, and the fallback for bad input. */
export const DEFAULT_THEME_ID = "light";

/** Every value the API will accept: the real themes plus `system`. */
export const ACCEPTED_THEME_IDS: readonly string[] = [
  SYSTEM_THEME_ID,
  ...THEME_IDS,
];

/**
 * Themes that used to ship and are no longer selectable.
 *
 * The column in `user_preferences` is free text, so rows can still hold one of
 * these ids. They are mapped onto the palette that matches their original
 * appearance instead of being rejected outright, so a user who picked OLED does
 * not lose their choice to a broken class on `<html>`.
 */
export const LEGACY_DARK_THEME_IDS: readonly string[] = [
  "oled",
  "midnight",
  "forest",
  "contrast",
];

export const LEGACY_LIGHT_THEME_IDS: readonly string[] = ["paper"];

/** Every id that was once selectable but is not any more. */
export const LEGACY_THEME_IDS: readonly string[] = [
  ...LEGACY_DARK_THEME_IDS,
  ...LEGACY_LIGHT_THEME_IDS,
];

/**
 * Every name `next-themes` must treat as a theme class.
 *
 * The provider's `themes` prop decides which classes it *removes* from
 * `<html>` before adding the active one. Without this list next-themes only
 * clears `light` and `dark`, so any other class that ever reached the element
 * would accumulate - and since the blocks all have equal specificity,
 * whichever is last in the stylesheet would silently win.
 *
 * The retired ids are in the list too: a browser that still has "oled" in
 * localStorage must have that class REMOVED, otherwise it sits next to the
 * active theme for the rest of the session.
 *
 * Deduped because `THEME_IDS` already contains `light` and `dark`.
 */
export const NEXT_THEMES_THEME_NAMES: readonly string[] = [
  ...new Set([...THEME_IDS, "light", "dark", ...LEGACY_THEME_IDS]),
];

/** Narrow an unknown value to a theme id, or `null` when unrecognised. */
export function toThemeId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return THEME_IDS.includes(value) ? value : null;
}

/** True when `value` is a registered theme id or the `system` sentinel. */
export function isAcceptedThemeId(value: unknown): value is string {
  return typeof value === "string" && ACCEPTED_THEME_IDS.includes(value);
}

/**
 * Map any stored preference onto a theme that still exists.
 *
 * Handles the three kinds of value that can be sitting in the free-text
 * `user_preferences.theme` column:
 *   * a live id ("light" / "dark") - returned unchanged;
 *   * a removed id ("oled", "paper", …) - mapped onto the palette with the
 *     same lightness, so the user keeps a dark (or light) UI;
 *   * the `system` sentinel - resolved by the caller, which knows the OS
 *     preference (`systemTheme`), because the server cannot.
 *
 * Anything else falls back to the default, so a corrupt row can never write a
 * dead class onto `<html>`.
 */
export function normalizeThemeId(
  value: unknown,
  systemTheme: string = DEFAULT_THEME_ID,
): string {
  if (typeof value !== "string") return DEFAULT_THEME_ID;
  if (THEME_IDS.includes(value)) return value;
  if (value === SYSTEM_THEME_ID) {
    // The caller decides how "follow the OS" resolves: pass "light"/"dark"
    // when the OS preference is known, or SYSTEM_THEME_ID to keep it symbolic
    // (the server has no way to read the OS preference).
    if (systemTheme === SYSTEM_THEME_ID) return SYSTEM_THEME_ID;
    return THEME_IDS.includes(systemTheme) ? systemTheme : DEFAULT_THEME_ID;
  }
  if (LEGACY_DARK_THEME_IDS.includes(value)) return "dark";
  if (LEGACY_LIGHT_THEME_IDS.includes(value)) return "light";
  return DEFAULT_THEME_ID;
}

/** Look up a theme by id. Returns `null` for `system` and unknown ids. */
export function getTheme(id: unknown): ThemeDefinition | null {
  const resolved = toThemeId(id);
  if (!resolved) return null;
  return THEMES.find((t) => t.id === resolved) ?? null;
}

/** Look up a theme by id, falling back to the default. Never returns null. */
export function getThemeOrDefault(id: unknown): ThemeDefinition {
  return getTheme(id) ?? THEMES[0];
}

/**
 * Is the given theme a dark appearance?
 *
 * Resolves `system` against the OS preference, so callers get one boolean for
 * both "dark" and "system, currently dark" without special-casing either.
 */
export function isDarkTheme(
  id: unknown,
  prefersDark: boolean | null = null,
): boolean {
  if (id === SYSTEM_THEME_ID) return Boolean(prefersDark);
  return getTheme(id)?.isDark ?? false;
}

/** The theme label for an id, including the `system` sentinel. */
export function getThemeLabel(id: unknown): string {
  if (id === SYSTEM_THEME_ID) return "System";
  return getTheme(id)?.label ?? "Unknown";
}

/**
 * The CSS class that must appear on `<html>` for a given theme id.
 *
 * `system` resolves to `light` or `dark` from the OS preference, matching what
 * next-themes writes. Exported so a test (or a future server-side renderer) can
 * assert agreement with next-themes rather than duplicating the rule.
 */
export function themeClassFor(
  id: unknown,
  prefersDark: boolean | null = null,
): string {
  if (id === SYSTEM_THEME_ID) return prefersDark ? "dark" : "light";
  return getThemeOrDefault(id).id;
}
