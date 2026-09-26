"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";

// ---------------------------------------------------------------------------
// Shared damage checklist
//
// Every household return / register / status form used to manage six boolean
// states plus optional notes by hand. `DamageChecklist` is a controlled
// component over a single `DamageState` so forms stay in sync and the damage
// flags feed straight into the API payload shape (damageWindow, damageDoor, …).
// ---------------------------------------------------------------------------

export interface DamageState {
  window: boolean;
  door: boolean;
  waterPanel: boolean;
  roof: boolean;
  wall: boolean;
  electricity: boolean;
  notes?: string;
}

export const EMPTY_DAMAGE_STATE: DamageState = {
  window: false,
  door: false,
  waterPanel: false,
  roof: false,
  wall: false,
  electricity: false,
  notes: "",
};

export function hasDamage(d: DamageState | null | undefined) {
  if (!d) return false;
  return d.window || d.door || d.waterPanel || d.roof || d.wall || d.electricity;
}

interface DamageChecklistProps {
  value: DamageState;
  onChange: (next: DamageState) => void;
  /** Show the notes input regardless of damage state (default: only when damaged). */
  notesAlwaysVisible?: boolean;
}

export function DamageChecklist({
  value,
  onChange,
  notesAlwaysVisible = false,
}: DamageChecklistProps) {
  const setFlag = (flag: keyof Omit<DamageState, "notes">, checked: boolean) =>
    onChange({ ...value, [flag]: checked });
  const showNotes = notesAlwaysVisible || hasDamage(value);

  return (
    <div className="border rounded-md p-3 bg-muted/20 space-y-2">
      <Label className="text-xs font-semibold flex items-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
        Inspection Damage Checklist
      </Label>
      <p className="text-[11px] text-muted-foreground">
        If any damages exist, mark the affected components. This automatically updates
        house status to Inactive for repair before re-entering queue availability.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={value.window} onCheckedChange={(c) => setFlag("window", !!c)} />
          <span>Window</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={value.door} onCheckedChange={(c) => setFlag("door", !!c)} />
          <span>Door</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox
            checked={value.waterPanel}
            onCheckedChange={(c) => setFlag("waterPanel", !!c)}
          />
          <span>Water Panel</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={value.roof} onCheckedChange={(c) => setFlag("roof", !!c)} />
          <span>Roof</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={value.wall} onCheckedChange={(c) => setFlag("wall", !!c)} />
          <span>Wall</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox
            checked={value.electricity}
            onCheckedChange={(c) => setFlag("electricity", !!c)}
          />
          <span>Electricity</span>
        </label>
      </div>

      {showNotes && (
        <div className="pt-2">
          <Label className="text-[11px] font-medium">Damage Notes</Label>
          <Input
            placeholder="Describe damages observed..."
            value={value.notes ?? ""}
            onChange={(e) => onChange({ ...value, notes: e.target.value })}
            className="h-8 text-xs mt-1"
          />
        </div>
      )}
    </div>
  );
}