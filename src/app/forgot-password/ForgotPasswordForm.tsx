"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mail } from "lucide-react";

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
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-100 px-4 py-12 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-100/30 via-transparent to-transparent dark:from-blue-900/10"
      />

      <div className="relative z-10 w-full max-w-[480px] space-y-6 rounded-2xl border border-slate-200 bg-white px-8 py-10 shadow-xl dark:border-white/10 dark:bg-slate-900/70 dark:shadow-black/50 backdrop-blur-xl">

        {/* Logo */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-800">
            <Image
              src="/images/msflogo.jpg"
              alt="Metahara Sugar Factory"
              width={56}
              height={56}
              className="h-14 w-14 rounded-full object-contain"
              priority
            />
          </div>
        </div>

        <div className="space-y-1 text-center">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Reset your password
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Enter your email and we'll send you a reset link
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
                If an account with that email exists, we've sent a password
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
                Email Address
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  required
                  autoComplete="email"
                  className="h-12 w-full rounded-lg border bg-slate-100 pl-10 pr-4 text-sm text-slate-900 outline-none transition-all duration-200 placeholder:text-slate-500 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-400 focus:border-blue-500 focus:bg-white dark:focus:bg-slate-700"
                />
              </div>
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full bg-blue-600 font-semibold tracking-wide hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Sending…
                </span>
              ) : (
                "Send Reset Link"
              )}
            </Button>

            <div className="text-center">
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Sign In
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
