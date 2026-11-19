import Image from "next/image";
import RadialSpinner from "@/components/RadialSpinner";

export default function BrandLoader() {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white px-6 text-center"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading MSF HomeDesk"
    >
      <p className="text-[11px] font-semibold tracking-[0.24em] text-[#0a4f2c] uppercase sm:text-xs">
        METAHARA SUGAR FACTORY
      </p>

      <div className="my-6 flex h-24 w-24 items-center justify-center sm:h-28 sm:w-28">
        <Image
          src="/icons/msf-logo.png"
          alt="MSF logo"
          width={112}
          height={112}
          className="h-full w-full object-contain"
          priority
        />
      </div>

      <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
        MSF HomeDesk
      </h1>
      <p className="mt-1 text-sm font-medium text-slate-600">
        Asset &amp; House Portal
      </p>

      <div className="mt-8" aria-hidden="true">
        <RadialSpinner size={40} />
      </div>
    </div>
  );
}
