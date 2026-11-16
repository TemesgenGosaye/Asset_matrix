import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Send } from "lucide-react";

export const metadata: Metadata = {
  title: "MSF Asset and House Portal - Terms of Service",
  description:
    "Terms of Service for the Metahara Sugar Factory Asset & House Portal.",
};

const SUPPORT_URL = "https://t.me/Thefluxor";
const LAST_UPDATED = "November 10, 2026";

interface Section {
  title: string;
  body: string[];
}

const SECTIONS: Section[] = [
  {
    title: "1. Overview",
    body: [
      "The MSF Asset & House Portal (\"HomeDesk\", \"the Portal\") is an internal business system operated by Metahara Sugar Factory (\"the Factory\", \"we\", \"us\"). It supports the management of assets, houses, allocations, inspections, and related administrative records.",
      "These Terms of Service (\"Terms\") govern your access to and use of the Portal, whether through a web browser, the HomeDesk desktop application, or the HomeDesk mobile application (the APK).",
    ],
  },
  {
    title: "2. Acceptance of Terms",
    body: [
      "By signing in to, or otherwise using, the Portal you confirm that you have read, understood, and agreed to be bound by these Terms. If you do not agree, you must not use the Portal.",
    ],
  },
  {
    title: "3. Authorized Use",
    body: [
      "The Portal is provided solely for the Factory's internal operational and administrative purposes. Access is limited to authorized personnel who have been issued valid credentials.",
      "You must only use the Portal for legitimate work-related purposes and in line with the Factory's internal policies, procedures, and applicable law.",
    ],
  },
  {
    title: "4. Account & Credentials",
    body: [
      "Your account is personal and non-transferable. You are responsible for keeping your username, password, and any multi-factor credentials confidential, and for all activity that takes place under your account.",
      "You must notify the system administrator or the support channel immediately if you suspect any unauthorized access to, or use of, your account.",
    ],
  },
  {
    title: "5. Acceptable Use",
    body: [
      "You must not attempt to gain unauthorized access to the Portal or its data, interfere with its normal operation, or use it to store, share, or transmit anything unlawful or harmful.",
      "You must not scrape, export, or redistribute Portal data outside the Factory except where explicitly authorized for official duties.",
    ],
  },
  {
    title: "6. Data, Privacy & Confidentiality",
    body: [
      "Information available through the Portal, including asset, housing, employee, and household records, is confidential and belongs to the Factory. It must be accessed only on a need-to-know basis and handled in accordance with the Factory's data protection practices.",
      "Activity within the Portal may be logged and audited to maintain security, integrity, and accountability of the records.",
    ],
  },
  {
    title: "7. Intellectual Property",
    body: [
      "The Portal, including its software, design, branding, and content, is the property of the Factory and its licensors. No rights are granted to you other than the limited right to use the Portal as described in these Terms.",
    ],
  },
  {
    title: "8. Availability & Support",
    body: [
      "The Portal is provided on an \"as available\" basis. Access may be interrupted for maintenance, upgrades, or circumstances beyond our control, and network connectivity is required for most functions.",
      "For assistance, please contact the support channel provided by the Factory.",
    ],
  },
  {
    title: "9. Suspension & Termination",
    body: [
      "We may suspend or withdraw your access at any time, without prior notice, if you breach these Terms, if your role changes, or if continued access is no longer authorized.",
    ],
  },
  {
    title: "10. Changes to These Terms",
    body: [
      "We may update these Terms from time to time to reflect operational, legal, or security requirements. Continued use of the Portal after an update constitutes acceptance of the revised Terms.",
    ],
  },
];

export default function TermsOfServicePage() {
  return (
    <div className="min-h-[100dvh] w-full bg-slate-50">
      {/* ── Header band ── */}
      <header className="relative overflow-hidden bg-gradient-to-br from-[#0b2b57] to-[#0a2450] px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-14 text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[120%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(ellipse,rgba(56,189,248,0.28)_0%,transparent_70%)] blur-2xl"
        />
        <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center text-center">
          <Image
            src="/images/msflogo.jpg"
            alt="Metahara Sugar Factory"
            width={64}
            height={64}
            className="h-16 w-16 rounded-full object-cover ring-2 ring-white/25"
            priority
          />
          <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
            Terms of Service
          </h1>
          <p className="mt-1 text-sm font-medium text-white/75">
            የአገልግሎት ደንቦች
          </p>
          <p className="mt-3 text-xs font-medium tracking-wide text-white/60">
            Last updated: {LAST_UPDATED}
          </p>
        </div>
      </header>

      {/* ── Content card ── */}
      <main className="mx-auto -mt-8 w-full max-w-3xl px-4 pb-10 sm:px-6">
        <article className="rounded-2xl border border-slate-200 bg-white px-6 py-8 shadow-[0_18px_40px_-20px_rgba(2,44,80,0.35)] sm:px-9 sm:py-10">
          <p className="text-sm leading-relaxed text-slate-600">
            These Terms apply to the Metahara Sugar Factory Asset &amp; House
            Portal. Please read them carefully before using the Portal.
          </p>

          <div className="mt-8 space-y-7">
            {SECTIONS.map((section) => (
              <section key={section.title}>
                <h2 className="text-base font-semibold tracking-tight text-slate-900">
                  {section.title}
                </h2>
                <div className="mt-2 space-y-2.5">
                  {section.body.map((paragraph, i) => (
                    <p
                      key={i}
                      className="text-sm leading-relaxed text-slate-600"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            ))}

            <section>
              <h2 className="text-base font-semibold tracking-tight text-slate-900">
                11. Contact
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                For questions about these Terms or the Portal, please reach the
                support channel:
              </p>
              <a
                href={SUPPORT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-slate-50"
              >
                <Send className="h-4 w-4" />
                Contact support on Telegram
              </a>
            </section>
          </div>

          <div className="mt-9 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-6">
            <Link
              href="/privacy"
              className="text-sm font-semibold text-primary transition-colors hover:text-primary/80"
            >
              Read the Privacy Policy
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-sm font-semibold text-primary transition-colors hover:text-primary/80"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to sign in
            </Link>
          </div>
        </article>

        <p className="mt-6 text-center text-xs font-medium text-slate-400">
          © {new Date().getFullYear()} Metahara Sugar Factory — Powered by
          Temesgen
        </p>
      </main>
    </div>
  );
}
