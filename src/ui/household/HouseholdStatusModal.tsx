"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { notify } from "@/lib/feedback/notify";

interface HouseholdStatusModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  household: {
    id: string;
    houseNumber: string;
    hid: string;
    status: string;
  } | null;
  targetStatus: "Active" | "Inactive";
  onSuccess: (updated: unknown) => void;
}

export default function HouseholdStatusModal({
  open,
  onOpenChange,
  household,
  targetStatus,
  onSuccess,
}: HouseholdStatusModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <HouseholdStatusForm
          onOpenChange={onOpenChange}
          household={household}
          targetStatus={targetStatus}
          onSuccess={onSuccess}
        />
      )}
    </Dialog>
  );
}

/**
 * Owns all inspection state. Mounted only while the dialog is open so the form
 * is freshly initialized from the current record on every open — no reset
 * effects required.
 */
function HouseholdStatusForm({
  onOpenChange,
  household,
  targetStatus,
  onSuccess,
}: Omit<HouseholdStatusModalProps, "open">) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [damageWindow, setDamageWindow] = useState(false);
  const [damageDoor, setDamageDoor] = useState(false);
  const [damageWaterPanel, setDamageWaterPanel] = useState(false);
  const [damageRoof, setDamageRoof] = useState(false);
  const [damageWall, setDamageWall] = useState(false);
  const [damageElectricity, setDamageElectricity] = useState(false);
  const [damageNotes, setDamageNotes] = useState("");

  const isDeactivating = targetStatus === "Inactive";

  const hasAnyDamage =
    damageWindow ||
    damageDoor ||
    damageWaterPanel ||
    damageRoof ||
    damageWall ||
    damageElectricity;

  const handleConfirm = async () => {
    if (!household?.id) return;
    setError(null);

    if (isDeactivating && !hasAnyDamage) {
      setError(
        "Please identify at least one damaged component before marking the house inactive.",
      );
      return;
    }

    setLoading(true);

    try {
      const payload = {
        status: targetStatus,
        damageWindow: isDeactivating ? damageWindow : false,
        damageDoor: isDeactivating ? damageDoor : false,
        damageWaterPanel: isDeactivating ? damageWaterPanel : false,
        damageRoof: isDeactivating ? damageRoof : false,
        damageWall: isDeactivating ? damageWall : false,
        damageElectricity: isDeactivating ? damageElectricity : false,
        damageNotes: isDeactivating ? damageNotes.trim() : null,
      };

      const res = await fetch(`/api/household/${household.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update status.");
      }

      notify.success(
        `House ${household.houseNumber} status changed to ${targetStatus}.`,
      );
      onSuccess(data);
      onOpenChange(false);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to update status";
      setError(msg);
      notify.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          {isDeactivating ? (
            <AlertTriangle className="text-destructive h-5 w-5" />
          ) : (
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          )}
          {isDeactivating ? "Deactivate House" : "Activate House"}
        </DialogTitle>
        <DialogDescription>
          House{" "}
          <strong className="text-foreground">{household?.houseNumber}</strong>{" "}
          ({household?.hid})
        </DialogDescription>
      </DialogHeader>

      {error && (
        <div className="bg-destructive/15 text-destructive flex items-center gap-2 rounded-md p-2.5 text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isDeactivating ? (
        <div className="space-y-3 py-1">
          <p className="text-muted-foreground text-xs">
            To mark this house{" "}
            <Badge variant="destructive" className="text-[10px]">
              Inactive
            </Badge>
            , you must record the damaged component(s):
          </p>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <label className="bg-card hover:bg-accent/40 flex cursor-pointer items-center gap-2 rounded border p-2">
              <Checkbox
                checked={damageWindow}
                onCheckedChange={(c) => setDamageWindow(!!c)}
              />
              <span>Window</span>
            </label>

            <label className="bg-card hover:bg-accent/40 flex cursor-pointer items-center gap-2 rounded border p-2">
              <Checkbox
                checked={damageDoor}
                onCheckedChange={(c) => setDamageDoor(!!c)}
              />
              <span>Door</span>
            </label>

            <label className="bg-card hover:bg-accent/40 flex cursor-pointer items-center gap-2 rounded border p-2">
              <Checkbox
                checked={damageWaterPanel}
                onCheckedChange={(c) => setDamageWaterPanel(!!c)}
              />
              <span>Water Panel</span>
            </label>

            <label className="bg-card hover:bg-accent/40 flex cursor-pointer items-center gap-2 rounded border p-2">
              <Checkbox
                checked={damageRoof}
                onCheckedChange={(c) => setDamageRoof(!!c)}
              />
              <span>Roof</span>
            </label>

            <label className="bg-card hover:bg-accent/40 flex cursor-pointer items-center gap-2 rounded border p-2">
              <Checkbox
                checked={damageWall}
                onCheckedChange={(c) => setDamageWall(!!c)}
              />
              <span>Wall</span>
            </label>

            <label className="bg-card hover:bg-accent/40 flex cursor-pointer items-center gap-2 rounded border p-2">
              <Checkbox
                checked={damageElectricity}
                onCheckedChange={(c) => setDamageElectricity(!!c)}
              />
              <span>Electricity</span>
            </label>
          </div>

          <div className="space-y-1 pt-1">
            <Label htmlFor="statusNotes" className="text-xs">
              Damage Notes (Optional)
            </Label>
            <Textarea
              id="statusNotes"
              value={damageNotes}
              onChange={(e) => setDamageNotes(e.target.value)}
              placeholder="Reason for deactivation / repairs..."
              rows={2}
              className="text-xs"
            />
          </div>
        </div>
      ) : (
        <div className="text-muted-foreground py-2 text-sm">
          Activating this house will clear any existing damage checklist flags
          and mark the house as ready for occupancy.
        </div>
      )}

      <DialogFooter className="gap-2 sm:gap-0">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant={isDeactivating ? "destructive" : "default"}
          onClick={handleConfirm}
          disabled={loading || (isDeactivating && !hasAnyDamage)}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isDeactivating ? "Confirm Deactivation" : "Confirm Activation"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
