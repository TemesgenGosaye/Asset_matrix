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
} from "lucide-react";

import ThemeSwitcher from "@/components/ThemeSwitcher";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

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

/* ─────────────────────────── Props & state ─────────────────────────── */
interface LoginPageProps {
  isDemo?: boolean;
  microsoftEnabled?: boolean;
  googleEnabled?: boolean;
}

interface SsoStatus {
  enabled: boolean;
  provider: string;
  providerName: string;
}

/* ──────────────────── Facebook-style input ──────────────────── */
function Field({
  label,
  icon,
  action,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <div className="group">
      <label
        htmlFor={props.id}
        className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300"
      >
        {label}
      </label>
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          {icon}
        </div>
        <input
          {...props}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          className={`h-12 w-full rounded-xl border-2 bg-slate-50 pl-10 pr-12 text-sm text-slate-900 outline-none transition-all duration-200 placeholder:text-slate-400 dark:bg-slate-800/80 dark:text-white dark:placeholder:text-slate-500 ${
            focused
              ? "border-blue-600 bg-white ring-2 ring-blue-500/20 dark:bg-slate-700 dark:border-blue-400"
              : "border-blue-400 hover:border-blue-600 dark:border-blue-500 dark:hover:border-blue-400"
          } ${className ?? ""}`}
        />
        {action && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {action}
          </div>
        )}
      </div>
    </div>
  );
}



