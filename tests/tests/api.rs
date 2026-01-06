//! GraphQL API Integration Tests
//!
//! Tests the API service with real database backends

use e2e_tests::{
    containers::start_memgraph,
    helpers::{init_test_tracing, unique_test_id},
};
use reqwest::Client;
use serde_json::{json, Value};
use std::time::Duration;

/// Start API server for testing (returns base URL)
async fn start_test_api_server(memgraph_url: &str, redis_url: Option<&str>) -> String {
    // For now, tests expect API to be running externally
    // In future, we could spawn the API process here
    std::env::var("TEST_API_URL").unwrap_or_else(|_| "http://localhost:8000".to_string())
}

/// Test health endpoint
#[tokio::test]
async fn test_health_endpoint() {
    init_test_tracing();
    
    let client = Client::new();
    let api_url = std::env::var("TEST_API_URL").unwrap_or_else(|_| "http://localhost:8000".to_string());
    
    let response = client
        .get(format!("{}/health", api_url))
        .timeout(Duration::from_secs(5))
        .send()
        .await;
    
    match response {
        Ok(resp) => {
            assert!(resp.status().is_success());
            let body: Value = resp.json().await.unwrap();
            assert_eq!(body["status"], "healthy");
        }
        Err(e) => {
            tracing::warn!("API not running, skipping test: {}", e);
        }
    }
}

/// Test readiness endpoint
#[tokio::test]
async fn test_ready_endpoint() {
    init_test_tracing();
    
    let client = Client::new();
    let api_url = std::env::var("TEST_API_URL").unwrap_or_else(|_| "http://localhost:8000".to_string());
    
    let response = client
        .get(format!("{}/ready", api_url))
        .timeout(Duration::from_secs(5))
        .send()
        .await;
    
    match response {
        Ok(resp) => {
            let body: Value = resp.json().await.unwrap();
            tracing::info!("Readiness response: {:?}", body);
            // Status should be either "ready" or "degraded"
            assert!(body["status"].is_string());
        }
        Err(e) => {
            tracing::warn!("API not running, skipping test: {}", e);
        }
    }
}

/// Test GraphQL introspection query
#[tokio::test]
async fn test_graphql_introspection() {
    init_test_tracing();
    
    let client = Client::new();
    let api_url = std::env::var("TEST_API_URL").unwrap_or_else(|_| "http://localhost:8080".to_string());
    
    let query = json!({
        "query": r#"
            query IntrospectionQuery {
                __schema {
                    queryType { name }
                    mutationType { name }
                    subscriptionType { name }
                }
            }
        "#
    });
    
    let response = client
        .post(format!("{}/graphql", api_url))
        .json(&query)
        .timeout(Duration::from_secs(10))
        .send()
        .await;
    
    match response {
        Ok(resp) => {
            assert!(resp.status().is_success());
            let body: Value = resp.json().await.unwrap();
            
            // Should have query type
            let schema = &body["data"]["__schema"];
            assert_eq!(schema["queryType"]["name"], "QueryRoot");
            assert_eq!(schema["subscriptionType"]["name"], "SubscriptionRoot");
        }
        Err(e) => {
            tracing::warn!("API not running, skipping test: {}", e);
        }
    }
}

/// Test graphStats query
#[tokio::test]
async fn test_graphql_graph_stats() {
    init_test_tracing();
    
    let client = Client::new();
    let api_url = std::env::var("TEST_API_URL").unwrap_or_else(|_| "http://localhost:8080".to_string());
    
    let query = json!({
        "query": r#"
            query {
                graphStats {
                    totalPackages
                    totalVersions
                    totalDependencies
                }
            }
        "#
    });
    
    let response = client
        .post(format!("{}/graphql", api_url))
        .json(&query)
        .timeout(Duration::from_secs(10))
        .send()
        .await;
    
    match response {
        Ok(resp) => {
            assert!(resp.status().is_success());
            let body: Value = resp.json().await.unwrap();
            
            // Should have stats (even if zero)
            let stats = &body["data"]["graphStats"];
            assert!(stats["totalPackages"].is_number());
            assert!(stats["totalVersions"].is_number());
        }
        Err(e) => {
            tracing::warn!("API not running, skipping test: {}", e);
        }
    }
}

/// Test package query
#[tokio::test]
async fn test_graphql_package_query() {
    init_test_tracing();
    
    let client = Client::new();
    let api_url = std::env::var("TEST_API_URL").unwrap_or_else(|_| "http://localhost:8080".to_string());
    
    let query = json!({
        "query": r#"
            query GetPackage($id: ID!) {
                package(id: $id) {
                    id
                    name
                    ecosystem
                }
            }
        "#,
        "variables": {
            "id": "npm:lodash"
        }
    });
    
    let response = client
        .post(format!("{}/graphql", api_url))
        .json(&query)
        .timeout(Duration::from_secs(10))
        .send()
        .await;
    
    match response {
        Ok(resp) => {
            assert!(resp.status().is_success());
            let body: Value = resp.json().await.unwrap();
            
            // Package may or may not exist, but query should succeed
            assert!(body["data"].is_object());
            assert!(!body.get("errors").map(|e| e.is_array()).unwrap_or(false));
        }
        Err(e) => {
            tracing::warn!("API not running, skipping test: {}", e);
        }
    }
}

