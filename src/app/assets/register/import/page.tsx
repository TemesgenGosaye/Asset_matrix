import { redirect } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getOrganizationContext } from "@/lib/organization-context";
import FixedAssetImportWizard from "@/ui/assets/FixedAssetImportWizard";

export const metadata = {
  title: "Import Fixed Assets",
};

export default async function Page() {
  if (!isFeatureEnabled("fixedAssetRegister")) redirect("/assets");
  const ctx = await getOrganizationContext().catch(() => null);
  if (!ctx?.userId || !ctx.isAdmin) redirect("/assets");
  return (
    <div className="space-y-4">
      <Breadcrumb
        options={[
          { label: "Home", href: "/" },
          { label: "Assets", href: "/assets" },
          { label: "Import", href: "/assets/register/import" },
        ]}
      />
      <FixedAssetImportWizard />
    </div>
  );
}
