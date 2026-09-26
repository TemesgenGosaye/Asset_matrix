"use client";

import { useOfflineQueue } from "@/hooks/useOfflineQueue";
import { CloudUpload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OfflineSyncIndicator() {
  const { pendingCount, isSyncing, syncNow } = useOfflineQueue();

  if (pendingCount === 0 && !isSyncing) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-muted-foreground gap-1.5 text-xs"
      onClick={syncNow}
      disabled={isSyncing}
    >
      {isSyncing ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <CloudUpload className="h-3.5 w-3.5" />
      )}
      {isSyncing ? "Syncing…" : `${pendingCount} pending`}
    </Button>
  );
}
