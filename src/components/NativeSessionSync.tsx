"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isNativeApp } from "@/lib/native-app";
import { useSession } from "@/lib/auth-client";
import { clearCachedSession, writeCachedSession } from "@/lib/session-cache";

type NativeSessionBridge = {
  setAuthenticated?: (authenticated: boolean) => void;
  clearAuthenticated?: () => void;
};

export default function NativeSessionSync() {
  const { data, isPending } = useSession();
  const pathname = usePathname();
  const userId = data?.user?.id;

  useEffect(() => {
    if (!isNativeApp() || isPending) return;
    const authenticated = Boolean(userId);

    const bridge = (window as Window & { HomeDeskNative?: NativeSessionBridge })
      .HomeDeskNative;

    if (authenticated) {
      if (bridge?.setAuthenticated) {
        bridge.setAuthenticated(true);
      } else {
        const timer = setInterval(() => {
          const current = (
            window as Window & { HomeDeskNative?: NativeSessionBridge }
          ).HomeDeskNative;
          if (current?.setAuthenticated) {
            current.setAuthenticated(true);
            clearInterval(timer);
          }
        }, 500);
        return () => clearInterval(timer);
      }
      void writeCachedSession({ authenticated: true, userId, route: pathname });
    } else {
      bridge?.clearAuthenticated?.();
      void clearCachedSession();
    }
  }, [userId, isPending, pathname]);

  return null;
}
