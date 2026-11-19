"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { SplashScreen } from "@capacitor/splash-screen";
import { isNativeApp } from "@/lib/native-app";
import {
  clearCachedSession,
  readCachedSession,
  writeCachedSession,
} from "@/lib/session-cache";

type NativeSessionBridge = {
  setAuthenticated?: (authenticated: boolean) => void;
  clearAuthenticated?: () => void;
};

type Phase = "booting" | "leaving" | "done";

const FADE_MS = 300;
const MIN_SPLASH_MS = 900;
const SESSION_TIMEOUT_MS = 4000;

const noopSubscribe = () => () => {};
const getServerSnapshot = () => false;

function setNativeAuthenticated(authenticated: boolean): void {
  const bridge = (window as Window & { HomeDeskNative?: NativeSessionBridge })
    .HomeDeskNative;
  if (!bridge) return;

  if (authenticated) {
    bridge.setAuthenticated?.(true);
  } else {
    bridge.clearAuthenticated?.();
  }
}

export default function AppBootstrap({ children }: { children: ReactNode }) {
  const native = useSyncExternalStore(
    noopSubscribe,
    isNativeApp,
    getServerSnapshot,
  );
  const [phase, setPhase] = useState<Phase>("booting");
  const finishedRef = useRef(false);
  const startedAtRef = useRef(0);
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideFrameRef = useRef<number | null>(null);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;

    const elapsed = Date.now() - startedAtRef.current;
    const delay = Math.max(0, MIN_SPLASH_MS - elapsed);

    finishTimerRef.current = setTimeout(() => {
      setPhase("leaving");
      hideFrameRef.current = requestAnimationFrame(() => {
        void SplashScreen.hide({ fadeOutDuration: FADE_MS }).catch(
          () => undefined,
        );
      });
    }, delay);
  }, []);

  useEffect(() => {
    if (!native) return;

    startedAtRef.current = Date.now();

    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SESSION_TIMEOUT_MS);

    async function bootstrap() {
      const cached = await readCachedSession();
      if (cancelled) return;

      if (cached?.authenticated) {
        setNativeAuthenticated(true);
        finish();
      }

      try {
        const result = await fetch("/api/auth/get-session", {
          cache: "no-store",
          credentials: "include",
          signal: controller.signal,
        }).then(async (response) => {
          if (response.status === 401 || response.status === 403) {
            return { authenticated: false } as const;
          }
          if (!response.ok) {
            throw new Error(`Session check failed: ${response.status}`);
          }
          const payload = (await response.json().catch(() => null)) as {
            user?: { id?: string };
          } | null;
          return payload?.user?.id
            ? ({ authenticated: true, userId: payload.user.id } as const)
            : ({ authenticated: false } as const);
        });

        if (cancelled) return;

        if (result.authenticated) {
          setNativeAuthenticated(true);
          await writeCachedSession({
            authenticated: true,
            userId: result.userId,
            route: window.location.pathname,
          });
        } else {
          setNativeAuthenticated(false);
          await clearCachedSession();
        }
      } catch {
        if (cached?.authenticated) setNativeAuthenticated(true);
      } finally {
        clearTimeout(timeout);
        if (!cancelled) finish();
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeout);
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
      if (hideFrameRef.current) cancelAnimationFrame(hideFrameRef.current);
    };
  }, [native, finish]);

  useEffect(() => {
    if (phase !== "leaving") return;
    const timer = setTimeout(() => setPhase("done"), FADE_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  const showOverlay = native && phase !== "done";

  return (
    <>
      {children}
      {showOverlay && (
        <div
          className={`msf-loader msf-loader-boot fixed inset-0 z-[100]${
            phase === "leaving" ? "msf-loader-fade" : ""
          }`}
          role="status"
          aria-live="polite"
          aria-label="Loading HomeDesk"
        >
          <div className="msf-loader-ambient" aria-hidden="true" />
          <div className="msf-loader-brand">
            <span
              className="msf-loader-brand-mark msf-loader-logo-image"
              aria-hidden="true"
            />
            <div>
              <p className="msf-loader-eyebrow">Metahara Sugar Factory</p>
              <p className="msf-loader-title">HomeDesk</p>
            </div>
          </div>
          <div className="msf-loader-center">
            <div className="msf-loader-stage" aria-hidden="true">
              <svg className="msf-loader-ring" viewBox="0 0 100 100">
                <circle className="msf-loader-track" cx="50" cy="50" r="44" />
                <circle className="msf-loader-arc" cx="50" cy="50" r="44" />
                <circle
                  className="msf-loader-arc-secondary"
                  cx="50"
                  cy="50"
                  r="44"
                />
              </svg>
              <span className="msf-loader-logo msf-loader-logo-image" />
            </div>

            <div className="msf-loader-copy">
              <p className="msf-loader-subtitle">Secure workspace</p>
              <p className="msf-loader-status">Restoring your workspace…</p>
            </div>

            <div className="msf-loader-bar" aria-hidden="true">
              <span />
            </div>
          </div>
          <div className="msf-loader-footer">
            <p>© 2026 Metahara Sugar Factory</p>
            <p className="msf-loader-powered">Powered By Temesgen G.</p>
          </div>
        </div>
      )}
    </>
  );
}
