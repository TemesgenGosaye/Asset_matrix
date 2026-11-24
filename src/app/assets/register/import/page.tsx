import { redirect } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getOrganizationContext } from "@/lib/organization-context";
import prisma from "@/lib/prisma";
import FixedAssetImportWizard from "@/ui/assets/FixedAssetImportWizard";

export const metadata = {
  title: "Import Fixed Assets",
};

export default async function Page() {
  if (!isFeatureEnabled("fixedAssetRegister")) redirect("/assets");
  const ctx = await getOrganizationContext().catch(() => null);
  if (!ctx?.userId || !ctx.isAdmin) redirect("/assets");
  const jobs = ctx.organization
    ? await prisma.importJob.findMany({
        where: {
          entityType: "fixed_asset_register",
          organizationId: ctx.organization.id,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          fileName: true,
          status: true,
          totalRows: true,
          successCount: true,
          errorCount: true,
          finishedAt: true,
        },
      })
    : [];
  return (
    <div className="space-y-4">
      <Breadcrumb
        options={[
          { label: "Home", href: "/" },
          { label: "Assets", href: "/assets" },
          { label: "Import", href: "/assets/register/import" },
        ]}
      />
      <FixedAssetImportWizard
        initialHistory={jobs.map((job) => ({
          ...job,
          finishedAt: job.finishedAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
