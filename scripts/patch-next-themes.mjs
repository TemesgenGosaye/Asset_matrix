#!/usr/bin/env node
/**
 * Silences the React 19.2 dev-only warning from next-themes 0.4.6:
 *
 *   Encountered a script tag while rendering React component. Scripts inside
 *   React components are never executed when rendering on the client.
 *
 * next-themes injects its no-flash theme <script> via React.createElement(),
 * and React 19 warns whenever a <script> element is created on the client
 * because those elements are inert. The upstream fix (render the script only
 * during SSR) was never published, so we apply it locally after every install.
 *
 * The script is still emitted into the initial SSR HTML (so the theme class is
 * applied before paint), but it is never re-created on the client, which also
 * removes the per-remount cost. Runs automatically via the "postinstall"
 * package script.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pkgDir = join(root, "node_modules", "next-themes");
const pkgPath = join(pkgDir, "package.json");

if (!existsSync(pkgPath)) {
  console.warn("patch-next-themes: next-themes is not installed, skipping.");
  process.exit(0);
}

const { version } = JSON.parse(readFileSync(pkgPath, "utf8"));
if (version !== "0.4.6") {
  console.warn(
    `patch-next-themes: expected version 0.4.6 but found ${version}. ` +
      "Skipping — re-check this patch before upgrading next-themes.",
  );
  process.exit(0);
}

// Render the no-flash script only during SSR; return false on the client.
const marker = 'return t.createElement("script",{...w,suppressHydrationWarning:!0,';
const replacement =
  'return typeof window=="undefined"&&t.createElement("script",{...w,suppressHydrationWarning:!0,';
const patchedMarker = 'typeof window=="undefined"&&t.createElement("script"';

for (const file of ["dist/index.mjs", "dist/index.js"]) {
  const path = join(pkgDir, file);
  const source = readFileSync(path, "utf8");

  if (source.includes(patchedMarker)) {
    console.log(`patch-next-themes: ${file} already patched.`);
    continue;
  }
  if (!source.includes(marker)) {
    console.error(`patch-next-themes: patch marker not found in ${file}. Aborting.`);
    process.exit(1);
  }

  writeFileSync(path, source.replace(marker, replacement));
  console.log(`patch-next-themes: patched ${file}.`);
}