import React from "react";
import Breadcrumb from "@/components/Breadcrumb";
import HouseholdRegisterClient from "@/ui/household/HouseholdRegisterClient";
import {
  getAssignedHouseIds,
  getHouseholds,
  getHouseholdSummary,
  getLocation,
} from "@/lib/data";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Asset Tracker - House Register",
  description: "Household and facility registration management",
};

function serializeDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  return typeof value === "string" ? value : value.toISOString();
}

export default async function HouseRegisterPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const [householdsRaw, summary, locationsRaw, assignedHouseIds] =
    await Promise.all([
      getHouseholds(),
      getHouseholdSummary(),
      getLocation(),
      getAssignedHouseIds(),
    ]);

  const households = householdsRaw.map((item) => ({
    ...item,
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
          { label: "House Hold", href: "/household/register" },
          { label: "House Register", href: "/household/register" },
        ]}
      />
      <HouseholdRegisterClient
        initialHouseholds={households}
        locations={locations}
        initialSummary={summary}
        initiallyAssignedHouseIds={assignedHouseIds}
      />
    </div>
  );
}

export const dynamic = "force-dynamic";
