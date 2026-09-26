import React from "react";
import Breadcrumb from "@/components/Breadcrumb";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import NotificationCenterClient from "@/ui/notifications/NotificationCenterClient";

export const metadata = {
  title: "Asset Tracker - Notifications",
  description:
    "Enterprise notification center — every system event in one feed.",
};

export default async function NotificationsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="space-y-6">
      <Breadcrumb
        options={[{ label: "Home", href: "/" }, { label: "Notifications" }]}
      />
      <NotificationCenterClient />
    </div>
  );
}

export const dynamic = "force-dynamic";