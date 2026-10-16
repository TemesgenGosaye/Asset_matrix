import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import PayRentClient from "@/ui/rent/PayRentClient";
import { auth } from "@/lib/auth";
import { getOrganizationContext } from "@/lib/organization-context";
import { buildRentCapabilities } from "@/lib/rent/access";
import { getRentSummary } from "@/lib/rent/queries";
import type { Permission } from "@/lib/rbac";

export const metadata = {
  title: "Asset Tracker - Pay Rent",
  description: "House, shop and grocery rent management",
};

/**
 * Pay Rent - /facility/pay-rent
 *
 * Server component. Resolves the organization, enforces `rent:view` on the
 * server (not just by hiding the link), reads the real summary aggregates so the
 * header paints with live numbers, and hands the client component a capability
 * map for presentation only.
 */
export default async function PayRentPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const ctx = await getOrganizationContext();
  const orgId = ctx?.organization?.id;
  if (!orgId) redirect("/login");

  const has = (permission: Permission) =>
    ctx!.isAdmin || ctx!.permissions.has(permission);
  if (!has("rent:view")) redirect("/dashboard");

  const capabilities = buildRentCapabilities(has, ctx!.isAdmin);
  const summary = await getRentSummary(orgId);

  return (
    <div className="space-y-4">
      <Breadcrumb
        options={[
          { label: "Home", href: "/" },
          { label: "Facility & House", href: "/houses/allocated" },
          { label: "Pay Rent", href: "/facility/pay-rent" },
        ]}
      />

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pay Rent</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Manage people who rent houses, shops, groceries or other premises from
          the factory. The monthly schedule is generated automatically from each
          lease.
        </p>
      </div>

      <PayRentClient capabilities={capabilities} initialSummary={summary} />
    </div>
  );
}

export const dynamic = "force-dynamic";
