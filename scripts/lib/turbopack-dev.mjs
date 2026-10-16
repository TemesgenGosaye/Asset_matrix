#!/usr/bin/env node
/**
 * Shared helpers for the dev orchestration scripts (dev.mjs / dev-warm.mjs).
 *
 * Responsibilities:
 *  - Identify / kill stale Next.js dev servers holding a port (Windows + POSIX)
 *  - Wipe Turbopack caches (.next, tsbuildinfo)
 *  - Collect app routes and warm them so Turbopack never compiles on demand
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const IS_WINDOWS = process.platform === "win32";

/** Absolute project root (two levels above this file: scripts/lib -> scripts -> root). */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const NEXT_BIN = join(ROOT, "node_modules", "next", "dist", "bin", "next");

// ---------------------------------------------------------------------------
// Logging (auto-disables colour when piped or NO_COLOR is set)
// ---------------------------------------------------------------------------

const NO_COLOR = !process.stdout.isTTY || !!process.env.NO_COLOR;
/** Wrap a string in an ANSI colour (or return it untouched when colours are off). */
export const color = (code, s) => (NO_COLOR ? s : `\x1b[${code}m${s}\x1b[0m`);

const stamp = () => new Date().toLocaleTimeString("en-US", { hour12: false });

const line = (code, tag, args) =>
  console.log(`${color("90", stamp())} ${color("90", "·")} ${color(code, tag)} ${args.join(" ")}`);

export const logError = (...args) => line("91", "[err ]", args);
export const logWarn = (...args) => line("93", "[warn]", args);
export const logInfo = (...args) => line("94", "[info]", args);
export const logOk = (...args) => line("92", "[ ok ]", args);
export const logDim = (...args) => line("90", "[----]", args);

/** Synchronous sleep (blocks only this CLI, never the dev server child). */
export function sleep(ms) {
  const sab = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(sab), 0, 0, ms);
}

// ---------------------------------------------------------------------------
// Port / process inspection (Windows native + best-effort POSIX)
// ---------------------------------------------------------------------------

function run(command, args) {
  const res = spawnSync(command, args, { encoding: "utf8", windowsHide: true });
  return {
    ok: !res.error,
    code: res.status,
    stdout: (res.stdout || "").toString(),
    stderr: (res.stderr || "").toString(),
  };
}

/** Return [{ pid, ports: number[] }] for every TCP LISTENING socket. */
export function listeners() {
  if (IS_WINDOWS) {
    const { stdout } = run("netstat", ["-ano", "-p", "tcp"]);
    const byPid = new Map();
    for (const raw of stdout.split(/\r?\n/)) {
      const m = raw.match(/^\s*TCP\s+(\S+):(\d+)\s+(\S+):\S+\s+(LISTENING)\s+(\d+)\s*$/);
      if (!m) continue;
      const pid = Number(m[5]);
      if (!Number.isInteger(pid) || pid <= 0) continue;
      if (!byPid.has(pid)) byPid.set(pid, new Set());
      byPid.get(pid).add(Number(m[2]));
    }
    return [...byPid.entries()].map(([pid, ports]) => ({
      pid,
      ports: [...ports].sort((a, b) => a - b),
    }));
  }

  // POSIX: prefer lsof (widely available); otherwise give up cleanly.
  const { ok, stdout } = run("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-Fc", "-Fp"]);
  if (!ok) return [];
  const byPid = new Map();
  let currentPid = null;
  for (const raw of stdout.split("\n")) {
    const t = raw.slice(0, 1);
    const v = raw.slice(1);
    if (t === "p") {
      const pid = Number(v);
      currentPid = Number.isInteger(pid) && pid > 0 ? pid : null;
      if (currentPid && !byPid.has(currentPid)) byPid.set(currentPid, []);
    } else if (t === "c" && currentPid) {
      const m = v.match(/:(\d+)\s*$/);
      if (m) byPid.get(currentPid).push(Number(m[1]));
    }
  }
  return [...byPid.entries()].map(([pid, ports]) => ({
    pid,
    ports: [...new Set(ports)].sort((a, b) => a - b),
  }));
}

