import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import KitCreateForm from "./ui/KitCreateForm";
import Breadcrumb from "@/components/Breadcrumb";

export const metadata = {
  title: "Asset Tracker - Create Kit",
};

export default async function CreateKitPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }
  if (!session.user.isadmin) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6 p-6">
      <Breadcrumb
        options={[
          { label: "Home", href: "/" },
          { label: "Kits", href: "/kits" },
          { label: "Create Kit" },
        ]}
      />
      <h1 className="text-2xl font-bold">Create Kit</h1>
      <KitCreateForm />
    </div>
  );
}
