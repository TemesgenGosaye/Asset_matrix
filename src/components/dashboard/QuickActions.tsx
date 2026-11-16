import Link from "next/link";
import { FileText, ArrowRight, Plus } from "lucide-react";
import QuickCreateMenu from "@/components/QuickCreateMenu";

interface QuickActionsProps {
  canRequestHouse?: boolean;
}

export default function QuickActions({
  canRequestHouse = false,
}: QuickActionsProps) {
  if (!canRequestHouse) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href="/house-request"
        title="Submit a house request"
        className="group inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-[#004d73] bg-[#006699] px-3 text-sm font-medium text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#004d73] hover:shadow-md focus-visible:ring-2 focus-visible:ring-[#006699] focus-visible:ring-offset-2 focus-visible:outline-none dark:border-[#006699] dark:bg-[#006699] dark:hover:bg-[#004d73]"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/20">
          <FileText className="h-3.5 w-3.5" />
        </span>
        House Request
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </Link>
      <QuickCreateMenu label="Create" className="bg-primary text-primary-foreground hover:bg-primary/90" />
    </div>
  );
}
