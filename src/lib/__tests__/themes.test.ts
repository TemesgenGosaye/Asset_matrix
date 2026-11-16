import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ACCEPTED_THEME_IDS,
  DARK_THEME_IDS,
  DEFAULT_THEME_ID,
  LEGACY_THEME_IDS,
  LIGHT_THEME_IDS,
  NEXT_THEMES_THEME_NAMES,
  SYSTEM_THEME_ID,
  THEMES,
  THEME_IDS,
  THEME_STORAGE_KEY,
  getTheme,
  getThemeLabel,
  getThemeOrDefault,
  isAcceptedThemeId,
  isDarkTheme,
  normalizeThemeId,
  themeClassFor,
  toThemeId,
} from "../themes";

const GLOBALS_CSS = resolve(process.cwd(), "src/app/globals.css");
const css = readFileSync(GLOBALS_CSS, "utf8");

/**
 * CSS with all comments removed.
 *
 * Needed for the drift guards below: the file's own comments legitimately name
 * selectors (`.dark .assistant-prose`) while explaining that they are gone, and
 * matching a prose reference would report a bug that does not exist.
 */
const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * Selector that carries a theme's tokens.
 *
 * Light is the `:root` default rather than a `.light` block — writing
 * `--background` under `:root` means the unclassed document (server HTML, or a
 * failed hydration) is already a valid light theme.
 */
function selectorFor(id: string): string {
  return id === DEFAULT_THEME_ID ? ":root" : `.${id}`;
}

/** Body of a theme's `{ ... }` block, located by brace matching. */
function blockFor(selector: string): string {
  const at = css.indexOf(`\n  ${selector} {`);
  expect(at, `no token block for ${selector}`).toBeGreaterThan(-1);
  const open = css.indexOf("{", at);
  const close = css.indexOf("}", open);
  return css.slice(open, close);
}