/* ─────────────────────────── Page component ─────────────────────────── */
export default function LoginPage({
  isDemo = false,
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
  const turnstileRef = useRef<HTMLDivElement | null>(null);
  const { token: turnstileToken, reset: resetTurnstile } =
    useTurnstile(turnstileRef);

  useEffect(() => {
    fetch("/api/setup/status")
      .then((r) => r.json())
      .then((d) => {
        if (d.needsSetup) router.replace("/setup");
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
        setError(result.error.message || "Invalid username or password");
        resetTurnstile();
        setIsLoading(false);
      } else if ((result?.data as any)?.twoFactorRedirect) {
        router.push("/mfa-verify");
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
      resetTurnstile();
      setIsLoading(false);
    }
  };

  const fillDemoCredentials = (isAdmin: boolean) => {
    setFormData({
      username: isAdmin ? "demo_admin" : "demo_user",
      password: "demo123",
    });
  };

  const hasOAuth = ssoStatus || microsoftEnabled || googleEnabled;


  return (
    <div className="login-page relative flex min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-100 font-sans dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* ── Theme Toggle (page-level, fixed top-right) ── */}
      <div className="fixed top-4 right-4 z-50">
        <ThemeSwitcher />
      </div>

      {/* ── Clean Background ── */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-100/30 via-transparent to-transparent dark:from-blue-900/10" />
      </div>



      {/* ── Centered Layout Container ── */}
      <div className="login-card relative z-10 flex w-full max-w-[500px] mx-auto px-4 py-12 justify-center">
        {/* ── Login Form Card ── */}
        <div className="flex w-full">
          <div className="login-card-inner relative w-full overflow-hidden rounded-3xl border-4 border-blue-600 bg-white shadow-2xl shadow-blue-500/10 dark:border-blue-500 dark:bg-slate-900/90 dark:shadow-black/50 backdrop-blur-xl">

            <div className="relative px-8 pt-6 pb-10 sm:px-10 sm:pt-8 sm:pb-11">
              {/* ── Minimal Logo ── */}
              <div className="login-section flex flex-col items-center">
                <div className="relative">
                  <div className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full">
                    <Image
                      src="/images/msflogo.jpg"
                      alt="Metahara Sugar Factory"
                      width={80}
                      height={80}
                      className="h-24 w-24 rounded-full object-contain"
                      priority
                    />
                  </div>
                </div>
              </div>

              {/* ── Heading ── */}
              <div className="login-section mt-1 text-center">
                <h2 className="text-sm font-bold leading-tight tracking-tight text-slate-900 dark:text-white">
                  የመተሐራ ስኳር ፋብሪካ
                </h2>
                <p className="mt-0.5 text-sm font-bold leading-tight text-slate-700 dark:text-slate-200">
                  የንብረትና የቤት አስተዳደር ፖርታል
                </p>
              </div>

              {/* ── Demo banner ── */}
              {isDemo && (
                <div className="login-section mt-6 overflow-hidden rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-orange-500/5 dark:border-amber-500/30">
                  <div className="flex items-center gap-2 border-b border-amber-500/15 bg-amber-500/5 px-4 py-2.5">
                    <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                      Demo Mode • Resets every 30 minutes
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 p-4">
                    <button
                      type="button"
                      onClick={() => fillDemoCredentials(true)}
                      className="group relative rounded-xl border-2 border-blue-400 bg-slate-50 px-4 py-3 text-center backdrop-blur-sm transition-all duration-200 hover:border-blue-600 hover:bg-blue-50 hover:scale-[1.02] active:scale-[0.98] dark:border-blue-500 dark:bg-slate-800/50 dark:hover:border-blue-400 dark:hover:bg-slate-800/80"
                    >
                      <p className="font-mono text-sm font-semibold text-slate-700 dark:text-slate-200">
                        demo_admin
                      </p>
                      <span className="mt-2 inline-block rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300 uppercase">
                        Admin
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => fillDemoCredentials(false)}
                      className="group relative rounded-xl border-2 border-blue-400 bg-slate-50 px-4 py-3 text-center backdrop-blur-sm transition-all duration-200 hover:border-blue-600 hover:bg-blue-50 hover:scale-[1.02] active:scale-[0.98] dark:border-blue-500 dark:bg-slate-800/50 dark:hover:border-blue-400 dark:hover:bg-slate-800/80"
                    >
                      <p className="font-mono text-sm font-semibold text-slate-700 dark:text-slate-200">
                        demo_user
                      </p>
                      <span className="mt-2 inline-block rounded-full bg-slate-600/40 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase">
                        User
                      </span>
                    </button>
                  </div>
                </div>
              )}

            {/* ── Form ── */}
            <form
              onSubmit={handleSubmit}
              className="login-section mt-7 space-y-4"
              noValidate
            >
              <Field
                id="username"
                name="username"
                type="text"
                label="Email or username"
                icon={<Mail className="h-[17px] w-[17px]" />}
                value={formData.username}
                onChange={handleChange}
                disabled={isLoading}
                required
                autoComplete="username"
              />

              <Field
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                label="Password"
                icon={<Lock className="h-[17px] w-[17px]" />}
                value={formData.password}
                onChange={handleChange}
                disabled={isLoading}
                required
                autoComplete="current-password"
                action={
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((v) => !v)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors duration-200 hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    {showPassword ? (
                      <EyeOff className="h-[17px] w-[17px]" />
                    ) : (
                      <Eye className="h-[17px] w-[17px]" />
                    )}
                  </button>
                }
              />

              {/* Options row */}
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setRemember((v) => !v)}
                  className="group flex items-center gap-2"
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-md border transition-all duration-200 ${
                      remember
                        ? "border-blue-600 bg-blue-600 dark:border-blue-500 dark:bg-blue-500"
                        : "border-slate-300 bg-white group-hover:border-slate-400 dark:border-white/20 dark:bg-slate-800/30 dark:group-hover:border-white/30"
                    }`}
                  >
                    {remember && (
                      <Check className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
                    )}
                  </span>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Remember me
                  </span>
                </button>
                <Link
                  href="/forgot-password"
                  className="text-sm font-semibold text-blue-600 transition-colors duration-200 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Forgot password?
                </Link>
              </div>

              {/* Error */}
              {error && (
                <div
                  role="alert"
                  className="login-shake relative flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="leading-relaxed">{error}</span>
                </div>
              )}

              {/* Turnstile */}
              {TURNSTILE_SITE_KEY && (
                <div ref={turnstileRef} className="flex justify-center" />
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading}
                className="login-btn group relative flex h-12 w-full items-center justify-center overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-900/40 active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 dark:focus-visible:ring-offset-slate-900"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2.5">
                    Sign in
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </span>
                )}
              </button>
            </form>

            {/* ── OAuth / SSO ── */}
            {hasOAuth && (
              <div className="login-section mt-6 space-y-3">
                <div className="relative flex items-center gap-4">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                  <span className="text-xs font-medium text-slate-500 uppercase">
                    or
                  </span>
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                </div>
                <div className="flex flex-col gap-2.5">
                  {microsoftEnabled && (
                    <button
                      type="button"
                      onClick={async () => {
                        await authClient.signIn.social({
                          provider: "microsoft",
                          callbackURL: "/dashboard",
                        });
                      }}
                      className="group relative flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border-2 border-blue-400 bg-white text-sm font-semibold text-slate-700 backdrop-blur-sm transition-all duration-200 hover:border-blue-600 hover:bg-blue-50/50 hover:scale-[1.01] active:scale-[0.99] dark:border-blue-500 dark:bg-slate-800/40 dark:text-slate-200 dark:hover:border-blue-400 dark:hover:bg-slate-800/70"
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
                  {googleEnabled && (
                    <button
                      type="button"
                      onClick={async () => {
                        await authClient.signIn.social({
                          provider: "google",
                          callbackURL: "/dashboard",
                        });
                      }}
                      className="group relative flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border-2 border-blue-400 bg-white text-sm font-semibold text-slate-700 backdrop-blur-sm transition-all duration-200 hover:border-blue-600 hover:bg-blue-50/50 hover:scale-[1.01] active:scale-[0.99] dark:border-blue-500 dark:bg-slate-800/40 dark:text-slate-200 dark:hover:border-blue-400 dark:hover:bg-slate-800/70"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                      </svg>
                      Continue with Google
                    </button>
                  )}
                  {ssoStatus && (
                    <button
                      type="button"
                      onClick={() => {
                        window.location.href = "/api/auth/sso-init";
                      }}
                      className="group relative flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border-2 border-blue-400 bg-white text-sm font-semibold text-slate-700 backdrop-blur-sm transition-all duration-200 hover:border-blue-600 hover:bg-blue-50/50 hover:scale-[1.01] active:scale-[0.99] dark:border-blue-500 dark:bg-slate-800/40 dark:text-slate-200 dark:hover:border-blue-400 dark:hover:bg-slate-800/70"
                    >
                      <KeyRound className="h-4 w-4 text-slate-400" />
                      Continue with {ssoStatus.providerName}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── Footer ── */}
            <div className="login-section mt-6 flex items-center justify-center gap-2 text-center">
              <Building2 className="h-3.5 w-3.5 text-slate-400" />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                © {new Date().getFullYear()} Metahara Sugar Factory
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
