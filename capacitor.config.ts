/// <reference types="@capacitor/cli" />
import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Android shell for the MSF Asset & House Portal.
 *
 * The Next.js app is a full-stack server (160+ API routes, Prisma, PostgreSQL),
 * so it cannot be bundled into an APK. The APK is therefore a native Capacitor
 * WebView that loads the deployed server, with the Capacitor bridge injected
 * into responses from that origin (see Bridge.java:636 -> WebViewLocalServer).
 *
 * This means:
 *   - `server.url` MUST point at a running HTTPS deployment. There is no offline
 *     fallback; the PWA service worker handles connectivity inside the WebView.
 *   - Override the target per build with CAPACITOR_SERVER_URL, e.g.
 *       $env:CAPACITOR_SERVER_URL="http://10.0.2.2:3000"; npx cap sync android
 *     (10.0.2.2 is the host loopback as seen from the Android emulator.)
 */
const serverUrl = process.env.CAPACITOR_SERVER_URL ?? "http://10.3.12.29:3000";

const config: CapacitorConfig = {
  appId: "com.company.assettracker",
  appName: "Asset Tracker",
  // Minimal placeholder: with `server.url` set, the WebView loads the remote
  // origin and never reads these files. It exists only because the Capacitor
  // CLI requires a webDir containing an index.html.
  webDir: "android-shell",
  server: {
    url: serverUrl,
    androidScheme: "http",
    cleartext: true,
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: process.env.NODE_ENV !== "production",
    backgroundColor: "#0f172a",
  },
  plugins: {
    Camera: {
      // The QR/barcode scanner at /scanner uses navigator.mediaDevices.getUserMedia.
      // Capacitor maps this to the native camera permission prompt.
      androidxCameraCore: "1.4.2",
    },
  },
};

export default config;
