"use client";
import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CalendarPlus } from "lucide-react";
import AssetDetailActions from "./AssetDetailActions";
import ReportProblemButton from "@/components/ReportProblemButton";
import RequestItemDialog from "@/components/RequestItemDialog";
import { AskMeriButton } from "@/components/ai/AskMeriButton";

function StatusChip({ name }) {
  const cls = useMemo(() => {
    const n = (name || "").toLowerCase();
    if (n === "active") return "bg-primary/10 text-primary";
    if (n === "available") return "bg-success-100 text-success-700";
    if (n === "pending") return "bg-warning-100 text-warning-700";
    if (n.includes("lost") || n.includes("stolen"))
      return "bg-danger-100 text-danger-700";
    return "bg-default-100 text-default-700";
  }, [name]);
  if (!name) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${cls}`}
    >
      {name}
    </span>
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
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {asset.assetname}
          </h1>
          <StatusChip name={statusName} />
        </div>
        <p className="text-foreground-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
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
          <Link
            href={`/assets/${asset.assetid}/edit`}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-8 items-center justify-center rounded-lg px-3 text-sm font-medium shadow-sm transition-colors"
          >
            Edit
          </Link>
        )}
        {isAdmin && <AssetDetailActions asset={asset} />}
      </div>
    </div>
  );
}
