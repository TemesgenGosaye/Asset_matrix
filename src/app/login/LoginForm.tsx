"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { signIn } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Clock3,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Moon,
  Sun,
  WifiOff,
} from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { isAndroidApp } from "@/lib/native-app";
import SiteFooterLinks from "@/components/SiteFooterLinks";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

const NETWORK_ERROR_MESSAGE =
  "Network error - unable to reach the server. Check your internet connection and try again.";
const OFFLINE_ERROR_MESSAGE =
  "You appear to be offline. Check your internet connection and try again.";

const REMEMBER_KEY = "msf-login-remember";
const REMEMBER_USER_KEY = "msf-login-username";

function formatClock(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())} : ${pad(date.getMinutes())} : ${pad(date.getSeconds())}`;
}

function isNetworkErrorMessage(message: string): boolean {
  return /network|fetch|failed to fetch|timeout|connection|offline|unreachable|err_/i.test(
    message,
  );
}

interface TurnstileWidget {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      size: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

function getTurnstile(): TurnstileWidget | undefined {
  return (window as Window & { turnstile?: TurnstileWidget }).turnstile;
}

function useTurnstile(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [token, setToken] = useState<string | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  const reset = () => {
    setToken(null);
    const widget = getTurnstile();
    if (widgetIdRef.current && widget) {
      widget.reset(widgetIdRef.current);
    }
  };

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !containerRef.current) return;

    const renderWidget = () => {
      const widget = getTurnstile();
      if (!widget || !containerRef.current || widgetIdRef.current) return;
      widgetIdRef.current = widget.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        size: "flexible",
        callback: (value) => setToken(value),
        "expired-callback": () => setToken(null),
        "error-callback": () => setToken(null),
      });
    };

    const existing = getTurnstile();
    if (existing) {
      renderWidget();
      return;
    }

    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = renderWidget;
    document.head.appendChild(script);

    return () => {
      const widget = getTurnstile();
      if (widgetIdRef.current && widget) {
        widget.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [containerRef]);

  return { token, reset };
}

interface LoginPageProps {
  microsoftEnabled?: boolean;
  googleEnabled?: boolean;
}

export default function LoginPage(_props: LoginPageProps) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  const [rememberMe, setRememberMe] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return localStorage.getItem(REMEMBER_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const [formData, setFormData] = useState(() => {
    if (typeof window === "undefined") return { username: "", password: "" };
    try {
      const remembered = localStorage.getItem(REMEMBER_KEY) !== "0";
      const savedUser = remembered
        ? localStorage.getItem(REMEMBER_USER_KEY) || ""
        : "";
      return { username: savedUser, password: "" };
    } catch {
      return { username: "", password: "" };
    }
  });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [googleNotice, setGoogleNotice] = useState(false);

  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const autoAdvancedRef = useRef(false);
  const androidFocusInitializedRef = useRef(false);
  const { token: turnstileToken, reset: resetTurnstile } =
    useTurnstile(turnstileRef);
  const { isOnline } = useOnlineStatus();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMounted(true);
      setNow(new Date());
    }, 0);
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    usernameRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!isAndroidApp()) return;
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    root.classList.remove("dark");
    root.setAttribute("data-android-app", "1");
    const timer = window.setTimeout(() => setIsAndroid(true), 0);
    return () => {
      window.clearTimeout(timer);
      root.removeAttribute("data-android-app");
      if (wasDark) root.classList.add("dark");
    };
  }, []);

  useEffect(() => {
    if (!isAndroid || androidFocusInitializedRef.current) return;
    androidFocusInitializedRef.current = true;
    if (formData.username.trim()) {
      passwordRef.current?.focus({ preventScroll: true });
      autoAdvancedRef.current = true;
      return;
    }
    usernameRef.current?.focus({ preventScroll: true });
  }, [isAndroid, formData.username]);

  useEffect(() => {
    if (!isAndroid || autoAdvancedRef.current) return;
    if (!formData.username.trim()) {
      autoAdvancedRef.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      passwordRef.current?.focus({ preventScroll: true });
      autoAdvancedRef.current = true;
    }, 900);
    return () => window.clearTimeout(timer);
  }, [isAndroid, formData.username]);

  useEffect(() => {
    if (!googleNotice) return;
    const timer = window.setTimeout(() => setGoogleNotice(false), 5000);
    return () => window.clearTimeout(timer);
  }, [googleNotice]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleUsernameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === "NumpadEnter") {
      event.preventDefault();
      passwordRef.current?.focus();
    }
  };

  const handlePasswordKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === "NumpadEnter") {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!formData.username.trim() || !formData.password) {
      setError("Enter your email or username and password.");
      return;
    }

    if (!isOnline) {
      setError(OFFLINE_ERROR_MESSAGE);
      return;
    }

    setIsLoading(true);

    try {
      const result = await signIn.email({
        email: formData.username,
        password: formData.password,
        rememberMe,
        fetchOptions: TURNSTILE_SITE_KEY
          ? { headers: { "x-turnstile-token": turnstileToken || "" } }
          : undefined,
      });

      if (result?.error) {
        const message = result.error.message || "Invalid username or password";
        setError(
          isNetworkErrorMessage(message) ? NETWORK_ERROR_MESSAGE : message,
        );
        resetTurnstile();
        setIsLoading(false);
        return;
      }

      try {
        localStorage.setItem(REMEMBER_KEY, rememberMe ? "1" : "0");
        if (rememberMe) {
          localStorage.setItem(REMEMBER_USER_KEY, formData.username.trim());
        } else {
          localStorage.removeItem(REMEMBER_USER_KEY);
        }
      } catch {}

      const data = result?.data as { twoFactorRedirect?: boolean } | null;
      if (data?.twoFactorRedirect) {
        router.push("/mfa-verify");
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      setError(
        isNetworkErrorMessage(message)
          ? NETWORK_ERROR_MESSAGE
          : "An unexpected error occurred. Please try again.",
      );
      resetTurnstile();
      setIsLoading(false);
    }
  };

  const isDark = mounted && resolvedTheme === "dark";
  const year = new Date().getFullYear();

  return (
    <main
      data-login-page
      className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[linear-gradient(135deg,#1E9FDB_0%,#0A74B0_100%)] p-4 font-sans dark:bg-[linear-gradient(135deg,#0b3d5e_0%,#06283d_100%)]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.7) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.7) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <button
        type="button"
        onClick={() => setTheme(isDark ? "light" : "dark")}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        className="absolute top-4 right-4 z-20 flex h-[34px] w-[34px] items-center justify-center rounded-lg bg-white/25 text-white backdrop-blur-sm transition hover:bg-white/35 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none dark:bg-white/10 dark:hover:bg-white/20"
      >
        {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </button>

      <div
        className={`relative z-10 w-full max-w-[436px] rounded-[28px] border-2 border-[#1B7DB8] bg-white px-8 py-8 shadow-[0_20px_50px_-20px_rgba(10,50,90,0.45)] sm:px-9 dark:border-[#1B7DB8]/70 dark:bg-slate-900 dark:shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7)] ${isAndroid ? "android-login-card" : ""}`}
      >
        <div className="flex flex-col items-center text-center">
          <div
            className="text-[14px] font-bold tracking-[0.18em] text-slate-700 tabular-nums dark:text-slate-200"
            suppressHydrationWarning
          >
            {now ? formatClock(now) : "00 : 00 : 00"}
          </div>

          <div className="mt-4 flex h-11 w-11 items-center justify-center overflow-hidden rounded-full">
            <Image
              src="/images/msflogo.jpg"
              alt="Metahara Sugar Factory"
              width={44}
              height={44}
              className="h-full w-full object-cover"
              priority
            />
          </div>

          <div className="mt-3 space-y-0.5">
            <p className="text-[12px] leading-tight font-bold text-slate-800 dark:text-slate-100">
              የመተሐራ ስኳር ፋብሪካ
            </p>
            <p className="text-[12px] leading-tight font-bold text-slate-800 dark:text-slate-100">
              የንብረትና የቤት አስተዳደር ፖርታል
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {!isOnline && (
            <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
              <div className="flex-1">
                <p className="font-medium">You&apos;re offline</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Reconnect to continue.
                </p>
              </div>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="text-xs font-semibold text-[#2563EB] hover:underline"
              >
                Retry
              </button>
            </div>
          )}

          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} noValidate className="mt-6 text-left">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="username"
                className="block text-[14px] font-semibold text-slate-700 dark:text-slate-200"
              >
                Email or username
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  ref={usernameRef}
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  inputMode="email"
                  enterKeyHint="next"
                  value={formData.username}
                  onChange={handleChange}
                  onKeyDown={handleUsernameKeyDown}
                  disabled={isLoading}
                  className="h-11 w-full rounded-[16px] border-2 border-[#C5D3E3] bg-[#F3F6FA] pr-4 pl-10 text-sm text-slate-900 transition outline-none placeholder:text-slate-400 focus:border-[#0A6396] focus:bg-white focus:ring-4 focus:ring-[#0A6396]/15 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:focus:border-[#1B7DB8] dark:focus:bg-slate-800 dark:focus:ring-[#1B7DB8]/20"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-[14px] font-semibold text-slate-700 dark:text-slate-200"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  ref={passwordRef}
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  enterKeyHint="go"
                  value={formData.password}
                  onChange={handleChange}
                  onKeyDown={handlePasswordKeyDown}
                  disabled={isLoading}
                  className="h-11 w-full rounded-[16px] border-2 border-[#C5D3E3] bg-[#F3F6FA] pr-11 pl-10 text-sm text-slate-900 transition outline-none placeholder:text-slate-400 focus:border-[#0A6396] focus:bg-white focus:ring-4 focus:ring-[#0A6396]/15 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:focus:border-[#1B7DB8] dark:focus:bg-slate-800 dark:focus:ring-[#1B7DB8]/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  disabled={isLoading}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute top-1/2 right-2.5 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200/60 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-[#0A6396]/40 focus-visible:outline-none disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {TURNSTILE_SITE_KEY && (
            <div ref={turnstileRef} className="mt-4 min-h-[60px]" />
          )}

          <div className="mt-5 flex items-center justify-between gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-[14px] font-semibold text-slate-800 select-none dark:text-slate-200">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={isLoading}
                className="h-[18px] w-[18px] cursor-pointer rounded-[4px] border border-slate-300 accent-[#2563EB] focus-visible:ring-2 focus-visible:ring-[#2563EB]/40 focus-visible:outline-none dark:border-slate-500"
              />
              <span>Remember me</span>
            </label>
            <Link
              href="/forgot-password"
              className="rounded text-[14px] font-semibold text-[#2563EB] hover:underline focus-visible:ring-2 focus-visible:ring-[#2563EB]/40 focus-visible:outline-none"
            >
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={isLoading || !isOnline}
            className="mt-6 flex h-[46px] w-full items-center justify-center gap-2 rounded-[14px] bg-[#0A6396] text-[14px] font-bold text-white transition hover:bg-[#08557f] focus-visible:ring-4 focus-visible:ring-[#0A6396]/30 focus-visible:outline-none active:bg-[#07486d] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              <>
                Sign in
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>

          {isAndroid && (
            <div className="android-google-section mt-5">
              <div className="flex items-center gap-3 text-[11px] font-semibold tracking-[0.12em] text-slate-400 uppercase">
                <span className="h-px flex-1 bg-slate-200" />
                or
                <span className="h-px flex-1 bg-slate-200" />
              </div>
              <button
                type="button"
                onClick={() => setGoogleNotice(true)}
                aria-describedby={
                  googleNotice ? "android-google-notice" : undefined
                }
                className="android-google-button mt-3 flex h-[46px] w-full items-center justify-center gap-2.5 rounded-[14px] border-2 border-[#C5D3E3] bg-white text-[14px] font-bold text-slate-700 transition hover:border-[#0A6396] hover:bg-[#F7FAFD] focus-visible:ring-4 focus-visible:ring-[#0A6396]/20 focus-visible:outline-none active:bg-[#EEF4F9]"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
                  />
                </svg>
                Sign in with Google
              </button>
              {googleNotice && (
                <div
                  id="android-google-notice"
                  role="status"
                  className="android-google-notice mt-2 flex items-start gap-2 rounded-xl border border-[#BBD7EC] bg-[#F3F8FD] px-3 py-2 text-left text-[12px] font-medium text-[#0B4C73]"
                >
                  <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>Please wait - Google sign-in is coming soon.</span>
                </div>
              )}
            </div>
          )}
        </form>

        <footer className="mt-6 space-y-2 text-center">
          <div className="flex items-center justify-center gap-1.5 text-[12px] text-slate-500 dark:text-slate-400">
            <Building2 className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
            <span>© {year} Metahara Sugar Factory</span>
          </div>
          <SiteFooterLinks
            className="text-[12px] text-slate-500 dark:text-slate-400"
            linkClassName="hover:underline hover:text-slate-700 dark:hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/40 rounded"
          />
        </footer>
      </div>
    </main>
  );
}
