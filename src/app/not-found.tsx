"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Compass, ArrowLeft, LayoutDashboard } from "lucide-react";

/**
 * 404 — the page does not exist.
 *
 * Same centred, status-led layout as `error.tsx` so the two failures read as
 * one family, but the tone is neutral (slate, not red): a wrong URL is not a
 * fault, and the copy avoids blaming the user. The way back is offered first.
 */
export default function NotFound() {
  const router = useRouter();

  return (
    <div className="flex min-h-[100dvh] w-full flex-col items-center justify-center bg-slate-50 px-6 py-12 text-center">
      <div className="grid h-24 w-24 place-items-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-[0_0_0_12px_rgba(241,245,249,0.7)]">
        <Compass className="h-11 w-11" strokeWidth={1.8} />
      </div>

      <span className="mt-6 inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-bold tracking-widest text-slate-500 uppercase">
        Error 404
      </span>

      <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
        Page not found
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-500">
        The page you&rsquo;re looking for doesn&rsquo;t exist or may have been
        moved. Check the address, or head back to a page you know.
      </p>

      <div className="mt-8 flex w-full max-w-sm flex-col gap-2.5 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={() => router.back()}
          className="focus-visible:ring-ring inline-flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 shadow-sm transition-all duration-200 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.98]"
        >
          <ArrowLeft className="h-4 w-4" />
          Go back
        </button>
        <Link
          href="/dashboard"
          className="bg-primary text-primary-foreground shadow-primary/25 hover:bg-primary/90 focus-visible:ring-ring inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold shadow-md transition-all duration-200 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.98]"
        >
          <LayoutDashboard className="h-4 w-4" />
          Dashboard
        </Link>
      </div>
    </div>
  );
}
