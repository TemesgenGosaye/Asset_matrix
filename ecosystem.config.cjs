/**
 * PM2 process definition for MSF Asset House Portal.
 *
 *   Start:   npx pm2 start ecosystem.config.cjs
 *   Reload:  npx pm2 reload msf-portal
 *   Logs:    npx pm2 logs msf-portal
 *
 * PM2 must be run with PM2_HOME pointing inside this project (./.pm2) so the
 * daemon state, logs and the saved process list stay self-contained on this
 * host. See the startup helper in scripts/.
 */
module.exports = {
  apps: [
    {
      name: "msf-portal",
      cwd: __dirname,
      // Next.js refuses `next start` with `output: "standalone"`, so the
      // standalone server is booted through a small wrapper that prepares the
      // standalone folder first. PM2 supervises that process directly, so
      // there is no cmd.exe shim in the process tree to signal on restart.
      script: "./scripts/pm2-server.mjs",
      interpreter: "node",

      instances: 1,
      exec_mode: "fork",

      // Supervision
      autorestart: true, // bring it back after a crash
      // A clean exit means the wrapper found another instance already serving
      // on :3000. Do not turn that into a restart loop against the same port.
      stop_exit_codes: [0],
      watch: false, // never watch files in production
      min_uptime: "15s", // must stay up 15s to count as a good start
      max_restarts: 10, // stop flapping after 10 rapid failures
      restart_delay: 4000, // wait 4s between restarts
      max_memory_restart: "1200M", // recycle if RAM grows past this
      kill_timeout: 10000, // allow 10s for a graceful shutdown on stop

      time: true, // timestamp every log line
      merge_logs: true,
      max_log_size: 10, // cap each log file at 10 MB (pm2-logrotate is Linux-only)

      env: {
        NODE_ENV: "production",
        PORT: 3000,
        HOSTNAME: "0.0.0.0",
      },
    },
  ],
};
