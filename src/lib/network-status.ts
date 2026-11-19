export type NetworkState =
  "online" | "offline" | "server_error" | "timeout" | "auth_error";

export interface NetworkProbeResult {
  state: NetworkState;
  label?: string;
}

interface NetworkConnectionLike {
  type?: string;
  effectiveType?: string;
}

interface NativeNetworkLike {
  getLabel?: () => string;
}

export function readNetworkLabel(): string {
  if (typeof navigator === "undefined") return "Checking";

  const bridge = (window as Window & { HomeDeskNative?: NativeNetworkLike })
    .HomeDeskNative;
  if (bridge?.getLabel) {
    try {
      return navigator.onLine === false ? "No connection" : bridge.getLabel();
    } catch {
      return "Connected";
    }
  }

  if (navigator.onLine === false) return "No connection";

  const nav = navigator as Navigator & {
    connection?: NetworkConnectionLike;
    mozConnection?: NetworkConnectionLike;
    webkitConnection?: NetworkConnectionLike;
  };
  const conn = nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
  if (conn?.type === "wifi") return "Wi-Fi";
  if (conn?.type === "cellular") {
    return conn.effectiveType
      ? `Mobile data · ${conn.effectiveType.toUpperCase()}`
      : "Mobile data";
  }
  if (conn?.type === "ethernet") return "Ethernet";
  if (conn?.type === "vpn") return "VPN";
  return "Connected";
}

export async function probeNetwork(
  timeoutMs = 5_000,
): Promise<NetworkProbeResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("/api/health/live", {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      headers: { "x-network-probe": "1", Accept: "application/json" },
      signal: controller.signal,
    });

    if (response.status === 401 || response.status === 403) {
      return { state: "auth_error", label: readNetworkLabel() };
    }
    if (response.status >= 500) {
      return { state: "server_error", label: readNetworkLabel() };
    }
    if (!response.ok) {
      return { state: "offline", label: readNetworkLabel() };
    }
    return { state: "online", label: readNetworkLabel() };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { state: "timeout", label: readNetworkLabel() };
    }
    return { state: "offline", label: readNetworkLabel() };
  } finally {
    clearTimeout(timeout);
  }
}

export function networkMessage(state: NetworkState): string {
  switch (state) {
    case "offline":
      return "You’re offline. Check your connection.";
    case "server_error":
      return "MSF HomeDesk is temporarily unavailable.";
    case "timeout":
      return "Connection is taking longer than expected.";
    case "auth_error":
      return "Your session expired. Signing you back in…";
    default:
      return "Back online";
  }
}
