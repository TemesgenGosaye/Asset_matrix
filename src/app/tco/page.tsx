import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import Breadcrumb from "@/components/Breadcrumb";

export const metadata = {
  title: "Asset Tracker - TCO Analysis",
  description: "Total Cost of Ownership analysis across asset categories",
};

export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) redirect("/login");
  if (!session.user.isadmin) redirect("/dashboard");

  return (
    <>
      <Breadcrumb
        options={[
          { label: "Home", href: "/" },
          { label: "TCO Analysis", href: "/tco" },
        ]}
      />
      <section className="bg-card rounded-lg border p-5 shadow-sm">
        <h2 className="text-foreground text-sm font-semibold">
          Total Cost of Ownership: የጠቅላላ ባለቤትነት ወጪ ትንተና
        </h2>
        <p className="text-muted-foreground mt-2 text-sm">
          The TCO dashboard is not available in this deployment.
        </p>
      </section>
    </>
  );
}
