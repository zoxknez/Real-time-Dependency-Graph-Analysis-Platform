# Disk-safe Docker helper for the frontend service.
# Usage:
#   .\scripts\docker-frontend.ps1 -Task status
#   .\scripts\docker-frontend.ps1 -Task prune-build-cache
#   .\scripts\docker-frontend.ps1 -Task logs

[CmdletBinding()]
param(
    [ValidateSet("up", "status", "logs", "prune-build-cache")]
    [string]$Task = "status",

    [switch]$PruneBuildCache
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$BaseComposeFile = Join-Path $RepoRoot "docker-compose.yml"
$AppsComposeFile = Join-Path $RepoRoot "docker-compose.apps.yml"
$ComposeFiles = @("-f", $BaseComposeFile)
$OverrideComposeFile = Join-Path $RepoRoot "docker-compose.override.yml"

if (Test-Path $OverrideComposeFile) {
    $ComposeFiles += @("-f", $OverrideComposeFile)
}

$ComposeFiles += @("-f", $AppsComposeFile)

function Show-DockerDiskUsage {
    Write-Host ""
    Write-Host "Docker disk usage:" -ForegroundColor Cyan
    & docker system df
}

function Invoke-Compose {
    param([string[]]$Arguments)

    Push-Location $RepoRoot
    try {
        & docker compose @ComposeFiles @Arguments
    }
    finally {
        Pop-Location
    }
}

& docker version | Out-Null
Show-DockerDiskUsage

if ($Task -eq "prune-build-cache") {
    $PruneBuildCache = $true
}

if ($PruneBuildCache) {
    Write-Host ""
    Write-Host "Pruning Docker build cache..." -ForegroundColor Yellow
    & docker builder prune --all --force
    Show-DockerDiskUsage
}

switch ($Task) {
    "status" {
        Invoke-Compose -Arguments @("ps")
    }

    "logs" {
        Invoke-Compose -Arguments @("logs", "--tail=120", "frontend")
    }

    "up" {
        Invoke-Compose -Arguments @("up", "-d", "frontend")
        Invoke-Compose -Arguments @("ps", "frontend")
    }
}
