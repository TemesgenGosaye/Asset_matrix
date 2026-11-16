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

export default async function HouseRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  // The dashboard's House Register tiles link here as /register?type=<category>.
  // Only known categories are accepted; anything else falls back to "all" so a
  // hand-edited URL cannot wedge the filter into a value with no results.
  const resolvedParams = await searchParams;
  const requestedType = Array.isArray(resolvedParams.type)
    ? resolvedParams.type[0]
    : resolvedParams.type;
  const initialTypeFilter = ["Staff", "A", "B", "C", "D", "E"].includes(
    requestedType ?? "",
  )
    ? (requestedType as string)
    : "all";

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
          { label: "House Register", href: "/household/register" },
          { label: "House Register", href: "/household/register" },
        ]}
      />
      <HouseholdRegisterClient
        initialHouseholds={households}
        locations={locations}
        initialSummary={summary}
        initiallyAssignedHouseIds={assignedHouseIds}
        initialTypeFilter={initialTypeFilter}
      />
    </div>
  );
}

export const dynamic = "force-dynamic";
