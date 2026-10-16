"use client";

import { useCallback, useSyncExternalStore } from "react";

import {
  getLocaleSnapshot,
  setLocale,
  subscribeLocale,
  translate,
} from "./index";

/**
 * React binding for the i18n module.
 *
 * `lib/i18n` keeps the locale in module state so server code can translate
 * without a React tree. That makes it non-reactive, which is exactly wrong for a
 * component: `t()` would render once and keep the old language after the user
 * switched. `useT` closes that gap by subscribing to the same store through
 * `useSyncExternalStore`, so a toast, a table header or a button re-renders in
 * the new language the moment it changes.
 *
 * `useT` returns a STABLE function identity for a given locale, so it is safe
 * in dependency arrays and in `useCallback` without causing churn.
 */

export type TranslateFn = (
  key: string,
  params?: Record<string, string>,
) => string;

/** The active locale, re-rendering the caller when it changes. */
export function useLocale(): string {
  return useSyncExternalStore(
    subscribeLocale,
    getLocaleSnapshot,
    getLocaleSnapshot,
  );
}

/** Translate against the active locale, re-rendering the caller when it changes. */
export function useT(): TranslateFn {
  const locale = useLocale();
  return useCallback(
    (key: string, params?: Record<string, string>) =>
      translate(locale, key, params),
    [locale],
  );
}

/** Switch the active locale for the whole app. */
export function useSetLocale(): (locale: string) => void {
  return setLocale;
}
