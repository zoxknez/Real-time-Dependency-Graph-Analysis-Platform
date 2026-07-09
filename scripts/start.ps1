# IDP Platform Startup Script (PowerShell)
# Usage: .\scripts\start.ps1 [-Mode dev|prod|infra-only]

param(
    [string]$Mode = "dev"
)

$ErrorActionPreference = "Stop"

$COMPOSE_FILE = "docker-compose.yml"
$OVERRIDE_COMPOSE_FILE = "docker-compose.override.yml"
$APPS_COMPOSE_FILE = "docker-compose.apps.yml"
$AppComposeArgs = @("-f", $COMPOSE_FILE)
if (Test-Path $OVERRIDE_COMPOSE_FILE) {
    $AppComposeArgs += @("-f", $OVERRIDE_COMPOSE_FILE)
}
$AppComposeArgs += @("-f", $APPS_COMPOSE_FILE)

function Invoke-ComposeBuildSafe {
    param([string[]]$Arguments)

    $previousBake = $env:COMPOSE_BAKE
    $env:COMPOSE_BAKE = "false"

    try {
        docker compose @Arguments
    }
    finally {
        if ($null -eq $previousBake) {
            Remove-Item Env:\COMPOSE_BAKE -ErrorAction SilentlyContinue
        }
        else {
            $env:COMPOSE_BAKE = $previousBake
        }
    }
}

Write-Host "🚀 Starting IDP Platform in $Mode mode..." -ForegroundColor Cyan

switch ($Mode) {
    "infra-only" {
        Write-Host "Starting infrastructure services only..." -ForegroundColor Blue
        docker compose -f $COMPOSE_FILE up -d
    }
    
    "dev" {
        Write-Host "Starting infrastructure + development mode..." -ForegroundColor Blue
        docker compose -f $COMPOSE_FILE up -d
        
        Write-Host ""
        Write-Host "Infrastructure is ready! Start development services manually:" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  # Terminal 1: API"
        Write-Host "  cd apps\api; cargo run"
        Write-Host ""
        Write-Host "  # Terminal 2: Frontend"
        Write-Host "  cd apps\frontend; npm run dev"
        Write-Host ""
        Write-Host "  # Terminal 3: Ingestion (optional)"
        Write-Host "  cd apps\ingestion; cargo run"
        Write-Host ""
    }
    
    "prod" {
        Write-Host "Starting full production stack..." -ForegroundColor Blue
        Invoke-ComposeBuildSafe -Arguments ($AppComposeArgs + @("up", "-d", "--build"))
    }
    
    "monitoring" {
        Write-Host "Starting with monitoring stack..." -ForegroundColor Blue
        Invoke-ComposeBuildSafe -Arguments ($AppComposeArgs + @("--profile", "monitoring", "up", "-d", "--build"))
    }
    
    default {
        Write-Host "Unknown mode: $Mode" -ForegroundColor Red
        Write-Host "Usage: .\scripts\start.ps1 [-Mode dev|prod|infra-only|monitoring]"
        exit 1
    }
}

Write-Host ""
Write-Host "✅ Startup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Service URLs:" -ForegroundColor Cyan
Write-Host "  - API:              http://localhost:8000/graphql"
Write-Host "  - GraphQL Playground: http://localhost:8000/graphql"
Write-Host "  - Frontend:         http://localhost:3000"
Write-Host "  - Redpanda Console: http://localhost:18080"
Write-Host '  - Memgraph Lab:     http://localhost:3002'
Write-Host "  - RisingWave:       http://localhost:5691"
Write-Host "  - Qdrant:           http://localhost:6333"
Write-Host "  - Jaeger:           http://localhost:16686"
Write-Host ""
Write-Host "🔍 Check logs:" -ForegroundColor Yellow
Write-Host "  docker compose logs -f [service-name]"
Write-Host ""
