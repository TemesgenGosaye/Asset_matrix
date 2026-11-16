import { redirect } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import { getOrganizationContext } from "@/lib/organization-context";
import NavigationSettingsClient from "./ui/NavigationSettingsClient";

/**
 * Settings → Navigation.
 *
 * A user-level preference page: which menu items the signed-in user wants to
 * see. It is deliberately NOT a permission page — the page lists only the items
 * the user's role can already reach, and hiding one changes nothing about what
 * the route or its API will allow.
 *
 * The current visibility state is not fetched here: `app/layout.tsx` already
 * resolved it for the chrome and seeded `NavigationPreferencesProvider`, which
 * this page reads. Only the two facts the provider cannot know — the role flag
 * and the permission set — are passed down.
 */

export const metadata = {
  title: "Navigation Settings — MSF Asset and House Portal",
  description: "Choose which menu items appear in your navigation.",
};

export const dynamic = "force-dynamic";

export default async function NavigationSettingsPage() {
  const ctx = await getOrganizationContext();
  if (!ctx) redirect("/login");

  if (ctx.isAdmin) {
    redirect("/admin/settings?tab=navigation");
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <Breadcrumb
        options={[
          { label: "Home", href: "/dashboard" },
          { label: "Settings", href: "/settings/navigation" },
          { label: "Navigation", href: "/settings/navigation" },
        ]}
      />
      <NavigationSettingsClient
        isAdmin={ctx.isAdmin}
        permissions={Array.from(ctx.permissions)}
      />
    </div>
  );
}
