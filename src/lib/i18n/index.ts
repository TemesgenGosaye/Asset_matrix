/**
 * Lightweight i18n system for the Asset Tracker application.
 *
 * No external packages required. Supports parameter interpolation
 * with {{param}} syntax, locale switching, and key-based fallback.
 *
 * Usage:
 *   import { t, setLocale, getLocale } from "@/lib/i18n";
 *   t("nav.dashboard");                          // "Dashboard"
 *   t("greeting", { name: "Luca" });             // "Hello, Luca"
 *   t("some.missing.key");                       // "some.missing.key"
 *
 * In a React component use `useT()` from `@/lib/i18n/react` instead of `t()`:
 * the locale here is module state, so a component that reads `t()` renders once
 * and never again when the user switches language. See `react.tsx`.
 */

import en from "./locales/en";
import am from "./locales/am";
import de from "./locales/de";
import fr from "./locales/fr";
import es from "./locales/es";
import nl from "./locales/nl";

// ---------------------------------------------------------------------------
// Translation store
// ---------------------------------------------------------------------------

type Translations = Record<string, string>;

const translationStore: Record<string, Translations> = {
  en,
  am,
  de,
  fr,
  es,
  nl,
};

/** Available locale codes and their display names, in their own language. */
export const AVAILABLE_LOCALES = {
  en: "English",
  am: "አማርኛ",
  de: "Deutsch",
  fr: "Français",
  es: "Español",
  nl: "Nederlands",
} as const;

export type LocaleCode = keyof typeof AVAILABLE_LOCALES;

/** The locale every miss falls back to. Also the language of last resort. */
export const FALLBACK_LOCALE = "en";

/** True when this build ships a full translation set for the locale. */
export function isSupportedLocale(locale: string): boolean {
  return Object.prototype.hasOwnProperty.call(translationStore, locale);
}

let currentLocale = FALLBACK_LOCALE;

// ---------------------------------------------------------------------------
// Change notification
//
// The locale is module state, which is all an imperative caller needs but not
// enough for a component: reading a mutable variable will never re-render when
// the user switches language, so anything that RENDERS a translated string has
// to be able to subscribe. These three functions are the whole mechanism, and
// they are dependency-free so this module stays importable from server code.
// ---------------------------------------------------------------------------

const localeListeners = new Set<() => void>();

/** Subscribe to locale changes. Returns the unsubscribe function. */
export function subscribeLocale(listener: () => void): () => void {
  localeListeners.add(listener);
  return () => {
    localeListeners.delete(listener);
  };
}

/** The current locale as a primitive, for `useSyncExternalStore`. */
export function getLocaleSnapshot(): string {
  return currentLocale;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Set the active locale. If the locale has no registered translations the
 * call is still accepted (strings fall back to English until translations are
 * loaded via `registerLocale`).
 *
 * Subscribers are notified only when the value actually changes, so a context
 * that stores the user's preference and re-applies it cannot loop.
 */
export function setLocale(locale: string): void {
  if (locale === currentLocale) return;
  currentLocale = locale;
  for (const listener of localeListeners) listener();
}

/**
 * Return the currently active locale code (e.g. "en").
 */
export function getLocale(): string {
  return currentLocale;
}

/**
 * Register (or replace) translations for a given locale at runtime.
 * This allows lazy-loading additional languages without bundling them
 * upfront.
 */
export function registerLocale(
  locale: string,
  translations: Translations,
): void {
  translationStore[locale] = { ...translationStore[locale], ...translations };
}

/**
 * Translate a key in an EXPLICIT locale.
 *
 * `t()` is the convenience form for imperative callers. A React component must
 * reach this through `useT()`, because it has to bind the locale it rendered
 * with rather than read whatever happens to be current at paint time.
 *
 * Resolution order: requested locale → English → the raw key. Interpolation
 * uses double-brace syntax:
 *   translate("am", "greeting", { name: "Luca" })  // "እንኳን ደህና መጡ Luca"
 */
export function translate(
  locale: string,
  key: string,
  params?: Record<string, string>,
): string {
  let value = translationStore[locale]?.[key];

  // Fall back to English if the current locale does not have the key
  if (value === undefined && locale !== FALLBACK_LOCALE) {
    value = translationStore[FALLBACK_LOCALE]?.[key];
  }

  // Fall back to the raw key
  if (value === undefined) {
    value = key;
  }

  // Interpolate parameters: replace every {{param}} with the supplied value
  if (params) {
    value = value.replace(/\{\{(\w+)\}\}/g, (_match, paramKey) => {
      return params[paramKey] !== undefined
        ? params[paramKey]
        : `{{${paramKey}}}`;
    });
  }

  return value;
}

/**
 * Translate a key using the current locale.
 *
 * Imperative only — a component that renders `t(...)` will not re-render when
 * the locale changes. Use `useT()` there.
 */
export function t(key: string, params?: Record<string, string>): string {
  return translate(currentLocale, key, params);
}
