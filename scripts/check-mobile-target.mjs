import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rawTarget =
  process.env.CAPACITOR_SERVER_URL ?? "https://msf-homedesk.vercel.app";
const target = new URL(rawTarget);

if (target.protocol !== "https:") {
  throw new Error("Mobile target must use HTTPS for a release build.");
}

if (target.username || target.password) {
  throw new Error("Mobile target must not include credentials.");
}

const origin = target.origin;
const host = target.hostname;
const startupUrl = `${origin}/?app=1`;

const files = {
  config: resolve(root, "capacitor.config.ts"),
  shellConfig: resolve(root, "android-shell", "config.js"),
  index: resolve(root, "android-shell", "index.html"),
  offline: resolve(root, "android-shell", "offline.html"),
  iconGenerator: resolve(root, "scripts", "generate-android-icons.mjs"),
  manifest: resolve(
    root,
    "android",
    "app",
    "src",
    "main",
    "AndroidManifest.xml",
  ),
  gradle: resolve(root, "android", "app", "build.gradle"),
  proguard: resolve(root, "android", "app", "proguard-rules.pro"),
  package: resolve(root, "package.json"),
  colors: resolve(
    root,
    "android",
    "app",
    "src",
    "main",
    "res",
    "values",
    "colors.xml",
  ),
  styles: resolve(
    root,
    "android",
    "app",
    "src",
    "main",
    "res",
    "values",
    "styles.xml",
  ),
  splashLayout: resolve(
    root,
    "android",
    "app",
    "src",
    "main",
    "res",
    "layout",
    "msf_splash.xml",
  ),
  resourceKeep: resolve(
    root,
    "android",
    "app",
    "src",
    "main",
    "res",
    "raw",
    "keep.xml",
  ),
  strings: resolve(
    root,
    "android",
    "app",
    "src",
    "main",
    "res",
    "values",
    "strings.xml",
  ),
  activity: resolve(
    root,
    "android",
    "app",
    "src",
    "main",
    "java",
    "com",
    "metahara",
    "homedesk",
    "MainActivity.java",
  ),
};

