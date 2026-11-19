"use client";

import Image from "next/image";
import RadialSpinner from "@/components/RadialSpinner";

export default function BrandLoader({
  label = "Loading MSF HomeDesk…",
}: {
  label?: string;
}) {
  return (
    <div
      className="msf-loader fixed inset-0 z-50 flex flex-col items-center justify-between overflow-hidden bg-white p-6 text-slate-900 select-none sm:p-8"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <span className="msf-loader-ambient" aria-hidden="true" />

      {/* Brand Header */}
      <div className="z-10 flex flex-col items-center pt-4 text-center sm:pt-6">
        <div className="relative mb-3 flex items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-sm sm:h-20 sm:w-20">
            <Image
              src="/icons/msf-logo.png"
              alt="Metahara Sugar Factory"
              width={72}
              height={72}
              className="h-full w-full object-contain"
              priority
            />
          </div>
        </div>
        <p className="text-[10px] font-bold tracking-[0.24em] text-[#0a4f2c] uppercase sm:text-[11px]">
          Metahara Sugar Factory
        </p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          <span className="text-[#0b2a43]">Home</span>
          <span className="text-[#0a4f2c]">Desk</span>
        </h1>
        <p className="mt-1 text-xs font-medium text-slate-500">
          Asset &amp; House Portal
        </p>
      </div>

      {/* Capacitor APK Style Spinner & Status */}
      <div className="z-10 my-auto flex flex-col items-center py-6 text-center">
        <RadialSpinner size={48} color="#0a4f2c" />
        <p className="mt-5 text-sm font-semibold tracking-tight text-slate-700">
          {label}
        </p>
        <div className="msf-loader-bar mt-3" aria-hidden="true">
          <span />
        </div>
      </div>

      {/* Footer */}
      <div className="z-10 flex flex-col items-center pb-2 text-center text-[11px] font-medium text-slate-500">
        <p>© 2026 Metahara Sugar Factory</p>
        <p className="mt-0.5 text-[10px] font-semibold tracking-wider text-[#0a4f2c] uppercase">
          Powered By Temesgen G.
        </p>
      </div>
    </div>
  );
}
