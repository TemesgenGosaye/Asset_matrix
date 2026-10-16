import Link from "next/link";
import { FileText, LayoutDashboard, ArrowRight } from "lucide-react";

interface QuickActionsProps {
  canRequestHouse?: boolean;
  canViewHouseLedger?: boolean;
}

export default function QuickActions({
  canRequestHouse = false,
  canViewHouseLedger = false,
}: QuickActionsProps) {
  if (!canRequestHouse && !canViewHouseLedger) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canViewHouseLedger && (
        <Link
          href="/dashboard/house-allocation"
          title="House Allocation Management (HAMS)"
          className="group inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-emerald-800 bg-emerald-700 px-3 text-sm font-medium text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-emerald-800 hover:shadow-md focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:outline-none dark:border-emerald-700 dark:bg-emerald-800 dark:hover:bg-emerald-700"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/20">
            <LayoutDashboard className="h-3.5 w-3.5" />
          </span>
          House Ledger
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}

      {canRequestHouse && (
        <Link
          href="/house-request"
          title="Submit a house request"
          className="group inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-blue-800 bg-blue-700 px-3 text-sm font-medium text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-blue-800 hover:shadow-md focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:outline-none dark:border-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/20">
            <FileText className="h-3.5 w-3.5" />
          </span>
          House Request
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}
