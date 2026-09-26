import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import Breadcrumb from "@/components/Breadcrumb";
import DuplicatesPage from "./ui/DuplicatesPage";

export const metadata = {
  title: "Asset Tracker - Duplicate Detection",
  description: "Find potential duplicate assets",
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
          { label: "Duplicates", href: "/duplicates" },
        ]}
      />
      <DuplicatesPage />
    </>
  );
}
