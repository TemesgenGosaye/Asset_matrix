#!/usr/bin/env node
/**
 * Warm up the Turbopack dev route index by visiting every page route once.
 *
 * Turbopack compiles each route lazily on first request, and Next.js disables
 * <Link> prefetching in dev, so the first click on a sidebar page pays a full
 * compile (10-50s in this app). Running this once with the dev server up moves
 * all of that work off the critical path: every route gets compiled and saved
 * to Turbopack's persistent filesystem cache, and stays hot across restarts.
 *
 * `npm run dev` runs this automatically; use this script to warm an already
 * running server (e.g. one started outside this runner).
 *
 * Usage:
 *   npm run dev:warm                 # prompts for your login
 *   npm run dev:warm -- --email you@example.com --password yourpass
 *   WARM_EMAIL=... WARM_PASSWORD=... npm run dev:warm
 *
 * Options:
 *   --url          Base URL of the dev server (default: http://localhost:PORT)
 *   --email        Login identifier (email or username)
 *   --password     Login password
 *   --concurrency  Parallel requests while warming (default: 2)
 */
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  APP_DIR,
  collectPageFiles,
  login,
  toUrlPath,
  warmRoutes,
} from "./lib/turbopack-dev.mjs";

const args = process.argv.slice(2);
const argValue = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : undefined;
};

const port = process.env.PORT || "3000";
const baseUrl = (
  argValue("--url") ||
  process.env.WARM_URL ||
  `http://localhost:${port}`
).replace(/\/$/, "");
const email = argValue("--email") || process.env.WARM_EMAIL;
const password = argValue("--password") || process.env.WARM_PASSWORD;
const concurrency = Number(
  argValue("--concurrency") || process.env.WARM_CONCURRENCY || 2,
);

async function promptCredentials() {
  const rl = createInterface({ input, output });
  const result = {};
  if (!email) result.email = (await rl.question("Login (email or username): ")).trim();
  if (!password) result.password = await rl.question("Password: ");
  rl.close();
  return result;
}

async function warm() {
  if (baseUrl && !/^https?:\/\//.test(baseUrl)) {
    console.error(`✖ Invalid --url: ${baseUrl}`);
    process.exit(1);
  }

  const appDir = APP_DIR();
  const pages = collectPageFiles(appDir).map((f) => toUrlPath(appDir, f)).sort();
  console.log(`Warming ${pages.length} routes on ${baseUrl} …`);

  const creds = await promptCredentials();
  const identifier = email || creds.email;
  const pass = password || creds.password;

  if (!identifier || !pass) {
    console.error("✖ Email and password are required to warm authenticated routes.");
    process.exitCode = 1;
    return;
  }

  let cookie;
  try {
    cookie = await login(baseUrl, identifier, pass);
  } catch (err) {
    console.error(`✖ ${err.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`✔ Logged in. Compiling routes in background (concurrency ${concurrency})…\n`);

  const result = await warmRoutes({
    baseUrl,
    pages,
    cookie,
    concurrency,
    onResult: ({ path, ms, status, error }) => {
      const mark = error ? "✖" : ms > 5000 ? "◉" : ms > 1000 ? "○" : "·";
      console.log(
        `${mark} ${String(ms).padStart(6)}ms  ${error ? "ERR" : status}  ${path}` +
          (error ? `  ${error}` : ""),
      );
    },
  });

  console.log(`\n✔ Warm-up finished in ${result.seconds.toFixed(1)}s (${result.requestMs}ms of request time).`);
  if (result.slow.length) {
    console.log(`\nRoutes that compiled for the first time (>5s):`);
    result.slow
      .sort((a, b) => b.ms - a.ms)
      .forEach(({ path, ms }) => console.log(`  ${String(ms).padStart(6)}ms  ${path}`));
  }
  console.log(
    `\nThese routes are now in Turbopack's persistent cache and will be near-instant` +
      ` to load, including after the next dev restart.`,
  );
}

warm().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
