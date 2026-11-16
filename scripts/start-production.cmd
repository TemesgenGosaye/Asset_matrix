@echo off
rem Production launcher for AssetTracker (Next.js standalone output).
rem Handles the standalone static-asset copy so a fresh build never breaks assets.
cd /d "%~dp0.."
if not exist "logs" mkdir logs
set HOSTNAME=0.0.0.0
set PORT=3000
set NODE_ENV=production
rem Repair the runtime first: hand port 5432 back to the postgres service when
rem an orphaned postmaster is holding it, so the database is up and owned by the
rem service manager before the server opens its first connection.
powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0repair-runtime.ps1" >> logs\repair.log 2>&1
rem The standalone server reads its own .env copy and runs from its own folder;
rem scripts\pm2-server.mjs prepares that folder and keeps the project root as cwd.
node scripts\pm2-server.mjs >> logs\prod.log 2>&1