/** Rough process identity for a PID (command line). Empty string when unknown. */
export function processCommandLine(pid) {
  if (IS_WINDOWS) {
    const res = run("powershell", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}' | Select-Object -ExpandProperty CommandLine`,
    ]);
    return res.ok ? String(res.stdout).trim() : "";
  }
  const { ok, stdout } = run("ps", ["-p", String(pid), "-o", "command="]);
  return ok ? String(stdout).trim() : "";
}

/** True when the command line is the `next dev` CLI itself. */
export function isNextDevCli(cmdLine) {
  if (!cmdLine) return false;
  const c = cmdLine.toLowerCase().replace(/\//g, "\\");
  return (
    c.includes("next dev") ||
    c.includes("next.cmd dev") ||
    c.includes("next.exe dev") ||
    (c.includes("dist\\bin\\next") && /\bdev\b/.test(c))
  );
}

/**
 * True when the command line belongs to a running Next.js dev server.
 * The process bound to the port is usually the `start-server.js` worker, not
 * the CLI, so both shapes are recognised.
 */
export function isNextDev(cmdLine) {
  if (!cmdLine) return false;
  if (isNextDevCli(cmdLine)) return true;
  const c = cmdLine.toLowerCase().replace(/\//g, "\\");
  return (
    c.includes("dist\\server\\lib\\start-server.js") ||
    c.includes("dist\\server\\next.js")
  );
}

/** Parent PID of a process (null when unknown). */
export function parentPid(pid) {
  if (IS_WINDOWS) {
    const res = run("powershell", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `(Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}').ParentProcessId`,
    ]);
    const n = Number(String(res.stdout).trim());
    return Number.isInteger(n) && n > 0 ? n : null;
  }
  const { ok, stdout } = run("ps", ["-p", String(pid), "-o", "ppid="]);
  const n = Number(String(stdout).trim());
  return ok && Number.isInteger(n) && n > 0 ? n : null;
}

/** Kill a process and its children. */
export function killProcessTree(pid) {
  if (IS_WINDOWS) {
    run("taskkill", ["/PID", String(pid), "/T", "/F"]);
    return;
  }
  try {
    const { stdout } = spawnSync("ps", ["-eo", "pid=,ppid="], { encoding: "utf8" });
    const children = new Map();
    for (const ln of (stdout || "").split("\n")) {
      const m = ln.trim().match(/^(\d+)\s+(\d+)$/);
      if (!m) continue;
      const [child, parent] = [Number(m[1]), Number(m[2])];
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(child);
    }
    const tree = [];
    const queue = [pid];
    while (queue.length) {
      const cur = queue.shift();
      tree.push(cur);
      queue.push(...(children.get(cur) || []));
    }
    for (const id of tree.reverse()) {
      try {
        process.kill(id, "SIGTERM");
      } catch {
        /* already gone */
      }
    }
    sleep(800);
    for (const id of tree) {
      try {
        process.kill(id, "SIGKILL");
      } catch {
        /* already gone */
      }
    }
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

function processesOnPort(port) {
  return listeners().filter((l) => l.ports.includes(port));
}

function waitForPortFree(port, timeoutMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (processesOnPort(port).length === 0) return true;
    sleep(300);
  }
  return processesOnPort(port).length === 0;
}

/**
 * Free `port` for a new dev server. Kills processes bound to it that are
 * clearly Next.js dev servers (or owned by this project). Throws when an
 * unrelated process holds the port — we never kill what we can't prove ours.
 *
 * @returns {{ killed: number[], blockers: number[] }}
 */
export function freePort(port) {
  const killed = [];
  const blockers = [];
  for (const { pid } of processesOnPort(port)) {
    const cmd = processCommandLine(pid);
    if (isNextDev(cmd)) {
      logWarn(`Port ${port} held by stale Next dev server (PID ${pid}); killing it…`);
      killProcessTree(pid);
      killed.push(pid);
      // The worker's parent is the `next dev` CLI — stop it too so it can't respawn.
      const parent = parentPid(pid);
      if (parent && parent !== process.pid && isNextDevCli(processCommandLine(parent))) {
        logWarn(`Stopping its parent \`next dev\` CLI (PID ${parent})…`);
        killProcessTree(parent);
        killed.push(parent);
      }
    } else {
      logError(
        `Port ${port} is held by an unrelated process (PID ${pid}, cmd: ${cmd.slice(0, 90) || "unknown"}).`,
      );
      logError("Refusing to kill it. Stop that process or use --port to pick another.");
      blockers.push(pid);
    }
  }
  if (killed.length && !waitForPortFree(port)) {
    throw new Error(`Port ${port} is still in use after killing stale processes.`);
  }
  return { killed, blockers };
}

/** Stray Next dev servers currently holding any port (used for diagnostics). */
export function findStrayNextDevServers() {
  return listeners().filter((l) => isNextDev(processCommandLine(l.pid)));
}

// ---------------------------------------------------------------------------
// Cache cleanup
// ---------------------------------------------------------------------------

/** Remove a directory/file, refusing to touch anything outside the project. */
export function removePath(target) {
  const resolved = resolve(target);
  if (!existsSync(resolved)) return false;
  if (!resolved.startsWith(ROOT + sep)) {
    throw new Error(`Refusing to remove path outside project: ${resolved}`);
  }
  rmSync(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 });
  return true;
}

/** Wipe everything Turbopack/Next persists between runs (forces full re-compile). */
export function cleanCaches(extra = []) {
  const targets = [join(ROOT, ".next"), join(ROOT, "tsconfig.tsbuildinfo"), ...extra];
  for (const t of targets) {
    if (removePath(t)) logDim(`Removed ${t}`);
  }
}

// ---------------------------------------------------------------------------
// Dev server lifecycle
// ---------------------------------------------------------------------------

/**
 * Boot `next dev --turbopack`, tee output to `logFile` (append with a header),
 * and resolve when Next prints "Ready in".
 */
export async function startDevServer({ port, readyTimeoutMs = 120_000, logFile }) {
  if (!existsSync(NEXT_BIN)) {
    throw new Error(
      "next not found — run `npm install` first (expected at node_modules/next/dist/bin/next).",
    );
  }

  const child = spawn(
    process.execPath,
    [NEXT_BIN, "dev", "--turbopack", "--port", String(port), "-H", "0.0.0.0"],
    { cwd: ROOT, env: process.env, stdio: ["ignore", "pipe", "pipe"] },
  );

  let logStream = null;
  if (logFile) {
    const { createWriteStream } = await import("node:fs");
    logStream = createWriteStream(logFile, { flags: "a" });
    logStream.write(`\n===== next dev run ${new Date().toISOString()} =====\n`);
    child.stdout.pipe(logStream);
    child.stderr.pipe(logStream);
  }

  const ready = waitForReady(child, readyTimeoutMs);

  return {
    child,
    ready,
    dispose: () => {
      try {
        logStream?.end();
      } catch {
        /* ignore */
      }
    },
  };
}

function waitForReady(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finalize = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdout?.off("data", onOut);
      child.stderr?.off("data", onErr);
      child.off("exit", onExit);
    };
    const timer = setTimeout(() => {
      finalize();
      reject(new Error(`Dev server did not become ready within ${Math.round(timeoutMs / 1000)}s. See dev-server.log.`));
    }, timeoutMs);

    const settle = (err) => {
      if (settled) return;
      if (err) reject(err);
      else resolve();
      finalize();
    };

    function check(s) {
      if (settled) return;
      if (s.includes("Ready in")) {
        settle();
      } else if (s.includes("Another next dev server is already running.")) {
        settle(new Error("Another Next dev server is already running on this project. Run `npm run dev:clean` to reset."));
      }
    }
    const onOut = (buf) => check(buf.toString());
    const onErr = (buf) => check(buf.toString());
    const onExit = (code, sig) =>
      settle(new Error(`Dev server exited before ready (code ${code}${sig ? `, signal ${sig}` : ""}).`));

    child.stdout?.on("data", onOut);
    child.stderr?.on("data", onErr);
    child.on("exit", onExit);
  });
}

