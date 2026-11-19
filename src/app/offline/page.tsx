"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Clock3, RefreshCw, WifiOff } from "lucide-react";
import { useNetworkStatus } from "@/contexts/NetworkStatusContext";

export default function OfflinePage() {
  const { state, isOnline, wasOffline, networkLabel, message, recheck } =
    useNetworkStatus();
  const router = useRouter();

  useEffect(() => {
    if (wasOffline && isOnline) router.replace("/dashboard");
  }, [wasOffline, isOnline, router]);

  const Icon =
    state === "timeout"
      ? Clock3
      : state === "server_error" || state === "auth_error"
        ? AlertTriangle
        : WifiOff;

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <div className="bg-card w-full max-w-md space-y-6 rounded-2xl border p-8 text-center shadow-sm">
        <span className="bg-primary/10 text-primary mx-auto flex h-16 w-16 items-center justify-center rounded-full">
          <Icon className="h-8 w-8" aria-hidden="true" />
        </span>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">
            {state === "server_error"
              ? "Service unavailable"
              : state === "timeout"
                ? "Connection timed out"
                : "You’re offline"}
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {message} Any changes you made offline are saved on this device and
            will sync when the connection is restored.
          </p>
        </div>

        <div className="bg-muted text-muted-foreground inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium">
          <span
            className={`h-2 w-2 rounded-full ${
              isOnline ? "bg-emerald-500" : "bg-rose-500"
            }`}
          />
          {networkLabel}
        </div>

        <button
          type="button"
          onClick={recheck}
          disabled={isOnline}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {isOnline ? "Reconnecting…" : "Try again"}
        </button>
      </div>
    </div>
  );
}
