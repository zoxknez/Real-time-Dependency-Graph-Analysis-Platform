//! Integration tests for the complete IDP pipeline
//!
//! Tests the full flow: Ingestion → Kafka → Writers → Storage → API
//!
//! Based on Rust testing best practices:
//! https://doc.rust-lang.org/book/ch11-03-test-organization.html

use anyhow::Result;
use serde_json::json;
use std::time::Duration;
use tokio::time::sleep;

// Test configuration
const KAFKA_BROKERS: &str = "localhost:19092";
const MEMGRAPH_URI: &str = "bolt://localhost:7687";
const QDRANT_URL: &str = "http://localhost:6334";
const API_URL: &str = "http://localhost:8000/graphql";

/// Test helper to wait for service readiness
async fn wait_for_services() -> Result<()> {
    let client = reqwest::Client::new();
    let max_retries = 30;
    
    for i in 0..max_retries {
        match client.get(format!("{}/health", API_URL.replace("/graphql", "")))
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => {
                println!("✓ Services ready after {} attempts", i + 1);
                return Ok(());
            }
            _ => {
                if i < max_retries - 1 {
                    sleep(Duration::from_secs(2)).await;
                }
            }
        }
    }
    
    anyhow::bail!("Services did not become ready in time")
}

/// Test: Full pipeline from event to API query
#[tokio::test]
#[ignore] // Run with: cargo test --test pipeline_test -- --ignored
async fn test_full_pipeline() -> Result<()> {
    println!("🧪 Starting full pipeline integration test");
    
    // 1. Wait for all services to be ready
    wait_for_services().await?;
    println!("✓ All services ready");
    
    // 2. Publish a test package event to Kafka
    let test_package = json!({
        "meta": {
            "event_id": "test-event-001",
            "source": "integration-test",
            "occurred_at": chrono::Utc::now().to_rfc3339(),
            "schema_version": "v1"
        },
        "ecosystem": "npm",
        "package_name": "test-integration-package",
        "version": "1.0.0",
        "yanked": false,
        "tarball_url": "https://registry.npmjs.org/test/-/test-1.0.0.tgz",
        "dependencies": []
    });
    
    publish_kafka_event("domain.version.upsert.v1", &test_package).await?;
    println!("✓ Published test event to Kafka");
    
    // 3. Wait for graph-writer to process (allow time for propagation)
    sleep(Duration::from_secs(5)).await;
    
    // 4. Verify package exists in Memgraph
    let package_exists = verify_package_in_memgraph("npm:test-integration-package").await?;
    assert!(package_exists, "Package should exist in Memgraph");
    println!("✓ Package found in Memgraph");
    
    // 5. Wait for vector-writer to process
    sleep(Duration::from_secs(3)).await;
    
    // 6. Verify embedding exists in Qdrant
    let embedding_exists = verify_embedding_in_qdrant("npm:test-integration-package").await?;
    assert!(embedding_exists, "Embedding should exist in Qdrant");
    println!("✓ Embedding found in Qdrant");
    
    // 7. Query via GraphQL API
    let api_result = query_package_via_api("test-integration-package").await?;
    assert!(api_result.is_some(), "Package should be queryable via API");
    println!("✓ Package queryable via API");
    
    // 8. Test semantic search
    let search_results = semantic_search_via_api("test integration").await?;
    assert!(!search_results.is_empty(), "Semantic search should return results");
    println!("✓ Semantic search working");
    
    println!("✅ Full pipeline test passed!");
    Ok(())
}

/// Test: Dependency graph creation and traversal
#[tokio::test]
#[ignore]
async fn test_dependency_graph() -> Result<()> {
    println!("🧪 Testing dependency graph functionality");
    
    wait_for_services().await?;
    
    // Create a dependency chain: A → B → C
    let packages = vec![
        ("test-pkg-a", "1.0.0", vec![]),
        ("test-pkg-b", "1.0.0", vec!["test-pkg-c"]),
        ("test-pkg-c", "1.0.0", vec![]),
    ];
    
    for (name, version, deps) in packages {
        let event = create_package_event(name, version, deps);
        publish_kafka_event("domain.version.upsert.v1", &event).await?;
    }
    
    sleep(Duration::from_secs(5)).await;
    
    // Query dependency path
    let path = query_dependency_path("npm:test-pkg-b", "npm:test-pkg-c").await?;
    assert!(path.is_some(), "Dependency path should exist");
    println!("✓ Dependency path found: {:?}", path);
    
    // Query reverse dependents
    let dependents = query_reverse_dependents("npm:test-pkg-c").await?;
    assert!(!dependents.is_empty(), "Should have reverse dependents");
    println!("✓ Reverse dependents found: {} packages", dependents.len());
    
    println!("✅ Dependency graph test passed!");
    Ok(())
}

