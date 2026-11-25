"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Building2,
  Mail,
  UserPlus,
  UserRound,
  UserRoundX,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import SearchableCombobox, {
  type MasterOption,
} from "@/components/SearchableCombobox";
import { notify } from "@/lib/feedback/notify";

interface AssignmentView {
  userId: string;
  name: string;
  employeeNumber?: string | null;
  department?: string | null;
  email?: string | null;
}

interface AssetAssignmentProps {
  assetId: string;
  assetTag?: string | null;
  currentAssignment: AssignmentView | null;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function AssetAssignment({
  assetId,
  assetTag,
  currentAssignment,
}: AssetAssignmentProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(
    currentAssignment?.userId ?? "",
  );
  const [selectedEmployee, setSelectedEmployee] = useState<MasterOption | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [unassigning, setUnassigning] = useState(false);

  const openDialog = () => {
    setSelectedUserId(currentAssignment?.userId ?? "");
    setSelectedEmployee(null);
    setDialogOpen(true);
  };

  const handleAssign = async () => {
    if (!selectedUserId) {
      notify.error({
        title: "Employee required",
        description: "Search for and select an employee first.",
      });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/userAssets/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId, userId: selectedUserId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to assign asset");

      notify.success({
        title: currentAssignment ? "Asset reassigned" : "Asset assigned",
        description: selectedEmployee?.name || "The assignment was saved.",
      });
      setDialogOpen(false);
      router.refresh();
    } catch (error) {
      notify.error({
        title: "Assignment failed",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleUnassign = async () => {
    if (!currentAssignment) return;

    setUnassigning(true);
    try {
      const res = await fetch("/api/userAssets/unassign", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId, userId: currentAssignment.userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to unassign asset");

      notify.success({
        title: "Asset unassigned",
        description: `${currentAssignment.name} no longer holds this asset.`,
      });
      setSelectedUserId("");
      setSelectedEmployee(null);
      router.refresh();
    } catch (error) {
      notify.error({
        title: "Unassign failed",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setUnassigning(false);
    }
  };

  const details = [
    currentAssignment?.employeeNumber
      ? `Employee ${currentAssignment.employeeNumber}`
      : null,
    currentAssignment?.department,
    currentAssignment?.email,
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
            <UserRound className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-lg font-semibold">Asset assignment</h3>
            <p className="text-muted-foreground mt-0.5 text-sm">
              Assign this asset to an employee from the register.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {currentAssignment && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleUnassign}
              disabled={unassigning}
            >
              <UserRoundX className="mr-1.5 h-4 w-4" />
              {unassigning ? "Removing..." : "Unassign"}
            </Button>
          )}
          <Button size="sm" onClick={openDialog}>
            <UserPlus className="mr-1.5 h-4 w-4" />
            {currentAssignment ? "Reassign" : "Assign asset"}
          </Button>
        </div>
      </div>

      {currentAssignment ? (
        <div className="bg-muted/20 flex flex-wrap items-center gap-4 rounded-lg border p-4">
          <span className="bg-primary/10 text-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
            {initials(currentAssignment.name)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{currentAssignment.name}</span>
              <Badge variant="secondary">Assigned</Badge>
            </div>
            <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              {currentAssignment.employeeNumber && (
                <span className="inline-flex items-center gap-1.5">
                  <BadgeCheck className="h-3.5 w-3.5" />
                  {currentAssignment.employeeNumber}
                </span>
              )}
              {currentAssignment.department && (
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" />
                  {currentAssignment.department}
                </span>
              )}
              {currentAssignment.email && (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" />
                  {currentAssignment.email}
                </span>
              )}
            </div>
          </div>
          <span className="text-muted-foreground text-xs">
            Current custodian
          </span>
        </div>
      ) : (
        <div className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
          This asset is not assigned. Choose an employee from the register to
          make someone responsible for it.
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {currentAssignment ? "Reassign asset" : "Assign asset"}
            </DialogTitle>
            <DialogDescription>
              {assetTag
                ? `Choose an employee for ${assetTag}.`
                : "Choose an employee for this asset."}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <SearchableCombobox
              id="asset-assignment-employee"
              ariaLabel="Employee"
              label="Employee"
              type="employee"
              allowCreate={false}
              value={selectedUserId}
              currentValue={currentAssignment?.name}
              placeholder="Search employees by name or number..."
              onChange={(value, option) => {
                setSelectedUserId(value);
                setSelectedEmployee(option);
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleAssign} disabled={saving || !selectedUserId}>
              {saving ? "Saving..." : currentAssignment ? "Reassign" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