const checks = [
  {
    name: "Capacitor app id",
    file: files.config,
    expected: 'appId: "com.metahara.homedesk"',
  },
  {
    name: "Capacitor app name",
    file: files.config,
    expected: 'appName: "HomeDesk"',
  },
  {
    name: "Capacitor env override",
    file: files.config,
    expected: "process.env.CAPACITOR_SERVER_URL",
  },
  {
    name: "Shell server origin",
    file: files.shellConfig,
    expected: `serverOrigin: "${origin}"`,
  },
  {
    name: "Shell startup URL",
    file: files.shellConfig,
    expected: `startupUrl: "${startupUrl}"`,
  },
  {
    name: "Shell start path",
    file: files.shellConfig,
    expected: 'startPath: "/?app=1"',
  },
  {
    name: "Launcher redirect",
    file: files.index,
    expected: "window.location.replace(",
  },
  {
    name: "Portal health probe",
    file: files.index,
    expected: "var HEALTH = ORIGIN +",
  },
  {
    name: "Manual splash control",
    file: files.config,
    expected: "launchAutoHide: false",
  },
  {
    name: "White splash background",
    file: files.config,
    expected: 'backgroundColor: "#FFFFFF"',
  },
  {
    name: "Custom native splash layout",
    file: files.config,
    expected: 'layoutName: "msf_splash"',
  },
  {
    name: "Custom splash spinner",
    file: files.splashLayout,
    expected: 'android:indeterminateTint="@color/colorAccent"',
  },
  {
    name: "Splash logo asset",
    file: files.iconGenerator,
    expected: '"splash_logo.png"',
  },
  {
    name: "Splash resources retained",
    file: files.resourceKeep,
    expected: 'tools:keep="@layout/msf_splash,@drawable/splash_logo"',
  },
  {
    name: "Legacy launch splash theme",
    file: files.styles,
    expected:
      '<style name="AppTheme.NoActionBarLaunch" parent="AppTheme.NoActionBar">',
  },
  {
    name: "Offline redirect",
    file: files.offline,
    expected: "window.location.replace(CFG.origin + CFG.start)",
  },
  {
    name: "Desktop app icon source",
    file: files.iconGenerator,
    expected: 'const markSource = join(root, "android-shell", "app-icon.png");',
  },
  {
    name: "Launcher loading spinner",
    file: files.index,
    expected: '<div class="spinner" role="status" aria-label="Loading">',
  },
  {
    name: "Launcher centered spinner",
    file: files.index,
    expected: "grid-row: 2;",
  },
  {
    name: "Launcher offline fast path",
    file: files.index,
    expected: "showOffline();",
  },
  {
    name: "Launcher offline spinner delay",
    file: files.index,
    expected: "var OFFLINE_SPIN_MS = 1000;",
  },
  {
    name: "Launcher powered by",
    file: files.index,
    expected: "Powered By Temesgen G.",
  },
  {
    name: "Offline centered status",
    file: files.offline,
    expected: "grid-row: 2;",
  },
  {
    name: "Offline network check",
    file: files.offline,
    expected: "function getNetwork()",
  },
  {
    name: "Offline powered by",
    file: files.offline,
    expected: "Powered By Temesgen G.",
  },
  {
    name: "Native splash powered by",
    file: files.strings,
    expected: 'name="splash_powered"',
  },
  {
    name: "Android app label",
    file: files.strings,
    expected: '<string name="app_name">HomeDesk</string>',
  },
  {
    name: "Android activity label",
    file: files.strings,
    expected: '<string name="title_activity_main">HomeDesk</string>',
  },
  {
    name: "White icon background",
    file: files.iconGenerator,
    expected: '<rect width="100%" height="100%" fill="#FFFFFF"/>',
  },
  {
    name: "White app theme",
    file: files.colors,
    expected: '<color name="windowBackground">#FFFFFF</color>',
  },
  {
    name: "Native package",
    file: files.activity,
    expected: "package com.metahara.homedesk;",
  },
  {
    name: "Native network type",
    file: files.activity,
    expected: "public String getType()",
  },
  {
    name: "Native bridge name",
    file: files.activity,
    expected: '"HomeDeskNative"',
  },
  {
    name: "Internet permission",
    file: files.manifest,
    expected: "android.permission.INTERNET",
  },
  {
    name: "Network state permission",
    file: files.manifest,
    expected: "android.permission.ACCESS_NETWORK_STATE",
  },
  {
    name: "Minify enabled",
    file: files.gradle,
    expected: "minifyEnabled true",
  },
  {
    name: "Shrink resources",
    file: files.gradle,
    expected: "shrinkResources true",
  },
  {
    name: "Capacitor keep rules",
    file: files.proguard,
    expected: "com.getcapacitor.BridgeActivity",
  },
  {
    name: "Native bridge keep rule",
    file: files.proguard,
    expected: "@android.webkit.JavascriptInterface <methods>",
  },
];

const failures = [];
const contents = new Map();

for (const check of checks) {
  let content;
  try {
    content = readFileSync(check.file, "utf8");
  } catch {
    failures.push(`${check.name}: missing ${check.file}`);
    continue;
  }
  contents.set(check.file, content);
  if (!content.includes(check.expected)) {
    failures.push(`${check.name}: expected ${check.expected}`);
  }
}

const forbidden = [
  /com\.company\.assettracker/,
  /house\.taild2df63\.ts\.net/,
  /\.ts\.net/,
  /\.tailscale\.net/,
  /android\.permission\.CAMERA/,
  /android\.hardware\.camera/,
  /"@capacitor\/camera"/,
  /localhost/,
  /10\.0\.2\.2/,
];

for (const [file, content] of contents) {
  for (const pattern of forbidden) {
    if (pattern.test(content)) {
      failures.push(`${file}: forbidden value matching ${pattern}`);
    }
  }
}

if (failures.length > 0) {
  console.error("APK target check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`APK target OK: ${origin} (${host})`);
