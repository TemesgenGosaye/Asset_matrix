"use client";

import { useNetworkStatus } from "@/contexts/NetworkStatusContext";

export function useOnlineStatus() {
  const { isOnline, wasOffline, networkLabel } = useNetworkStatus();
  return { isOnline, wasOffline, networkLabel };
}
