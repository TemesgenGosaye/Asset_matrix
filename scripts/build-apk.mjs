import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const androidDir = join(root, "android");
const apkName = "HomeDesk.apk";
const isWindows = process.platform === "win32";

const rawTarget =
  process.env.CAPACITOR_SERVER_URL ?? "https://msf-homedesk.vercel.app";
const target = new URL(rawTarget);

if (target.protocol !== "https:") {
  throw new Error("CAPACITOR_SERVER_URL must use HTTPS for a release APK.");
}

if (target.username || target.password) {
  throw new Error("CAPACITOR_SERVER_URL must not include credentials.");
}

const origin = target.origin;
const startupUrl = `${origin}/?app=1`;
const versionName = process.env.ANDROID_VERSION_NAME ?? "1.0.0";

function run(command, args, cwd, label) {
  console.log(`\n> ${label}`);
  const useCmd = isWindows && (command === "npx" || command.endsWith(".bat"));
  const executable = useCmd ? "cmd.exe" : command;
  const finalArgs = useCmd ? ["/c", command, ...args] : args;
  const result = spawnSync(executable, finalArgs, {
    cwd,
    stdio: "inherit",
    shell: false,
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${label} failed with exit code ${result.status}`);
}

function findReleaseApk() {
  const releaseDir = join(
    androidDir,
    "app",
    "build",
    "outputs",
    "apk",
    "release",
  );
  if (!existsSync(releaseDir)) return null;
  return (
    readdirSync(releaseDir)
      .filter((file) => file.toLowerCase().endsWith(".apk"))
      .map((file) => join(releaseDir, file))
      .filter((file) => !file.includes("-unsigned"))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] ?? null
  );
}

function main() {
  writeFileSync(
    join(root, "android-shell", "config.js"),
    `window.HOMEDESK_CONFIG = {\n  serverOrigin: ${JSON.stringify(origin)},\n  startupUrl: ${JSON.stringify(startupUrl)},\n  startPath: "/?app=1",\n  healthPath: "/api/mobile/health",\n  livePath: "/api/health/live",\n};\n`,
  );

  console.log(`HomeDesk APK — target ${origin} — version ${versionName}`);

  if (!process.env.ANDROID_KEYSTORE_FILE) {
    console.warn(
      "Warning: no release keystore configured; using the debug signing config.",
    );
  }

  run(
    process.execPath,
    ["scripts/check-mobile-target.mjs"],
    root,
    "Verify mobile target",
  );
  run(
    process.execPath,
    ["scripts/generate-android-icons.mjs"],
    root,
    "Generate Android brand assets",
  );
  run("npx", ["cap", "sync", "android"], root, "Sync Capacitor web assets");

  const gradlew = isWindows ? "gradlew.bat" : "./gradlew";
  run(
    gradlew,
    ["clean", "assembleRelease", "--no-daemon"],
    androidDir,
    "Build release APK",
  );

  const apk = findReleaseApk();
  if (!apk)
    throw new Error("assembleRelease finished but no release APK was found.");

  const destination = join(root, apkName);
  const artifactsDir = join(root, "build-artifacts");
  mkdirSync(artifactsDir, { recursive: true });
  copyFileSync(apk, destination);
  copyFileSync(apk, join(artifactsDir, `HomeDesk-v${versionName}.apk`));

  const sizeMb = (statSync(destination).size / (1024 * 1024)).toFixed(1);
  console.log(`\nAPK ready: ${destination} (${sizeMb} MB)`);
}

try {
  main();
} catch (error) {
  console.error(
    `\nAPK build failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
