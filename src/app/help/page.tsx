import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import Breadcrumb from "@/components/Breadcrumb";

export const metadata = {
  title: "Asset Tracker - Help & FAQ",
  description: "Guides, FAQ, and keyboard shortcuts",
};

export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() });
  const isAdmin = !!session?.user?.isadmin;

  return (
    <>
      <Breadcrumb
        options={[
          { label: "Home", href: "/" },
          { label: "Help", href: "/help" },
        ]}
      />
      <section className="bg-card rounded-lg border p-5 shadow-sm">
        <h2 className="text-foreground text-sm font-semibold">Help & FAQ</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          The help content is not available in this deployment
          {isAdmin ? " (administrator view)" : ""}.
        </p>
      </section>
    </>
  );
}
