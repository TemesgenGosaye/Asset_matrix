"use client";

import React from "react";
import NavigationSettingsClient from "@/app/settings/navigation/ui/NavigationSettingsClient";

interface NavigationTabProps {
  isAdmin?: boolean;
  permissions?: string[];
}

export default function NavigationTab({
  isAdmin = true,
  permissions = [],
}: NavigationTabProps) {
  return (
    <div className="space-y-6">
      <NavigationSettingsClient isAdmin={isAdmin} permissions={permissions} />
    </div>
  );
}
