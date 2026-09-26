"use client";

import Link from "next/link";
import {
  Package,
  Key,
  Wrench,
  Shield,
  BarChart3,
  Building2,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import MarketingNav from "@/components/marketing/MarketingNav";
import MarketingFooter from "@/components/marketing/MarketingFooter";

const features = [
  {
    icon: Package,
    title: "Asset Tracking",
    description:
      "Track hardware, software, and equipment across your entire organization with real-time visibility.",
  },
  {
    icon: Key,
    title: "License Management",
    description:
      "Monitor software licenses, track compliance, and avoid costly over- or under-licensing.",
  },
  {
    icon: Wrench,
    title: "Maintenance Scheduling",
    description:
      "Schedule and track preventive maintenance to extend asset lifecycles and reduce downtime.",
  },
  {
    icon: Shield,
    title: "Role-Based Access",
    description:
      "Granular permissions and roles ensure the right people have access to the right data.",
  },
  {
    icon: BarChart3,
    title: "Reports & Analytics",
    description:
      "Gain insights with custom reports, dashboards, and data exports for informed decision-making.",
  },
  {
    icon: Building2,
    title: "Multi-tenant",
    description:
      "Organization isolation, SSO integration, and multi-tenant support for enterprise teams.",
  },
];

const steps = [
  {
    number: "01",
    title: "Create your workspace",
    description:
      "Sign up and set up your organization in under two minutes.",
  },
  {
    number: "02",
    title: "Import or add assets",
    description:
      "Bulk-import from CSV or add assets manually. Tag them, assign owners, and set locations.",
  },
  {
    number: "03",
    title: "Track everything",
    description:
      "Monitor check-outs, license expirations, maintenance schedules, and consumable stock levels.",
  },
];

const stats = [
  { value: "10,000+", label: "Assets Tracked" },
  { value: "500+", label: "Organizations" },
  { value: "99.9%", label: "Uptime" },
];

export default function LandingPage() {
  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <MarketingNav />

      {/* Main content sits above the fixed footer */}
      <main className="relative z-10 flex-1 bg-background">
        {/* Hero Section */}
        <section className="pb-24 pt-32 sm:pb-32 sm:pt-40">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <p className="mb-5 inline-block rounded-full border border-border/60 px-4 py-1.5 text-xs font-medium tracking-wide text-muted-foreground">
                Modern Asset Management Platform
              </p>
              <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                Track every asset.
                <br />
                Stay in control.
              </h1>
              <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
                The complete platform to manage hardware, software licenses, and
                consumables across your organization. Built for IT teams that
                need clarity, not complexity.
              </p>
              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Button size="lg" className="rounded-full px-8" asChild>
                  <Link href="/register">
                    Get Started
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Stats / Trust */}
        <section className="border-y border-border/40 py-14">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <p className="mb-10 text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Trusted by teams worldwide
            </p>
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
              {stats.map((stat) => (
                <div key={stat.label} className="text-center">
                  <p className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                    {stat.value}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section id="features" className="scroll-mt-20 py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="mb-3 inline-block rounded-full border border-border/60 px-4 py-1.5 text-xs font-medium tracking-wide text-muted-foreground">
                Features
              </p>
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Everything you need to manage your assets
              </h2>
              <p className="mt-4 text-base text-muted-foreground">
                A complete toolkit for tracking, managing, and optimizing your
                organization&apos;s inventory.
              </p>
            </div>

            <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className="group rounded-2xl border border-border/50 bg-background p-6 transition-all hover:border-border hover:shadow-sm"
                >
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-border/50 bg-muted/50">
                    <feature.icon className="h-5 w-5 text-foreground" />
                  </div>
                  <h3 className="text-base font-semibold text-foreground">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section
          id="how-it-works"
          className="scroll-mt-20 border-t border-border/40 bg-muted/20 py-24 sm:py-32"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="mb-3 inline-block rounded-full border border-border/60 px-4 py-1.5 text-xs font-medium tracking-wide text-muted-foreground">
                How it works
              </p>
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Up and running in minutes
              </h2>
              <p className="mt-4 text-base text-muted-foreground">
                Three simple steps to full visibility over your assets.
              </p>
            </div>

            <div className="mt-16 grid gap-8 md:grid-cols-3">
              {steps.map((step) => (
                <div key={step.number} className="relative">
                  <span className="text-5xl font-bold text-border/60">
                    {step.number}
                  </span>
                  <h3 className="mt-4 text-lg font-semibold text-foreground">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Checklist / Why us */}
        <section className="py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid items-center gap-16 lg:grid-cols-2">
              <div>
                <p className="mb-3 inline-block rounded-full border border-border/60 px-4 py-1.5 text-xs font-medium tracking-wide text-muted-foreground">
                  Why Asset Tracker
                </p>
                <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                  Built for IT teams that value simplicity
                </h2>
                <p className="mt-4 text-base text-muted-foreground">
                  No bloated feature lists. Just the tools you actually need to
                  keep your assets organized and your team accountable.
                </p>
              </div>

              <div className="space-y-5">
                {[
                  "Full asset lifecycle tracking from procurement to disposal",
                  "License compliance monitoring with expiry alerts",
                  "Automated maintenance reminders and scheduling",
                  "Check-in / check-out with full audit history",
                  "Multi-organization support with SSO",
                  "Custom fields, categories, and workflows",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {item}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="border-t border-border/40 bg-muted/20 py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Ready to take control?
              </h2>
              <p className="mt-4 text-base text-muted-foreground">
                Join hundreds of organizations already using Asset Tracker to
                streamline their asset management.
              </p>
              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Button size="lg" className="rounded-full px-8" asChild>
                  <Link href="/register">
                    Get Started
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="rounded-full px-8"
                  asChild
                >
                  <Link href="/login">Sign In</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
