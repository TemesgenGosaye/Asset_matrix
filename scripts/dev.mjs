#!/usr/bin/env node
/**
 * Production-grade Next.js dev runner.
 *
 *   npm run dev        # start Turbopack dev server, then pre-compile all routes
 *   npm run dev:clean  # kill stale dev servers, wipe .next, then dev + pre-compile
 *
 * Why: Turbopack compiles routes lazily on first request ("on-demand
 * compilation"). On a large app the first hit of a heavy route can stall for
 * minutes. This runner compiles every route once at startup into Turbopack's
 * persistent cache, so no page ever waits for an on-demand bundle again.
 *
 * Options:
 *   --clean            Kill stale Next dev servers and wipe .next first
 *   --no-warm          Do not pre-compile routes on startup
 *   --port <n>         Dev server port (default: $PORT or 3000)
 *   --email <value>    Login for warming authenticated routes (or WARM_EMAIL)
 *   --password <value> Login for warming authenticated routes (or WARM_PASSWORD)
 *   --concurrency <n>  Parallel warm requests (default: 2)
 *   --timeout <ms>     Max wait for "Ready in" (default: 120000)
 *   --no-log           Do not tee server output to dev-server.log
 *   --help             Show this help
 */
import "dotenv/config";
import { join } from "node:path";
import {
  APP_DIR,
  ROOT,
  cleanCaches,
  collectPageFiles,
  color,
  findStrayNextDevServers,
  freePort,
  hasCredentials,
  isNextDev,
  listeners,
  logDim,
  logError,
  logInfo,
  logOk,
  logWarn,
  login,
  processCommandLine,
  startDevServer,
  toUrlPath,
  warmRoutes,
} from "./lib/turbopack-dev.mjs";

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);

function parseArgs(args) {
  const opts = {
    clean: false,
    warm: true,
    port: Number(process.env.PORT) || 3000,
    email: process.env.WARM_EMAIL || "",
    password: process.env.WARM_PASSWORD || "",
    concurrency: Number(process.env.WARM_CONCURRENCY) || 2,
    timeout: 120_000,
    log: true,
    help: false,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const [flag, inline] = arg.split("=");
    const value = inline !== undefined ? inline : args[i + 1];
    const takeValue = () => {
      if (inline !== undefined) return inline;
      i += 1;
      return args[i];
    };
    switch (flag) {
      case "--clean":
        opts.clean = true;
        break;
      case "--no-clean":
        opts.clean = false;
        break;
      case "--warm":
        opts.warm = true;
        break;
      case "--no-warm":
        opts.warm = false;
        break;
      case "--no-log":
        opts.log = false;
        break;
      case "--port":
        opts.port = Number(takeValue());
        break;
      case "--email":
        opts.email = takeValue() || "";
        break;
      case "--password":
        opts.password = takeValue() || "";
        break;
      case "--concurrency":
        opts.concurrency = Number(takeValue());
        break;
      case "--timeout":
        opts.timeout = Number(takeValue());
        break;
      case "--help":
      case "-h":
        opts.help = true;
        break;
      default:
        logWarn(`Ignoring unknown argument: ${arg}`);
    }
    void value;
  }
  return opts;
}

const HELP = `
${color("1", "Next.js + Turbopack dev runner")}

  node scripts/dev.mjs [options]

  --clean            Kill stale Next dev servers and wipe .next first
  --no-warm          Skip pre-compiling routes on startup
  --port <n>         Dev server port (default: $PORT or 3000)
  --email <value>    Login for authenticated warm-up (or WARM_EMAIL)
  --password <value> Login for authenticated warm-up (or WARM_PASSWORD)
  --concurrency <n>  Parallel warm requests (default: 2)
  --timeout <ms>     Max wait for "Ready in" (default: 120000)
  --no-log           Do not tee server output to dev-server.log
  --help             Show this help
`;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const opts = parseArgs(argv);

if (opts.help) {
  console.log(HELP);
  process.exit(0);
}

if (!Number.isInteger(opts.port) || opts.port < 1 || opts.port > 65535) {
  logError(`Invalid port: ${opts.port}`);
  process.exit(1);
}
if (!Number.isInteger(opts.concurrency) || opts.concurrency < 1) {
  opts.concurrency = 2;
}
if (Boolean(opts.email) !== Boolean(opts.password)) {
  logError("Provide both --email and --password (or WARM_EMAIL + WARM_PASSWORD).");
  process.exit(1);
}

const baseUrl = `http://localhost:${opts.port}`;
const logFile = opts.log ? join(ROOT, "dev-server.log") : null;
const abort = new AbortController();

/** Find a process listening on `port`, returning its identity. */
function processOnPort(port) {
  const listener = listeners().find((l) => l.ports.includes(port));
  if (!listener) return null;
  const cmd = processCommandLine(listener.pid);
  return { ...listener, cmd, isNext: isNextDev(cmd) };
}

// ---------------------------------------------------------------------------
// Warm-up
// ---------------------------------------------------------------------------

