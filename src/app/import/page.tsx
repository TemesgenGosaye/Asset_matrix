import { Metadata } from "next";
import Breadcrumb from "@/components/Breadcrumb";
import ImportPageClient from "./ui/ImportPageClient";

export const metadata: Metadata = {
  title: "Asset Tracker - Import",
  description:
    "Bulk import assets, employees, the house register, accessories, consumables, licences, users, and locations",
};

export default function ImportPage() {
  return (
    <>
      <Breadcrumb
        options={[
          { label: "Home", href: "/" },
          { label: "Import", href: "/import" },
        ]}
      />
      <ImportPageClient />
    </>
  );
}
