$ErrorActionPreference = 'SilentlyContinue'

# Repairs the runtime before the production server is started.
#
# WHY THIS EXISTS
# Two failure modes kept taking the deployment down:
#
#   1. Postgres was left running as a detached user process while the service
#      manager still showed "Stopped". The service could not start because the
#      orphan owned port 5432, and a reboot then left the database down.
#
#   2. A postgres postmaster was killed while its child processes survived.
#      The children inherit the listening socket, so port 5432 stayed bound by
#      a server whose owner was gone: TCP connections were accepted and then
#      hung, and every database query timed out.
#
# Both cases end the same way - a bound 5432 with no healthy postmaster behind
# it - so this script clears any postgres process that is not the service's and
# hands the port back to the service manager.
#
# It runs as the scheduled task's identity, which has the rights to stop the
# orphaned processes and to start the service.

$logDir = Join-Path (Split-Path -Parent $PSScriptRoot) 'logs'
$logFile = Join-Path $logDir 'repair.log'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
function Write-RepairLog([string]$message) {
  Add-Content -Path $logFile -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $message"
}

$serviceName = 'postgresql-x64-18'

function Test-PortOpen([int]$port) {
  try {
    $c = New-Object System.Net.Sockets.TcpClient
    $ok = $c.ConnectAsync('127.0.0.1', $port).Wait(2500)
    $connected = $ok -and $c.Connected
    $c.Close()
    return $connected
  } catch {
    return $false
  }
}

$service = Get-Service $serviceName -ErrorAction SilentlyContinue

# The service is the source of truth: if it is not running, any postgres
# process on the box is an orphan and must go before the service can bind.
if ($service -and $service.Status -ne 'Running') {
  $orphans = @(Get-Process postgres -ErrorAction SilentlyContinue)
  foreach ($orphan in $orphans) {
    Stop-Process -Id $orphan.Id -Force -ErrorAction SilentlyContinue
    Write-RepairLog "stopped orphaned postgres pid $($orphan.Id)"
  }
  if ($orphans.Count -gt 0) { Start-Sleep -Seconds 5 }

  Start-Service $serviceName -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 10
  Write-RepairLog "started service $serviceName"
}

$service = Get-Service $serviceName -ErrorAction SilentlyContinue
$state = if ($service) { $service.Status } else { 'not installed' }
$portOpen = Test-PortOpen 5432
Write-RepairLog "postgres service $state, port 5432 open: $portOpen"
