"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowRightLeft,
  CalendarClock,
  Copy,
  Edit3,
  ExternalLink,
  LogOut,
  Printer,
  QrCode,
  Settings2,
  Trash2,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AssetOperationType, RegisterAsset } from "./asset-types";

interface AssetOperationsMenuProps {
  asset: RegisterAsset;
  isAdmin: boolean;
  onSelectOperation: (asset: RegisterAsset, type: AssetOperationType) => void;
}

function buildDuplicateUrl(asset: RegisterAsset): string {
  const params = new URLSearchParams();
  if (asset.assetname) params.set("assetname", asset.assetname);
  if (asset.assetcategorytypeid) {
    params.set("assetcategorytypeid", asset.assetcategorytypeid);
  }
  if (asset.statustypeid) params.set("statustypeid", asset.statustypeid);
  if (asset.locationid) params.set("locationid", asset.locationid);
  if (asset.departmentId) params.set("departmentid", asset.departmentId);
  if (asset.departmentCode) {
    params.set("departmentCode", asset.departmentCode);
  }
  if (asset.manufacturerid) {
    params.set("manufacturerid", asset.manufacturerid);
  }
  if (asset.modelid) params.set("modelid", asset.modelid);
  if (asset.supplierid) params.set("supplierid", asset.supplierid);
  if (asset.specs) params.set("specs", asset.specs);
  if (asset.purchaseprice != null) {
    params.set("purchaseprice", String(asset.purchaseprice));
  }
  if (asset.warrantyMonths != null) {
    params.set("warrantyMonths", String(asset.warrantyMonths));
  }
  params.set("mobile", String(Boolean(asset.mobile)));
  params.set("requestable", String(Boolean(asset.requestable)));
  return `/assets/create?${params.toString()}`;
}

export default function AssetOperationsMenu({
  asset,
  isAdmin,
  onSelectOperation,
}: AssetOperationsMenuProps) {
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={`Operations for ${asset.assetname || asset.serialnumber}`}
          title="Operations"
        >
          <Settings2 className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-muted-foreground text-xs font-medium">
          Asset Record
        </DropdownMenuLabel>
        {isAdmin && (
          <DropdownMenuItem asChild>
            <Link href={`/assets/${asset.assetid}/edit`}>
              <Edit3 className="mr-2 h-4 w-4" />
              Edit Asset
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href={`/assets/${asset.assetid}`}>
            <ExternalLink className="mr-2 h-4 w-4" />
            View Details
          </Link>
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem
            onSelect={() => router.push(buildDuplicateUrl(asset))}
          >
            <Copy className="mr-2 h-4 w-4" />
            Duplicate Asset
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-muted-foreground text-xs font-medium">
          Operations
        </DropdownMenuLabel>
        {isAdmin && (
          <DropdownMenuItem onSelect={() => onSelectOperation(asset, "assign")}>
            <UserPlus className="mr-2 h-4 w-4" />
            Assign / Unassign
          </DropdownMenuItem>
        )}
        {isAdmin && (
          <DropdownMenuItem
            onSelect={() => onSelectOperation(asset, "transfer")}
          >
            <ArrowRightLeft className="mr-2 h-4 w-4" />
            Transfer
          </DropdownMenuItem>
        )}
        {isAdmin && (
          <DropdownMenuItem
            onSelect={() => onSelectOperation(asset, "checkout")}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Check Out / Check In
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => onSelectOperation(asset, "reserve")}>
          <CalendarClock className="mr-2 h-4 w-4" />
          Reservations
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem onSelect={() => onSelectOperation(asset, "status")}>
            <Activity className="mr-2 h-4 w-4" />
            Update Status
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-muted-foreground text-xs font-medium">
          Tools
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onSelectOperation(asset, "qrcode")}>
          <QrCode className="mr-2 h-4 w-4" />
          Show QR Code
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onSelectOperation(asset, "label")}>
          <Printer className="mr-2 h-4 w-4" />
          Print Label
        </DropdownMenuItem>

        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => onSelectOperation(asset, "delete")}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Asset
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
