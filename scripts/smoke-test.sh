#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Smoke Test Script for IDP API Gateway
# 
# Usage: ./scripts/smoke-test.sh [API_URL]
# Default: http://localhost:8000
#
# Exit codes:
#   0 - All critical tests passed
#   1 - One or more critical tests failed
# ═══════════════════════════════════════════════════════════════

set -e

# Configuration
API_URL="${1:-${API_URL:-http://localhost:8000}}"
TIMEOUT=5
VERBOSE=${VERBOSE:-false}

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
WARNINGS=0

# ═══════════════════════════════════════════════════════════════
# Helper Functions
# ═══════════════════════════════════════════════════════════════

log_pass() {
    echo -e "${GREEN}✅ PASS${NC}: $1"
    ((PASSED++))
}

log_fail() {
    echo -e "${RED}❌ FAIL${NC}: $1"
    ((FAILED++))
}

log_warn() {
    echo -e "${YELLOW}⚠️  WARN${NC}: $1"
    ((WARNINGS++))
}

log_info() {
    echo -e "ℹ️  $1"
}

# Check if jq is available
check_dependencies() {
    if ! command -v curl &> /dev/null; then
        echo "Error: curl is required but not installed."
        exit 1
    fi
    
    if ! command -v jq &> /dev/null; then
        log_warn "jq not installed - some checks will be limited"
        JQ_AVAILABLE=false
    else
        JQ_AVAILABLE=true
    fi
}

# ═══════════════════════════════════════════════════════════════
# Test Functions
# ═══════════════════════════════════════════════════════════════

test_health_endpoint() {
    local response
    response=$(curl -sf --max-time $TIMEOUT "$API_URL/health" 2>/dev/null) || {
        log_fail "Health endpoint unreachable at $API_URL/health"
        return 1
    }
    
    if [ "$JQ_AVAILABLE" = true ]; then
        local status
        status=$(echo "$response" | jq -r '.status' 2>/dev/null)
        if [ "$status" = "healthy" ]; then
            log_pass "Health endpoint returns 'healthy'"
        else
            log_fail "Health endpoint status: $status (expected 'healthy')"
            return 1
        fi
    else
        if echo "$response" | grep -q "healthy"; then
            log_pass "Health endpoint responds with 'healthy'"
        else
            log_fail "Health endpoint does not contain 'healthy'"
            return 1
        fi
    fi
}

test_ready_endpoint() {
    local response
    response=$(curl -sf --max-time $TIMEOUT "$API_URL/ready" 2>/dev/null) || {
        log_fail "Readiness endpoint unreachable at $API_URL/ready"
        return 1
    }
    
    if [ "$JQ_AVAILABLE" = true ]; then
        local status memgraph redis
        status=$(echo "$response" | jq -r '.status' 2>/dev/null)
        memgraph=$(echo "$response" | jq -r '.memgraph' 2>/dev/null)
        redis=$(echo "$response" | jq -r '.redis' 2>/dev/null)
        
        if [ "$status" = "ready" ]; then
            log_pass "Readiness status: ready (memgraph=$memgraph, redis=$redis)"
        elif [ "$status" = "degraded" ]; then
            log_warn "Readiness status: degraded (memgraph=$memgraph, redis=$redis)"
        else
            log_fail "Readiness status: $status"
            return 1
        fi
    else
        if echo "$response" | grep -q "ready\|degraded"; then
            log_pass "Readiness endpoint responds"
        else
            log_fail "Readiness endpoint unexpected response"
            return 1
        fi
    fi
}

test_metrics_endpoint() {
    local response
    response=$(curl -sf --max-time $TIMEOUT "$API_URL/metrics" 2>/dev/null) || {
        log_warn "Metrics endpoint unreachable (optional)"
        return 0
    }
    
    if echo "$response" | grep -q "http_requests\|process_"; then
        log_pass "Metrics endpoint returns Prometheus metrics"
    else
        log_warn "Metrics endpoint response unexpected format"
    fi
}

test_graphql_introspection() {
    local query='{"query":"{ __schema { queryType { name } } }"}'
    local response
    
    response=$(curl -sf --max-time $TIMEOUT \
        -H "Content-Type: application/json" \
        -d "$query" \
        "$API_URL/graphql" 2>/dev/null) || {
        log_fail "GraphQL endpoint unreachable"
        return 1
    }
    
    if [ "$JQ_AVAILABLE" = true ]; then
        local has_data has_errors
        has_data=$(echo "$response" | jq 'has("data")' 2>/dev/null)
        has_errors=$(echo "$response" | jq 'has("errors")' 2>/dev/null)
        
        if [ "$has_data" = "true" ]; then
            log_pass "GraphQL introspection enabled (development mode)"
        elif [ "$has_errors" = "true" ]; then
            local error_message
            error_message=$(echo "$response" | jq -r '.errors[0].message' 2>/dev/null)
            if echo "$error_message" | grep -qi "introspection"; then
                log_pass "GraphQL introspection DISABLED (production mode - secure)"
            else
                log_warn "GraphQL returned error: $error_message"
            fi
        else
            log_warn "GraphQL introspection response unexpected"
        fi
    else
        log_pass "GraphQL endpoint responds"
    fi
}

