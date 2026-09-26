"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useSession } from "@/lib/auth-client";
import { useTheme } from "next-themes";

export interface UserPreferences {
  theme: string;
  locale: string;
  timezone: string;
  currency: string;
  dateFormat: string;
  numberFormat: string;
  pageSize: number;
  onboardingCompleted: boolean;
  dashboardLayout: unknown | null;
  helpDismissed: unknown | null;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "system",
  locale: "en",
  timezone: "UTC",
  currency: "USD",
  dateFormat: "MM/DD/YYYY",
  numberFormat: "1,234.56",
  pageSize: 20,
  onboardingCompleted: false,
  dashboardLayout: null,
  helpDismissed: null,
};

interface UserPreferencesContextValue {
  preferences: UserPreferences;
  preferencesReady: boolean;
  preferencesError: boolean;
  updatePreferences: (partial: Partial<UserPreferences>) => Promise<void>;
}

const UserPreferencesContext = createContext<UserPreferencesContextValue>({
  preferences: DEFAULT_PREFERENCES,
  preferencesReady: false,
  preferencesError: false,
  updatePreferences: async () => {},
});

export function UserPreferencesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, isPending } = useSession();
  const { theme, setTheme } = useTheme();
  // Track the latest theme value without re-running the preferences fetch
  // (whose only dependency is the session).
  const themeRef = useRef(theme);
  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);
  const [preferences, setPreferences] =
    useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [preferencesError, setPreferencesError] = useState(false);

  useEffect(() => {
    if (isPending || !session?.user) return;

    let cancelled = false;

    async function fetchPreferences() {
      try {
        const res = await fetch("/api/user/preferences");
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setPreferences((prev) => ({ ...prev, ...data }));
            // Apply the stored theme to next-themes so the whole page reacts.
            // Only do this if the client hasn't made an explicit theme choice
            // (still "system") — otherwise a late/preferences re-fetch would
            // instantly snap the page back to dark after toggling to light.
            if (
              data.theme &&
              ["light", "dark", "system"].includes(data.theme) &&
              themeRef.current === "system"
            ) {
              setTheme(data.theme);
            }
          }
        }
      } catch {
        if (!cancelled) {
          setPreferencesError(true);
        }
      } finally {
        if (!cancelled) {
          setPreferencesReady(true);
        }
      }
    }

    fetchPreferences();

    return () => {
      cancelled = true;
    };
  }, [isPending, session?.user, setTheme]);

  const updatePreferences = useCallback(
    async (partial: Partial<UserPreferences>) => {
      // Optimistically update local state
      setPreferences((prev) => ({ ...prev, ...partial }));

      try {
        const res = await fetch("/api/user/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(partial),
        });

        if (!res.ok) {
          throw new Error("Failed to update preferences");
        }

        const updated = await res.json();
        setPreferences((prev) => ({ ...prev, ...updated }));
      } catch (err) {
        // Revert on failure — re-fetch current state
        try {
          const res = await fetch("/api/user/preferences");
          if (res.ok) {
            const data = await res.json();
            setPreferences((prev) => ({ ...prev, ...data }));
          }
        } catch {
          // Keep optimistic state if refetch also fails
        }
        throw err;
      }
    },
    [],
  );

  const value = useMemo(
    () => ({
      preferences,
      preferencesReady,
      preferencesError,
      updatePreferences,
    }),
    [preferences, preferencesReady, preferencesError, updatePreferences],
  );

  return (
    <UserPreferencesContext.Provider value={value}>
      {children}
    </UserPreferencesContext.Provider>
  );
}

export function useUserPreferences() {
  const context = useContext(UserPreferencesContext);
  if (!context) {
    throw new Error(
      "useUserPreferences must be used within a UserPreferencesProvider",
    );
  }
  return context;
}
