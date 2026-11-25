"use client";
import React, { useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { QRCodeCanvas } from "qrcode.react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";

export default function AssetDetailActions({ asset }) {
  const router = useRouter();
  const [qrOpen, setQrOpen] = React.useState(false);
  const qrRef = useRef(null);

  const handleDownload = useCallback(() => {
    const canvas = qrRef.current?.querySelector("canvas");
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = url;
    link.download = `QRCode_${asset.assettag}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [asset]);

  const handleDuplicate = useCallback(() => {
    const params = new URLSearchParams();
    if (asset.assetname) params.set("assetname", asset.assetname);
    if (asset.assetcategorytypeid)
      params.set("assetcategorytypeid", asset.assetcategorytypeid);
    if (asset.statustypeid) params.set("statustypeid", asset.statustypeid);
    if (asset.locationid) params.set("locationid", asset.locationid);
    if (asset.departmentId) params.set("departmentid", asset.departmentId);
    if (asset.departmentCode)
      params.set("departmentCode", asset.departmentCode);
    if (asset.manufacturerid)
      params.set("manufacturerid", asset.manufacturerid);
    if (asset.modelid) params.set("modelid", asset.modelid);
    if (asset.supplierid) params.set("supplierid", asset.supplierid);
    if (asset.specs) params.set("specs", asset.specs);
    if (asset.purchaseprice != null)
      params.set("purchaseprice", String(asset.purchaseprice));
    if (asset.warrantyMonths != null)
      params.set("warrantyMonths", String(asset.warrantyMonths));
    params.set("mobile", String(Boolean(asset.mobile)));
    params.set("requestable", String(Boolean(asset.requestable)));
    router.push(`/assets/create?${params.toString()}`);
  }, [asset, router]);

  return (
    <div className="flex gap-2">
      <Button variant="outline" onClick={() => setQrOpen(true)}>
        Show QR Code
      </Button>
      <Button variant="outline" onClick={handleDuplicate}>
        <Copy className="mr-2 h-4 w-4" />
        Duplicate
      </Button>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>QR-Code for {asset.assettag}</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center py-4" ref={qrRef}>
            <QRCodeCanvas
              value={`${typeof window !== "undefined" ? window.location.origin : ""}/assets/${asset.assetid}`}
              size={256}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setQrOpen(false)}>
              Close
            </Button>
            <Button onClick={handleDownload}>Download</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
