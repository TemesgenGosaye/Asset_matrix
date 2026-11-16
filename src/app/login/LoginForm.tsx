"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type InputHTMLAttributes,
} from "react";
import { signIn, authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  AlertCircle,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ArrowRight,
  Loader2,
  Building2,
  KeyRound,
  Check,
  WifiOff,
  RefreshCw,
  ScrollText,
  LifeBuoy,
  X,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { isNativeApp } from "@/lib/native-app";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

/** Support channel shown on the login page (help link). */
const TELEGRAM_HELP_URL = "https://t.me/Thefluxor";

const NETWORK_ERROR_MESSAGE =
  "Network error — unable to reach the server. Please check your internet connection and try again.";

const OFFLINE_ERROR_MESSAGE =
  "You appear to be offline. Please check your internet connection and try again.";

/** Heuristics for transport-level failures surfaced by fetch/better-auth. */
function isNetworkErrorMessage(message: string): boolean {
  return /network|fetch|failed to fetch|timeout|connection|offline|unreachable|err_/i.test(
    message,
  );
}

/* ───────────────────────── Live Clock ───────────────────────── */
function LiveClock() {
  const [time, setTime] = useState<Date | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    const anim = requestAnimationFrame(() => setTime(new Date()));
    return () => {
      cancelAnimationFrame(anim);
      clearInterval(timer);
    };
  }, []);

  const hours = time ? time.getHours().toString().padStart(2, "0") : "--";
  const minutes = time ? time.getMinutes().toString().padStart(2, "0") : "--";
  const seconds = time ? time.getSeconds().toString().padStart(2, "0") : "--";

  const dateStr = time
    ? time.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : "";

  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3.5 py-1 text-xs font-semibold tracking-wide text-slate-700 shadow-xs border border-slate-200/70">
      {dateStr && <span className="opacity-80 font-normal">{dateStr}</span>}
      {dateStr && <span className="opacity-40">•</span>}
      <div className="inline-flex items-center font-mono">
        <span>{hours}</span>
        <span className="animate-pulse text-sky-600 font-bold">:</span>
        <span>{minutes}</span>
        <span className="animate-pulse text-sky-600 font-bold">:</span>
        <span>{seconds}</span>
      </div>
    </div>
  );
}

/* ───────────────────────── Turnstile ───────────────────────── */
function useTurnstile(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [token, setToken] = useState<string | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  const reset = useCallback(() => {
    setToken(null);
    if (
      widgetIdRef.current !== null &&
      typeof window !== "undefined" &&
      (window as any).turnstile
    ) {
      (window as any).turnstile.reset(widgetIdRef.current);
    }
  }, []);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !containerRef.current) return;

    function renderWidget() {
      if (!containerRef.current) return;
      if (widgetIdRef.current !== null) return;
      widgetIdRef.current = (window as any).turnstile.render(
        containerRef.current,
        {
          sitekey: TURNSTILE_SITE_KEY,
          size: "flexible",
          callback: (tok: string) => setToken(tok),
          "expired-callback": () => setToken(null),
          "error-callback": () => setToken(null),
        },
      );
    }

    if ((window as any).turnstile) {
      renderWidget();
      return;
    }

    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => renderWidget();
    document.head.appendChild(script);

    return () => {
      if (widgetIdRef.current !== null && (window as any).turnstile) {
        (window as any).turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [containerRef]);

  return { token, reset };
}