// ---------------------------------------------------------------------------
// Routing + warm-up
// ---------------------------------------------------------------------------

export function collectPageFiles(appDir, acc = []) {
  for (const entry of readdirSync(appDir, { withFileTypes: true })) {
    const full = join(appDir, entry.name);
    if (entry.name.startsWith(".")) continue;
    if (entry.isDirectory()) collectPageFiles(full, acc);
    else if (entry.name === "page.tsx" || entry.name === "page.ts") acc.push(full);
  }
  return acc;
}

export const APP_DIR = () => join(ROOT, "src", "app");

/** Convert a page file path into its URL path (substituting param segments). */
export function toUrlPath(appDir, pageFile) {
  const rel = dirname(pageFile)
    .slice(appDir.length)
    .split(sep)
    .filter(Boolean)
    .map((seg) => (seg.includes("[") ? "__warm__" : seg))
    .filter((seg) => !(seg.startsWith("(") && seg.endsWith(")")));
  return "/" + rel.join("/");
}

/**
 * Log in through better-auth and return a session cookie string.
 * Throws when credentials are wrong or the account uses SSO/LDAP.
 */
export async function login(baseUrl, email, password) {
  const res = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ email, password }),
    redirect: "manual",
  });
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  if (!res.ok || setCookies.length === 0) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body.message || "";
    } catch {
      /* ignore */
    }
    throw new Error(
      `Login failed (HTTP ${res.status})${detail ? `: ${detail}` : ""}. ` +
        "If your account uses SSO/LDAP you cannot warm programmatically — set WARM_EMAIL/WARM_PASSWORD to a local account.",
    );
  }
  return setCookies.map((c) => c.split(";")[0]).join("; ");
}