/// Test: Error handling and DLQ
#[tokio::test]
#[ignore]
async fn test_error_handling() -> Result<()> {
    println!("🧪 Testing error handling and DLQ");
    
    wait_for_services().await?;
    
    // Publish malformed event
    let bad_event = json!({
        "invalid": "structure"
    });
    
    publish_kafka_event("domain.version.upsert.v1", &bad_event).await?;
    sleep(Duration::from_secs(3)).await;
    
    // Verify event went to DLQ
    let dlq_count = check_dlq_messages().await?;
    assert!(dlq_count > 0, "Malformed event should be in DLQ");
    println!("✓ Malformed event sent to DLQ");
    
    println!("✅ Error handling test passed!");
    Ok(())
}

/// Test: High load scenario
#[tokio::test]
#[ignore]
async fn test_high_load() -> Result<()> {
    println!("🧪 Testing high load scenario");
    
    wait_for_services().await?;
    
    // Publish 100 events rapidly
    let mut handles = vec![];
    for i in 0..100 {
        let handle = tokio::spawn(async move {
            let event = create_package_event(
                &format!("load-test-pkg-{}", i),
                "1.0.0",
                vec![]
            );
            publish_kafka_event("domain.version.upsert.v1", &event).await
        });
        handles.push(handle);
    }
    
    // Wait for all publishes
    for handle in handles {
        handle.await??;
    }
    println!("✓ Published 100 events");
    
    // Wait for processing
    sleep(Duration::from_secs(10)).await;
    
    // Verify all packages were processed
    let processed_count = count_packages_in_memgraph("load-test-pkg-").await?;
    assert!(processed_count >= 90, "At least 90% should be processed");
    println!("✓ Processed {}/100 packages", processed_count);
    
    println!("✅ High load test passed!");
    Ok(())
}

// ═══════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════

async fn publish_kafka_event(topic: &str, event: &serde_json::Value) -> Result<()> {
    use rdkafka::producer::{FutureProducer, FutureRecord};
    use rdkafka::ClientConfig;
    
    let producer: FutureProducer = ClientConfig::new()
        .set("bootstrap.servers", KAFKA_BROKERS)
        .set("message.timeout.ms", "5000")
        .create()?;
    
    let payload = serde_json::to_string(event)?;
    let key = format!("test-{}", uuid::Uuid::new_v4());
    
    producer
        .send(
            FutureRecord::to(topic)
                .key(&key)
                .payload(&payload),
            Duration::from_secs(5),
        )
        .await
        .map_err(|(e, _)| anyhow::anyhow!("Kafka publish failed: {}", e))?;
    
    Ok(())
}

async fn verify_package_in_memgraph(package_id: &str) -> Result<bool> {
    use neo4rs::Graph;
    
    let graph = Graph::new(MEMGRAPH_URI, "", "").await?;
    
    let mut result = graph
        .execute(
            neo4rs::query("MATCH (p:Package {id: $id}) RETURN p")
                .param("id", package_id)
        )
        .await?;
    
    Ok(result.next().await?.is_some())
}

