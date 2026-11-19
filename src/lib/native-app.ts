/**
 * True when the page is running inside the Capacitor Android/iOS shell.
 *
 * The APK loads the remote portal, so the injected Capacitor bridge is the
 * reliable signal. The `?app=1` query flag is a fallback for the first paint
 * before the bridge is ready and for links minted by the native shell.
 */
type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
};

const NATIVE_FLAG_KEY = "homedesk:native";

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;

  const capacitor = (window as Window & { Capacitor?: CapacitorBridge })
    .Capacitor;

  if (capacitor) {
    if (typeof capacitor.isNativePlatform === "function") {
      return capacitor.isNativePlatform();
    }
    if (typeof capacitor.getPlatform === "function") {
      return capacitor.getPlatform() !== "web";
    }
  }

  try {
    // The flag persists across in-origin navigations (e.g. after logout), so
    // the APK never falls back into the /setup wizard once it has started.
    if (window.localStorage.getItem(NATIVE_FLAG_KEY) === "1") return true;

    if (new URLSearchParams(window.location.search).get("app") === "1") {
      window.localStorage.setItem(NATIVE_FLAG_KEY, "1");
      return true;
    }
  } catch {
    // Storage can be unavailable (private mode); fall through to web mode.
  }

  return false;
}

/**
 * True when running inside the Android APK (Capacitor shell or WebView).
 * Used for platform-specific UI such as the login background.
 */
export function isAndroidApp(): boolean {
  if (typeof window === "undefined") return false;

  const capacitor = (window as Window & { Capacitor?: CapacitorBridge })
    .Capacitor;
  const platform =
    capacitor && typeof capacitor.getPlatform === "function"
      ? capacitor.getPlatform()
      : null;

  if (platform === "android") return true;
  if (platform && platform !== "web") return false;

  const ua = window.navigator.userAgent || "";
  if (!/android/i.test(ua)) return false;

  // Android WebView marker
  if (/; wv\)|\bwv\b/i.test(ua)) return true;

  try {
    if (window.localStorage.getItem(NATIVE_FLAG_KEY) === "1") return true;
  } catch {
    // ignore
  }

  return false;
}
