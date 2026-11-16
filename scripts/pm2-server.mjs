#!/usr/bin/env node
/**
 * PM2 entry point for the production server.
 *
 * Next.js refuses to run `next start` when next.config.mjs sets
 * `output: "standalone"`, so PM2 boots the standalone server instead. This
 * wrapper prepares the standalone folder the way Next expects it and then
 * loads the server in-process, so PM2 supervises the real server process:
 *
 *   1. copy .next/static and public into .next/standalone - Next does not
 *      include them in the standalone output, but the server serves them;
 *   2. copy .env into .next/standalone, so the standalone folder stays
 *      self-contained;
 *   3. load .next/standalone/server.js (it chdirs into its own folder);
 *   4. chdir back to the project root, so application folders that are
 *      resolved from process.cwd() (uploads/, data/) stay in the project.
 *
 * The build itself is not part of this script: run `npm run build` first.
 */
import { spawn } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STANDALONE = path.join(ROOT, ".next", "standalone");
const SERVER = path.join(STANDALONE, "server.js");

function copyTree(source, destination) {
  if (!existsSync(source)) return;
  const child = spawn(
    "robocopy",
    [source, destination, "/E", "/NFL", "/NDL", "/NJH", "/NJS", "/NP", "/R:1", "/W:1"],
    { cwd: ROOT, windowsHide: true },
  );
  child.on("close", (code) => {
    if (code !== null && code > 7) {
      console.error(`robocopy ${source} -> ${destination} failed with code ${code}`);
    }
  });
}

function copyEnv() {
  const source = path.join(ROOT, ".env");
  const destination = path.join(STANDALONE, ".env");
  if (!existsSync(source)) return;
  copyFileSync(source, destination);
}

async function main() {
  if (!existsSync(SERVER)) {
    console.error(
      `${SERVER} is missing. Run "npm run build" before starting the production server.`,
    );
    process.exit(1);
  }

  copyTree(path.join(ROOT, ".next", "static"), path.join(STANDALONE, ".next", "static"));
  copyTree(path.join(ROOT, "public"), path.join(STANDALONE, "public"));
  copyEnv();

  process.env.HOSTNAME = process.env.HOSTNAME || "0.0.0.0";
  process.env.PORT = process.env.PORT || "3000";

  await import(pathToFileURL(SERVER).href);

  process.chdir(ROOT);
  console.log(
    `Production server listening on http://${process.env.HOSTNAME}:${process.env.PORT} (project root ${ROOT}).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
