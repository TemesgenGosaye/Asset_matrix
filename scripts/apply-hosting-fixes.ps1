#Requires -RunAsAdministrator
param(
    [string]$PostgresVersion = "18",
    [string]$LanSubnet = "10.3.12.0/24",
    [switch]$SkipTailscale
)

$ErrorActionPreference = "Stop"

function Write-Step($message) {
    Write-Host ""
    Write-Host "==> $message" -ForegroundColor Cyan
}

Write-Step "Hardening PostgreSQL listen address"
$pgRoot = "C:\Program Files\PostgreSQL\$PostgresVersion"
$pgData = Join-Path $pgRoot "data"
$pgConf = Join-Path $pgData "postgresql.conf"
$pgService = "postgresql-x64-$PostgresVersion"

if (Test-Path $pgConf) {
    $backup = "$pgConf.bak-$(Get-Date -Format yyyyMMddHHmmss)"
    Copy-Item $pgConf $backup
    $text = Get-Content $pgConf -Raw
    if ($text -match "(?m)^\s*#?\s*listen_addresses\s*=.*$") {
        $text = [regex]::Replace($text, "(?m)^\s*#?\s*listen_addresses\s*=.*$", "listen_addresses = 'localhost'")
    } else {
        $text = $text.TrimEnd() + "`nlisten_addresses = 'localhost'`n"
    }
    [IO.File]::WriteAllText($pgConf, $text, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "listen_addresses set to 'localhost' (backup: $backup)"

    $service = Get-Service $pgService -ErrorAction SilentlyContinue
    if ($service) {
        if ($service.Status -eq "Running") {
            Restart-Service $pgService
        } else {
            & (Join-Path $pgRoot "bin\pg_ctl.exe") -D $pgData stop -m fast 2>$null
            Start-Sleep -Seconds 2
            Start-Service $pgService
        }
        (Get-Service $pgService).WaitForStatus("Running", "00:00:30")
        Write-Host "PostgreSQL service is running and listening on localhost only."
    }
} else {
    Write-Host "postgresql.conf not found at $pgConf - skipped." -ForegroundColor Yellow
}

Write-Step "Restricting port 3000 firewall rule"
$ruleName = "AssetTracker - TCP 3000"
$remote = @($LanSubnet, "100.64.0.0/10")
$rule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($rule) {
    Set-NetFirewallRule -DisplayName $ruleName -Enabled True -Direction Inbound -Action Allow -Profile Domain,Private
    Set-NetFirewallAddressFilter -AssociatedNetFirewallRule $rule -RemoteAddress $remote
    Write-Host "Updated '$ruleName' to allow $($remote -join ', ') on Domain/Private profiles."
} else {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Domain,Private -RemoteAddress $remote | Out-Null
    Write-Host "Created '$ruleName' to allow $($remote -join ', ') on Domain/Private profiles."
}

if (-not $SkipTailscale) {
    Write-Step "Installing Tailscale"
    $tailscale = "C:\Program Files\Tailscale\tailscale.exe"
    if (-not (Test-Path $tailscale)) {
        winget install --id Tailscale.Tailscale -e --silent --accept-package-agreements --accept-source-agreements
    }
    $tsService = Get-Service Tailscale -ErrorAction SilentlyContinue
    if ($tsService -and $tsService.Status -ne "Running") {
        Start-Service Tailscale
    }
}

Write-Step "Next steps"
Write-Host "1. Run: tailscale up"
Write-Host "2. Enable MagicDNS and HTTPS certificates in the Tailscale admin console."
Write-Host "3. Run: tailscale serve --bg 3000"
Write-Host "4. Read your name: tailscale status"
Write-Host "5. Run: node scripts/set-public-origin.mjs https://<your-name>.ts.net"
Write-Host "6. Run: npm run build"
Write-Host "7. Restart the app: npx pm2 restart msf-portal (or start it with the AssetTracker-Prod task)."
