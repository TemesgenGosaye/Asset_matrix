import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getOrganizationContext } from "@/lib/organization-context";

export const metadata: Metadata = {
  title: "Edit Fixed Asset",
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!isFeatureEnabled("fixedAssetRegister")) redirect("/assets");
  const ctx = await getOrganizationContext().catch(() => null);
  if (!ctx?.userId || !ctx.isAdmin) redirect("/assets");
  const { id } = await params;
  redirect(`/assets?edit=${encodeURIComponent(id)}`);
}
