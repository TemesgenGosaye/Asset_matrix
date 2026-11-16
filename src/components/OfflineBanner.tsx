"use client";

import { WifiOff, Wifi, RefreshCw } from "lucide-react";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

/**
 * Global connectivity banner.
 *
 * A floating pill pinned to the top of the viewport rather than a full-bleed
 * bar: it reads as a status chip over the app instead of a second navigation
 * bar, and it never shifts the page underneath. Offline it states the problem
 * and offers Retry; restored it confirms once ("Back online") and then removes
 * itself, which `useOnlineStatus` handles by clearing `wasOffline` after 5s.
 */
export default function OfflineBanner() {
  const { isOnline, wasOffline } = useOnlineStatus();

  const showOffline = !isOnline;
  const showOnline = wasOffline && isOnline;

  if (!showOffline && !showOnline) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[9999] flex justify-center px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div
        role="status"
        aria-live="polite"
        className={[
          "pointer-events-auto flex max-w-[calc(100vw-1.5rem)] items-center gap-2.5 rounded-full border py-2 pr-2.5 pl-3.5 text-sm font-medium shadow-lg shadow-black/10 backdrop-blur",
          "transition-all duration-300 ease-out",
          showOffline
            ? "border-rose-500/40 bg-rose-600/95 text-white"
            : "border-emerald-500/40 bg-emerald-600/95 text-white",
        ].join(" ")}
        style={{ animation: "bannerDrop 300ms cubic-bezier(0.16, 1, 0.3, 1) both" }}
      >
        {showOffline ? (
          <>
            <WifiOff className="h-4 w-4 shrink-0" />
            <span className="hidden leading-snug sm:inline">
              You&rsquo;re offline. Check your connection.
            </span>
            <span className="leading-snug sm:hidden">You&rsquo;re offline</span>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="ml-0.5 inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-white/25 active:scale-[0.97]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          </>
        ) : (
          <>
            <Wifi className="h-4 w-4 shrink-0" />
            <span>Back online</span>
          </>
        )}

        {/* Inline keyframes so we don't need a global CSS change */}
        <style>{`
          @keyframes bannerDrop {
            from {
              transform: translateY(-140%);
              opacity: 0;
            }
            to {
              transform: translateY(0);
              opacity: 1;
            }
          }
        `}</style>
      </div>
    </div>
  );
}
