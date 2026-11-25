"use client";
import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarPlus, Fingerprint } from "lucide-react";
import AssetDetailActions from "./AssetDetailActions";
import ReportProblemButton from "@/components/ReportProblemButton";
import RequestItemDialog from "@/components/RequestItemDialog";
import { AskMeriButton } from "@/components/ai/AskMeriButton";

type StatusVariant =
  "default" | "success" | "warning" | "destructive" | "muted";

function statusVariant(name): StatusVariant {
  const value = (name || "").toLowerCase();
  if (value === "active") return "default";
  if (value === "available") return "success";
  if (value === "pending") return "warning";
  if (value.includes("lost") || value.includes("stolen")) return "destructive";
  return "muted";
}

function StatusChip({ name }) {
  if (!name) return null;
  return (
    <Badge variant={statusVariant(name)} className="tracking-wide uppercase">
      {name}
    </Badge>
  );
}

export default function AssetDetailHeader({ asset, statuses, isAdmin = true }) {
  const [requestOpen, setRequestOpen] = useState(false);
  const statusName = useMemo(
    () =>
      statuses.find((s) => s.statustypeid === asset.statustypeid)
        ?.statustypename,
    [statuses, asset.statustypeid],
  );
  const isAvailable = statusName?.toLowerCase().includes("available");
  const canRequest = !isAdmin && (asset.requestable || isAvailable);

  return (
    <div className="border-border/70 from-card to-muted/30 flex flex-col gap-4 rounded-xl border bg-gradient-to-r p-4 shadow-sm sm:p-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="bg-primary text-primary-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
          <Fingerprint className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-foreground truncate text-2xl font-semibold tracking-tight">
              {asset.assetname}
            </h1>
            <StatusChip name={statusName} />
          </div>
          <p className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 font-mono font-medium">
              {asset.assettag}
            </span>
            <span className="bg-muted rounded px-1.5 py-0.5 font-mono">
              {asset.serialnumber}
            </span>
            <span className="hidden sm:inline">•</span>
            <span>Asset profile and lifecycle</span>
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <AskMeriButton
          variant="outline"
          size="sm"
          question={`Give me a full picture of asset ${asset.assettag} (${asset.assetname}): its current status, warranty position, maintenance history, and anything that looks overdue.`}
        />
        <ReportProblemButton
          entityType="asset"
          entityId={asset.assetid}
          entityName={asset.assetname}
        />
        {canRequest && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRequestOpen(true)}
          >
            <CalendarPlus className="mr-2 h-4 w-4" />
            Request
          </Button>
        )}
        <RequestItemDialog
          entityType="asset"
          entityId={asset.assetid}
          entityName={asset.assetname}
          open={requestOpen}
          onOpenChange={setRequestOpen}
        />
        {isAdmin && (
          <Button variant="default" size="sm" asChild>
            <Link href={`/assets/${asset.assetid}/edit`}>Edit</Link>
          </Button>
        )}
        {isAdmin && <AssetDetailActions asset={asset} />}
      </div>
    </div>
  );
}
