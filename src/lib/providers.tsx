// app/providers.tsx
"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  NEXT_THEMES_THEME_NAMES,
  SYSTEM_THEME_ID,
  THEME_STORAGE_KEY,
} from "@/lib/themes";

interface ProvidersProps {
  children: React.ReactNode;
  /** CSP nonce stamped by src/proxy.ts for the next-themes inline script. */
  nonce?: string;
}

export function Providers({ children, nonce }: ProvidersProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme={SYSTEM_THEME_ID}
      enableSystem={true}
      // Required, not optional: with `attribute="class"` next-themes removes
      // only the names in this list before adding the active one. Left at its
      // default of ['light','dark'] it never clears `oled`/`midnight`/`paper`,
      // so classes pile up and the LAST theme in the stylesheet wins - picking
      // "High Contrast" after "Paper" would silently render as Paper.
      themes={[...NEXT_THEMES_THEME_NAMES]}
      // From the registry, so adding a theme cannot leave the saved key behind.
      storageKey={THEME_STORAGE_KEY}
      nonce={nonce}
    >
      <TooltipProvider>{children}</TooltipProvider>
    </NextThemesProvider>
  );
}
