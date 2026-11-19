"use client";

import BrandLoader from "@/components/BrandLoader";
import { useNetworkStatus } from "@/contexts/NetworkStatusContext";

export default function Loading() {
  const { isOnline, message } = useNetworkStatus();

  return (
    <BrandLoader
      label={
        isOnline
          ? "Loading MSF HomeDesk…"
          : `${message} Retrying automatically…`
      }
    />
  );
}
