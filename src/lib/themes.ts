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
 * Ordering is deliberate: the two defaults first, then the light alternatives,
 * then the dark alternatives from most-neutral to most-contrasty.
 */
export const THEMES: readonly ThemeDefinition[] = [
  {
    id: "light",
    label: "Light",
    description: "Default daylight palette",
    isDark: false,
    swatchBackground: "0 0% 100%",
    swatchSurface: "220 6% 96%",
    swatchAccent: "217 91% 60%",
    swatchForeground: "220 9% 12%",
  },
  {
    id: "dark",
    label: "Dark",
    description: "Neutral slate, easy on the eyes",
    isDark: true,
    swatchBackground: "220 13% 6%",
    swatchSurface: "220 10% 16%",
    swatchAccent: "217 91% 60%",
    swatchForeground: "0 0% 98%",
  },
  {
    id: "oled",
    label: "OLED",
    description: "True black — saves battery on OLED screens",
    isDark: true,
    swatchBackground: "0 0% 0%",
    swatchSurface: "0 0% 10%",
    swatchAccent: "213 94% 62%",
    swatchForeground: "0 0% 96%",
  },
  {
    id: "midnight",
    label: "Midnight",
    description: "Deep navy, calm for night shifts",
    isDark: true,
    swatchBackground: "224 47% 7%",
    swatchSurface: "223 40% 16%",
    swatchAccent: "199 89% 60%",
    swatchForeground: "210 40% 96%",
  },
  {
    id: "forest",
    label: "Forest",
    description: "Muted greens, low-glare",
    isDark: true,
    swatchBackground: "150 15% 7%",
    swatchSurface: "150 14% 16%",
    swatchAccent: "142 55% 50%",
    swatchForeground: "140 20% 95%",
  },
  {
    id: "contrast",
    label: "High Contrast",
    description: "Maximum separation for accessibility",
    isDark: true,
    swatchBackground: "0 0% 0%",
    swatchSurface: "0 0% 14%",
    swatchAccent: "210 100% 70%",
    swatchForeground: "0 0% 100%",
  },
  {
    id: "paper",
    label: "Paper",
    description: "Warm sepia, gentler than pure white",
    isDark: false,
    swatchBackground: "40 30% 96%",
    swatchSurface: "40 25% 90%",
    swatchAccent: "25 65% 38%",
    swatchForeground: "25 30% 15%",
  },
] as const;

/** Every selectable id, e.g. `["light", "dark", "oled", …]`. */
export const THEME_IDS = THEMES.map((t) => t.id);

/** Ids that render as a dark UI. */
export const DARK_THEME_IDS = THEMES.filter((t) => t.isDark).map((t) => t.id);

/** Ids that render as a light UI. */
export const LIGHT_THEME_IDS = THEMES.filter((t) => !t.isDark).map((t) => t.id);

/**
 * The pseudo-theme that follows the operating system. Not a real appearance: it
 * is what `next-themes` stores while "follow the OS" is selected, and it resolves
 * to `light` or `dark` at paint time.
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
 * Every name `next-themes` must treat as a theme class.
 *
 * The provider's `themes` prop decides which classes it *removes* from
 * `<html>` before adding the active one. Without this list next-themes only
 * clears `light` and `dark`, so the other five classes accumulate and every
 * token block matches at once — and since the blocks all have equal
 * specificity, whichever is last in the stylesheet silently wins.
 *
 * Deduped because `THEME_IDS` already contains `light` and `dark`.
 */
export const NEXT_THEMES_THEME_NAMES: readonly string[] = [
  ...new Set([...THEME_IDS, "light", "dark"]),
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
 * both "OLED" and "system, currently dark" without special-casing either.
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