function fetchWithTimeout(url, options, timeoutMs, signal) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  });
}

/**
 * Request every route once so Turbopack compiles it (persistently cached).
 * Returns a timing summary plus routes that took longer than slowThresholdMs.
 */
export async function warmRoutes({
  baseUrl,
  pages,
  cookie = "",
  concurrency = 2,
  signal,
  requestTimeoutMs = 180_000,
  slowThresholdMs = 5_000,
  onResult,
}) {
  const startedAt = Date.now();
  let requestMs = 0;
  const slow = [];
  const errors = [];
  const queue = [...pages];

  const worker = async () => {
    while (queue.length) {
      if (signal?.aborted) return;
      const path = queue.shift();
      const t0 = performance.now();
      try {
        const res = await fetchWithTimeout(
          baseUrl + path,
          { headers: cookie ? { Cookie: cookie } : {}, redirect: "manual" },
          requestTimeoutMs,
          signal,
        );
        const ms = Math.round(performance.now() - t0);
        requestMs += ms;
        onResult?.({ path, ms, status: res.status, error: null });
        if (ms > slowThresholdMs) slow.push({ path, ms });
      } catch (err) {
        const ms = Math.round(performance.now() - t0);
        requestMs += ms;
        errors.push({ path, message: err?.message || String(err) });
        onResult?.({ path, ms, status: null, error: err?.message || String(err) });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

  return {
    seconds: (Date.now() - startedAt) / 1000,
    requestMs: Math.round(requestMs),
    total: pages.length,
    slow,
    errors,
  };
}

/** True when both an email and password are provided for warm-up login. */
export function hasCredentials(email, password) {
  return (
    typeof email === "string" && email.length > 0 &&
    typeof password === "string" && password.length > 0
  );
}