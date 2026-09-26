import { describe, it, expect, beforeEach } from "vitest";
import {
  t,
  setLocale,
  getLocale,
  registerLocale,
  AVAILABLE_LOCALES,
} from "@/lib/i18n";

// Reset locale to English before each test
beforeEach(() => {
  setLocale("en");
});

// ---------------------------------------------------------------------------
// 1. AVAILABLE_LOCALES
// ---------------------------------------------------------------------------
describe("AVAILABLE_LOCALES", () => {
  it("contains all 5 locale codes with display names", () => {
    expect(AVAILABLE_LOCALES).toEqual({
      en: "English",
      de: "Deutsch",
      fr: "Français",
      es: "Español",
      nl: "Nederlands",
    });
  });

  it("has exactly 5 entries", () => {
    expect(Object.keys(AVAILABLE_LOCALES)).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// 2. getLocale / setLocale
// ---------------------------------------------------------------------------
describe("getLocale / setLocale", () => {
  it("defaults to 'en'", () => {
    expect(getLocale()).toBe("en");
  });

  it("setLocale changes the active locale", () => {
    setLocale("de");
    expect(getLocale()).toBe("de");
  });

  it("accepts arbitrary locale strings (even unregistered ones)", () => {
    setLocale("xx");
    expect(getLocale()).toBe("xx");
  });
});

// ---------------------------------------------------------------------------
// 3. t() basic translation
// ---------------------------------------------------------------------------
describe("t() basic translation", () => {
  it("translates a known key in English", () => {
    expect(t("nav.dashboard")).toBe("Dashboard");
  });

  it("translates another known key in English", () => {
    expect(t("action.save")).toBe("Save");
  });
});

// ---------------------------------------------------------------------------
// 4. t() fallback to raw key
// ---------------------------------------------------------------------------
describe("t() fallback to raw key", () => {
  it("returns the raw key when the key does not exist in any locale", () => {
    expect(t("totally.unknown.key")).toBe("totally.unknown.key");
  });

  it("returns the raw key for an unregistered locale with no English fallback match", () => {
    setLocale("xx");
    expect(t("totally.unknown.key")).toBe("totally.unknown.key");
  });
});

// ---------------------------------------------------------------------------
// 5. t() with interpolation
// ---------------------------------------------------------------------------
describe("t() with interpolation", () => {
  it("replaces a single {{param}} placeholder", () => {
    expect(t("greeting", { name: "Luca" })).toBe("Hello, Luca");
  });

  it("replaces multiple placeholders in one string", () => {
    expect(t("pageOf", { current: "3", total: "10" })).toBe(
      "Page 3 of 10"
    );
  });

  it("works with the welcome key", () => {
    expect(t("welcome", { name: "Alice" })).toBe("Welcome back, Alice");
  });
});

// ---------------------------------------------------------------------------
// 6. t() English fallback from another locale
// ---------------------------------------------------------------------------
describe("t() English fallback", () => {
  it("falls back to English when key is missing in the current locale", () => {
    // Register a locale with no keys at all
    registerLocale("empty", {});
    setLocale("empty");
    // Should fall back to the English value
    expect(t("nav.dashboard")).toBe("Dashboard");
  });

  it("falls back to English for a partially-filled locale", () => {
    registerLocale("partial", { "nav.dashboard": "Custom Dashboard" });
    setLocale("partial");
    // Key exists in partial locale
    expect(t("nav.dashboard")).toBe("Custom Dashboard");
    // Key does NOT exist in partial locale -> English fallback
    expect(t("action.save")).toBe("Save");
  });
});

// ---------------------------------------------------------------------------
// 7. t() German translation
// ---------------------------------------------------------------------------
describe("t() German translation", () => {
  beforeEach(() => setLocale("de"));

  it("returns the German translation for nav.assets", () => {
    expect(t("nav.assets")).toBe("Anlagen");
  });

  it("returns the German translation for action.save", () => {
    expect(t("action.save")).toBe("Speichern");
  });

  it("interpolates in German", () => {
    expect(t("greeting", { name: "Luca" })).toBe("Guten Tag, Luca");
  });
});

// ---------------------------------------------------------------------------
// 8. t() French translation
// ---------------------------------------------------------------------------
describe("t() French translation", () => {
  beforeEach(() => setLocale("fr"));

  it("returns the French translation for nav.dashboard", () => {
    expect(t("nav.dashboard")).toBe("Tableau de bord");
  });

  it("returns the French translation for nav.assets", () => {
    expect(t("nav.assets")).toBe("Actifs");
  });

  it("returns the French translation for action.save", () => {
    expect(t("action.save")).toBe("Enregistrer");
  });
});

// ---------------------------------------------------------------------------
// 9. t() Spanish translation
// ---------------------------------------------------------------------------
describe("t() Spanish translation", () => {
  beforeEach(() => setLocale("es"));

  it("returns the Spanish translation for nav.assets", () => {
    expect(t("nav.assets")).toBe("Activos");
  });

  it("returns the Spanish translation for action.save", () => {
    expect(t("action.save")).toBe("Guardar");
  });

  it("interpolates in Spanish", () => {
    expect(t("greeting", { name: "Luca" })).toBe("Hola, Luca");
  });
});

// ---------------------------------------------------------------------------
// 10. t() Dutch translation
// ---------------------------------------------------------------------------
describe("t() Dutch translation", () => {
  beforeEach(() => setLocale("nl"));

  it("returns the Dutch translation for nav.users", () => {
    expect(t("nav.users")).toBe("Gebruikers");
  });

  it("returns the Dutch translation for action.save", () => {
    expect(t("action.save")).toBe("Opslaan");
  });

  it("interpolates in Dutch", () => {
    expect(t("greeting", { name: "Luca" })).toBe("Goedendag, Luca");
  });
});

// ---------------------------------------------------------------------------
// 11. registerLocale — register a custom locale
// ---------------------------------------------------------------------------
describe("registerLocale", () => {
  it("registers a new locale and translates keys from it", () => {
    registerLocale("test", {
      "nav.dashboard": "Test Dashboard",
      "action.save": "Test Save",
    });
    setLocale("test");
    expect(t("nav.dashboard")).toBe("Test Dashboard");
    expect(t("action.save")).toBe("Test Save");
  });

  it("falls back to English for keys not in the custom locale", () => {
    registerLocale("test2", { "nav.dashboard": "Custom" });
    setLocale("test2");
    expect(t("nav.dashboard")).toBe("Custom");
    expect(t("nav.assets")).toBe("Assets"); // English fallback
  });
});

// ---------------------------------------------------------------------------
// 12. registerLocale merges translations
// ---------------------------------------------------------------------------
describe("registerLocale merges translations", () => {
  it("merges new keys into an existing locale without removing old ones", () => {
    registerLocale("merge", { "key.one": "One" });
    registerLocale("merge", { "key.two": "Two" });
    setLocale("merge");
    expect(t("key.one")).toBe("One");
    expect(t("key.two")).toBe("Two");
  });

  it("overwrites existing keys when re-registered", () => {
    registerLocale("overwrite", { "key.a": "Original" });
    registerLocale("overwrite", { "key.a": "Updated" });
    setLocale("overwrite");
    expect(t("key.a")).toBe("Updated");
  });
});

// ---------------------------------------------------------------------------
// 13. Interpolation with missing param
// ---------------------------------------------------------------------------
describe("interpolation with missing param", () => {
  it("leaves {{param}} in place when param is not provided", () => {
    expect(t("greeting", {})).toBe("Hello, {{name}}");
  });

  it("replaces provided params and leaves missing ones intact", () => {
    expect(t("pageOf", { current: "1" })).toBe("Page 1 of {{total}}");
  });

  it("does not alter the string when no params object is passed", () => {
    expect(t("greeting")).toBe("Hello, {{name}}");
  });
});
