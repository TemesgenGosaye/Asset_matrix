#!/usr/bin/env node
/**
 * Boot the PM2-managed app (msf-portal) after a reboot or a power loss.
 *
 * PM2 survives crashes but not a power cut: when the machine comes back, this
 * script is what puts the app online again. It is idempotent and safe to run
 * by hand at any time.
 *
 * Steps:
 *   1. wait for the database host to accept TCP connections (the app talks to
 *      a remote PostgreSQL, and booting before the network is up means a
 *      crash-loop);
 *   2. `pm2 resurrect` to restore the saved process list;
 *   3. if the app is not in the list, `pm2 start ecosystem.config.cjs` instead;
 *   4. restart the app if it is present but not online;
 *   5. refresh the PM2 dump with `pm2 save`.
 *
 * Everything is appended to .pm2/boot.log so a failed boot can be diagnosed
 * after the fact.
 *
 * PM2_HOME is pinned to ./.pm2 so the daemon state, logs and the saved
 * process list stay inside the project.
 */
import { spawn } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
} from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PM2_HOME = path.join(ROOT, ".pm2");
const LOG_FILE = path.join(PM2_HOME, "boot.log");
const ECOSYSTEM = path.join(ROOT, "ecosystem.config.cjs");
const LOCAL_PM2 = path.join(ROOT, "node_modules", "pm2", "bin", "pm2");
const APP_NAME = "msf-portal";

const DB_WAIT_TIMEOUT_MS = 5 * 60 * 1000;
const DB_POLL_INTERVAL_MS = 5_000;
const LOG_MAX_BYTES = 512 * 1024;

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  try {
    appendFileSync(LOG_FILE, `${line}\n`);
  } catch {
    // A missing log file must never stop the boot.
  }
}

function rotateLogIfNeeded() {
  try {
    if (!existsSync(LOG_FILE) || statSync(LOG_FILE).size < LOG_MAX_BYTES) return;
    renameSync(LOG_FILE, `${LOG_FILE}.1`);
  } catch {
    // Rotation is best effort.
  }
}

function pm2Env() {
  return {
    ...process.env,
    PM2_HOME,
    PATH: `${path.join(process.env.APPDATA || "", "npm")};${process.env.PATH}`,
  };
}

function runPm2(args, { timeoutMs = 120_000 } = {}) {
  const useLocal = existsSync(LOCAL_PM2);
  const command = useLocal ? process.execPath : "pm2";
  const commandArgs = useLocal ? [LOCAL_PM2, ...args] : args;

  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, {
      cwd: ROOT,
      env: pm2Env(),
      shell: !useLocal,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: `${stderr}\n${error.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        code: timedOut ? -1 : (code ?? -1),
        stdout,
        stderr: timedOut ? `${stderr}\nTimed out after ${timeoutMs} ms` : stderr,
      });
    });
  });
}

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function summarize(output) {
  return stripAnsi(output)
    .split(/\r?\n/)
    .filter((line) => line.trim() && !/[\u2500-\u257f]/.test(line))
    .join("\n")
    .trim();
}

async function listApps() {
  const result = await runPm2(["jlist"]);
  if (result.code !== 0) return [];
  try {
    const parsed = JSON.parse(stripAnsi(result.stdout));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readDatabaseTarget() {
  const envFile = path.join(ROOT, ".env");
  if (!existsSync(envFile)) return null;
  const match = readFileSync(envFile, "utf8").match(/^\s*DATABASE_URL\s*=\s*(.+)$/m);
  if (!match) return null;
  const raw = match[1].trim().replace(/^["']|["']$/g, "");
  try {
    const url = new URL(raw);
    return { host: url.hostname, port: Number(url.port || 5432) };
  } catch {
    return null;
  }
}

function canConnect(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const finish = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(5_000);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function waitForDatabase() {
  const target = readDatabaseTarget();
  if (!target) {
    log("No DATABASE_URL in .env - skipping the database wait.");
    return;
  }

  log(`Waiting for the database at ${target.host}:${target.port} ...`);
  const deadline = Date.now() + DB_WAIT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (await canConnect(target.host, target.port)) {
      log("Database is reachable.");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, DB_POLL_INTERVAL_MS));
  }

  log("Database still unreachable - starting anyway, PM2 will retry the app.");
}

async function main() {
  mkdirSync(PM2_HOME, { recursive: true });
  rotateLogIfNeeded();

  log("Boot sequence started.");
  await waitForDatabase();

  const resurrect = await runPm2(["resurrect"]);
  log(`pm2 resurrect exited with ${resurrect.code}.`);
  if (resurrect.stdout.trim()) log(summarize(resurrect.stdout));
  if (resurrect.stderr.trim()) log(summarize(resurrect.stderr));

  let apps = await listApps();
  let app = apps.find((entry) => entry.name === APP_NAME);

  if (!app) {
    log(`${APP_NAME} is not in the process list - starting it from ecosystem.config.cjs.`);
    const start = await runPm2(["start", ECOSYSTEM]);
    log(`pm2 start exited with ${start.code}.`);
    if (start.stdout.trim()) log(summarize(start.stdout));
    if (start.stderr.trim()) log(summarize(start.stderr));
    apps = await listApps();
    app = apps.find((entry) => entry.name === APP_NAME);
  } else if (app.pm2_env?.status !== "online") {
    log(`${APP_NAME} is ${app.pm2_env?.status} - restarting it.`);
    await runPm2(["restart", APP_NAME]);
    apps = await listApps();
    app = apps.find((entry) => entry.name === APP_NAME);
  } else {
    log(`${APP_NAME} is already online.`);
  }

  if (!app) {
    log(`FAILED: ${APP_NAME} could not be started.`);
    process.exitCode = 1;
    return;
  }

  await runPm2(["save"]);
  log(`${APP_NAME} is ${app.pm2_env?.status} (pid ${app.pid}, restarts ${app.pm2_env?.restart_time}).`);
  log("Boot sequence finished.");
}

main().catch((error) => {
  log(`Boot sequence crashed: ${error instanceof Error ? error.stack : String(error)}`);
  process.exitCode = 1;
});
