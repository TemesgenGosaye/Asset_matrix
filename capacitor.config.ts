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
 *   - `server.url` MUST point at a running HTTPS deployment. The APK boots
 *     directly on the portal's real `/login` route. Connectivity is checked by
 *     the light-mode native launch gate before the WebView is opened; the real
 *     login page is the only screen that accepts credentials.
 *   - `errorPath` is only a light-mode recovery screen for a WebView that loses
 *     the server after the gate has passed. It never collects credentials.
 *   - Override the target per build with CAPACITOR_SERVER_URL, e.g.
 *       $env:CAPACITOR_SERVER_URL="http://10.0.2.2:3000"; npx cap sync android
 *     (10.0.2.2 is the host loopback as seen from the Android emulator.)
 */
const serverUrl =
  process.env.CAPACITOR_SERVER_URL ?? "https://house.taild2df63.ts.net";

/**
 * The APK always boots on the sign-in screen — never the site root (which can
 * redirect to /setup) and never the first-run wizard. `app=1` marks the
 * navigation as native so the login page skips the setup detour even before
 * the Capacitor bridge is injected.
 */
const loginUrl = `${serverUrl.replace(/\/+$/, "").replace(/\/login.*$/, "")}/login?app=1`;

const config: CapacitorConfig = {
  appId: "com.company.assettracker",
  appName: "HomeDesk",
  // Minimal placeholder: with `server.url` set, the WebView loads the remote
  // origin and never reads these files. It exists only because the Capacitor
  // CLI requires a webDir containing an index.html.
  webDir: "android-shell",
  server: {
    url: loginUrl,
    androidScheme: "https",
    cleartext: false,
    errorPath: "offline.html",
    allowNavigation: ["house.taild2df63.ts.net", "*.ts.net", "*.tailscale.net"],
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    // Never enable remote WebView inspection in a release build. Opt in only
    // for a local debug build with CAPACITOR_WEB_DEBUG=true before `cap sync`.
    webContentsDebuggingEnabled: process.env.CAPACITOR_WEB_DEBUG === "true",
    backgroundColor: "#ffffff",
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
