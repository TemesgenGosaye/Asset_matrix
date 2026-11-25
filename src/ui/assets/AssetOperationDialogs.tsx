"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import {
  Check,
  Download,
  Loader2,
  LogIn,
  Trash2,
  UserRoundX,
  X,
} from "lucide-react";
import PrintLabelDialog from "@/components/PrintLabelDialog";
import SearchableCombobox, {
  type MasterOption,
} from "@/components/SearchableCombobox";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/lib/feedback/notify";
import type {
  ActiveAssetOperation,
  ReferenceItem,
  RegisterAsset,
} from "./asset-types";

interface AssetOperationDialogsProps {
  operation: ActiveAssetOperation | null;
  statuses: ReferenceItem[];
  isAdmin: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface UserOption {
  userid: string;
  firstname: string;
  lastname: string;
  email?: string | null;
}

interface LocationOption {
  locationid: string;
  locationname: string | null;
}

interface OrgOption {
  id: string;
  name: string;
}

interface CheckoutRecord {
  id: string;
  checkedOutTo: string;
  checkoutDate: string;
  expectedReturn: string | null;
  status: string;
  checkedOutToUser?: {
    userid: string;
    firstname: string;
    lastname: string;
  } | null;
}

interface ReservationRecord {
  id: string;
  startDate: string;
  endDate: string;
  status: string;
  notes: string | null;
  user?: {
    firstname: string;
    lastname: string;
  } | null;
}

function formatShortDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function AssetOperationDialogs({
  operation,
  statuses,
  isAdmin,
  onClose,
  onSuccess,
}: AssetOperationDialogsProps) {
  const asset = operation?.asset ?? null;
  const type = operation?.type ?? null;

  if (!asset || !type) return null;

  if (type === "assign") {
    return (
      <AssignDialog asset={asset} onClose={onClose} onSuccess={onSuccess} />
    );
  }
  if (type === "transfer") {
    return (
      <TransferDialog asset={asset} onClose={onClose} onSuccess={onSuccess} />
    );
  }
  if (type === "checkout") {
    return (
      <CheckoutDialog asset={asset} onClose={onClose} onSuccess={onSuccess} />
    );
  }
  if (type === "reserve") {
    return (
      <ReservationDialog
        asset={asset}
        isAdmin={isAdmin}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );
  }
  if (type === "status") {
    return (
      <StatusDialog
        asset={asset}
        statuses={statuses}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );
  }
  if (type === "qrcode") {
    return <QrCodeDialog asset={asset} onClose={onClose} />;
  }
  if (type === "label") {
    return (
      <PrintLabelDialog
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        assets={[
          {
            assetid: asset.assetid,
            assetname: asset.assetname,
            assettag: asset.assettag,
            serialnumber: asset.serialnumber,
            manufacturerid: asset.manufacturerid ?? undefined,
            modelid: asset.modelid ?? undefined,
            locationid: asset.locationid ?? undefined,
            assetcategorytypeid: asset.assetcategorytypeid ?? undefined,
            purchaseprice:
              asset.purchaseprice != null
                ? String(asset.purchaseprice)
                : undefined,
            status: asset.statusType?.statustypename ?? undefined,
          },
        ]}
      />
    );
  }
  if (type === "delete") {
    return (
      <DeleteDialog asset={asset} onClose={onClose} onSuccess={onSuccess} />
    );
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Assign / Unassign                                                          */
/* -------------------------------------------------------------------------- */

function AssignDialog({
  asset,
  onClose,
  onSuccess,
}: {
  asset: RegisterAsset;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loadingCurrent, setLoadingCurrent] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<MasterOption | null>(
    null,
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(
      `/api/userAssets/findByAssetId?assetId=${encodeURIComponent(asset.assetid)}`,
    )
      .then(async (res) => {
        if (!active) return;
        if (res.ok) {
          const data = await res.json();
          const uid = data?.userAsset?.userid ?? null;
          setCurrentUserId(uid);
          if (uid) setSelectedUserId(uid);
        } else {
          setCurrentUserId(null);
        }
      })
      .catch(() => {
        if (active) setCurrentUserId(null);
      })
      .finally(() => {
        if (active) setLoadingCurrent(false);
      });
    return () => {
      active = false;
    };
  }, [asset.assetid]);

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
        body: JSON.stringify({
          assetId: asset.assetid,
          userId: selectedUserId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to assign asset");
      notify.success({
        title: currentUserId ? "Asset reassigned" : "Asset assigned",
        description: selectedEmployee?.name || "Assignment updated.",
      });
      onSuccess();
      onClose();
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
    if (!currentUserId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/userAssets/unassign", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: asset.assetid, userId: currentUserId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to unassign asset");
      notify.success({
        title: "Asset unassigned",
        description: `${asset.assetname} is now unassigned.`,
      });
      onSuccess();
      onClose();
    } catch (error) {
      notify.error({
        title: "Unassign failed",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {currentUserId ? "Reassign / Unassign Asset" : "Assign Asset"}
          </DialogTitle>
          <DialogDescription>
            {asset.assetname} ({asset.serialnumber || asset.assettag})
          </DialogDescription>
        </DialogHeader>

        {loadingCurrent ? (
          <div className="text-muted-foreground flex items-center gap-2 py-4 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking current assignment…
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {currentUserId && (
              <div className="bg-muted/50 flex items-center justify-between rounded-lg border p-3 text-sm">
                <span>Currently assigned to an employee</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUnassign}
                  disabled={saving}
                >
                  <UserRoundX className="mr-1.5 h-4 w-4" />
                  Unassign
                </Button>
              </div>
            )}
            <SearchableCombobox
              id="register-assign-employee"
              ariaLabel="Employee"
              label="Employee"
              type="employee"
              allowCreate={false}
              value={selectedUserId}
              placeholder="Search employees by name or number…"
              onChange={(value, option) => {
                setSelectedUserId(value);
                setSelectedEmployee(option);
              }}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={saving || loadingCurrent || !selectedUserId}
          >
            {saving ? "Saving…" : currentUserId ? "Reassign" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Transfer                                                                   */
/* -------------------------------------------------------------------------- */

function TransferDialog({
  asset,
  onClose,
  onSuccess,
}: {
  asset: RegisterAsset;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [transferType, setTransferType] = useState<
    "user" | "location" | "organization"
  >("user");
  const [targetId, setTargetId] = useState("");
  const [reason, setReason] = useState("");
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadOptions = useCallback(async (kind: "location" | "organization") => {
    setLoadingOptions(true);
    try {
      if (kind === "location") {
        const res = await fetch("/api/location");
        if (res.ok) setLocations(await res.json());
      } else {
        const res = await fetch("/api/organizations");
        if (res.ok) setOrgs(await res.json());
      }
    } catch {
      notify.error("Failed to load transfer targets");
    } finally {
      setLoadingOptions(false);
    }
  }, []);

  const handleTypeChange = (value: "user" | "location" | "organization") => {
    setTransferType(value);
    setTargetId("");
    if (value === "location" && locations.length === 0) {
      void loadOptions("location");
    } else if (value === "organization" && orgs.length === 0) {
      void loadOptions("organization");
    }
  };

  const handleSubmit = async () => {
    if (!targetId) {
      notify.error("Please select a transfer target");
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, string | undefined> = {
        assetId: asset.assetid,
        transferType,
        reason: reason || undefined,
      };
      if (transferType === "user") payload.toUserId = targetId;
      else if (transferType === "location") payload.toLocationId = targetId;
      else payload.toOrgId = targetId;

      const res = await fetch("/api/asset/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Transfer failed");
      notify.success("Asset transferred successfully");
      onSuccess();
      onClose();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Transfer failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer Asset</DialogTitle>
          <DialogDescription>
            Move {asset.assetname} ({asset.serialnumber || asset.assettag}) to a
            new custodian, location, or organization.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Transfer Type</Label>
            <Select
              value={transferType}
              onValueChange={(v) =>
                handleTypeChange(v as "user" | "location" | "organization")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Employee / User</SelectItem>
                <SelectItem value="location">Location</SelectItem>
                <SelectItem value="organization">Organization</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {transferType === "user" && (
            <SearchableCombobox
              id="register-transfer-employee"
              ariaLabel="Destination Employee"
              label="Destination Employee"
              type="employee"
              allowCreate={false}
              value={targetId}
              placeholder="Search employees…"
              onChange={(value) => setTargetId(value)}
            />
          )}

          {transferType === "location" && (
            <div className="space-y-1.5">
              <Label>Destination Location</Label>
              <Select
                value={targetId}
                onValueChange={setTargetId}
                disabled={loadingOptions}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      loadingOptions ? "Loading locations…" : "Select location"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.locationid} value={loc.locationid}>
                      {loc.locationname || "Unnamed Location"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {transferType === "organization" && (
            <div className="space-y-1.5">
              <Label>Destination Organization</Label>
              <Select
                value={targetId}
                onValueChange={setTargetId}
                disabled={loadingOptions}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      loadingOptions
                        ? "Loading organizations…"
                        : "Select organization"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {orgs.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="transfer-reason">Reason (optional)</Label>
            <Input
              id="transfer-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Department relocation, employee onboarding"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !targetId}>
            {submitting ? "Transferring…" : "Confirm Transfer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Check Out / Check In                                                       */
/* -------------------------------------------------------------------------- */

function CheckoutDialog({
  asset,
  onClose,
  onSuccess,
}: {
  asset: RegisterAsset;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [activeCheckout, setActiveCheckout] = useState<CheckoutRecord | null>(
    null,
  );
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [expectedReturn, setExpectedReturn] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [checkoutRes, usersRes] = await Promise.all([
        fetch(
          `/api/asset/checkout?assetId=${encodeURIComponent(asset.assetid)}`,
        ),
        fetch("/api/user"),
      ]);
      if (checkoutRes.ok) {
        const list: CheckoutRecord[] = await checkoutRes.json();
        setActiveCheckout(list.find((c) => c.status === "checked_out") ?? null);
      }
      if (usersRes.ok) {
        setUsers(await usersRes.json());
      }
    } catch {
      notify.error("Failed to load checkout details");
    } finally {
      setLoading(false);
    }
  }, [asset.assetid]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const handleCheckIn = async () => {
    if (!activeCheckout) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/asset/checkout/${activeCheckout.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Check-in failed");
      notify.success("Asset checked in");
      onSuccess();
      onClose();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Check-in failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckout = async () => {
    if (!selectedUserId) {
      notify.error("Please select a user to check out to");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/asset/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: asset.assetid,
          checkedOutTo: selectedUserId,
          expectedReturn: expectedReturn || undefined,
          notes: notes || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Checkout failed");
      notify.success("Asset checked out");
      onSuccess();
      onClose();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Checkout failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {activeCheckout ? "Check In Asset" : "Check Out Asset"}
          </DialogTitle>
          <DialogDescription>
            {asset.assetname} ({asset.serialnumber || asset.assettag})
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="text-muted-foreground flex items-center gap-2 py-4 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading checkout status…
          </div>
        ) : activeCheckout ? (
          <div className="space-y-4 py-2">
            <div className="bg-muted/50 space-y-2 rounded-lg border p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Checked out to</span>
                <span className="font-medium">
                  {activeCheckout.checkedOutToUser
                    ? `${activeCheckout.checkedOutToUser.firstname} ${activeCheckout.checkedOutToUser.lastname}`.trim()
                    : activeCheckout.checkedOutTo}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Checkout date</span>
                <span>{formatShortDate(activeCheckout.checkoutDate)}</span>
              </div>
              {activeCheckout.expectedReturn && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Expected return</span>
                  <span>{formatShortDate(activeCheckout.expectedReturn)}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Check Out To</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select user…" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.userid} value={u.userid}>
                      {`${u.firstname} ${u.lastname}`.trim()}
                      {u.email ? ` (${u.email})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="checkout-return">
                Expected Return Date (optional)
              </Label>
              <Input
                id="checkout-return"
                type="date"
                value={expectedReturn}
                onChange={(e) => setExpectedReturn(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="checkout-notes">Notes (optional)</Label>
              <Textarea
                id="checkout-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Condition or purpose notes…"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          {activeCheckout ? (
            <Button onClick={handleCheckIn} disabled={submitting}>
              <LogIn className="mr-1.5 h-4 w-4" />
              {submitting ? "Checking in…" : "Check In"}
            </Button>
          ) : (
            <Button
              onClick={handleCheckout}
              disabled={submitting || loading || !selectedUserId}
            >
              {submitting ? "Checking out…" : "Check Out"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Reservations                                                               */
/* -------------------------------------------------------------------------- */

function ReservationDialog({
  asset,
  isAdmin,
  onClose,
  onSuccess,
}: {
  asset: RegisterAsset;
  isAdmin: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [reservations, setReservations] = useState<ReservationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/asset/reservations?assetId=${encodeURIComponent(asset.assetid)}`,
      );
      if (res.ok) {
        setReservations(await res.json());
      }
    } catch {
      notify.error("Failed to load reservations");
    } finally {
      setLoading(false);
    }
  }, [asset.assetid]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const handleCreate = async () => {
    if (!startDate || !endDate) {
      notify.error("Please select both start and end dates");
      return;
    }
    if (new Date(startDate) >= new Date(endDate)) {
      notify.error("End date must be after start date");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/asset/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: asset.assetid,
          startDate,
          endDate,
          notes: notes || undefined,
        }),
      });
      if (res.status === 409) {
        notify.error("This asset already has a reservation for those dates");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data.error || "Failed to create reservation");
      notify.success("Reservation submitted");
      setStartDate("");
      setEndDate("");
      setNotes("");
      onSuccess();
      void load();
    } catch (error) {
      notify.error(
        error instanceof Error ? error.message : "Failed to create reservation",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusUpdate = async (id: string, status: string) => {
    try {
      const res = await fetch("/api/asset/reservations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data.error || "Failed to update reservation");
      notify.success(`Reservation ${status}`);
      onSuccess();
      void load();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Update failed");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Asset Reservations</DialogTitle>
          <DialogDescription>
            {asset.assetname} ({asset.serialnumber || asset.assettag})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="res-start">Start Date</Label>
              <Input
                id="res-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="res-end">End Date</Label>
              <Input
                id="res-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="res-notes">Notes (optional)</Label>
            <Textarea
              id="res-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Purpose of reservation…"
            />
          </div>
          <Button
            className="w-full"
            onClick={handleCreate}
            disabled={submitting || !startDate || !endDate}
          >
            {submitting ? "Submitting…" : "Create Reservation"}
          </Button>

          <div className="border-t pt-3">
            <div className="text-muted-foreground mb-2 text-xs font-medium uppercase">
              Recent & Upcoming Reservations
            </div>
            {loading ? (
              <div className="text-muted-foreground flex items-center gap-2 py-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : reservations.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No reservations for this asset.
              </p>
            ) : (
              <div className="max-h-48 space-y-2 overflow-y-auto">
                {reservations.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="font-medium">
                        {formatShortDate(r.startDate)} →{" "}
                        {formatShortDate(r.endDate)}
                      </div>
                      <div className="text-muted-foreground truncate text-xs">
                        {r.user
                          ? `${r.user.firstname} ${r.user.lastname}`.trim()
                          : "User"}
                        {r.notes ? ` · ${r.notes}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="capitalize">
                        {r.status}
                      </Badge>
                      {isAdmin && r.status === "pending" && (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-green-600"
                            title="Approve"
                            onClick={() => handleStatusUpdate(r.id, "approved")}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-red-600"
                            title="Reject"
                            onClick={() => handleStatusUpdate(r.id, "rejected")}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Status / Lifecycle                                                         */
/* -------------------------------------------------------------------------- */

function StatusDialog({
  asset,
  statuses,
  onClose,
  onSuccess,
}: {
  asset: RegisterAsset;
  statuses: ReferenceItem[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [statusId, setStatusId] = useState(asset.statustypeid ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!statusId) {
      notify.error("Please select a status");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/asset/updateStatus", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: asset.assetid,
          statusTypeId: statusId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update status");
      notify.success("Asset status updated");
      onSuccess();
      onClose();
    } catch (error) {
      notify.error(
        error instanceof Error ? error.message : "Failed to update status",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Asset Status</DialogTitle>
          <DialogDescription>
            {asset.assetname} ({asset.serialnumber || asset.assettag})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="text-sm">
            <span className="text-muted-foreground">Current status: </span>
            <span className="font-medium">
              {asset.statusType?.statustypename || asset.condition1 || "—"}
            </span>
          </div>
          <div className="space-y-1.5">
            <Label>New Status</Label>
            <Select value={statusId} onValueChange={setStatusId}>
              <SelectTrigger>
                <SelectValue placeholder="Select status…" />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !statusId}>
            {saving ? "Updating…" : "Update Status"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* QR Code                                                                    */
/* -------------------------------------------------------------------------- */

function QrCodeDialog({
  asset,
  onClose,
}: {
  asset: RegisterAsset;
  onClose: () => void;
}) {
  const qrRef = useRef<HTMLDivElement>(null);

  const handleDownload = () => {
    const canvas = qrRef.current?.querySelector("canvas");
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = url;
    link.download = `QRCode_${asset.assettag || asset.serialnumber}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            QR Code · {asset.assettag || asset.serialnumber}
          </DialogTitle>
          <DialogDescription>{asset.assetname}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-center py-4" ref={qrRef}>
          <QRCodeCanvas
            value={`${typeof window !== "undefined" ? window.location.origin : ""}/assets/${asset.assetid}`}
            size={240}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button onClick={handleDownload}>
            <Download className="mr-1.5 h-4 w-4" />
            Download PNG
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Delete Confirmation                                                        */
/* -------------------------------------------------------------------------- */

function DeleteDialog({
  asset,
  onClose,
  onSuccess,
}: {
  asset: RegisterAsset;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch("/api/asset/deleteAsset", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: asset.assetid }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to delete asset");
      notify.success("Asset deleted");
      onSuccess();
      onClose();
    } catch (error) {
      notify.error(
        error instanceof Error ? error.message : "Failed to delete asset",
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Asset</DialogTitle>
          <DialogDescription>
            Are you sure you want to permanently delete{" "}
            <span className="text-foreground font-semibold">
              {asset.assetname}
            </span>{" "}
            ({asset.serialnumber || asset.assettag})? This action cannot be
            undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={deleting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            {deleting ? "Deleting…" : "Delete Asset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
