import { redirect } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import { getDepartments, getLocation, getStatus } from "@/lib/data";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getOrganizationContext } from "@/lib/organization-context";
import FixedAssetForm from "@/ui/assets/FixedAssetForm";

export const metadata = {
  title: "New Fixed Asset",
};

export default async function Page() {
  if (!isFeatureEnabled("fixedAssetRegister")) redirect("/assets");
  const ctx = await getOrganizationContext().catch(() => null);
  if (!ctx?.userId || !ctx.isAdmin) redirect("/assets");
  const [departments, statuses, locations] = await Promise.all([
    getDepartments().catch(() => []),
    getStatus().catch(() => []),
    getLocation().catch(() => []),
  ]);
  return (
    <div className="space-y-4">
      <Breadcrumb
        options={[
          { label: "Home", href: "/" },
          { label: "Assets", href: "/assets" },
          { label: "New", href: "/assets/register/create" },
        ]}
      />
      <FixedAssetForm
        mode="create"
        departments={departments.map((item) => ({
          id: item.id,
          name: item.name,
          code: item.code,
        }))}
        statuses={statuses.map((item) => ({
          id: item.statustypeid,
          name: item.statustypename,
        }))}
        locations={locations.map((item) => ({
          id: item.locationid,
          name: item.locationname,
        }))}
      />
    </div>
  );
}
