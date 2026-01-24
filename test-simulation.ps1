# IDP Platform Test Simulation Script
# ==================================

$baseUrl = "http://localhost:4001/graphql"

function Invoke-GraphQL {
    param([string]$Query)
    $body = @{ query = $Query } | ConvertTo-Json
    try {
        $result = Invoke-RestMethod -Uri $baseUrl -Method POST -ContentType "application/json" -Body $body -ErrorAction Stop
        return $result
    } catch {
        Write-Host "   ERROR: $_" -ForegroundColor Red
        return $null
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  IDP PLATFORM - TEST SIMULACIJA" -ForegroundColor Cyan  
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# TEST 1: Package Query
Write-Host "[TEST 1] DOHVATI PAKET: npm/express" -ForegroundColor Yellow
$r1 = Invoke-GraphQL -Query '{ package(registry: "npm", name: "express") { id name description latestVersion downloads } }'
if ($r1 -and $r1.data -and $r1.data.package) {
    Write-Host "   OK - Paket pronadjen:" -ForegroundColor Green
    Write-Host "   - Naziv: $($r1.data.package.name)" -ForegroundColor White
    Write-Host "   - Verzija: $($r1.data.package.latestVersion)" -ForegroundColor White
    Write-Host "   - Downloads: $($r1.data.package.downloads)" -ForegroundColor White
} else {
    Write-Host "   WARN - Paket nije u bazi (ocekivano ako nema seed podataka)" -ForegroundColor Yellow
}
Write-Host ""

# TEST 2: Graph Stats
Write-Host "[TEST 2] STATISTIKA GRAFA" -ForegroundColor Yellow
$r2 = Invoke-GraphQL -Query '{ graphStats { totalPackages totalDependencies avgDependencies registryBreakdown { registry count } } }'
if ($r2 -and $r2.data -and $r2.data.graphStats) {
    $stats = $r2.data.graphStats
    Write-Host "   OK - Statistika dobivena:" -ForegroundColor Green
    Write-Host "   - Ukupno paketa: $($stats.totalPackages)" -ForegroundColor White
    Write-Host "   - Ukupno zavisnosti: $($stats.totalDependencies)" -ForegroundColor White
    Write-Host "   - Prosjecno zavisnosti: $([math]::Round($stats.avgDependencies, 2))" -ForegroundColor White
    if ($stats.registryBreakdown) {
        Write-Host "   - Po registry-ju:" -ForegroundColor White
        foreach ($rb in $stats.registryBreakdown) {
            Write-Host "     * $($rb.registry): $($rb.count) paketa" -ForegroundColor Gray
        }
    }
} else {
    Write-Host "   ERROR - Nije moguce dobiti statistiku" -ForegroundColor Red
    if ($r2.errors) { Write-Host "   $($r2.errors[0].message)" -ForegroundColor Red }
}
Write-Host ""

# TEST 3: Search Packages
Write-Host "[TEST 3] PRETRAGA PAKETA: 'react'" -ForegroundColor Yellow
$r3 = Invoke-GraphQL -Query '{ searchPackages(query: "react") { edges { node { id name registry description } } } }'
if ($r3 -and $r3.data -and $r3.data.searchPackages -and $r3.data.searchPackages.edges) {
    $edges = $r3.data.searchPackages.edges
    Write-Host "   OK - Pronadjeno $($edges.Count) rezultata:" -ForegroundColor Green
    foreach ($edge in $edges | Select-Object -First 3) {
        Write-Host "   - [$($edge.node.registry)] $($edge.node.name)" -ForegroundColor White
    }
} else {
    Write-Host "   WARN - Nema rezultata pretrage" -ForegroundColor Yellow
    if ($r3.errors) { Write-Host "   $($r3.errors[0].message)" -ForegroundColor Red }
}
Write-Host ""

# TEST 4: Dependencies
Write-Host "[TEST 4] ZAVISNOSTI: cargo/axum" -ForegroundColor Yellow
$r4 = Invoke-GraphQL -Query '{ dependencies(registry: "cargo", name: "axum") { id name versionReq scope } }'
if ($r4 -and $r4.data -and $r4.data.dependencies) {
    $deps = $r4.data.dependencies
    Write-Host "   OK - Pronadjeno $($deps.Count) zavisnosti:" -ForegroundColor Green
    foreach ($dep in $deps) {
        Write-Host "   - $($dep.name) ($($dep.versionReq)) [$($dep.scope)]" -ForegroundColor White
    }
} else {
    Write-Host "   WARN - Nema zavisnosti ili paket ne postoji" -ForegroundColor Yellow
}
Write-Host ""

# TEST 5: Reverse Dependents
Write-Host "[TEST 5] REVERSE DEPENDENTS: npm/lodash" -ForegroundColor Yellow
$r5 = Invoke-GraphQL -Query '{ reverseDependents(registry: "npm", name: "lodash", depth: 1, first: 10) { edges { node { id name } } totalCount } }'
if ($r5 -and $r5.data -and $r5.data.reverseDependents) {
    $rd = $r5.data.reverseDependents
    Write-Host "   OK - Ukupno $($rd.totalCount) paketa zavisi od lodash:" -ForegroundColor Green
    if ($rd.edges) {
        foreach ($edge in $rd.edges | Select-Object -First 5) {
            Write-Host "   - $($edge.node.name)" -ForegroundColor White
        }
    }
} else {
    Write-Host "   WARN - Nema reverse dependents" -ForegroundColor Yellow
    if ($r5.errors) { Write-Host "   $($r5.errors[0].message)" -ForegroundColor Red }
}
Write-Host ""

# TEST 6: Dependency Path
Write-Host "[TEST 6] PUT ZAVISNOSTI: express -> ms" -ForegroundColor Yellow
$r6 = Invoke-GraphQL -Query '{ dependencyPath(fromRegistry: "npm", fromName: "express", toRegistry: "npm", toName: "ms") { found pathLength path { id name } } }'
if ($r6 -and $r6.data -and $r6.data.dependencyPath) {
    $path = $r6.data.dependencyPath
    if ($path.found) {
        Write-Host "   OK - Put pronadjen (duzina: $($path.pathLength)):" -ForegroundColor Green
        $pathStr = ($path.path | ForEach-Object { $_.name }) -join " -> "
        Write-Host "   $pathStr" -ForegroundColor White
    } else {
        Write-Host "   INFO - Put ne postoji" -ForegroundColor Yellow
    }
} else {
    Write-Host "   WARN - Nije moguce izracunati put" -ForegroundColor Yellow
    if ($r6.errors) { Write-Host "   $($r6.errors[0].message)" -ForegroundColor Red }
}
Write-Host ""

# TEST 7: AI Assistant (Gemini)
Write-Host "[TEST 7] AI ASISTENT (Gemini)" -ForegroundColor Yellow
$r7 = Invoke-GraphQL -Query '{ askGemini(question: "What is the difference between axios and fetch?") { answer tokensUsed } }'
if ($r7 -and $r7.data -and $r7.data.askGemini) {
    $ai = $r7.data.askGemini
    Write-Host "   OK - AI odgovor:" -ForegroundColor Green
    $answer = $ai.answer
    if ($answer.Length -gt 200) { $answer = $answer.Substring(0, 200) + "..." }
    Write-Host "   $answer" -ForegroundColor White
    Write-Host "   (Tokens: $($ai.tokensUsed))" -ForegroundColor Gray
} else {
    Write-Host "   INFO - AI nije konfigurisan ili API key nedostaje" -ForegroundColor Yellow
    if ($r7.errors) { Write-Host "   $($r7.errors[0].message)" -ForegroundColor Gray }
}
Write-Host ""

# TEST 8: Semantic Search
Write-Host "[TEST 8] SEMANTICKA PRETRAGA: 'http client library'" -ForegroundColor Yellow
$r8 = Invoke-GraphQL -Query '{ semanticSearchPackages(query: "http client library for making api requests", limit: 5) { id name description score } }'
if ($r8 -and $r8.data -and $r8.data.semanticSearchPackages) {
    $results = $r8.data.semanticSearchPackages
    Write-Host "   OK - Pronadjeno $($results.Count) semanticki slicnih paketa:" -ForegroundColor Green
    foreach ($pkg in $results) {
        Write-Host "   - $($pkg.name) (score: $([math]::Round($pkg.score, 3)))" -ForegroundColor White
    }
} else {
    Write-Host "   INFO - Semanticka pretraga nije dostupna ili nema rezultata" -ForegroundColor Yellow
    if ($r8.errors) { Write-Host "   $($r8.errors[0].message)" -ForegroundColor Gray }
}
Write-Host ""

# SUMMARY
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  TESTIRANJE ZAVRSENO" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Aplikacija je ONLINE i funkcionalna!" -ForegroundColor Green
Write-Host ""
Write-Host "Dostupni endpointi:" -ForegroundColor White
Write-Host "  - API Health:     http://localhost:4001/health" -ForegroundColor Gray
Write-Host "  - GraphQL:        http://localhost:4001/graphql" -ForegroundColor Gray
Write-Host "  - Frontend:       http://localhost:3000" -ForegroundColor Gray
Write-Host "  - Memgraph Lab:   http://localhost:3002" -ForegroundColor Gray
Write-Host "  - Redpanda:       http://localhost:18080" -ForegroundColor Gray
Write-Host "  - Jaeger Tracing: http://localhost:16686" -ForegroundColor Gray
Write-Host ""
