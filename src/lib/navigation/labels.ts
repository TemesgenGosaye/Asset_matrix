"use client";

/**
 * Nav label resolution, shared by the chrome and the Navigation Settings page.
 *
 * It lives here rather than inside either consumer so the sidebar, the mobile
 * sheet and the settings list can never drift: if a menu reads "ዳሽቦርድ" in the
 * rail it reads the same in the list that turns it off.
 *
 * A registry item carries both a default `label` and an optional catalog
 * `labelKey`. `translate()` returns the key itself when it has no entry, so a
 * missing translation falls back to English instead of rendering "nav.foo".
 */

import { useMemo } from "react";
import { useT } from "@/lib/i18n/react";

export interface NavLabelSource {
  label: string;
  labelKey?: string;
}

export type NavLabelResolver = (item: NavLabelSource) => string;

/** A stable label resolver for the active locale. */
export function useNavLabel(): NavLabelResolver {
  const t = useT();
  return useMemo(
    () =>
      (item: NavLabelSource): string => {
        if (!item.labelKey) return item.label;
        const translated = t(item.labelKey);
        return translated === item.labelKey ? item.label : translated;
      },
    [t],
  );
}

/** Resolve a section heading through the catalog, falling back to its title. */
export function useNavSectionTitle(): (section: {
  title: string;
  titleKey?: string;
}) => string {
  const t = useT();
  return useMemo(
    () =>
      (section: { title: string; titleKey?: string }): string =>
        section.titleKey ? t(section.titleKey) : section.title,
    [t],
  );
}
