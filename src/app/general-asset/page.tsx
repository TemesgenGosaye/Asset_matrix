import React from "react";
import Breadcrumb from "@/components/Breadcrumb";
import GeneralAssetClient from "@/ui/general-asset/GeneralAssetClient";
import {
  getGeneralAssets,
  getGeneralAssetSummary,
  getLocation,
} from "@/lib/data";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Asset Tracker - General Asset",
  description:
    "General (non-IT) fixed asset inventory for Metahara Sugar Factory",
};

function serializeDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  return typeof value === "string" ? value : value.toISOString();
}

export default async function GeneralAssetPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const [itemsRaw, summary, locationsRaw] = await Promise.all([
    getGeneralAssets(),
    getGeneralAssetSummary(),
    getLocation(),
  ]);

  const items = itemsRaw.map((item) => ({
    ...item,
    reviewsDate: serializeDate(item.reviewsDate),
    createdAt: serializeDate(item.createdAt),
    updatedAt: serializeDate(item.updatedAt),
  }));

  const locations = locationsRaw.map((loc) => ({
    locationid: loc.locationid,
    locationname: loc.locationname,
  }));

  return (
    <div className="space-y-6">
      <Breadcrumb
        options={[
          { label: "Home", href: "/" },
          { label: "General Asset", href: "/general-asset" },
        ]}
      />
      <GeneralAssetClient
        initialItems={items}
        locations={locations}
        initialSummary={summary}
      />
    </div>
  );
}

export const dynamic = "force-dynamic";