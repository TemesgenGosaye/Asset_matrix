"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { notify } from "@/lib/feedback/notify";
import { isNativeApp } from "@/lib/native-app";

export default function ServiceWorkerRegistration() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (process.env.NODE_ENV !== "production") {
      // In development, actively unregister any leftover service workers and clear caches
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const registration of registrations) {
            registration.unregister();
          }
        });
      }
      if ("caches" in window) {
        caches.keys().then((keys) => {
          for (const key of keys) {
            caches.delete(key);
          }
        });
      }
      return;
    }

    // The Capacitor shell loads the remote Vercel origin directly. A stale
    // Service Worker or Cache Storage in the WebView can serve mismatched
    // assets and produce a blank screen (while a normal browser profile works).
    if (isNativeApp()) {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker
          .getRegistrations()
          .then((registrations) => {
            for (const registration of registrations) {
              registration.unregister();
            }
          })
          .catch(() => undefined);
      }
      if ("caches" in window) {
        caches
          .keys()
          .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
          .catch(() => undefined);
      }
      return;
    }

    if (!("serviceWorker" in navigator)) return;

    let refreshing = false;
    const handleControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      router.refresh();
    };
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type !== "SESSION_EXPIRED") return;
      void signOut().finally(() => router.replace("/login"));
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      handleControllerChange,
    );
    navigator.serviceWorker.addEventListener("message", handleMessage);

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        registration.update();

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              notify.info({
                title: "A new version is available",
                description: "Update HomeDesk to get the latest improvements.",
                dedupeKey: "home-desk-sw-update",
                duration: 15_000,
                action: {
                  label: "Update now",
                  onClick: () => {
                    const waiting = registration.waiting ?? newWorker;
                    waiting.postMessage({ type: "SKIP_WAITING" });
                  },
                },
              });
            }
          });
        });
      })
      .catch((error) => {
        console.error("Service worker registration failed:", error);
      });

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        handleControllerChange,
      );
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    };
  }, [router]);

  return null;
}
