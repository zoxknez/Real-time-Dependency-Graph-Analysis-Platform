# ═══════════════════════════════════════════════════════════════
# Smoke Test Script for IDP API Gateway (PowerShell)
# 
# Usage: .\scripts\smoke-test.ps1 [-ApiUrl "http://localhost:8000"]
#
# Exit codes:
#   0 - All critical tests passed
#   1 - One or more critical tests failed
# ═══════════════════════════════════════════════════════════════

param(
    [string]$ApiUrl = $env:API_URL ?? "http://localhost:8000",
    [int]$Timeout = 5,
    [switch]$Verbose
)

$ErrorActionPreference = "Continue"

# Counters
$script:Passed = 0
$script:Failed = 0
$script:Warnings = 0

# ═══════════════════════════════════════════════════════════════
# Helper Functions
# ═══════════════════════════════════════════════════════════════

function Write-Pass {
    param([string]$Message)
    Write-Host "✅ PASS: " -ForegroundColor Green -NoNewline
    Write-Host $Message
    $script:Passed++
}

function Write-Fail {
    param([string]$Message)
    Write-Host "❌ FAIL: " -ForegroundColor Red -NoNewline
    Write-Host $Message
    $script:Failed++
}

function Write-Warn {
    param([string]$Message)
    Write-Host "⚠️  WARN: " -ForegroundColor Yellow -NoNewline
    Write-Host $Message
    $script:Warnings++
}

function Write-Info {
    param([string]$Message)
    Write-Host "ℹ️  $Message"
}

function Invoke-ApiRequest {
    param(
        [string]$Endpoint,
        [string]$Method = "GET",
        [string]$Body = $null,
        [hashtable]$Headers = @{}
    )
    
    $uri = "$ApiUrl$Endpoint"
    $params = @{
        Uri = $uri
        Method = $Method
        TimeoutSec = $Timeout
        ErrorAction = "Stop"
    }
    
    if ($Headers.Count -gt 0) {
        $params.Headers = $Headers
    }
    
    if ($Body) {
        $params.Body = $Body
        $params.ContentType = "application/json"
    }
    
    try {
        $response = Invoke-RestMethod @params
        return @{ Success = $true; Data = $response; Error = $null }
    }
    catch {
        return @{ Success = $false; Data = $null; Error = $_.Exception.Message }
    }
}

# ═══════════════════════════════════════════════════════════════
# Test Functions
# ═══════════════════════════════════════════════════════════════

function Test-HealthEndpoint {
    $result = Invoke-ApiRequest -Endpoint "/health"
    
    if (-not $result.Success) {
        Write-Fail "Health endpoint unreachable: $($result.Error)"
        return $false
    }
    
    if ($result.Data.status -eq "healthy") {
        Write-Pass "Health endpoint returns 'healthy'"
        return $true
    }
    else {
        Write-Fail "Health endpoint status: $($result.Data.status) (expected 'healthy')"
        return $false
    }
}

function Test-ReadyEndpoint {
    $result = Invoke-ApiRequest -Endpoint "/ready"
    
    if (-not $result.Success) {
        Write-Fail "Readiness endpoint unreachable: $($result.Error)"
        return $false
    }
    
    $status = $result.Data.status
    $memgraph = $result.Data.memgraph
    $redis = $result.Data.redis
    
    if ($status -eq "ready") {
        Write-Pass "Readiness status: ready (memgraph=$memgraph, redis=$redis)"
        return $true
    }
    elseif ($status -eq "degraded") {
        Write-Warn "Readiness status: degraded (memgraph=$memgraph, redis=$redis)"
        return $true
    }
    else {
        Write-Fail "Readiness status: $status"
        return $false
    }
}

function Test-MetricsEndpoint {
    try {
        $response = Invoke-WebRequest -Uri "$ApiUrl/metrics" -TimeoutSec $Timeout -ErrorAction Stop
        $content = $response.Content
        
        if ($content -match "http_requests|process_") {
            Write-Pass "Metrics endpoint returns Prometheus metrics"
            return $true
        }
        else {
            Write-Warn "Metrics endpoint response unexpected format"
            return $true
        }
    }
    catch {
        Write-Warn "Metrics endpoint unreachable (optional)"
        return $true
    }
}

