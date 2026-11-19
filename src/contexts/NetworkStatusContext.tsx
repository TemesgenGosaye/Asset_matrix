"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useOffline } from "next/offline";
import { App } from "@capacitor/app";
import { Network } from "@capacitor/network";
import { signOut } from "@/lib/auth-client";
import { isNativeApp } from "@/lib/native-app";
import {
  networkMessage,
  probeNetwork,
  readNetworkLabel,
  type NetworkState,
} from "@/lib/network-status";
import { clearCachedSession } from "@/lib/session-cache";
import { replayQueue } from "@/lib/offline-queue";

interface NetworkStatusValue {
  state: NetworkState;
  isOnline: boolean;
  wasOffline: boolean;
  networkLabel: string;
  message: string;
  recheck: () => void;
}

const NetworkStatusContext = createContext<NetworkStatusValue | null>(null);
const BACKOFF = [2_000, 4_000, 8_000, 16_000, 30_000];

type ListenerHandle = { remove: () => void | Promise<void> };

export function NetworkStatusProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const frameworkOffline = useOffline();
  const [state, setState] = useState<NetworkState>("online");
  const [networkLabel, setNetworkLabel] = useState("Checking");
  const [wasOffline, setWasOffline] = useState(false);

  const stateRef = useRef<NetworkState>("online");
  const probeRef = useRef<Promise<void> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(0);
  const failuresRef = useRef(0);
  const restoredTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authErrorRef = useRef(false);
  const scheduleRef = useRef<() => void>(() => undefined);

  const recheckRef = useRef<() => void>(() => undefined);

  const handleAuthError = useCallback(() => {
    if (authErrorRef.current) return;
    authErrorRef.current = true;
    void signOut()
      .then(() => clearCachedSession())
      .finally(() => {
        authErrorRef.current = false;
        router.replace("/login");
      });
  }, [router]);

  const applyState = useCallback(
    (next: NetworkState, label?: string) => {
      const previous = stateRef.current;
      if (label) setNetworkLabel(label);
      if (previous === next) return;

      stateRef.current = next;
      setState(next);

      if (restoredTimerRef.current) {
        clearTimeout(restoredTimerRef.current);
        restoredTimerRef.current = null;
      }

      if (next === "online") {
        backoffRef.current = 0;
        failuresRef.current = 0;
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        if (previous !== "online") {
          setWasOffline(true);
          restoredTimerRef.current = setTimeout(() => {
            setWasOffline(false);
            restoredTimerRef.current = null;
          }, 5_000);
          void replayQueue().finally(() => router.refresh());
        }
      } else if (next === "auth_error") {
        failuresRef.current = 0;
        handleAuthError();
      }
    },
    [handleAuthError, router],
  );

  const runProbe = useCallback(async () => {
    if (probeRef.current) return probeRef.current;

    const probe = (async () => {
      let deviceDisconnected = frameworkOffline;
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        deviceDisconnected = true;
      }

      if (isNativeApp()) {
        try {
          const status = await Network.getStatus();
          if (!status.connected) deviceDisconnected = true;
        } catch {
          deviceDisconnected = deviceDisconnected || navigator.onLine === false;
        }
      }

      let result: { state: NetworkState; label?: string };
      if (deviceDisconnected) {
        result = { state: "offline", label: readNetworkLabel() };
        failuresRef.current = 0;
      } else {
        result = await probeNetwork();
        if (result.state === "offline" || result.state === "timeout") {
          failuresRef.current += 1;
          if (failuresRef.current === 1) {
            result = { state: "timeout", label: result.label };
          }
        } else {
          failuresRef.current = 0;
        }
      }

      applyState(result.state, result.label);
      if (result.state !== "online") scheduleRef.current();
    })();

    probeRef.current = probe;
    try {
      await probe;
    } finally {
      probeRef.current = null;
    }
  }, [applyState, frameworkOffline]);

  const validateSession = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/get-session", {
        cache: "no-store",
        credentials: "include",
      });
      if (response.status === 401 || response.status === 403) {
        handleAuthError();
      }
    } catch {}
  }, [handleAuthError]);

  useEffect(() => {
    scheduleRef.current = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const delay = BACKOFF[Math.min(backoffRef.current, BACKOFF.length - 1)];
      backoffRef.current += 1;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void runProbe().then(() => {
          if (stateRef.current === "online") void validateSession();
        });
      }, delay);
    };

    recheckRef.current = () => {
      backoffRef.current = 0;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      void runProbe().then(() => {
        if (stateRef.current === "online") void validateSession();
      });
    };

    void runProbe();
    void validateSession();

    const handleOnline = () => recheckRef.current();
    const handleOffline = () => {
      applyState("offline", readNetworkLabel());
      scheduleRef.current();
    };
    const handleVisibility = () => {
      if (!document.hidden) recheckRef.current();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);
    (window as Window & { __homedeskRecheck?: () => void }).__homedeskRecheck =
      () => recheckRef.current();

    let networkHandle: ListenerHandle | undefined;
    let appHandle: ListenerHandle | undefined;

    if (isNativeApp()) {
      void Network.addListener("networkStatusChange", (status) => {
        setNetworkLabel(
          status.connected ? readNetworkLabel() : "No connection",
        );
        if (status.connected) recheckRef.current();
        else {
          applyState("offline", "No connection");
          scheduleRef.current();
        }
      }).then((handle) => {
        networkHandle = handle;
      });

      void App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) recheckRef.current();
      }).then((handle) => {
        appHandle = handle;
      });
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
      delete (window as Window & { __homedeskRecheck?: () => void })
        .__homedeskRecheck;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (restoredTimerRef.current) clearTimeout(restoredTimerRef.current);
      void networkHandle?.remove();
      void appHandle?.remove();
    };
  }, [applyState, runProbe, validateSession]);

  useEffect(() => {
    if (frameworkOffline) recheckRef.current();
  }, [frameworkOffline]);

  const value = useMemo<NetworkStatusValue>(
    () => ({
      state,
      isOnline: state === "online",
      wasOffline,
      networkLabel,
      message: networkMessage(state),
      recheck: () => recheckRef.current(),
    }),
    [state, wasOffline, networkLabel],
  );

  return (
    <NetworkStatusContext.Provider value={value}>
      {children}
    </NetworkStatusContext.Provider>
  );
}

export function useNetworkStatus(): NetworkStatusValue {
  const context = useContext(NetworkStatusContext);
  if (!context) {
    throw new Error(
      "useNetworkStatus must be used within NetworkStatusProvider",
    );
  }
  return context;
}
