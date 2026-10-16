#!/usr/bin/env node
/**
 * Production server startup script for network access
 * Starts the standalone Next.js server on all network interfaces
 */

const { spawn } = require("child_process");
const path = require("path");

const serverPath = path.join(__dirname, ".next", "standalone", "server.js");

console.log("Starting production server on all network interfaces...");

const server = spawn("node", [serverPath], {
  cwd: __dirname,
  env: {
    ...process.env,
    HOST: "0.0.0.0",
    PORT: "3000",
  },
  stdio: "inherit",
});

server.on("error", (err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

server.on("exit", (code) => {
  console.log(`Server exited with code ${code}`);
  process.exit(code);
});

process.on("SIGINT", () => {
  console.log("Stopping server...");
  server.kill("SIGINT");
});

process.on("SIGTERM", () => {
  console.log("Stopping server...");
  server.kill("SIGTERM");
});
