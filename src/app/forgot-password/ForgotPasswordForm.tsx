"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTheme } from "next-themes";
import { ArrowLeft, Building2, Mail, Moon, Sun } from "lucide-react";

export default function ForgotPasswordForm() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(t);
  }, []);

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

      <div className="relative z-10 w-full max-w-[436px] rounded-[28px] border-2 border-[#1B7DB8] bg-white px-8 py-8 shadow-[0_20px_50px_-20px_rgba(10,50,90,0.45)] sm:px-9 dark:border-[#1B7DB8]/70 dark:bg-slate-900 dark:shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7)]">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full">
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

        <div className="mt-6 text-center">
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
            Reset your password
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Enter your email and we&apos;ll send you a reset link
          </p>
        </div>

        {submitted ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border-2 border-[#C5D3E3] bg-[#F3F6FA] p-5 text-center dark:border-slate-600 dark:bg-slate-800">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#0A6396] ring-1 ring-[#C5D3E3] dark:bg-slate-700 dark:text-[#1B9FE0] dark:ring-slate-600">
                <Mail className="h-5 w-5" />
              </div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Check your inbox
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                If an account with that email exists, we&apos;ve sent a password
                reset link.
              </p>
            </div>
            <Link
              href="/login"
              className="flex h-[46px] w-full items-center justify-center gap-2 rounded-[14px] border-2 border-[#C5D3E3] bg-white text-[14px] font-semibold text-slate-700 transition hover:bg-[#F3F6FA] focus-visible:ring-4 focus-visible:ring-[#0A6396]/15 focus-visible:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Sign In
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 text-left" noValidate>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="email"
                  className="block text-[14px] font-semibold text-slate-700 dark:text-slate-200"
                >
                  Email or username
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    placeholder=""
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    required
                    autoComplete="email"
                    className="h-11 w-full rounded-[16px] border-2 border-[#C5D3E3] bg-[#F3F6FA] pr-4 pl-10 text-sm text-slate-900 transition outline-none placeholder:text-slate-400 focus:border-[#0A6396] focus:bg-white focus:ring-4 focus:ring-[#0A6396]/15 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:focus:border-[#1B7DB8] dark:focus:bg-slate-800 dark:focus:ring-[#1B7DB8]/20"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="mt-6 flex h-[46px] w-full items-center justify-center gap-2 rounded-[14px] bg-[#0A6396] text-[14px] font-bold text-white transition hover:bg-[#08557f] focus-visible:ring-4 focus-visible:ring-[#0A6396]/30 focus-visible:outline-none active:bg-[#07486d] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? "Sending..." : "Send Reset Link"}
            </button>

            <div className="mt-4 text-center">
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 rounded text-[14px] font-semibold text-[#2563EB] hover:underline focus-visible:ring-2 focus-visible:ring-[#2563EB]/40 focus-visible:outline-none"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Sign In
              </Link>
            </div>
          </form>
        )}

        <div className="mt-6 flex items-center justify-center gap-1.5 text-[12px] text-slate-500 dark:text-slate-400">
          <Building2 className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
          <span>© {year} Metahara Sugar Factory</span>
        </div>
      </div>
    </main>
  );
}
