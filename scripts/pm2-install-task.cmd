@echo off
REM ---------------------------------------------------------------------------
REM Installs the "MSF Portal (PM2)" Task Scheduler job that brings the app back
REM after a reboot or a power loss.
REM
REM Run it once (it asks for Administrator rights by itself):
REM   scripts\pm2-install-task.cmd
REM
REM The job runs scripts\pm2-boot.cmd as SYSTEM at every boot, one minute after
REM Windows starts, so the network and the remote database are reachable before
REM PM2 brings the app online.
REM
REM The output is written to .\.pm2\task-install.log.
REM ---------------------------------------------------------------------------
setlocal
net session >nul 2>&1
if not %errorlevel%==0 (
  echo Requesting Administrator rights...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b 0
)

set "BOOT_CMD=%~dp0pm2-boot.cmd"
set "TASK_NAME=MSF Portal (PM2)"
set "LOG=%~dp0..\.pm2\task-install.log"

if not exist "%~dp0..\.pm2" mkdir "%~dp0..\.pm2"

echo Registering "%TASK_NAME%" ... > "%LOG%"
schtasks /create /tn "%TASK_NAME%" /tr "\"%BOOT_CMD%\"" /sc onstart /ru SYSTEM /rl HIGHEST /delay 0001:00 /f >> "%LOG%" 2>&1
if errorlevel 1 (
  echo. >> "%LOG%"
  echo FAILED to create the task. >> "%LOG%"
  exit /b 1
)

echo. >> "%LOG%"
echo Task created. >> "%LOG%"

powershell -NoProfile -Command "$s = (Get-ScheduledTask -TaskName '%TASK_NAME%').Settings; $s.RestartCount = 3; $s.RestartInterval = 'PT1M'; $s.ExecutionTimeLimit = 'PT0S'; $s.StartWhenAvailable = $true; $s.DisallowStartIfOnBatteries = $false; $s.StopIfGoingOnBatteries = $false; $s.MultipleInstances = 'IgnoreNew'; Set-ScheduledTask -TaskName '%TASK_NAME%' -Settings $s" >> "%LOG%" 2>&1

echo. >> "%LOG%"
echo Task settings applied. >> "%LOG%"
schtasks /query /tn "%TASK_NAME%" /v /fo LIST >> "%LOG%" 2>&1
exit /b 0
