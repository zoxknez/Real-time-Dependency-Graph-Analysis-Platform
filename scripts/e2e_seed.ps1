# E2E Seed Test Script
# Tests the ingestion seed mode with real PyPI and Cargo packages

param(
    [switch]$SkipDocker,
    [string]$PypiPackages = "requests,flask",
    [string]$CargoCrates = "tokio,serde"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  E2E Seed Mode Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Set PROTOC
$env:PROTOC = "C:\Users\o0o0o0o\AppData\Local\Microsoft\WinGet\Packages\Google.Protobuf_Microsoft.Winget.Source_8wekyb3d8bbwe\bin\protoc.exe"

# Check Docker if needed
if (-not $SkipDocker) {
    Write-Host "[1/5] Starting Docker services..." -ForegroundColor Yellow
    docker compose up -d postgres redpanda 2>&1 | Out-Null
    Start-Sleep -Seconds 5
} else {
    Write-Host "[1/5] Skipping Docker (assuming services are running)..." -ForegroundColor Yellow
}

# Build
Write-Host "[2/5] Building ingestion..." -ForegroundColor Yellow
Push-Location $PSScriptRoot\..
cargo build -p ingestion 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}
Pop-Location

# Run seed mode
Write-Host "[3/5] Running seed mode..." -ForegroundColor Yellow
Write-Host "  PyPI: $PypiPackages" -ForegroundColor Gray
Write-Host "  Cargo: $CargoCrates" -ForegroundColor Gray
Write-Host ""

$seedOutput = & cargo run -p ingestion -- --mode seed --registry all --seed-pypi $PypiPackages --seed-cargo $CargoCrates 2>&1
$seedOutput | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) {
    Write-Host "Seed mode failed!" -ForegroundColor Red
    exit 1
}

# Check database
Write-Host ""
Write-Host "[4/5] Checking database state..." -ForegroundColor Yellow

$dbUrl = $env:DATABASE_URL
if (-not $dbUrl) {
    $dbUrl = "postgres://postgres:postgres@localhost:5432/inversedeps"
}

# Check PyPI state
Write-Host ""
Write-Host "PyPI Package State:" -ForegroundColor Cyan
$pypiPackagesList = $PypiPackages -split ","
$pypiQuery = "SELECT package_name, last_version, COALESCE(jsonb_array_length(versions_json), 0) as version_count FROM pypi_package_state WHERE package_name IN ('$($pypiPackagesList -join "','")')"

docker exec -i realtime3u1-postgres-1 psql -U postgres -d inversedeps -c "$pypiQuery" 2>&1

# Check Cargo state
Write-Host ""
Write-Host "Cargo Package State:" -ForegroundColor Cyan
$cargoCratesList = $CargoCrates -split ","
$cargoQuery = "SELECT crate_name, last_version, COALESCE(jsonb_array_length(versions_json), 0) as version_count FROM cargo_package_state WHERE crate_name IN ('$($cargoCratesList -join "','")')"

docker exec -i realtime3u1-postgres-1 psql -U postgres -d inversedeps -c "$cargoQuery" 2>&1

# Check outbox
Write-Host ""
Write-Host "Outbox Events (last 10):" -ForegroundColor Cyan
$outboxQuery = "SELECT topic, partition_key, status, created_at FROM ingestion_outbox ORDER BY created_at DESC LIMIT 10"
docker exec -i realtime3u1-postgres-1 psql -U postgres -d inversedeps -c "$outboxQuery" 2>&1

# Summary
Write-Host ""
Write-Host "[5/5] Summary" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan

$pypiCount = docker exec -i realtime3u1-postgres-1 psql -U postgres -d inversedeps -t -c "SELECT COUNT(*) FROM pypi_package_state" 2>&1
$cargoCount = docker exec -i realtime3u1-postgres-1 psql -U postgres -d inversedeps -t -c "SELECT COUNT(*) FROM cargo_package_state" 2>&1
$outboxCount = docker exec -i realtime3u1-postgres-1 psql -U postgres -d inversedeps -t -c "SELECT COUNT(*) FROM ingestion_outbox WHERE status = 'pending'" 2>&1

Write-Host "  PyPI packages in state:   $($pypiCount.Trim())" -ForegroundColor Green
Write-Host "  Cargo crates in state:    $($cargoCount.Trim())" -ForegroundColor Green
Write-Host "  Pending outbox events:    $($outboxCount.Trim())" -ForegroundColor Green
Write-Host ""
Write-Host "Seed mode completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Run OutboxPublisher to push events to Kafka"
Write-Host "  2. Run graph-writer to consume events and build graph"
Write-Host "  3. Query the API to see the data"
Write-Host ""
