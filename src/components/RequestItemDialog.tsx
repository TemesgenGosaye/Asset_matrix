"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { CheckCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface RequestItemDialogProps {
  entityType: "asset" | "accessory" | "consumable" | "licence";
  entityId: string;
  entityName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showQuantity?: boolean;
  maxQuantity?: number;
  onSuccess?: () => void;
}

export default function RequestItemDialog({
  entityType,
  entityId,
  entityName,
  open,
  onOpenChange,
  showQuantity = false,
  maxQuantity,
  onSuccess,
}: RequestItemDialogProps) {
  const router = useRouter();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType,
          entityId,
          startDate: startDate || null,
          endDate: endDate || null,
          notes: notes || null,
          quantity: showQuantity ? parseInt(quantity) || 1 : 1,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Request failed");
      }
      setSubmitted(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    const wasSubmitted = submitted;
    onOpenChange(false);
    // Reset after close animation
    setTimeout(() => {
      setSubmitted(false);
      setStartDate("");
      setEndDate("");
      setNotes("");
      setQuantity("1");
      if (wasSubmitted) {
        onSuccess?.();
        router.refresh();
      }
    }, 200);
  };

  if (submitted) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent>
          <div className="flex flex-col items-center py-6 text-center">
            <CheckCircle className="mb-3 h-12 w-12 text-green-500" />
            <h3 className="text-lg font-semibold">Request Submitted</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              Your request for <span className="font-medium">{entityName}</span>{" "}
              has been sent to the admin team for approval.
            </p>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
              <Button asChild>
                <Link href="/reservations">View My Requests</Link>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Request{" "}
            {entityType === "licence"
              ? "Licence"
              : entityType.charAt(0).toUpperCase() + entityType.slice(1)}
          </DialogTitle>
          <DialogDescription>
            Request <span className="font-medium">{entityName}</span>. An admin
            will review and approve your request.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {showQuantity && (
            <div>
              <Label htmlFor="req-quantity">Quantity</Label>
              <Input
                id="req-quantity"
                type="number"
                min="1"
                max={maxQuantity}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="mt-1"
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="req-start">Needed from (optional)</Label>
              <Input
                id="req-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="req-end">Until (optional)</Label>
              <Input
                id="req-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="req-notes">Notes (optional)</Label>
            <Textarea
              id="req-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why do you need this item?"
              rows={3}
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