test_graphql_basic_query() {
    local query='{"query":"{ graphStats { totalPackages totalVersions totalDependencies } }"}'
    local response
    
    response=$(curl -sf --max-time $TIMEOUT \
        -H "Content-Type: application/json" \
        -d "$query" \
        "$API_URL/graphql" 2>/dev/null) || {
        log_fail "GraphQL query failed"
        return 1
    }
    
    if [ "$JQ_AVAILABLE" = true ]; then
        local has_data has_errors
        has_data=$(echo "$response" | jq '.data.graphStats != null' 2>/dev/null)
        has_errors=$(echo "$response" | jq 'has("errors")' 2>/dev/null)
        
        if [ "$has_data" = "true" ]; then
            local packages versions deps
            packages=$(echo "$response" | jq '.data.graphStats.totalPackages' 2>/dev/null)
            versions=$(echo "$response" | jq '.data.graphStats.totalVersions' 2>/dev/null)
            deps=$(echo "$response" | jq '.data.graphStats.totalDependencies' 2>/dev/null)
            log_pass "GraphQL query works (packages=$packages, versions=$versions, deps=$deps)"
        elif [ "$has_errors" = "true" ]; then
            local error_message
            error_message=$(echo "$response" | jq -r '.errors[0].message' 2>/dev/null)
            log_fail "GraphQL query error: $error_message"
            return 1
        else
            log_warn "GraphQL query response unexpected"
        fi
    else
        if echo "$response" | grep -q "graphStats\|totalPackages"; then
            log_pass "GraphQL query responds with data"
        else
            log_fail "GraphQL query response unexpected"
            return 1
        fi
    fi
}

test_depth_limit() {
    # This deeply nested query should be rejected by depth limit
    local deep_query='{"query":"{ ecosystems { packages(first:1) { edges { node { versions(first:1) { edges { node { dependencies(first:1) { edges { node { package { versions(first:1) { edges { node { id } } } } } } } } } } } } } } } }"}'
    local response
    
    response=$(curl -sf --max-time $TIMEOUT \
        -H "Content-Type: application/json" \
        -d "$deep_query" \
        "$API_URL/graphql" 2>/dev/null) || {
        log_warn "Depth limit test skipped - endpoint error"
        return 0
    }
    
    if [ "$JQ_AVAILABLE" = true ]; then
        local has_errors
        has_errors=$(echo "$response" | jq 'has("errors")' 2>/dev/null)
        
        if [ "$has_errors" = "true" ]; then
            local error_message
            error_message=$(echo "$response" | jq -r '.errors[0].message' 2>/dev/null)
            if echo "$error_message" | grep -qi "depth\|limit\|exceeded"; then
                log_pass "GraphQL depth limit working"
            else
                log_warn "Query rejected but not for depth: $error_message"
            fi
        else
            log_warn "Deep query was allowed - depth limit may be too high"
        fi
    fi
}

test_cors_headers() {
    local response_headers
    response_headers=$(curl -sI --max-time $TIMEOUT \
        -H "Origin: http://localhost:3000" \
        -X OPTIONS \
        "$API_URL/graphql" 2>/dev/null) || {
        log_warn "CORS preflight test failed"
        return 0
    }
    
    if echo "$response_headers" | grep -qi "access-control-allow-origin"; then
        log_pass "CORS headers present"
    else
        log_warn "CORS headers not found in preflight response"
    fi
}

test_security_headers() {
    local response_headers
    response_headers=$(curl -sI --max-time $TIMEOUT "$API_URL/health" 2>/dev/null) || {
        log_warn "Security headers test skipped"
        return 0
    }
    
    local missing_headers=""
    
    if ! echo "$response_headers" | grep -qi "x-content-type-options"; then
        missing_headers="$missing_headers X-Content-Type-Options"
    fi
    
    if ! echo "$response_headers" | grep -qi "x-frame-options"; then
        missing_headers="$missing_headers X-Frame-Options"
    fi
    
    if [ -z "$missing_headers" ]; then
        log_pass "Security headers present"
    else
        log_warn "Missing security headers:$missing_headers"
    fi
}

# ═══════════════════════════════════════════════════════════════
# Main Execution
# ═══════════════════════════════════════════════════════════════

main() {
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "  IDP API Gateway Smoke Tests"
    echo "  Target: $API_URL"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
    
    check_dependencies
    
    log_info "Running critical tests..."
    echo ""
    
    # Critical tests (must pass)
    test_health_endpoint
    test_ready_endpoint
    test_graphql_basic_query
    
    echo ""
    log_info "Running optional tests..."
    echo ""
    
    # Optional/informational tests
    test_metrics_endpoint
    test_graphql_introspection
    test_depth_limit
    test_cors_headers
    test_security_headers
    
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "  Summary"
    echo "═══════════════════════════════════════════════════════════"
    echo -e "  ${GREEN}Passed${NC}:   $PASSED"
    echo -e "  ${RED}Failed${NC}:   $FAILED"
    echo -e "  ${YELLOW}Warnings${NC}: $WARNINGS"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
    
    if [ $FAILED -gt 0 ]; then
        echo -e "${RED}❌ Smoke tests FAILED${NC}"
        exit 1
    else
        echo -e "${GREEN}🎉 Smoke tests PASSED${NC}"
        exit 0
    fi
}

main "$@"
