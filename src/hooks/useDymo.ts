"use client";

import { useState, useEffect, useCallback } from "react";
import { loadDymoSdk, getDymoPrinters, type DymoPrinter } from "@/lib/dymo";

interface UseDymoReturn {
  isLoading: boolean;
  isAvailable: boolean;
  printers: DymoPrinter[];
  error: string | null;
  refresh: () => void;
}

export function useDymo(): UseDymoReturn {
  const [isLoading, setIsLoading] = useState(true);
  const [isAvailable, setIsAvailable] = useState(false);
  const [printers, setPrinters] = useState<DymoPrinter[]>([]);
  const [error, setError] = useState<string | null>(null);

  const detect = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      await loadDymoSdk();
      const found = getDymoPrinters();
      setPrinters(found);
      setIsAvailable(found.length > 0);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      setIsAvailable(false);
      setPrinters([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    detect();
  }, [detect]);

  return { isLoading, isAvailable, printers, error, refresh: detect };
}
