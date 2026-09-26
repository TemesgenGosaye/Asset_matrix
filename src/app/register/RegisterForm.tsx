"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RegisterForm() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    firstname: "",
    lastname: "",
    email: "",
    organization: "",
    username: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (formData.password.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstname: formData.firstname,
          lastname: formData.lastname,
          email: formData.email,
          organization: formData.organization,
          username: formData.username,
          password: formData.password,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Registration failed. Please try again.");
        setIsLoading(false);
        return;
      }
      router.push("/login?registered=true");
    } catch (err) {
      console.error("Registration error:", err);
      setError("An unexpected error occurred. Please try again.");
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

        {/* Logo + Branding */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-green-700 to-emerald-600 p-1.5 shadow-lg shadow-green-900/30">
            <Image
              src="/images/msflogo.jpg"
              alt="Metahara Sugar Factory"
              width={64}
              height={64}
              className="h-full w-full rounded-xl object-contain"
              priority
            />
          </div>
          <div className="space-y-0.5">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-green-700 dark:text-green-400">
              Metahara Sugar Factory
            </p>
            <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">
              Asset &amp; House Portal
            </h1>
          </div>
        </div>

        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            Create an account
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Register to start tracking assets
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="firstname" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                First Name
              </Label>
              <Input
                id="firstname"
                name="firstname"
                type="text"
                placeholder="First name"
                value={formData.firstname}
                onChange={handleChange}
                disabled={isLoading}
                required
                className="dark:border-slate-700 dark:bg-slate-800/60"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastname" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Last Name
              </Label>
              <Input
                id="lastname"
                name="lastname"
                type="text"
                placeholder="Last name"
                value={formData.lastname}
                onChange={handleChange}
                disabled={isLoading}
                required
                className="dark:border-slate-700 dark:bg-slate-800/60"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Email
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              value={formData.email}
              onChange={handleChange}
              disabled={isLoading}
              required
              autoComplete="email"
              className="dark:border-slate-700 dark:bg-slate-800/60"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="organization" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Organisation
            </Label>
            <Input
              id="organization"
              name="organization"
              type="text"
              placeholder="Your organisation name"
              value={formData.organization}
              onChange={handleChange}
              disabled={isLoading}
              required
              className="dark:border-slate-700 dark:bg-slate-800/60"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="username" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Username
            </Label>
            <Input
              id="username"
              name="username"
              type="text"
              placeholder="Choose a username"
              value={formData.username}
              onChange={handleChange}
              disabled={isLoading}
              required
              autoComplete="username"
              className="dark:border-slate-700 dark:bg-slate-800/60"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Password
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="Min. 12 characters"
              value={formData.password}
              onChange={handleChange}
              disabled={isLoading}
              required
              minLength={12}
              autoComplete="new-password"
              className="dark:border-slate-700 dark:bg-slate-800/60"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Confirm Password
            </Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              placeholder="Re-enter your password"
              value={formData.confirmPassword}
              onChange={handleChange}
              disabled={isLoading}
              required
              minLength={12}
              autoComplete="new-password"
              className="dark:border-slate-700 dark:bg-slate-800/60"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400"
            >
              {error}
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full bg-green-700 font-semibold tracking-wide hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700"
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Creating account…
              </span>
            ) : (
              "Create Account"
            )}
          </Button>

          <p className="text-center text-xs text-slate-400 dark:text-slate-500">
            By registering, you agree to our{" "}
            <Link href="/terms" className="text-green-700 hover:underline dark:text-green-400">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-green-700 hover:underline dark:text-green-400">
              Privacy Policy
            </Link>
            .
          </p>

          <p className="text-center text-sm text-slate-500 dark:text-slate-400">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-semibold text-green-700 hover:underline dark:text-green-400"
            >
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
