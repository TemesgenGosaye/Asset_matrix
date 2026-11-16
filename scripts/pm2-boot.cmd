@echo off
REM ---------------------------------------------------------------------------
REM Restores the PM2-managed app (msf-portal) after a reboot / power loss.
REM
REM Register once with scripts\pm2-install-task.cmd (it elevates itself and
REM creates the "MSF Portal (PM2)" Task Scheduler job), or manually:
REM   schtasks /create /tn "MSF Portal (PM2)" ^
REM     /tr "\"%~f0\"" /sc onstart /ru SYSTEM /rl HIGHEST /delay 0001:00 /f
REM
REM PM2 state (process dump + logs) is kept inside the project in .\.pm2 via
REM PM2_HOME, so the saved process list travels with the checkout.
REM
REM The real work is in scripts\pm2-boot.mjs: it waits for the database,
REM resurrects the process list, starts the app if it is missing and writes
REM .\.pm2\boot.log.
REM ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0.."
set "PM2_HOME=%CD%\.pm2"
set "PATH=C:\Program Files\nodejs;%APPDATA%\npm;%PATH%"

node "scripts\pm2-boot.mjs"

endlocal
