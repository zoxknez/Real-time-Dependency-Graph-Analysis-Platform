//! GraphQL API Integration Tests
//!
//! Tests the API service with real database backends

use e2e_tests::helpers::{init_test_tracing, unique_test_id};
use neo4rs::{ConfigBuilder, Graph, query};
use reqwest::Client;
use serde_json::{Value, json};
use std::time::Duration;

/// Test health endpoint
#[tokio::test]
async fn test_health_endpoint() {
    init_test_tracing();

    let client = Client::new();
    let api_url =
        std::env::var("TEST_API_URL").unwrap_or_else(|_| "http://localhost:8000".to_string());

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
    let api_url =
        std::env::var("TEST_API_URL").unwrap_or_else(|_| "http://localhost:8000".to_string());

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
    let api_url =
        std::env::var("TEST_API_URL").unwrap_or_else(|_| "http://localhost:8080".to_string());

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
    let api_url =
        std::env::var("TEST_API_URL").unwrap_or_else(|_| "http://localhost:8080".to_string());

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
    let api_url =
        std::env::var("TEST_API_URL").unwrap_or_else(|_| "http://localhost:8080".to_string());

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
    let api_url =
        std::env::var("TEST_API_URL").unwrap_or_else(|_| "http://localhost:8080".to_string());

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
                        rawRequirement
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

/// Proves the stored manifest requirement crosses the real graph and GraphQL boundary.
/// This intentionally selects rawRequirement: the test fails against an API/query that
/// omits the field, even if a frontend type later pretends it exists.
#[tokio::test]
async fn test_graphql_reverse_dependents_preserves_real_requirements() {
    init_test_tracing();
    let client = Client::new();
    let api_url =
        std::env::var("TEST_API_URL").unwrap_or_else(|_| "http://localhost:8000".to_string());
    let graph = match Graph::connect(
        ConfigBuilder::default()
            .uri("bolt://localhost:7687")
            .user("memgraph")
            .password("memgraph")
            .db("memgraph")
            .build()
            .unwrap(),
    )
    .await
    {
        Ok(graph) => graph,
        Err(error) => {
            tracing::warn!(
                ?error,
                "Memgraph not running, skipping requirement boundary test"
            );
            return;
        }
    };
    let suffix = unique_test_id();
    let target = format!("npm:wmcp-target-{suffix}");
    let a = format!("npm:wmcp-a-{suffix}");
    let b = format!("npm:wmcp-b-{suffix}");
    let c = format!("npm:wmcp-c-{suffix}");
    graph.run(query("CREATE (target:Package {id: $target, tenant_id: 'public', ecosystem: 'npm', name: $target})
        CREATE (a:Package {id: $a, tenant_id: 'public', ecosystem: 'npm', name: $a})
        CREATE (b:Package {id: $b, tenant_id: 'public', ecosystem: 'npm', name: $b})
        CREATE (c:Package {id: $c, tenant_id: 'public', ecosystem: 'npm', name: $c})
        CREATE (a)-[:DEPENDS_ON_PKG {version_constraint: '^2.0.0'}]->(target)
        CREATE (b)-[:DEPENDS_ON_PKG {version_constraint: '~1.9.0'}]->(target)
        CREATE (c)-[:DEPENDS_ON_PKG]->(target)")
        .param("target", target.clone()).param("a", a.clone()).param("b", b.clone()).param("c", c.clone())).await.unwrap();

    let payload = json!({
        "query": "query($id: ID!) { reverseDependents(packageId: $id, maxDepth: 1, first: 10) { edges { node { id } rawRequirement } } }",
        "variables": { "id": target }
    });
    let response = match client
        .post(format!("{api_url}/graphql"))
        .json(&payload)
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            tracing::warn!(
                ?error,
                "API not running, skipping requirement boundary test"
            );
            return;
        }
    };
    assert!(response.status().is_success());
    let body: Value = response.json().await.unwrap();
    let edges = body["data"]["reverseDependents"]["edges"]
        .as_array()
        .unwrap();
    let requirements: std::collections::HashMap<String, Option<String>> = edges
        .iter()
        .filter_map(|edge| {
            Some((
                edge["node"]["id"].as_str()?.to_string(),
                edge["rawRequirement"].as_str().map(str::to_string),
            ))
        })
        .collect();
    assert_eq!(requirements.get(&a), Some(&Some("^2.0.0".to_string())));
    assert_eq!(requirements.get(&b), Some(&Some("~1.9.0".to_string())));
    assert_eq!(requirements.get(&c), Some(&None));
    graph
        .run(
            query("MATCH (n:Package) WHERE n.id IN [$target, $a, $b, $c] DETACH DELETE n")
                .param("target", target)
                .param("a", a)
                .param("b", b)
                .param("c", c),
        )
        .await
        .unwrap();
}

/// Test impactRadius query
#[tokio::test]
async fn test_graphql_impact_radius() {
    init_test_tracing();

    let client = Client::new();
    let api_url =
        std::env::var("TEST_API_URL").unwrap_or_else(|_| "http://localhost:8080".to_string());

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
    let api_url =
        std::env::var("TEST_API_URL").unwrap_or_else(|_| "http://localhost:8080".to_string());

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
    let api_url =
        std::env::var("TEST_API_URL").unwrap_or_else(|_| "http://localhost:8080".to_string());

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
    let api_url =
        std::env::var("TEST_API_URL").unwrap_or_else(|_| "http://localhost:8080".to_string());

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
                headers.get("X-Content-Type-Options").is_some()
                    || headers.get("x-content-type-options").is_some(),
                "Should have X-Content-Type-Options header"
            );

            tracing::info!("Security headers present: {:?}", headers);
        }
        Err(e) => {
            tracing::warn!("API not running, skipping test: {}", e);
        }
    }
}
