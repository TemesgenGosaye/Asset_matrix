@echo off
REM ---------------------------------------------------------------------------
REM Runs a PM2 command with Administrator rights.
REM
REM The production daemon runs as SYSTEM (see scripts\pm2-install-task.cmd), and
REM a normal PM2 command cannot connect to that daemon - it fails with
REM "connect EPERM \\.\pipe\rpc.sock". This wrapper elevates the command, which
REM is enough to talk to the daemon.
REM
REM Usage:
REM   scripts\pm2-ctl.cmd list
REM   scripts\pm2-ctl.cmd status
REM   scripts\pm2-ctl.cmd logs msf-portal --lines 100
REM   scripts\pm2-ctl.cmd reload msf-portal --update-env
REM   scripts\pm2-ctl.cmd restart msf-portal
REM   scripts\pm2-ctl.cmd save
REM   scripts\pm2-ctl.cmd monit
REM ---------------------------------------------------------------------------
setlocal
net session >nul 2>&1
if not %errorlevel%==0 (
  powershell -NoProfile -Command "Start-Process -FilePath 'cmd.exe' -ArgumentList '/c `"%~f0`" %*' -Verb RunAs"
  exit /b 0
)

cd /d "%~dp0.."
set "PM2_HOME=%CD%\.pm2"
set "PATH=C:\Program Files\nodejs;%APPDATA%\npm;%PATH%"

if exist "node_modules\pm2\bin\pm2" (
  node "node_modules\pm2\bin\pm2" %*
) else (
  pm2 %*
)

endlocal