const PUBLIC_PREFIXES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/set-password",
  "/terms",
  "/privacy",
  "/api-docs",
  "/mfa-verify",
  "/invite",
  "/help",
];

function isPublicRoute(path) {
  return (
    path === "/" ||
    PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p + "/")) ||
    path.startsWith("/__warm__")
  );
}

async function runWarm() {
  const appDir = APP_DIR();
  let pages = collectPageFiles(appDir).map((f) => toUrlPath(appDir, f)).sort();
  let cookie = "";

  const total = pages.length;
  logInfo(`Pre-compiling ${total} routes (Turbopack on-demand compilation)…`);
  logDim(`Log: ${logFile || "console only"}`);

  if (hasCredentials(opts.email, opts.password)) {
    logInfo("Signing in to pre-compile authenticated routes…");
    cookie = await login(baseUrl, opts.email, opts.password);
  } else {
    logWarn("No WARM_EMAIL/WARM_PASSWORD set — pre-compiling public routes only.");
    logWarn("Set them (or run `npm run dev:warm`) to pre-compile authenticated pages.");
    pages = pages.filter(isPublicRoute);
  }

  let done = 0;
  const result = await warmRoutes({
    baseUrl,
    pages,
    cookie,
    concurrency: opts.concurrency,
    signal: abort.signal,
    onResult: ({ path, ms, status, error }) => {
      done += 1;
      if (error) {
        logError(`${path} — ${error}`);
      } else if (ms > 15_000) {
        logWarn(`slow ${String(ms).padStart(7)}ms  ${status}  ${path}`);
      }
      if (done % 10 === 0 || done === pages.length) {
        logDim(`compiled ${done}/${pages.length}…`);
      }
    },
  });

  logOk(
    `Warm-up finished in ${result.seconds.toFixed(1)}s (${result.requestMs}ms total request time).`,
  );
  if (result.slow.length) {
    logInfo(`Routes that needed a first compile (>5s):`);
    for (const { path, ms } of result.slow.sort((a, b) => b.ms - a.ms)) {
      logInfo(`  ${String(ms).padStart(7)}ms  ${path}`);
    }
  }
  if (result.errors.length) {
    logWarn(`${result.errors.length} route(s) could not be warmed (see above).`);
  }
  logOk("All routes compiled — Turbopack will no longer bundle on demand on first visit.");
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

async function main() {
  const existing = processOnPort(opts.port);

  if (existing && !opts.clean) {
    if (existing.isNext) {
      logWarn(`A Next dev server is already running on ${baseUrl} (PID ${existing.pid}) — reusing it.`);
      if (opts.warm) {
        try {
          await runWarm();
        } catch (err) {
          logError(`Warm-up skipped: ${err.message}`);
        }
      }
      process.exit(0);
    }
    logError(`Port ${opts.port} is in use by an unrelated process (PID ${existing.pid}).`);
    logError(`  cmd: ${existing.cmd.slice(0, 120) || "unknown"}`);
    logError("Stop it, or run with --port <n>.");
    process.exit(1);
  }

  if (opts.clean) {
    logInfo("Clean start: stopping stale dev servers and wiping Turbopack caches…");
    const { blockers } = freePort(opts.port);
    if (blockers.length) {
      logError("Refusing to continue while the port is held by another process.");
      process.exit(1);
    }
    const strays = findStrayNextDevServers().filter((s) => !blockers.includes(s.pid));
    for (const s of strays) {
      logWarn(`Stray Next dev server still running (PID ${s.pid}, ports ${s.ports.join(", ")}).`);
    }
    cleanCaches();
  }

  logInfo(`Starting next dev --turbopack on port ${opts.port}…`);
  const server = await startDevServer({
    port: opts.port,
    readyTimeoutMs: opts.timeout,
    logFile,
  });
  const { child, ready, dispose } = server;

  let shuttingDown = false;
  const shutdown = (code = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logWarn("Stopping dev server…");
    abort.abort();
    try {
      child.kill("SIGINT");
    } catch {
      /* already gone */
    }
    const force = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* already gone */
      }
      process.exit(code);
    }, 3000);
    force.unref();
  };

  child.on("exit", (code, signal) => {
    dispose();
    if (!shuttingDown) {
      logWarn(`Dev server exited (code ${code}${signal ? `, ${signal}` : ""}).`);
    }
    process.exit(code ?? (shuttingDown ? 0 : 1));
  });

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));

  try {
    await ready;
  } catch (err) {
    logError(err.message);
    dispose();
    try {
      child.kill("SIGKILL");
    } catch {
      /* already gone */
    }
    process.exit(1);
  }

  logOk(`Dev server ready at ${baseUrl}`);

  if (opts.warm) {
    try {
      await runWarm();
    } catch (err) {
      logError(`Warm-up failed: ${err.message}`);
      logWarn("The dev server is still running; the first visit to each route may compile on demand.");
    }
  } else {
    logWarn("Warm-up disabled (--no-warm) — heavy routes will still compile on first visit.");
  }

  logOk(`Ready. Press Ctrl+C to stop.`);
}

main().catch((err) => {
  logError(err?.stack || String(err));
  process.exit(1);
});
