"use client";

import { AlertTriangle, Clock3, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useNetworkStatus } from "@/contexts/NetworkStatusContext";

export default function OfflineBanner() {
  const { state, isOnline, wasOffline, networkLabel, message, recheck } =
    useNetworkStatus();

  if (isOnline && !wasOffline) return null;

  const tone = isOnline
    ? "border-emerald-500/40 bg-emerald-600/95 text-white"
    : state === "offline"
      ? "border-rose-500/40 bg-rose-600/95 text-white"
      : "border-amber-500/40 bg-amber-600/95 text-white";

  const Icon = isOnline
    ? Wifi
    : state === "offline"
      ? WifiOff
      : state === "timeout"
        ? Clock3
        : AlertTriangle;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[9999] flex justify-center px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-auto flex max-w-[calc(100vw-1.5rem)] items-center gap-2.5 rounded-full border py-2 pr-2.5 pl-3.5 text-sm font-medium shadow-lg shadow-black/10 backdrop-blur transition-all duration-300 ease-out ${tone}`}
        style={{
          animation: "bannerDrop 300ms cubic-bezier(0.16, 1, 0.3, 1) both",
        }}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate leading-snug">{message}</span>
        {!isOnline && (
          <>
            <span className="hidden shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase md:inline">
              {networkLabel}
            </span>
            <button
              type="button"
              onClick={recheck}
              className="ml-0.5 inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-white/25 active:scale-[0.97]"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry
            </button>
          </>
        )}
        <style>{`
          @keyframes bannerDrop {
            from { transform: translateY(-140%); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
        `}</style>
      </div>
    </div>
  );
}
