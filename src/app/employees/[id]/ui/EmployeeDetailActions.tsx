"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { notify } from "@/lib/feedback/notify";
import { RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface EmployeeDetailActionsProps {
  employeeId: string;
  employeeName: string;
  isDeleted: boolean;
  canDelete: boolean;
  canRestore: boolean;
}

export default function EmployeeDetailActions({
  employeeId,
  employeeName,
  isDeleted,
  canDelete,
  canRestore,
}: EmployeeDetailActionsProps) {
  const router = useRouter();
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleArchive = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/employees/${employeeId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to archive employee");
      }
      notify.success("Employee archived");
      setIsArchiveDialogOpen(false);
      router.refresh();
    } catch (err) {
      notify.error({
        title: "Archive failed",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestore = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/employees/${employeeId}`, {
        method: "PATCH",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to restore employee");
      }
      notify.success("Employee restored");
      router.refresh();
    } catch (err) {
      notify.error({
        title: "Restore failed",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {isDeleted ? (
        canRestore ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleRestore}
            disabled={isSubmitting}
            className="border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10"
          >
            <RotateCcw className="mr-1.5 h-4 w-4" />
            {isSubmitting ? "Restoring..." : "Restore Employee"}
          </Button>
        ) : null
      ) : canDelete ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsArchiveDialogOpen(true)}
          className="border-destructive/30 text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="mr-1.5 h-4 w-4" />
          Archive
        </Button>
      ) : null}

      <Dialog open={isArchiveDialogOpen} onOpenChange={setIsArchiveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Archive Employee
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-2 text-sm">
              <p>
                Are you sure you want to archive <strong>{employeeName}</strong>
                ?
              </p>
              <p className="text-muted-foreground text-xs">
                This is a reversible soft-delete. The record will be hidden from
                active registers, but allocations and history are preserved.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              disabled={isSubmitting}
              onClick={() => setIsArchiveDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={isSubmitting}
              onClick={handleArchive}
            >
              {isSubmitting ? "Archiving..." : "Archive Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
