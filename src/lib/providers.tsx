// app/providers.tsx
"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";

interface ProvidersProps {
  children: React.ReactNode;
  /** CSP nonce stamped by src/proxy.ts for the next-themes inline script. */
  nonce?: string;
}

export function Providers({ children, nonce }: ProvidersProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem={true}
      storageKey="msf-theme"
      nonce={nonce}
    >
      <TooltipProvider>
        {children}
      </TooltipProvider>
    </NextThemesProvider>
  );
}
