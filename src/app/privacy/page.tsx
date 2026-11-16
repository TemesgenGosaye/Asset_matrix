import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Send } from "lucide-react";

export const metadata: Metadata = {
  title: "MSF Asset and House Portal - Privacy Policy",
  description:
    "Privacy Policy for the Metahara Sugar Factory Asset & House Portal.",
};

const SUPPORT_URL = "https://t.me/Thefluxor";
const LAST_UPDATED = "November 11, 2026";

interface Section {
  title: string;
  body: string[];
}

const SECTIONS: Section[] = [
  {
    title: "1. About This Policy",
    body: [
      'This Privacy Policy explains how Metahara Sugar Factory ("the Factory", "we", or "us") handles information in the MSF Asset & House Portal ("HomeDesk" or "the Portal"). It applies when you use the Portal through a web browser, desktop application, or mobile application.',
      "The Portal is an internal operational system. Access to its records is intended for authorized personnel.",
    ],
  },
  {
    title: "2. Information the Portal Handles",
    body: [
      "Depending on your use of the Portal, information may include account and work details such as your name, username, email address, organization, and access role.",
      "The Portal also stores operational records entered by authorized users, including asset, housing, allocation, inspection, employee, request, and administrative activity records.",
      "For authentication, security, and troubleshooting, the Portal may process session identifiers and technical or audit information about requests and actions performed in the system.",
    ],
  },
  {
    title: "3. How Information Is Used",
    body: [
      "Information is used to provide Portal features, manage Factory assets and housing operations, administer user access, maintain accurate records, and respond to operational requests.",
      "Technical and activity information may be used to secure the Portal, investigate issues, audit changes, and maintain system reliability.",
    ],
  },
  {
    title: "4. Access and Disclosure",
    body: [
      "Portal information is available to authorized personnel according to their assigned roles and access permissions. Users should access records only when needed for their work.",
      "Information may be shared with service providers supporting the operation or security of the Portal, or disclosed when required for an authorized business purpose or by law. The Portal is not intended to make internal records publicly available.",
    ],
  },
  {
    title: "5. Confidentiality and Security",
    body: [
      "Users must protect their credentials and handle information from the Portal as confidential Factory information. Do not share account access or export and redistribute records unless authorized for official duties.",
      "Access controls and system activity records are used to support confidentiality and accountability. No internet-connected system can be guaranteed completely secure, so suspected unauthorized access should be reported promptly.",
    ],
  },
  {
    title: "6. Retention",
    body: [
      "Information is retained for as long as it is needed for the Portal's operational purposes, applicable recordkeeping requirements, and security or audit needs. Retention and disposal are handled under the Factory's applicable procedures.",
    ],
  },
  {
    title: "7. Your Responsibilities and Requests",
    body: [
      "Keep your account information accurate and your credentials private. If you believe information is inaccurate, or you have a question or request concerning information in the Portal, contact the system administrator or the support channel.",
    ],
  },
  {
    title: "8. Changes to This Policy",
    body: [
      "This Policy may be updated when Portal operations, security practices, or applicable requirements change. The date at the top of this page indicates when it was most recently updated.",
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-[100dvh] w-full bg-slate-50">
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
            Privacy Policy
          </h1>
          <p className="mt-1 text-sm font-medium text-white/75">የግላዊነት ፖሊሲ</p>
          <p className="mt-3 text-xs font-medium tracking-wide text-white/60">
            Last updated: {LAST_UPDATED}
          </p>
        </div>
      </header>

      <main className="mx-auto -mt-8 w-full max-w-3xl px-4 pb-10 sm:px-6">
        <article className="rounded-2xl border border-slate-200 bg-white px-6 py-8 shadow-[0_18px_40px_-20px_rgba(2,44,80,0.35)] sm:px-9 sm:py-10">
          <p className="text-sm leading-relaxed text-slate-600">
            This Policy describes how information is handled when using the
            Metahara Sugar Factory Asset &amp; House Portal. Please read it
            alongside the{" "}
            <Link
              href="/terms"
              className="text-primary font-semibold hover:underline"
            >
              Terms of Service
            </Link>
            .
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
                9. Contact
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                For questions about this Policy or information in the Portal,
                contact the system administrator or use the support channel:
              </p>
              <a
                href={SUPPORT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors hover:bg-slate-50"
              >
                <Send className="h-4 w-4" />
                Contact support on Telegram
              </a>
            </section>
          </div>

          <div className="mt-9 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-6">
            <Link
              href="/terms"
              className="text-primary hover:text-primary/80 text-sm font-semibold transition-colors"
            >
              Read the Terms of Service
            </Link>
            <Link
              href="/login"
              className="text-primary hover:text-primary/80 inline-flex items-center gap-2 text-sm font-semibold transition-colors"
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