/* ───────────────────────── Offline notice ───────────────────────── */
function OfflineNotice({
  className = "",
  onRetry,
}: {
  className?: string;
  onRetry?: () => void;
}) {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = () => {
    setRetrying(true);
    if (onRetry) {
      onRetry();
    } else {
      window.location.reload();
    }
    setTimeout(() => setRetrying(false), 1200);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={`relative flex flex-col items-center rounded-2xl border border-rose-200/90 bg-rose-50/95 p-4 text-center shadow-xs ${className}`}
    >
      {/* Wi-Fi off on top */}
      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600 shadow-xs mb-2">
        <WifiOff className="h-5 w-5" />
        <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
        </span>
      </span>
      <h3 className="text-sm font-bold text-rose-950">
        Connect to the internet
      </h3>
      <p className="mt-0.5 text-[13px] leading-snug text-rose-700">
        You&rsquo;re offline. Check your connection.
      </p>
      <p className="mt-1 text-[11px] leading-tight text-rose-600/80">
        ፖርታሉን ለመጠቀም ኢንተርኔት ያስፈልጋል። እባክዎ Wi-Fi ወይም የሞባይል ዳታ ያብሩና እንደገና ይሞክሩ።
      </p>
      
      {/* Retry Button - Primary action */}
      <button
        type="button"
        onClick={handleRetry}
        disabled={retrying}
        className="mt-4 w-full inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 shadow-xs transition-all hover:bg-rose-100 hover:text-rose-950 active:scale-95 disabled:opacity-60"
      >
        <RefreshCw
          className={`h-4 w-4 ${retrying ? "animate-spin" : ""}`}
        />
        <span>{retrying ? "Reconnecting..." : "Retry"}</span>
      </button>

      {/* Divider */}
      <div className="relative my-3">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-rose-200/60"></div>
        </div>
        <div className="relative flex justify-center text-[10px] uppercase">
          <span className="bg-rose-50/95 px-2 text-rose-400 font-medium tracking-wider">or</span>
        </div>
      </div>

      {/* Help & Contact - Secondary action at bottom */}
      <a
        href={TELEGRAM_HELP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-sky-200 bg-white px-4 py-2.5 text-sm font-semibold text-[#0088cc] shadow-xs transition-all hover:bg-sky-50 active:scale-95"
      >
        <svg className="h-4 w-4 shrink-0 fill-current" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.52 2.77-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
        </svg>
        <span>Help and Contact</span>
      </a>
    </div>
  );
}

/* ───────────────────────── Terms & Services Modal ───────────────────────── */
function TermsModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[85vh] sm:max-h-[80vh] w-full max-w-lg flex-col rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ScrollText className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Terms of Service
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Metahara Sugar Factory • የአገልግሎት ደንቦች
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Terms"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Terms Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-xs sm:text-sm text-slate-600 leading-relaxed">
          <section>
            <h3 className="font-bold text-slate-900">1. Overview &amp; Acceptance</h3>
            <p className="mt-1">
              The MSF Asset &amp; House Portal (&quot;HomeDesk&quot;) is an official enterprise management system operated by Metahara Sugar Factory. By accessing or signing in to the mobile APK or web portal, you agree to comply with all company operational standards and guidelines.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-slate-900">2. Authorized Personnel</h3>
            <p className="mt-1">
              Access is strictly restricted to verified employees and administrative staff. You must use only your assigned corporate credentials. Unauthorized access attempts are monitored and recorded.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-slate-900">3. Data Confidentiality</h3>
            <p className="mt-1">
              All asset records, housing allocations, employee directories, and inspection data are strictly confidential property of Metahara Sugar Factory. Extracting or sharing data without authorization is prohibited.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-slate-900">4. Support &amp; Developer Contact</h3>
            <p className="mt-1">
              For system inquiries, account provisioning, or technical assistance, reach the developer directly via Telegram at{" "}
              <a
                href={TELEGRAM_HELP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-primary hover:underline"
              >
                https://t.me/Thefluxor
              </a>.
            </p>
          </section>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-5 py-3 rounded-b-2xl">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link
              href="/terms"
              target="_blank"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
            >
              <span>Read Full Terms</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
            <Link
              href="/privacy"
              target="_blank"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
            >
              <span>Privacy Policy</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-primary/90 active:scale-95 transition-all cursor-pointer"
          >
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Props & state ─────────────────────────── */
interface LoginPageProps {
  microsoftEnabled?: boolean;
  googleEnabled?: boolean;
}

interface SsoStatus {
  enabled: boolean;
  provider: string;
  providerName: string;
}

/* ──────────────────── Desktop Field (unchanged desktop style) ──────────────────── */
function DesktopField({
  label,
  icon,
  action,
  className,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <div className="group space-y-1.5 text-left">
      <label
        htmlFor={id}
        className="block text-xs sm:text-sm font-medium text-slate-700"
      >
        {label}
      </label>
      <div className="relative">
        <div
          className={`pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 transition-colors duration-200 ${
            focused ? "text-primary" : "text-slate-400"
          }`}
        >
          {icon}
        </div>
        <input
          id={id}
          {...props}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          className={`h-11 sm:h-11.5 w-full rounded-xl border bg-slate-50/90 pr-11 pl-10.5 text-base sm:text-sm text-slate-900 transition-all duration-200 outline-none placeholder:text-slate-400 ${
            focused
              ? "border-primary bg-white ring-2 ring-primary/20"
              : "border-slate-200 hover:border-slate-300"
          } ${className ?? ""}`}
        />
        {action && (
          <div className="absolute top-1/2 right-2.5 -translate-y-1/2">
            {action}
          </div>
        )}
      </div>
    </div>
  );
}

/* ──────────────────── Mobile Field (reference design style) ──────────────────── */
function MobileField({
  label,
  action,
  className,
  id,
  required,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  action?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <div className="space-y-1 text-left">
      <label
        htmlFor={id}
        className="block text-sm font-medium text-slate-800"
      >
        {label}
        {required && <span className="text-primary ml-0.5">*</span>}
      </label>
      <div className="relative">
        <input
          id={id}
          required={required}
          {...props}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          className={`h-12 w-full rounded-xl border bg-slate-100 px-4 pr-11 text-sm text-slate-900 transition-all duration-150 outline-none placeholder:text-slate-400 ${
            focused
              ? "border-primary bg-white ring-2 ring-primary/20"
              : "border-transparent hover:bg-slate-200/70"
          } ${className ?? ""}`}
        />
        {action && (
          <div className="absolute top-1/2 right-2.5 -translate-y-1/2">
            {action}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── Page component ─────────────────────────── */
export default function LoginPage({
  microsoftEnabled = false,
  googleEnabled = false,
}: LoginPageProps) {
  const router = useRouter();
  const [formData, setFormData] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [ssoStatus, setSsoStatus] = useState<SsoStatus | null>(null);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [devMessage, setDevMessage] = useState("");
  const turnstileRef = useRef<HTMLDivElement | null>(null);
  const { token: turnstileToken, reset: resetTurnstile } =
    useTurnstile(turnstileRef);
  const { isOnline } = useOnlineStatus();

  useEffect(() => {
    // The native APK must always start on sign-in. Never detour to the
    // first-run /setup wizard from inside the app shell.
    fetch("/api/setup/status")
      .then((r) => r.json())
      .then((d) => {
        if (d.needsSetup && !isNativeApp()) router.replace("/setup");
      })
      .catch(() => {});
  }, [router]);

  useEffect(() => {
    fetch("/api/auth/sso-status")
      .then((r) => r.json())
      .then((d) => {
        if (d.enabled) setSsoStatus(d);
      })
      .catch(() => {});
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (!isOnline) {
      setError(OFFLINE_ERROR_MESSAGE);
      return;
    }

    setIsLoading(true);

    try {
      const result = await signIn.email({
        email: formData.username,
        password: formData.password,
        fetchOptions: TURNSTILE_SITE_KEY
          ? { headers: { "x-turnstile-token": turnstileToken || "" } }
          : undefined,
      });

      if (result?.error) {
        const message = result.error.message || "Invalid username or password";
        setError(isNetworkErrorMessage(message) ? NETWORK_ERROR_MESSAGE : message);
        resetTurnstile();
        setIsLoading(false);
      } else if ((result?.data as any)?.twoFactorRedirect) {
        router.push("/mfa-verify");
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(
        isNetworkErrorMessage(message)
          ? NETWORK_ERROR_MESSAGE
          : "An unexpected error occurred. Please try again.",
      );
      resetTurnstile();
      setIsLoading(false);
    }
  };

  /**
   * Shared handler for OAuth buttons. Guards against offline state and
   * surfaces a readable message when a provider isn't configured server-side
   * or the network drops mid-request.
   */
  const handleSocialSignIn = async (provider: "google" | "microsoft") => {
    setError("");

    if (!isOnline) {
      setError(OFFLINE_ERROR_MESSAGE);
      return;
    }

    // Google Sign-In - Under Development
    if (provider === "google") {
      setDevMessage("Google Sign-In is currently under development. Please use email sign-in for now.");
      setTimeout(() => setDevMessage(""), 4000);
      return;
    }

    if (provider === "microsoft" && !microsoftEnabled) {
      setError(
        "Microsoft Sign-In is not enabled on this server yet. Please contact your administrator, or sign in with your email.",
      );
      return;
    }

    try {
      const result = await authClient.signIn.social({
        provider,
        callbackURL: "/dashboard",
      });
      if (result?.error) {
        const message =
          result.error.message ||
          `${provider === "google" ? "Google" : "Microsoft"} Sign-In failed`;
        setError(isNetworkErrorMessage(message) ? NETWORK_ERROR_MESSAGE : message);
      }
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
    }
  };

  /* ─────────────────── MOBILE / APK view (< md) ─────────────────── */
  const mobileView = (
    <div className="md:hidden relative flex min-h-[100dvh] w-full flex-col justify-between items-center overflow-x-hidden overflow-y-auto px-4 py-6 font-sans select-none
      pt-[max(1.5rem,env(safe-area-inset-top))]
      pb-[max(1.5rem,env(safe-area-inset-bottom))]
      pl-[max(1rem,env(safe-area-inset-left))]
      pr-[max(1rem,env(safe-area-inset-right))]">

      {/* ── Clean white canvas with a faint primary glow (reference design) ── */}
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-white">
        <div className="absolute -top-1/4 left-1/2 h-[55%] w-[140%] -translate-x-1/2 rounded-[50%] bg-primary/10 blur-[80px]" />
      </div>

      <div className="relative z-10 w-full max-w-[420px] mx-auto mt-6 px-1">
        {/* ── Top section: Logo + Title ── */}
        <div className="flex flex-col items-center gap-3 pt-2 pb-2">
          {/* Circular logo using system primary color */}
          <div className="relative flex h-[72px] w-[72px] items-center justify-center rounded-full bg-primary shadow-lg shadow-primary/30 overflow-hidden">
            <Image
              src="/images/msflogo.jpg"
              alt="MSF Logo"
              width={72}
              height={72}
              className="h-full w-full object-cover"
              priority
            />
          </div>

          <div className="text-center space-y-0.5 mt-1">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Sign in
            </h1>
            <p className="text-sm text-slate-500 font-medium">
              Sign in to MSF Asset &amp; House Portal
            </p>
          </div>
        </div>

        {/* ── Offline notice (network cut / airplane mode / unreachable) ── */}
        {(!isOnline || isNetworkErrorMessage(error)) && (
          <OfflineNotice
            className="mt-4"
            onRetry={() => {
              setError("");
              window.location.reload();
            }}
          />
        )}

        {/* ── Form ── */}
        <form
          onSubmit={handleSubmit}
          className="mt-6 space-y-4 w-full"
          noValidate
        >
          <MobileField
            id="username-mobile"
            name="username"
            type="text"
            label="Email"
            value={formData.username}
            onChange={handleChange}
            disabled={isLoading}
            required
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="username"
            inputMode="email"
            enterKeyHint="next"
            placeholder="Email"
          />

          <MobileField
            id="password-mobile"
            name="password"
            type={showPassword ? "text" : "password"}
            label="Password"
            value={formData.password}
            onChange={handleChange}
            disabled={isLoading}
            required
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="current-password"
            enterKeyHint="go"
            placeholder="••••••••"
            action={
              <button
                type="button"
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((v) => !v)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:text-slate-600 active:scale-95 cursor-pointer"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            }
          />

          {/* Options row */}
          <div className="flex items-center justify-between pt-0.5">
            <label className="group flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="sr-only"
              />
              <span
                className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border-[1.5px] transition-all duration-200 ${
                  remember
                    ? "border-primary bg-primary text-white"
                    : "border-slate-300 bg-white group-hover:border-slate-400"
                }`}
              >
                {remember && (
                  <Check className="h-2.5 w-2.5 stroke-[3]" />
                )}
              </span>
              <span className="text-sm font-medium text-slate-600">
                Remember me
              </span>
            </label>
            <Link
              href="/forgot-password"
              className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              Forgot Password?
            </Link>
          </div>

          {/* Error banner (non-network) */}
          {error && !isNetworkErrorMessage(error) && (
            <div
              role="alert"
              className="login-shake relative flex items-start gap-2.5 rounded-xl bg-red-50 pl-4 pr-3.5 py-3 text-sm text-red-700 border-l-4 border-red-500 shadow-sm"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <span className="leading-snug font-medium">{error}</span>
            </div>
          )}

          {/* Development message banner */}
          {devMessage && (
            <div
              role="status"
              aria-live="polite"
              className="relative flex items-start gap-2.5 rounded-xl bg-blue-50 pl-4 pr-3.5 py-3 text-sm text-blue-700 border-l-4 border-blue-500 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300"
            >
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
              <span className="leading-snug font-medium">{devMessage}</span>
            </div>
          )}

          {/* Turnstile */}
          {TURNSTILE_SITE_KEY && (
            <div ref={turnstileRef} className="flex justify-center" />
          )}

          {/* Sign in button — existing primary color */}
          <button
            type="submit"
            disabled={isLoading || !isOnline}
            title={!isOnline ? "You're offline" : undefined}
            className="group relative flex h-12 w-full items-center justify-center rounded-xl bg-primary text-white text-sm font-semibold shadow-md shadow-primary/25 transition-all duration-200 hover:bg-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer mt-2"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Signing in...</span>
              </span>
            ) : (
              <span>Sign in</span>
            )}
          </button>
        </form>

        {/* ── OAuth / SSO ── */}
        <div className="mt-5 space-y-3">
          <div className="relative flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">or sign in with</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          <div className="flex flex-col gap-2.5">
            {/* Sign in with Google Button with authentic Google icon */}
            <button
              type="button"
              onClick={() => handleSocialSignIn("google")}
              className="flex h-11.5 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 shadow-xs transition-all duration-200 hover:border-slate-300 hover:bg-slate-50/90 active:scale-[0.99] cursor-pointer"
            >
              <svg className="h-4.5 w-4.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              <span>Sign in with Google</span>
            </button>
            {microsoftEnabled && (
              <button
                type="button"
                onClick={() => handleSocialSignIn("microsoft")}
                className="flex h-11.5 w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 shadow-xs transition-all duration-200 hover:bg-slate-50 active:scale-[0.99] cursor-pointer"
              >
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 21 21" fill="none">
                  <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                  <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                  <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                  <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                </svg>
                Continue with Microsoft
              </button>
            )}
            {ssoStatus && (
              <button
                type="button"
                onClick={() => {
                  router.push("/api/auth/sso-init");
                }}
                className="flex h-11.5 w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 shadow-xs transition-all duration-200 hover:bg-slate-50 active:scale-[0.99] cursor-pointer"
              >
                <KeyRound className="h-4 w-4 text-slate-400" />
                Continue with {ssoStatus.providerName}
              </button>
            )}
          </div>
        </div>

        {/* ── Legal & support (Telegram Developer Link) ── */}
        <div className="mt-6 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => setShowTermsModal(true)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-2 text-xs sm:text-sm font-semibold text-slate-700 shadow-xs transition-all duration-200 hover:bg-slate-50 active:scale-[0.98] cursor-pointer"
          >
            <ScrollText className="h-4 w-4 shrink-0 text-slate-400" />
            <span>Terms of Service</span>
          </button>
          <a
            href={TELEGRAM_HELP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50/70 px-2 text-xs sm:text-sm font-semibold text-[#0088cc] shadow-xs transition-all duration-200 hover:bg-sky-100/80 active:scale-[0.98]"
            title="Help and Contact on Telegram"
          >
            <svg className="h-4 w-4 shrink-0 fill-current" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.52 2.77-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
            </svg>
            <span>Help and Contact</span>
          </a>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="relative z-10 pt-4 pb-1 text-center space-y-1">
        <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-slate-500">
          <Building2 className="h-3 w-3 shrink-0" />
          <span>© {new Date().getFullYear()} Metahara Sugar Factory</span>
        </div>
        <div className="text-[11px] text-slate-400">
          Powered by <span className="font-semibold text-slate-700">Temesgen</span>
        </div>
      </div>
    </div>
  );

  /* ─────────────────── DESKTOP view (≥ md) — UNCHANGED ─────────────────── */
  const desktopView = (
    <div className="hidden md:flex login-page relative min-h-[100dvh] w-full flex-col justify-between items-center overflow-x-hidden overflow-y-auto px-6 font-sans pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(0.875rem,env(safe-area-inset-left))] pr-[max(0.875rem,env(safe-area-inset-right))] select-none">
      {/* ── Premium Blue Ambient Background ── */}
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0293CA] via-[#0284c7] to-[#0369a1]" />
        <div className="absolute -top-1/3 left-1/2 h-[80%] w-[120%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(ellipse,rgba(56,189,248,0.4)_0%,rgba(14,165,233,0.25)_40%,transparent_70%)] blur-[100px]" />
        <div className="absolute top-1/4 -right-1/4 h-[50%] w-[50%] rounded-full bg-[radial-gradient(circle,rgba(125,211,252,0.3)_0%,transparent_70%)] blur-[80px]" />
        <div className="absolute bottom-0 left-1/4 h-[40%] w-[60%] bg-[radial-gradient(ellipse,rgba(14,165,233,0.25)_0%,transparent_70%)] blur-[90px]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.08)_0%,transparent_40%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black_30%,transparent_100%)]" />
      </div>

      {/* ── Login Card (Compact, Responsive, Clean) ── */}
      <main className="login-card relative z-10 mx-auto my-auto w-full max-w-[460px] sm:max-w-[480px]">
        <div className="login-card-inner relative w-full overflow-hidden rounded-2xl bg-white px-7 py-7 shadow-[0_20px_40px_-12px_rgba(2,44,80,0.22)] border border-white/40 transition-all">

          {/* ── MSF Logo ── */}
          <div className="login-section flex flex-col items-center gap-2.5 text-center pt-1">
            <Image
              src="/images/msflogo.jpg"
              alt="Metahara Sugar Factory"
              width={80}
              height={80}
              className="h-20 w-20 rounded-full object-cover shadow-xs border border-slate-100"
              priority
            />
            <LiveClock />
          </div>

          {/* ── Heading (Bilingual Titles) ── */}
          <div className="login-section mt-1.5 text-center">
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900 leading-snug">
              የመተሐራ ስኳር ፋብሪካ
            </h1>
            <p className="mt-0.5 text-sm font-semibold text-slate-600">
              የንብረትና የቤት አስተዳደር ፖርታል
            </p>
          </div>

          {/* ── Offline notice (network cut / unreachable) ── */}
          {(!isOnline || isNetworkErrorMessage(error)) && (
            <OfflineNotice
              className="login-section mt-4"
              onRetry={() => {
                setError("");
                window.location.reload();
              }}
            />
          )}

          {/* ── Form ── */}
          <form
            onSubmit={handleSubmit}
            className="login-section mt-5 space-y-3.5"
            noValidate
          >
            <DesktopField
              id="username"
              name="username"
              type="text"
              label="Username or Email"
              icon={<Mail className="h-4 w-4" />}
              value={formData.username}
              onChange={handleChange}
              disabled={isLoading}
              required
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="username"
              inputMode="email"
              enterKeyHint="next"
              placeholder="Enter email or username"
            />

            <DesktopField
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              label="Password"
              icon={<Lock className="h-4 w-4" />}
              value={formData.password}
              onChange={handleChange}
              disabled={isLoading}
              required
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="current-password"
              enterKeyHint="go"
              placeholder="••••••••"
              action={
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((v) => !v)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:text-slate-600 hover:bg-slate-100 active:scale-95 cursor-pointer"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              }
            />

            {/* Options row */}
            <div className="flex items-center justify-between pt-1">
              <label className="group flex items-center gap-2.5 py-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="sr-only"
                />
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all duration-200 ${
                    remember
                      ? "border-sky-600 bg-sky-600 text-white"
                      : "border-slate-300 bg-white group-hover:border-slate-400"
                  }`}
                >
                  {remember && (
                    <Check className="h-3 w-3 stroke-[3]" />
                  )}
                </span>
                <span className="text-sm font-medium text-slate-600">
                  Remember me
                </span>
              </label>
              <Link
                href="/forgot-password"
                className="text-sm font-semibold text-sky-600 hover:text-sky-700 transition-colors hover:underline hover:opacity-90 px-1 py-0.5 rounded"
              >
                Forgot password?
              </Link>
            </div>

            {/* Error banner (non-network) */}
            {error && !isNetworkErrorMessage(error) && (
              <div
                role="alert"
                className="login-shake relative flex items-start gap-2.5 rounded-xl bg-red-50 pl-4 pr-3.5 py-3.5 text-sm text-red-700 border-l-4 border-red-500 shadow-sm overflow-hidden"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <span className="leading-snug font-medium">{error}</span>
              </div>
            )}

            {/* Development message banner */}
            {devMessage && (
              <div
                role="status"
                aria-live="polite"
                className="relative flex items-start gap-2.5 rounded-xl bg-blue-50 pl-4 pr-3.5 py-3.5 text-sm text-blue-700 border-l-4 border-blue-500 shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300"
              >
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                <span className="leading-snug font-medium">{devMessage}</span>
              </div>
            )}

            {/* Turnstile */}
            {TURNSTILE_SITE_KEY && (
              <div ref={turnstileRef} className="flex justify-center" />
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={isLoading || !isOnline}
              title={!isOnline ? "You're offline" : undefined}
              className="group relative flex h-11.5 w-full items-center justify-center rounded-xl bg-primary text-primary-foreground text-base font-semibold shadow-sm transition-all duration-200 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Signing in...</span>
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <span>Sign in</span>
                  <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" />
                </span>
              )}
            </button>
          </form>

          {/* ── OAuth / SSO ── */}
          <div className="login-section mt-5 space-y-3">
            <div className="relative flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                or continue with
              </span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>
            <div className="flex flex-col gap-2.5">
              {/* Sign in with Google Button */}
              <button
                type="button"
                onClick={() => handleSocialSignIn("google")}
                className="group flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 shadow-2xs transition-all duration-200 hover:border-slate-300 hover:bg-slate-50/90 active:scale-[0.99] cursor-pointer"
              >
                <svg className="h-4.5 w-4.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                <span>Sign in with Google</span>
              </button>
              {microsoftEnabled && (
                <button
                  type="button"
                  onClick={() => handleSocialSignIn("microsoft")}
                  className="group flex h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition-all duration-200 hover:bg-slate-50 active:scale-[0.99] cursor-pointer"
                >
                  <svg className="h-4 w-4" viewBox="0 0 21 21" fill="none">
                    <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                    <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                    <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                    <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                  </svg>
                  Continue with Microsoft
                </button>
              )}
              {ssoStatus && (
                <button
                  type="button"
                  onClick={() => {
                    router.push("/api/auth/sso-init");
                  }}
                  className="group flex h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition-all duration-200 hover:bg-slate-50 active:scale-[0.99] cursor-pointer"
                >
                  <KeyRound className="h-4 w-4 text-slate-400" />
                  Continue with {ssoStatus.providerName}
                </button>
              )}
            </div>
          </div>

          {/* ── Legal & support (Telegram Developer Link) ── */}
          <div className="login-section mt-4 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setShowTermsModal(true)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-none bg-slate-100 text-xs font-semibold text-slate-700 transition-all duration-200 hover:bg-slate-200 hover:text-primary active:scale-[0.98] cursor-pointer"
            >
              <ScrollText className="h-4 w-4 shrink-0 text-slate-400" />
              <span>Terms of Service</span>
            </button>
            <a
              href={TELEGRAM_HELP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-none bg-sky-100 text-xs font-semibold text-[#0088cc] transition-all duration-200 hover:bg-sky-200 active:scale-[0.98]"
              title="Help and Contact on Telegram"
            >
              <svg className="h-4 w-4 shrink-0 fill-current" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.52 2.77-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
              </svg>
              <span>Help and Contact</span>
            </a>
          </div>

          {/* ── Footer ── */}
          <div className="login-section mt-5 pt-3.5 border-t border-slate-100 text-center space-y-1">
            <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-slate-500">
              <Building2 className="h-3 w-3 shrink-0 text-slate-400" />
              <span>© {new Date().getFullYear()} Metahara Sugar Factory</span>
            </div>
            <div className="text-[11px] text-slate-400">
              Powered by <span className="font-semibold text-slate-600">Temesgen</span>
            </div>
          </div>
        </div>
      </main>

      {/* ── Bottom Safe-Area Spacer ── */}
      <footer className="relative z-10 w-full max-w-[480px] text-center py-1">
        <p className="text-[11px] text-white/80 tracking-wide font-medium">
          HomeDesk Enterprise Platform • v0.7.0
        </p>
      </footer>
    </div>
  );

  return (
    <>
      {mobileView}
      {desktopView}
      <TermsModal
        isOpen={showTermsModal}
        onClose={() => setShowTermsModal(false)}
      />
    </>
  );
}