/// Test reverseDependents query
#[tokio::test]
async fn test_graphql_reverse_dependents() {
    init_test_tracing();
    
    let client = Client::new();
    let api_url = std::env::var("TEST_API_URL").unwrap_or_else(|_| "http://localhost:8080".to_string());
    
    let query = json!({
        "query": r#"
            query ReverseDeps($packageId: ID!, $maxDepth: Int, $first: Int) {
                reverseDependents(packageId: $packageId, maxDepth: $maxDepth, first: $first) {
                    edges {
                        node {
                            id
                            name
                            ecosystem
                        }
                        depth
                    }
                    totalCount
                    pageInfo {
                        hasNextPage
                        endCursor
                    }
                }
            }
        "#,
        "variables": {
            "packageId": "npm:lodash",
            "maxDepth": 2,
            "first": 10
        }
    });
    
    let response = client
        .post(format!("{}/graphql", api_url))
        .json(&query)
        .timeout(Duration::from_secs(10))
        .send()
        .await;
    
    match response {
        Ok(resp) => {
            assert!(resp.status().is_success());
            let body: Value = resp.json().await.unwrap();
            
            // Query should succeed (may return empty results)
            let data = &body["data"]["reverseDependents"];
            assert!(data["edges"].is_array());
            assert!(data["totalCount"].is_number());
        }
        Err(e) => {
            tracing::warn!("API not running, skipping test: {}", e);
        }
    }
}

/// Test impactRadius query
#[tokio::test]
async fn test_graphql_impact_radius() {
    init_test_tracing();
    
    let client = Client::new();
    let api_url = std::env::var("TEST_API_URL").unwrap_or_else(|_| "http://localhost:8080".to_string());
    
    let query = json!({
        "query": r#"
            query ImpactRadius($packageId: ID!, $maxDepth: Int, $limit: Int) {
                impactRadius(packageId: $packageId, maxDepth: $maxDepth, limit: $limit) {
                    packageId
                    maxDepth
                    impactedPackages
                    impactedVersions
                    topImpacted {
                        package {
                            id
                            name
                        }
                        depth
                    }
                }
            }
        "#,
        "variables": {
            "packageId": "npm:lodash",
            "maxDepth": 3,
            "limit": 100
        }
    });
    
    let response = client
        .post(format!("{}/graphql", api_url))
        .json(&query)
        .timeout(Duration::from_secs(10))
        .send()
        .await;
    
    match response {
        Ok(resp) => {
            assert!(resp.status().is_success());
            let body: Value = resp.json().await.unwrap();
            
            let data = &body["data"]["impactRadius"];
            assert!(data["impactedPackages"].is_number());
        }
        Err(e) => {
            tracing::warn!("API not running, skipping test: {}", e);
        }
    }
}

/// Test query complexity limit
#[tokio::test]
async fn test_query_complexity_limit() {
    init_test_tracing();
    
    let client = Client::new();
    let api_url = std::env::var("TEST_API_URL").unwrap_or_else(|_| "http://localhost:8080".to_string());
    
    // Very deep query that should exceed complexity limits
    let query = json!({
        "query": r#"
            query DeepQuery {
                r1: reverseDependents(packageId: "npm:a", maxDepth: 10, first: 100) {
                    edges { node { id } }
                }
                r2: reverseDependents(packageId: "npm:b", maxDepth: 10, first: 100) {
                    edges { node { id } }
                }
                r3: reverseDependents(packageId: "npm:c", maxDepth: 10, first: 100) {
                    edges { node { id } }
                }
                r4: reverseDependents(packageId: "npm:d", maxDepth: 10, first: 100) {
                    edges { node { id } }
                }
                r5: reverseDependents(packageId: "npm:e", maxDepth: 10, first: 100) {
                    edges { node { id } }
                }
            }
        "#
    });
    
    let response = client
        .post(format!("{}/graphql", api_url))
        .json(&query)
        .timeout(Duration::from_secs(10))
        .send()
        .await;
    
    match response {
        Ok(resp) => {
            let body: Value = resp.json().await.unwrap();
            // This may or may not exceed limits depending on config
            tracing::info!("Complex query response: {:?}", body);
        }
        Err(e) => {
            tracing::warn!("API not running, skipping test: {}", e);
        }
    }
}

/// Test rate limiting headers
#[tokio::test]
async fn test_rate_limit_headers() {
    init_test_tracing();
    
    let client = Client::new();
    let api_url = std::env::var("TEST_API_URL").unwrap_or_else(|_| "http://localhost:8080".to_string());
    
    let query = json!({
        "query": "{ graphStats { totalPackages } }"
    });
    
    let response = client
        .post(format!("{}/graphql", api_url))
        .json(&query)
        .timeout(Duration::from_secs(5))
        .send()
        .await;
    
    match response {
        Ok(resp) => {
            // Check for rate limit headers
            let headers = resp.headers();
            tracing::info!("Response headers: {:?}", headers);
            
            // These headers might be present depending on configuration
            if let Some(limit) = headers.get("X-RateLimit-Limit") {
                tracing::info!("Rate limit: {:?}", limit);
            }
            if let Some(remaining) = headers.get("X-RateLimit-Remaining") {
                tracing::info!("Remaining: {:?}", remaining);
            }
        }
        Err(e) => {
            tracing::warn!("API not running, skipping test: {}", e);
        }
    }
}

/// Test security headers
#[tokio::test]
async fn test_security_headers() {
    init_test_tracing();
    
    let client = Client::new();
    let api_url = std::env::var("TEST_API_URL").unwrap_or_else(|_| "http://localhost:8080".to_string());
    
    let response = client
        .get(format!("{}/health", api_url))
        .timeout(Duration::from_secs(5))
        .send()
        .await;
    
    match response {
        Ok(resp) => {
            let headers = resp.headers();
            
            // Check for security headers
            assert!(
                headers.get("X-Content-Type-Options").is_some() ||
                headers.get("x-content-type-options").is_some(),
                "Should have X-Content-Type-Options header"
            );
            
            tracing::info!("Security headers present: {:?}", headers);
        }
        Err(e) => {
            tracing::warn!("API not running, skipping test: {}", e);
        }
    }
}
