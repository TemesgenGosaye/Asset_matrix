"use client";

import { useEffect, useState, useCallback, useRef } from "react";

interface OnlineStatus {
  isOnline: boolean;
  wasOffline: boolean;
}

/**
 * Tracks browser online/offline status.
 *
 * Uses `navigator.onLine` as a fast signal, then confirms with a real
 * network probe (HEAD request to the app itself) to avoid false negatives.
 * `navigator.onLine` is unreliable in some environments (VPNs, proxies,
 * certain browsers) and can report `false` even when the network works.
 *
 * - `isOnline` reflects the confirmed connectivity state.
 * - `wasOffline` is `true` for 5 seconds after the connection is restored,
 *   allowing the UI to show a "back online" message before it disappears.
 */
export function useOnlineStatus(): OnlineStatus {
  const [isOnline, setIsOnline] = useState(true);
  const [wasOffline, setWasOffline] = useState(false);
  const wasOfflineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markOnline = useCallback(() => {
    setIsOnline((prev) => {
      if (!prev) {
        // Was offline, now online — show "back online" message
        setWasOffline(true);
        if (wasOfflineTimerRef.current) {
          clearTimeout(wasOfflineTimerRef.current);
        }
        wasOfflineTimerRef.current = setTimeout(() => {
          setWasOffline(false);
          wasOfflineTimerRef.current = null;
        }, 5_000);
      }
      return true;
    });
  }, []);

  const markOffline = useCallback(() => {
    setIsOnline(false);
    if (wasOfflineTimerRef.current) {
      clearTimeout(wasOfflineTimerRef.current);
      wasOfflineTimerRef.current = null;
    }
    setWasOffline(false);
  }, []);

  const probeConnection = useCallback(async (): Promise<boolean> => {
    try {
      const resp = await fetch("/api/health", {
        method: "HEAD",
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    // On mount: if navigator says offline, double-check with a real probe
    // This catches the false-negative case where navigator.onLine is wrong
    const checkInitial = async () => {
      if (!navigator.onLine) {
        const reachable = await probeConnection();
        if (mounted) {
          if (reachable) {
            setIsOnline(true);
          } else {
            setIsOnline(false);
          }
        }
      }
    };
    checkInitial();

    const handleOnline = () => {
      markOnline();
    };

    const handleOffline = async () => {
      // navigator says offline — confirm with a probe before showing the banner
      const reachable = await probeConnection();
      if (mounted) {
        if (reachable) {
          // False alarm — navigator is wrong, we're actually online
          setIsOnline(true);
        } else {
          markOffline();
        }
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      mounted = false;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (wasOfflineTimerRef.current) {
        clearTimeout(wasOfflineTimerRef.current);
      }
    };
  }, [markOnline, markOffline, probeConnection]);

  return { isOnline, wasOffline };
}
