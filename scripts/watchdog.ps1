$ErrorActionPreference = 'SilentlyContinue'
$taskName = 'AssetTracker-Prod'
$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root 'logs'
$logFile = Join-Path $logDir 'watchdog.log'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

function Write-WatchdogLog([string]$message) {
  Add-Content -Path $logFile -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $message"
}

# ─── Database ────────────────────────────────────────────────────────────────
# The app is useless without Postgres, so the database is checked first: a dead
# postmaster makes every request fail, and a restarted app would then be killed
# by its own readiness check for the wrong reason.
$dbUp = $false
try {
  $c = New-Object System.Net.Sockets.TcpClient
  $ok = $c.ConnectAsync('127.0.0.1', 5432).Wait(3000)
  if ($ok -and $c.Connected) { $dbUp = $true }
  $c.Close()
} catch {}

if (-not $dbUp) {
  Start-Service postgresql-x64-18
  Start-Sleep -Seconds 10
  $dbUp = $false
  try {
    $c = New-Object System.Net.Sockets.TcpClient
    $ok = $c.ConnectAsync('127.0.0.1', 5432).Wait(3000)
    if ($ok -and $c.Connected) { $dbUp = $true }
    $c.Close()
  } catch {}
  Write-WatchdogLog "db down on 5432 - service postgresql-x64-18 start issued (now up: $dbUp)"
}

# ─── Application ─────────────────────────────────────────────────────────────
# A single slow probe is not an outage. This host's Node event loop routinely
# stalls for 15-22s under load (see next.config.mjs), so retry with a generous
# timeout before killing a process that is merely busy.
$appUp = $false
$probeAttempts = 3
$probeTimeoutSec = 30
for ($attempt = 0; $attempt -lt $probeAttempts -and -not $appUp; $attempt++) {
  try {
    $resp = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/health/live' -UseBasicParsing -TimeoutSec $probeTimeoutSec
    if ($resp.StatusCode -eq 200) { $appUp = $true }
  } catch {}
  if (-not $appUp -and $attempt -lt ($probeAttempts - 1)) { Start-Sleep -Seconds 3 }
}

if ($appUp) { exit 0 }
Write-WatchdogLog "liveness probe failed $probeAttempts times (${probeTimeoutSec}s timeout each)"

# The task can be "running" while the process behind it is a zombie: the port
# stays bound by an orphaned node process that no longer serves requests, and a
# fresh instance of the task then dies with EADDRINUSE. Restarting the task
# alone does not clear that, so any listener on :3000 that is not answering the
# liveness probe is stopped before the task is started again.
$listeners = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
foreach ($listener in $listeners) {
  $pidToKill = $listener.OwningProcess
  if ($pidToKill -and $pidToKill -ne $PID) {
    Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
    Write-WatchdogLog "cleared zombie listener pid $pidToKill on port 3000"
  }
}
if ($listeners) { Start-Sleep -Seconds 3 }

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($task -and $task.State -eq 'Running') {
  Stop-ScheduledTask -TaskName $taskName
  Start-Sleep -Seconds 5
}
Start-ScheduledTask -TaskName $taskName
Write-WatchdogLog "app not serving on port 3000 - restarted $taskName"
