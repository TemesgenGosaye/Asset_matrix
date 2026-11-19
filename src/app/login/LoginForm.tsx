"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { signIn, authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  WifiOff,
} from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
const TELEGRAM_HELP_URL = "https://t.me/Thefluxor";

const NETWORK_ERROR_MESSAGE =
  "Network error — unable to reach the server. Check your internet connection and try again.";
const OFFLINE_ERROR_MESSAGE =
  "You appear to be offline. Check your internet connection and try again.";

const inputStyle = {
  WebkitBoxShadow: "0 0 0 1000px #ffffff inset",
  WebkitTextFillColor: "#000000",
} as CSSProperties;

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

function isNetworkErrorMessage(message: string): boolean {
  return /network|fetch|failed to fetch|timeout|connection|offline|unreachable|err_/i.test(
    message,
  );
}

function useTurnstile(containerRef: RefObject<HTMLDivElement | null>) {
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

interface SsoStatus {
  enabled: boolean;
  provider: string;
  providerName: string;
}

export default function LoginPage({
  microsoftEnabled = false,
  googleEnabled = false,
}: LoginPageProps) {
  const router = useRouter();
  const [formData, setFormData] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [ssoStatus, setSsoStatus] = useState<SsoStatus | null>(null);
  const [devMessage, setDevMessage] = useState("");
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const { token: turnstileToken, reset: resetTurnstile } =
    useTurnstile(turnstileRef);
  const { isOnline } = useOnlineStatus();

  useEffect(() => {
    usernameRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/sso-status", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((data: SsoStatus) => {
        if (data.enabled) setSsoStatus(data);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

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

  const handleSocialSignIn = async (provider: "google" | "microsoft") => {
    setError("");

    if (!isOnline) {
      setError(OFFLINE_ERROR_MESSAGE);
      return;
    }

    if (provider === "google") {
      setDevMessage(
        "Google sign-in is currently under development. Use email sign-in for now.",
      );
      setTimeout(() => setDevMessage(""), 4000);
      return;
    }

    if (!microsoftEnabled) {
      setError(
        "Microsoft sign-in is not enabled on this server. Contact your administrator or use email sign-in.",
      );
      return;
    }

    try {
      const result = await authClient.signIn.social({
        provider,
        callbackURL: "/dashboard",
      });
      if (result?.error) {
        const message = result.error.message || "Microsoft sign-in failed";
        setError(
          isNetworkErrorMessage(message) ? NETWORK_ERROR_MESSAGE : message,
        );
      }
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
    }
  };

  const showSso =
    googleEnabled ||
    microsoftEnabled ||
    (ssoStatus?.enabled && ssoStatus.provider !== "microsoft");

  return (
    <main
      data-login-page
      className="flex min-h-[100dvh] w-full items-center justify-center bg-white px-5 py-10 text-black"
    >
      <div className="w-full max-w-[420px]">
        <div className="mb-9 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#0A4F2C] text-lg font-bold text-white">
            M
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-black">
            Sign in to HomeDesk
          </h1>
          <p className="mt-1 text-sm text-black/60">
            Metahara Sugar Factory · Asset &amp; House Portal
          </p>
        </div>

        {!isOnline && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-black/15 bg-white p-4">
            <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-[#0A4F2C]" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-black">
                You&rsquo;re offline
              </p>
              <p className="mt-0.5 text-xs text-black/60">
                Reconnect to continue, then try again.
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="text-xs font-semibold text-[#0A4F2C] hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {error && (
          <div
            role="alert"
            aria-live="polite"
            className="mb-5 flex items-start gap-3 rounded-xl border border-black/15 bg-white p-4"
          >
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#0A4F2C]" />
            <p className="text-sm text-black">{error}</p>
          </div>
        )}

        {devMessage && (
          <div
            role="status"
            aria-live="polite"
            className="mb-5 rounded-xl border border-black/15 bg-white p-4 text-sm text-black"
          >
            {devMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-5">
            <div className="space-y-2 text-left">
              <label
                htmlFor="username"
                className="block text-sm font-medium text-black"
              >
                Email or username
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-black/40" />
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
                  placeholder="name@domain.com"
                  style={inputStyle}
                  className="h-12 w-full rounded-lg border border-black/15 bg-white pr-4 pl-11 text-base text-black outline-none placeholder:text-black/35 focus:border-[#0A4F2C] focus:ring-2 focus:ring-[#0A4F2C]/20 disabled:opacity-60"
                />
              </div>
            </div>

            <div className="space-y-2 text-left">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-black"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-black/40" />
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
                  placeholder="Enter your password"
                  style={inputStyle}
                  className="h-12 w-full rounded-lg border border-black/15 bg-white pr-12 pl-11 text-base text-black outline-none placeholder:text-black/35 focus:border-[#0A4F2C] focus:ring-2 focus:ring-[#0A4F2C]/20 disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  disabled={isLoading}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute top-1/2 right-3 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-black/50 hover:bg-black/5 hover:text-black disabled:opacity-50"
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
            <div ref={turnstileRef} className="mt-5 min-h-[60px]" />
          )}

          <button
            type="submit"
            disabled={isLoading || !isOnline}
            className="mt-7 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#0A4F2C] text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            {isLoading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {showSso && (
          <div className="mt-7 space-y-3">
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-black/10" />
              <span className="text-xs text-black/45">or continue with</span>
              <span className="h-px flex-1 bg-black/10" />
            </div>
            {googleEnabled && (
              <button
                type="button"
                onClick={() => handleSocialSignIn("google")}
                disabled={!isOnline}
                className="h-11 w-full rounded-lg border border-black/15 bg-white text-sm font-medium text-black hover:bg-black/[0.03] disabled:opacity-50"
              >
                Google
              </button>
            )}
            {microsoftEnabled && (
              <button
                type="button"
                onClick={() => handleSocialSignIn("microsoft")}
                disabled={!isOnline}
                className="h-11 w-full rounded-lg border border-black/15 bg-white text-sm font-medium text-black hover:bg-black/[0.03] disabled:opacity-50"
              >
                Microsoft
              </button>
            )}
            {ssoStatus?.enabled && ssoStatus.provider !== "microsoft" && (
              <Link
                href="/api/auth/sso-init"
                className="flex h-11 items-center justify-center rounded-lg border border-black/15 bg-white text-sm font-medium text-black hover:bg-black/[0.03]"
              >
                {ssoStatus.providerName}
              </Link>
            )}
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-black/55">
          <Link href="/forgot-password" className="hover:text-[#0A4F2C]">
            Forgot password?
          </Link>
          <Link href="/terms" className="hover:text-[#0A4F2C]">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-[#0A4F2C]">
            Privacy
          </Link>
          <a
            href={TELEGRAM_HELP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#0A4F2C]"
          >
            Support
          </a>
        </div>
      </div>
    </main>
  );
}
