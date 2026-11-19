/// <reference types="@capacitor/cli" />
import type { CapacitorConfig } from "@capacitor/cli";

const rawTarget =
  process.env.CAPACITOR_SERVER_URL ?? "https://msf-homedesk.vercel.app";
const target = new URL(rawTarget);

if (target.protocol !== "https:") {
  throw new Error("CAPACITOR_SERVER_URL must use HTTPS.");
}

if (target.username || target.password) {
  throw new Error("CAPACITOR_SERVER_URL must not include credentials.");
}

const config: CapacitorConfig = {
  appId: "com.metahara.homedesk",
  appName: "MSF Homedesk",
  webDir: "android-shell",
  server: {
    androidScheme: "https",
    cleartext: false,
    errorPath: "offline.html",
    allowNavigation: [target.hostname],
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    backgroundColor: "#FFFFFF",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: false,
      launchFadeOutDuration: 300,
      backgroundColor: "#FFFFFF",
      androidSplashResourceName: "splash",
      androidScaleType: "FIT_XY",
      layoutName: "msf_splash",
      showSpinner: false,
    },
  },
};

export default config;
