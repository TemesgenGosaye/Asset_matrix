#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

const input = process.argv[2];
if (!input) {
  fail("usage: node scripts/set-public-origin.mjs https://your-name.ts.net");
}

let origin;
try {
  const url = new URL(input);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    fail("URL must start with http:// or https://");
  }
  origin = url.origin;
} catch {
  fail(`invalid URL: ${input}`);
}

const envPath = path.join(ROOT, ".env");
if (!existsSync(envPath)) fail(`.env not found at ${envPath}`);

function upsert(content, key, value) {
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}=${value}`;
  if (pattern.test(content)) return content.replace(pattern, line);
  return `${content.replace(/\s*$/, "")}\n${line}\n`;
}

let env = readFileSync(envPath, "utf8");
env = upsert(env, "FRONTEND_URL", origin);
env = upsert(env, "NEXT_PUBLIC_APP_URL", origin);
env = upsert(env, "BETTER_AUTH_URL", origin);

const trustedMatch = env.match(/^BETTER_AUTH_TRUSTED_ORIGINS=(.*)$/m);
const current = trustedMatch
  ? trustedMatch[1]
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  : [];
const merged = [...new Set([...current, origin])];
env = upsert(env, "BETTER_AUTH_TRUSTED_ORIGINS", merged.join(","));

writeFileSync(envPath, env, "utf8");

const standaloneEnv = path.join(ROOT, ".next", "standalone", ".env");
if (existsSync(standaloneEnv)) writeFileSync(standaloneEnv, env, "utf8");

console.log(`Public origin set to ${origin}`);
console.log("Updated FRONTEND_URL, NEXT_PUBLIC_APP_URL, BETTER_AUTH_URL, BETTER_AUTH_TRUSTED_ORIGINS");
console.log("NEXT_PUBLIC_APP_URL is baked at build time: run `npm run build`, then restart the server.");