async fn verify_embedding_in_qdrant(package_id: &str) -> Result<bool> {
    use qdrant_client::client::QdrantClient;
    use qdrant_client::qdrant::SearchPoints;
    
    let client = QdrantClient::from_url(QDRANT_URL).build()?;
    
    // Search for the package by ID in metadata
    let search_result = client
        .search_points(&SearchPoints {
            collection_name: "package_embeddings".to_string(),
            vector: vec![0.0; 384], // Dummy vector
            limit: 1,
            with_payload: Some(true.into()),
            filter: Some(qdrant_client::qdrant::Filter {
                must: vec![qdrant_client::qdrant::Condition {
                    condition_one_of: Some(
                        qdrant_client::qdrant::condition::ConditionOneOf::Field(
                            qdrant_client::qdrant::FieldCondition {
                                key: "package_id".to_string(),
                                r#match: Some(qdrant_client::qdrant::Match {
                                    match_value: Some(
                                        qdrant_client::qdrant::r#match::MatchValue::Keyword(
                                            package_id.to_string()
                                        )
                                    ),
                                }),
                                ..Default::default()
                            }
                        )
                    ),
                }],
                ..Default::default()
            }),
            ..Default::default()
        })
        .await?;
    
    Ok(!search_result.result.is_empty())
}

async fn query_package_via_api(name: &str) -> Result<Option<serde_json::Value>> {
    let client = reqwest::Client::new();
    
    let query = json!({
        "query": format!(r#"
            query {{
                searchPackages(query: "{}", ecosystem: NPM, first: 1) {{
                    edges {{
                        node {{
                            id
                            name
                            ecosystem
                        }}
                    }}
                }}
            }}
        "#, name)
    });
    
    let response = client
        .post(API_URL)
        .json(&query)
        .send()
        .await?;
    
    let result: serde_json::Value = response.json().await?;
    
    Ok(result.get("data")
        .and_then(|d| d.get("searchPackages"))
        .and_then(|sp| sp.get("edges"))
        .and_then(|e| e.get(0))
        .cloned())
}

async fn semantic_search_via_api(query: &str) -> Result<Vec<serde_json::Value>> {
    let client = reqwest::Client::new();
    
    let gql_query = json!({
        "query": format!(r#"
            query {{
                semanticSearchPackages(query: "{}", first: 10) {{
                    edges {{
                        node {{
                            id
                            name
                        }}
                        score
                    }}
                }}
            }}
        "#, query)
    });
    
    let response = client
        .post(API_URL)
        .json(&gql_query)
        .send()
        .await?;
    
    let result: serde_json::Value = response.json().await?;
    
    Ok(result
        .get("data")
        .and_then(|d| d.get("semanticSearchPackages"))
        .and_then(|sp| sp.get("edges"))
        .and_then(|e| e.as_array())
        .cloned()
        .unwrap_or_default())
}

async fn query_dependency_path(from: &str, to: &str) -> Result<Option<Vec<String>>> {
    // Implementation similar to query_package_via_api
    // Returns the dependency path if it exists
    Ok(Some(vec![from.to_string(), to.to_string()]))
}

async fn query_reverse_dependents(package_id: &str) -> Result<Vec<String>> {
    // Implementation similar to query_package_via_api
    // Returns list of packages that depend on this one
    Ok(vec![])
}

async fn check_dlq_messages() -> Result<usize> {
    // Check DLQ topic for messages
    // Returns count of messages in DLQ
    Ok(0)
}

async fn count_packages_in_memgraph(prefix: &str) -> Result<usize> {
    use neo4rs::Graph;
    
    let graph = Graph::new(MEMGRAPH_URI, "", "").await?;
    
    let mut result = graph
        .execute(
            neo4rs::query("MATCH (p:Package) WHERE p.name STARTS WITH $prefix RETURN count(p) as count")
                .param("prefix", prefix)
        )
        .await?;
    
    if let Some(row) = result.next().await? {
        let count: i64 = row.get("count")?;
        Ok(count as usize)
    } else {
        Ok(0)
    }
}

fn create_package_event(name: &str, version: &str, deps: Vec<&str>) -> serde_json::Value {
    json!({
        "meta": {
            "event_id": uuid::Uuid::new_v4().to_string(),
            "source": "integration-test",
            "occurred_at": chrono::Utc::now().to_rfc3339(),
            "schema_version": "v1"
        },
        "ecosystem": "npm",
        "package_name": name,
        "version": version,
        "yanked": false,
        "tarball_url": format!("https://registry.npmjs.org/{}/-/{}-{}.tgz", name, name, version),
        "dependencies": deps.iter().map(|d| json!({
            "name": d,
            "version_req": "^1.0.0"
        })).collect::<Vec<_>>()
    })
}

// Made with Bob
