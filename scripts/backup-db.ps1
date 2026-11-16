<#
.SYNOPSIS
    Creates a PostgreSQL backup of the Asset Tracker database using pg_dump.

.DESCRIPTION
    Reads DATABASE_URL from .env (or -DbUrl), writes a compressed custom-format
    dump to .\backups, and deletes dumps older than -KeepDays.

    Restore with:
        & "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" `
            --clean --if-exists --no-owner --no-privileges `
            --dbname "postgresql://postgres:PASSWORD@localhost:5432/msfhousedb" `
            "backups\msfhousedb-YYYYMMDD-HHMMSS.dump"

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\backup-db.ps1
#>
param(
    [string]$DbUrl,
    [string]$OutDir,
    [int]$KeepDays = 14
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
if (-not $OutDir) { $OutDir = Join-Path $Root "backups" }

if (-not $DbUrl) {
    $envFile = Join-Path $Root ".env"
    if (-not (Test-Path $envFile)) { throw "No .env found at $envFile" }
    $line = Get-Content $envFile |
        Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } |
        Select-Object -First 1
    if (-not $line) { throw "DATABASE_URL not found in .env" }
    $DbUrl = ($line -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"').Trim("'")
}

$pgDump = (Get-Command pg_dump.exe -ErrorAction SilentlyContinue).Source
if (-not $pgDump) {
    $found = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\pg_dump.exe" -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending
    if ($found) { $pgDump = $found[0].FullName }
}
if (-not $pgDump) { throw "pg_dump.exe not found. Install PostgreSQL client tools or add them to PATH." }

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outFile = Join-Path $OutDir "msfhousedb-$stamp.dump"

Write-Host "==> Dumping database to $outFile"
& $pgDump --format=custom --no-owner --no-privileges --file=$outFile $DbUrl
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE" }

$sizeMb = [math]::Round((Get-Item $outFile).Length / 1MB, 2)
Write-Host "==> Backup OK ($sizeMb MB)"

$cutoff = (Get-Date).AddDays(-$KeepDays)
Get-ChildItem $OutDir -Filter "msfhousedb-*.dump" -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt $cutoff } |
    ForEach-Object {
        Write-Host "==> Removing old backup $($_.Name)"
        Remove-Item $_.FullName -Force
    }

Write-Host "==> Done. Backups older than $KeepDays days were pruned."