describe("theme registry", () => {
  it("exposes unique, non-empty ids", () => {
    expect(THEME_IDS.length).toBeGreaterThan(0);
    expect(new Set(THEME_IDS).size).toBe(THEME_IDS.length);
    for (const theme of THEMES) {
      expect(theme.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(theme.label.trim()).not.toBe("");
      expect(theme.description.trim()).not.toBe("");
    }
  });

  it("includes the two historical themes so existing users keep their choice", () => {
    expect(THEME_IDS).toContain("light");
    expect(THEME_IDS).toContain("dark");
    expect(DEFAULT_THEME_ID).toBe("light");
  });

  it("offers exactly two themes: light and dark", () => {
    expect(THEME_IDS).toEqual(["light", "dark"]);
    expect(THEMES).toHaveLength(2);
    // Every retired id must be gone from the selectable list, otherwise the
    // picker would offer a theme the stylesheet no longer defines.
    for (const retired of LEGACY_THEME_IDS) {
      expect(THEME_IDS).not.toContain(retired);
    }
  });

  it("partitions every theme into exactly one light/dark bucket", () => {
    expect(LIGHT_THEME_IDS.length + DARK_THEME_IDS.length).toBe(
      THEME_IDS.length,
    );
    expect(new Set([...LIGHT_THEME_IDS, ...DARK_THEME_IDS]).size).toBe(
      THEME_IDS.length,
    );
    for (const theme of THEMES) {
      const bucket = theme.isDark ? DARK_THEME_IDS : LIGHT_THEME_IDS;
      expect(bucket).toContain(theme.id);
    }
  });

  it("keeps the storage key in sync with the ThemeProvider", () => {
    const providers = readFileSync(
      resolve(process.cwd(), "src/lib/providers.tsx"),
      "utf8",
    );
    // Asserted as a reference, not a literal: the provider must read the
    // constant, so a renamed key cannot silently orphan saved themes.
    expect(providers).toMatch(/storageKey=\{THEME_STORAGE_KEY\}/);
    expect(providers).toMatch(/defaultTheme=\{SYSTEM_THEME_ID\}/);
    // `attribute="class"` is what lets any theme id reach the CSS.
    expect(providers).toMatch(/attribute="class"/);
  });

  /**
   * Regression: classes stacking up on <html>.
   *
   * With `attribute="class"`, next-themes removes only the names in its
   * `themes` prop before adding the active one. Left at its default
   * `['light','dark']`, a retired class such as `oled` was never cleared, so it
   * sat next to the active theme for the rest of the session. This is what
   * `NEXT_THEMES_THEME_NAMES` prevents.
   */
  it("tells next-themes every class it must be able to clear", () => {
    expect([...NEXT_THEMES_THEME_NAMES].sort()).toEqual(
      [...new Set([...THEME_IDS, "light", "dark", ...LEGACY_THEME_IDS])].sort(),
    );
    // Every registered theme must be removable.
    for (const id of THEME_IDS) {
      expect(NEXT_THEMES_THEME_NAMES).toContain(id);
    }
    // And so must every retired one, or it survives on <html>.
    for (const id of LEGACY_THEME_IDS) {
      expect(NEXT_THEMES_THEME_NAMES).toContain(id);
    }
    // And the provider must actually be handed it.
    const providers = readFileSync(
      resolve(process.cwd(), "src/lib/providers.tsx"),
      "utf8",
    );
    expect(providers).toMatch(/themes=\{\[\.\.\.NEXT_THEMES_THEME_NAMES\]\}/);
  });
});

describe("toThemeId / isAcceptedThemeId", () => {
  it("accepts every registered id", () => {
    for (const id of THEME_IDS) {
      expect(toThemeId(id)).toBe(id);
      expect(isAcceptedThemeId(id)).toBe(true);
    }
  });

  it("accepts the system sentinel but is not a real theme", () => {
    expect(isAcceptedThemeId(SYSTEM_THEME_ID)).toBe(true);
    // `system` resolves to light/dark at paint time, so it has no metadata.
    expect(toThemeId(SYSTEM_THEME_ID)).toBeNull();
    expect(getTheme(SYSTEM_THEME_ID)).toBeNull();
  });

  it("rejects unknown and non-string values", () => {
    for (const bad of ["neon", "", "LIGHT", "oled ", null, undefined, 42, {}]) {
      expect(toThemeId(bad)).toBeNull();
      expect(isAcceptedThemeId(bad)).toBe(false);
    }
  });

  it("lists every accepted value exactly once", () => {
    expect(new Set(ACCEPTED_THEME_IDS).size).toBe(ACCEPTED_THEME_IDS.length);
    expect(ACCEPTED_THEME_IDS).toContain(SYSTEM_THEME_ID);
    for (const id of THEME_IDS) expect(ACCEPTED_THEME_IDS).toContain(id);
  });
});

describe("getTheme / getThemeLabel / getThemeOrDefault", () => {
  it("returns the matching definition", () => {
    const dark = getTheme("dark");
    expect(dark?.label).toBe("Dark");
    expect(dark?.isDark).toBe(true);
  });

  it("falls back rather than throwing on bad input", () => {
    expect(getTheme("nope")).toBeNull();
    expect(getThemeOrDefault("nope").id).toBe(DEFAULT_THEME_ID);
    expect(getThemeLabel(SYSTEM_THEME_ID)).toBe("System");
    expect(getThemeLabel("nope")).toBe("Unknown");
  });
});

describe("normalizeThemeId", () => {
  it("keeps a live theme unchanged", () => {
    expect(normalizeThemeId("light")).toBe("light");
    expect(normalizeThemeId("dark")).toBe("dark");
  });

  it("maps a retired theme onto the palette with the same lightness", () => {
    for (const retired of ["oled", "midnight", "forest", "contrast"]) {
      expect(normalizeThemeId(retired)).toBe("dark");
    }
    expect(normalizeThemeId("paper")).toBe("light");
  });

  it("resolves the system sentinel with the OS preference the caller knows", () => {
    expect(normalizeThemeId(SYSTEM_THEME_ID, "dark")).toBe("dark");
    expect(normalizeThemeId(SYSTEM_THEME_ID, "light")).toBe("light");
    // The server cannot read the OS, so it keeps the sentinel symbolic.
    expect(normalizeThemeId(SYSTEM_THEME_ID, SYSTEM_THEME_ID)).toBe(
      SYSTEM_THEME_ID,
    );
  });

  it("falls back to the default for junk", () => {
    expect(normalizeThemeId("neon")).toBe(DEFAULT_THEME_ID);
    expect(normalizeThemeId("")).toBe(DEFAULT_THEME_ID);
    expect(normalizeThemeId(null)).toBe(DEFAULT_THEME_ID);
    expect(normalizeThemeId(undefined)).toBe(DEFAULT_THEME_ID);
    expect(normalizeThemeId(42)).toBe(DEFAULT_THEME_ID);
  });
});

describe("isDarkTheme", () => {
  it("reads the registry, so the dark theme counts as dark", () => {
    // The regression this guards: the old switcher used
    // `resolvedTheme === "dark"`, which is false for every theme except "dark".
    for (const id of DARK_THEME_IDS) {
      expect(isDarkTheme(id)).toBe(true);
    }
    for (const id of LIGHT_THEME_IDS) {
      expect(isDarkTheme(id)).toBe(false);
    }
  });

  it("resolves `system` against the OS preference", () => {
    expect(isDarkTheme(SYSTEM_THEME_ID, true)).toBe(true);
    expect(isDarkTheme(SYSTEM_THEME_ID, false)).toBe(false);
    // Unknown preference is treated as light, matching the CSS default.
    expect(isDarkTheme(SYSTEM_THEME_ID, null)).toBe(false);
  });

  it("defaults an unknown id to light rather than throwing", () => {
    expect(isDarkTheme("garbage")).toBe(false);
    expect(isDarkTheme(undefined)).toBe(false);
  });
});

describe("themeClassFor", () => {
  it("returns the id itself for a concrete theme", () => {
    expect(themeClassFor("light")).toBe("light");
    expect(themeClassFor("dark")).toBe("dark");
  });

  it("resolves `system` to the class next-themes writes", () => {
    expect(themeClassFor(SYSTEM_THEME_ID, true)).toBe("dark");
    expect(themeClassFor(SYSTEM_THEME_ID, false)).toBe("light");
  });

  it("falls back to the default for an unknown id", () => {
    expect(themeClassFor("nope")).toBe(DEFAULT_THEME_ID);
    // A retired id has no class any more, so it must not be handed to the DOM.
    expect(themeClassFor("oled")).toBe(DEFAULT_THEME_ID);
  });
});

// ---------------------------------------------------------------------------
// Drift guards against globals.css
//
// The CSS is the other half of this feature: it defines one token block per
// theme class and an `@custom-variant dark` selector list. A theme added to the
// registry without the matching CSS would render as an unstyled page, and a dark
// theme missing from the variant list would silently lose all 500+ `dark:`
// utilities in the codebase. These assertions make that a build failure.
// ---------------------------------------------------------------------------

describe("globals.css stays in sync with the registry", () => {
  it("defines a token block for every theme", () => {
    for (const theme of THEMES) {
      const selector = selectorFor(theme.id);
      expect(
        new RegExp(`\\${selector}\\s*\\{`).test(css),
        `globals.css has no "${selector} { ... }" token block`,
      ).toBe(true);
    }
  });

  it("includes every dark theme in the `dark` Tailwind variant", () => {
    const variant = css.slice(
      css.indexOf("@custom-variant dark"),
      css.indexOf("@theme {"),
    );
    expect(variant).toBeTruthy();
    for (const id of DARK_THEME_IDS) {
      expect(
        new RegExp(`\\.${id}\\b`).test(variant),
        `dark theme "${id}" is missing from @custom-variant dark, so every dark: utility would be inert on it`,
      ).toBe(true);
    }
  });

  it("does not list light themes as dark", () => {
    const variant = css.slice(
      css.indexOf("@custom-variant dark"),
      css.indexOf("@theme {"),
    );
    for (const id of LIGHT_THEME_IDS) {
      expect(new RegExp(`\\.${id}\\b`).test(variant)).toBe(false);
    }
  });

  it("declares a dark colour-scheme for every dark theme", () => {
    // Native form controls, scrollbars and the caret follow color-scheme, so a
    // dark theme that omits it gets light scrollbars on a black page.
    const scheme = cssWithoutComments.slice(
      cssWithoutComments.indexOf("color-scheme: light"),
    );
    for (const id of DARK_THEME_IDS) {
      expect(
        new RegExp(`\\.${id}\\b`).test(scheme),
        `"${id}" is missing from the color-scheme: dark list`,
      ).toBe(true);
    }
  });

  it("defines every token the light theme defines, in every theme", () => {
    // A theme that forgets one token silently falls back to the light value.
    const tokens = [
      "--background",
      "--foreground",
      "--card",
      "--card-foreground",
      "--popover",
      "--popover-foreground",
      "--primary",
      "--primary-foreground",
      "--secondary",
      "--secondary-foreground",
      "--muted",
      "--muted-foreground",
      "--accent",
      "--accent-foreground",
      "--destructive",
      "--destructive-foreground",
      "--border",
      "--input",
      "--ring",
      "--chart-1",
      "--chart-2",
      "--chart-3",
      "--chart-4",
      "--chart-5",
      "--success",
      "--success-foreground",
      "--success-bg",
      "--warning",
      "--warning-foreground",
      "--warning-bg",
      "--info",
      "--info-foreground",
      "--info-bg",
      "--assist-mix-target",
      "--shadow-sm",
      "--shadow-md",
    ];

    for (const theme of THEMES) {
      const body = blockFor(selectorFor(theme.id));
      for (const token of tokens) {
        expect(
          body.includes(`${token}:`),
          `theme "${theme.id}" does not define ${token}`,
        ).toBe(true);
      }
    }
  });

  it("keeps only the light and dark token blocks", () => {
    // A retired theme must lose its block, otherwise its rules would still
    // apply to any element that kept the class.
    for (const retired of LEGACY_THEME_IDS) {
      expect(
        new RegExp(`\\.${retired}\\s*\\{`).test(css),
        `globals.css still defines a token block for the retired theme "${retired}"`,
      ).toBe(false);
    }
  });

  it("has no leftover per-theme dark overrides that would bypass the tokens", () => {
    // The maplibre popup and assistant rules used to be `.dark`-scoped with
    // hard-coded colours; they are now token-driven. A `.dark`-scoped override
    // would mean a colour that ignores which of the two themes is active.
    // Matched against comment-stripped CSS: the prose explaining this rule
    // mentions the old selectors by name on purpose.
    expect(cssWithoutComments).not.toMatch(/\.dark\s+\.maplibregl-popup/);
    expect(cssWithoutComments).not.toMatch(/\.dark\s+\.assistant-prose/);
  });
});
