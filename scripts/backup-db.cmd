@echo off
REM ---------------------------------------------------------------------------
REM Runs the PostgreSQL backup. Register with Task Scheduler (see below):
REM
REM   schtasks /create /tn "AssetTracker-DB-Backup" ^
REM     /tr "\"%~f0\"" /sc daily /st 23:00 /ru SYSTEM /rl HIGHEST /f
REM
REM Logs are appended to .\backups\backup.log
REM ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0.."
if not exist "backups" mkdir "backups"
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\backup-db.ps1" >> "backups\backup.log" 2>&1
endlocal
