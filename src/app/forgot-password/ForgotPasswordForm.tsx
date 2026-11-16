"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mail, Building2 } from "lucide-react";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      setSubmitted(true);
    } catch {
      setSubmitted(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden p-3.5 sm:p-6 font-sans pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0293CA] via-[#0284c7] to-[#0369a1] dark:bg-gradient-to-br dark:from-[#012a4a] dark:via-[#013a63] dark:to-[#001d3d]" />
        <div className="absolute -top-1/3 left-1/2 h-[80%] w-[120%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(ellipse,rgba(56,189,248,0.4)_0%,rgba(14,165,233,0.25)_40%,transparent_70%)] blur-[100px]" />
        <div className="absolute top-1/4 -right-1/4 h-[50%] w-[50%] rounded-full bg-[radial-gradient(circle,rgba(125,211,252,0.3)_0%,transparent_70%)] blur-[80px]" />
        <div className="absolute bottom-0 left-1/4 h-[40%] w-[60%] bg-[radial-gradient(ellipse,rgba(14,165,233,0.25)_0%,transparent_70%)] blur-[90px]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.08)_0%,transparent_40%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black_30%,transparent_100%)]" />
      </div>

      <div className="relative z-10 w-full max-w-[420px] sm:max-w-[440px] space-y-5 rounded-2xl sm:rounded-3xl border border-slate-200/90 bg-white/95 px-5 py-6 sm:px-8 sm:py-7 shadow-xl shadow-slate-200/40 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-2xl dark:shadow-black/60">

        {/* Logo */}
        <div className="flex flex-col items-center text-center">
          <div className="relative flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center">
            <Image
              src="/images/msflogo.jpg"
              alt="Metahara Sugar Factory"
              width={80}
              height={80}
              className="h-full w-full object-contain"
              priority
            />
          </div>
        </div>

        <div className="space-y-1 text-center">
          <h2 className="text-base sm:text-lg leading-tight font-bold tracking-tight text-slate-900 dark:text-white">
            የመተሐራ ስኳር ፋብሪካ
          </h2>
          <p className="mt-1 text-xs sm:text-sm leading-tight font-semibold tracking-wide text-[hsl(var(--primary))] dark:text-[hsl(var(--primary))]">
            የንብረትና የቤት አስተዳደር ፖርታል
          </p>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
            Reset your password
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Enter your email and we&apos;ll send you a reset link
          </p>
        </div>

        {submitted ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 text-center dark:border-blue-900/50 dark:bg-blue-900/20">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40">
                <Mail className="h-6 w-6 text-blue-700 dark:text-blue-400" />
              </div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Check your inbox
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                If an account with that email exists, we&apos;ve sent a password
                reset link.
              </p>
            </div>
            <Link href="/login">
              <Button variant="outline" className="w-full dark:border-slate-700">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Sign In
              </Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="group">
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Email or username
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  required
                  autoComplete="email"
                  className="h-12 w-full rounded-xl border-2 border-slate-300 bg-slate-50 pl-10 pr-4 text-sm text-slate-900 outline-none transition-all duration-200 placeholder:text-slate-400 hover:border-[hsl(var(--primary))] focus:border-[hsl(var(--primary))] focus:bg-white focus:ring-2 focus:ring-[hsl(var(--primary))/20] dark:border-slate-700 dark:bg-slate-800/80 dark:text-white dark:placeholder:text-slate-500 dark:hover:border-[hsl(var(--primary))] dark:focus:border-[hsl(var(--primary))] dark:focus:bg-slate-700"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="group relative flex h-12 w-full items-center justify-center overflow-hidden rounded-xl bg-[hsl(var(--primary))] text-sm font-semibold text-white shadow-lg shadow-[hsl(var(--primary))/30] transition-all duration-200 hover:-translate-y-0.5 hover:opacity-90 hover:shadow-xl hover:shadow-[hsl(var(--primary))/40] focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-white focus-visible:outline-none active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 dark:focus-visible:ring-offset-slate-900"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Sending…
                </span>
              ) : (
                "Send Reset Link"
              )}
            </button>

            <div className="text-center">
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[hsl(var(--primary))] hover:opacity-80 dark:text-[hsl(var(--primary))]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Sign In
              </Link>
            </div>
          </form>
        )}

        <div className="pt-3.5 border-t border-slate-100 dark:border-slate-800/80 text-center">
          <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
            <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
            <span>© {new Date().getFullYear()} Metahara Sugar Factory</span>
          </div>
          <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            Powered by <span className="font-semibold text-slate-800 dark:text-slate-200">Temesgen</span>
          </div>
        </div>
      </div>
    </div>
  );
}
