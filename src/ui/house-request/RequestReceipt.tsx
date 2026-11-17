"use client";

import {
  ArrowRight,
  CalendarClock,
  Check,
  ClipboardCheck,
  Hash,
  Home,
  Printer,
  RotateCcw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/ui/household/house-format";
import type { Confirmation } from "./useHouseRequestFlow";

export default function RequestReceipt({
  confirmation,
  onReset,
}: {
  confirmation: Confirmation;
  onReset: () => void;
}) {
  return (
    <section
      aria-label="Request filed"
      className="border-border/70 bg-card animate-in fade-in slide-in-from-bottom-2 overflow-hidden rounded-3xl border shadow-[var(--shadow-md)]"
    >
      <div className="border-success-foreground/15 from-success-bg to-card border-b bg-gradient-to-br px-5 py-8 text-center sm:px-8">
        <div className="bg-success-bg text-success-foreground ring-success-foreground/20 mx-auto flex h-16 w-16 items-center justify-center rounded-full ring-8">
          <Check className="h-7 w-7" aria-hidden />
        </div>
        <p className="text-success-foreground mt-5 text-[10px] font-bold tracking-[0.18em] uppercase">
          House request filed
        </p>
        <h2 className="housing-serif text-foreground mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
          {confirmation.fullName} is in the queue
        </h2>
        <p className="text-muted-foreground mx-auto mt-2 max-w-xl text-sm leading-relaxed text-pretty">
          The request was recorded and will be ranked inside the Type{" "}
          {confirmation.houseCategory ?? "—"} band on the next queue
          calculation.
        </p>
      </div>

      <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
        <div className="border-border/60 bg-secondary/40 rounded-2xl border p-4">
          <p className="text-muted-foreground flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] uppercase">
            <Hash className="h-3 w-3" aria-hidden />
            Reference
          </p>
          <p className="text-foreground mt-2 font-mono text-sm font-bold break-all">
            {confirmation.requestId}
          </p>
        </div>
        <div className="border-border/60 bg-secondary/40 rounded-2xl border p-4">
          <p className="text-muted-foreground flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] uppercase">
            <Home className="h-3 w-3" aria-hidden />
            House band
          </p>
          <p className="text-foreground mt-2 text-sm font-bold">
            Type {confirmation.houseCategory ?? "—"}
          </p>
        </div>
        <div className="border-border/60 bg-secondary/40 rounded-2xl border p-4">
          <p className="text-muted-foreground flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] uppercase">
            <CalendarClock className="h-3 w-3" aria-hidden />
            Submitted
          </p>
          <p className="text-foreground mt-2 text-sm font-bold">
            {formatDateTime(confirmation.submittedAt)}
          </p>
        </div>
        <div className="border-border/60 bg-secondary/40 rounded-2xl border p-4">
          <p className="text-muted-foreground flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] uppercase">
            <ClipboardCheck className="h-3 w-3" aria-hidden />
            Status
          </p>
          <p className="text-foreground mt-2 text-sm font-bold">Submitted</p>
        </div>
      </div>

      <div className="border-border/60 border-t px-5 py-5 sm:px-6">
        <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.12em] uppercase">
          Justification recorded
        </p>
        <p className="text-foreground mt-2 text-sm leading-relaxed whitespace-pre-wrap">
          {confirmation.remarks}
        </p>
      </div>

      <div className="border-border/60 bg-secondary/40 flex flex-col gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
        <Button
          type="button"
          variant="outline"
          onClick={() => window.print()}
          className="gap-2"
        >
          <Printer className="h-4 w-4" aria-hidden />
          Print receipt
        </Button>
        <Button type="button" onClick={onReset} className="gap-2">
          <RotateCcw className="h-4 w-4" aria-hidden />
          File another request
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </section>
  );
}
