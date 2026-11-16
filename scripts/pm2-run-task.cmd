@echo off
REM ---------------------------------------------------------------------------
REM Runs the "MSF Portal (PM2)" scheduled task on demand - the same path the
REM machine takes after a reboot or a power loss.
REM
REM Useful when the app is down and you want it back without touching PM2 by
REM hand. It asks for Administrator rights by itself, because the task runs as
REM SYSTEM.
REM
REM Output: .\.pm2\task-run.log
REM ---------------------------------------------------------------------------
setlocal
net session >nul 2>&1
if not %errorlevel%==0 (
  echo Requesting Administrator rights...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b 0
)

set "TASK_NAME=MSF Portal (PM2)"
set "LOG=%~dp0..\.pm2\task-run.log"

if not exist "%~dp0..\.pm2" mkdir "%~dp0..\.pm2"

schtasks /run /tn "%TASK_NAME%" >> "%LOG%" 2>&1
exit /b 0
