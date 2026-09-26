import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import Breadcrumb from "@/components/Breadcrumb";
import HelpPage from "./ui/HelpPage";

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
      <HelpPage isAdmin={isAdmin} />
    </>
  );
}
