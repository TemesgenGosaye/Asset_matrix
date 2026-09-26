@echo off
rem Production launcher for AssetTracker (Next.js standalone output).
rem Handles the standalone static-asset copy so a fresh build never breaks assets.
cd /d "%~dp0.."
if not exist "logs" mkdir logs
if exist ".next\static" robocopy ".next\static" ".next\standalone\.next\static" /E /NFL /NDL /NJH /NJS /NP >nul 2>&1
if exist "public" robocopy "public" ".next\standalone\public" /E /NFL /NDL /NJH /NJS /NP >nul 2>&1
set HOSTNAME=10.3.12.29
set PORT=3000
set NODE_ENV=production
rem The standalone server reads its own .env copy — keep it in sync with the project one.
copy /y ".env" ".next\standalone\.env" >nul 2>&1
node .next/standalone/server.js >> logs\prod.log 2>&1