function Test-GraphQLIntrospection {
    $query = '{"query":"{ __schema { queryType { name } } }"}'
    $result = Invoke-ApiRequest -Endpoint "/graphql" -Method "POST" -Body $query -Headers @{ "Content-Type" = "application/json" }
    
    if (-not $result.Success) {
        Write-Fail "GraphQL endpoint unreachable"
        return $false
    }
    
    if ($result.Data.data) {
        Write-Pass "GraphQL introspection enabled (development mode)"
        return $true
    }
    elseif ($result.Data.errors) {
        $errorMessage = $result.Data.errors[0].message
        if ($errorMessage -match "introspection") {
            Write-Pass "GraphQL introspection DISABLED (production mode - secure)"
            return $true
        }
        else {
            Write-Warn "GraphQL returned error: $errorMessage"
            return $true
        }
    }
    else {
        Write-Warn "GraphQL introspection response unexpected"
        return $true
    }
}

function Test-GraphQLBasicQuery {
    $query = '{"query":"{ graphStats { totalPackages totalVersions totalDependencies } }"}'
    $result = Invoke-ApiRequest -Endpoint "/graphql" -Method "POST" -Body $query -Headers @{ "Content-Type" = "application/json" }
    
    if (-not $result.Success) {
        Write-Fail "GraphQL query failed: $($result.Error)"
        return $false
    }
    
    if ($result.Data.data.graphStats) {
        $stats = $result.Data.data.graphStats
        Write-Pass "GraphQL query works (packages=$($stats.totalPackages), versions=$($stats.totalVersions), deps=$($stats.totalDependencies))"
        return $true
    }
    elseif ($result.Data.errors) {
        $errorMessage = $result.Data.errors[0].message
        Write-Fail "GraphQL query error: $errorMessage"
        return $false
    }
    else {
        Write-Warn "GraphQL query response unexpected"
        return $true
    }
}

function Test-DepthLimit {
    # Deeply nested query that should be rejected
    $deepQuery = '{"query":"{ ecosystems { packages(first:1) { edges { node { versions(first:1) { edges { node { dependencies(first:1) { edges { node { package { versions(first:1) { edges { node { id } } } } } } } } } } } } } } } }"}'
    $result = Invoke-ApiRequest -Endpoint "/graphql" -Method "POST" -Body $deepQuery -Headers @{ "Content-Type" = "application/json" }
    
    if (-not $result.Success) {
        Write-Warn "Depth limit test skipped - endpoint error"
        return $true
    }
    
    if ($result.Data.errors) {
        $errorMessage = $result.Data.errors[0].message
        if ($errorMessage -match "depth|limit|exceeded") {
            Write-Pass "GraphQL depth limit working"
            return $true
        }
        else {
            Write-Warn "Query rejected but not for depth: $errorMessage"
            return $true
        }
    }
    else {
        Write-Warn "Deep query was allowed - depth limit may be too high"
        return $true
    }
}

function Test-SecurityHeaders {
    try {
        $response = Invoke-WebRequest -Uri "$ApiUrl/health" -TimeoutSec $Timeout -ErrorAction Stop
        $headers = $response.Headers
        
        $missingHeaders = @()
        
        if (-not $headers.ContainsKey("X-Content-Type-Options")) {
            $missingHeaders += "X-Content-Type-Options"
        }
        
        if (-not $headers.ContainsKey("X-Frame-Options")) {
            $missingHeaders += "X-Frame-Options"
        }
        
        if ($missingHeaders.Count -eq 0) {
            Write-Pass "Security headers present"
            return $true
        }
        else {
            Write-Warn "Missing security headers: $($missingHeaders -join ', ')"
            return $true
        }
    }
    catch {
        Write-Warn "Security headers test skipped"
        return $true
    }
}

# ═══════════════════════════════════════════════════════════════
# Main Execution
# ═══════════════════════════════════════════════════════════════

function Main {
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  IDP API Gateway Smoke Tests (PowerShell)" -ForegroundColor Cyan
    Write-Host "  Target: $ApiUrl" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
    
    Write-Info "Running critical tests..."
    Write-Host ""
    
    # Critical tests
    $null = Test-HealthEndpoint
    $null = Test-ReadyEndpoint
    $null = Test-GraphQLBasicQuery
    
    Write-Host ""
    Write-Info "Running optional tests..."
    Write-Host ""
    
    # Optional tests
    $null = Test-MetricsEndpoint
    $null = Test-GraphQLIntrospection
    $null = Test-DepthLimit
    $null = Test-SecurityHeaders
    
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  Summary" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  Passed:   $script:Passed" -ForegroundColor Green
    Write-Host "  Failed:   $script:Failed" -ForegroundColor Red
    Write-Host "  Warnings: $script:Warnings" -ForegroundColor Yellow
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
    
    if ($script:Failed -gt 0) {
        Write-Host "❌ Smoke tests FAILED" -ForegroundColor Red
        exit 1
    }
    else {
        Write-Host "🎉 Smoke tests PASSED" -ForegroundColor Green
        exit 0
    }
}

Main
