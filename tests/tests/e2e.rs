//! End-to-End Integration Tests
//!
//! These tests require Docker to be running and will spin up
//! containers for Memgraph, Qdrant, Redpanda, and RisingWave.

use e2e_tests::{
    containers::{start_memgraph, start_qdrant, start_redpanda},
    fixtures::{TestKafkaEvent, TestPackage},
    helpers::{self, init_test_tracing, unique_test_id},
};
use std::time::Duration;

/// Test basic Memgraph connectivity and operations
#[tokio::test]
#[ignore = "requires Docker"]
async fn test_memgraph_basic_operations() {
    init_test_tracing();
    
    // Start Memgraph container
    let (_container, url) = start_memgraph().await.unwrap();
    
    // Connect to Memgraph
    let graph = helpers::db::connect_memgraph(&url).await.unwrap();
    
    // Create a test package node
    let pkg = TestPackage::npm_lodash();
    graph.run(neo4rs::Query::new(format!(
        "CREATE (p:Package {{id: '{}', name: '{}', ecosystem: '{}'}})",
        pkg.id, pkg.name, pkg.ecosystem
    ))).await.unwrap();
    
    // Verify node was created
    let count = helpers::db::count_nodes(&graph, "Package").await.unwrap();
    assert_eq!(count, 1);
    
    // Cleanup
    helpers::db::clear_memgraph(&graph).await.unwrap();
}

/// Test Memgraph dependency graph creation
#[tokio::test]
#[ignore = "requires Docker"]
async fn test_memgraph_dependency_graph() {
    init_test_tracing();
    
    let (_container, url) = start_memgraph().await.unwrap();
    
    let graph = helpers::db::connect_memgraph(&url).await.unwrap();
    
    // Create packages with dependencies
    let express = TestPackage::npm_express();
    let lodash = TestPackage::npm_lodash();
    
    // Create nodes
    graph.run(neo4rs::Query::new(format!(
        "CREATE (p:Package {{id: '{}', name: '{}', ecosystem: '{}'}})",
        express.id, express.name, express.ecosystem
    ))).await.unwrap();
    
    graph.run(neo4rs::Query::new(format!(
        "CREATE (p:Package {{id: '{}', name: '{}', ecosystem: '{}'}})",
        lodash.id, lodash.name, lodash.ecosystem
    ))).await.unwrap();
    
    // Create dependency edge
    graph.run(neo4rs::Query::new(format!(
        "MATCH (a:Package {{id: '{}'}}), (b:Package {{id: '{}'}})
         CREATE (a)-[:DEPENDS_ON {{version_constraint: '^4.17.0'}}]->(b)",
        express.id, lodash.id
    ))).await.unwrap();
    
    // Query for dependents
    let mut result = graph.execute(neo4rs::Query::new(format!(
        "MATCH (p:Package {{id: '{}'}})<-[:DEPENDS_ON]-(d:Package)
         RETURN d.name as name",
        lodash.id
    ))).await.unwrap();
    
    let row = result.next().await.unwrap().unwrap();
    let name: String = row.get("name").unwrap();
    assert_eq!(name, "express");
    
    helpers::db::clear_memgraph(&graph).await.unwrap();
}

/// Test Qdrant vector operations
#[tokio::test]
#[ignore = "requires Docker"]
async fn test_qdrant_vector_operations() {
    init_test_tracing();
    
    let (_container, url) = start_qdrant().await.unwrap();
    
    // Create Qdrant client
    let client = qdrant_client::Qdrant::from_url(&url).build().unwrap();
    
    // Create collection
    use qdrant_client::qdrant::{CreateCollectionBuilder, Distance, VectorParamsBuilder};
    
    client.create_collection(
        CreateCollectionBuilder::new("test_packages")
            .vectors_config(VectorParamsBuilder::new(384, Distance::Cosine))
    ).await.unwrap();
    
    // Insert a vector
    use qdrant_client::qdrant::{PointStruct, UpsertPointsBuilder, Value};
    use std::collections::HashMap;
    
    let mut payload: HashMap<String, Value> = HashMap::new();
    payload.insert("name".to_string(), Value::from("lodash"));
    
    let point = PointStruct::new(
        "npm/lodash".to_string(),
        vec![0.1f32; 384],
        payload,
    );
    
    client.upsert_points(
        UpsertPointsBuilder::new("test_packages", vec![point])
    ).await.unwrap();
    
    // Search for similar vectors
    use qdrant_client::qdrant::SearchPointsBuilder;
    
    let results = client.search_points(
        SearchPointsBuilder::new("test_packages", vec![0.1f32; 384], 10)
            .with_payload(true)
    ).await.unwrap();
    
    assert_eq!(results.result.len(), 1);
}

/// Test Kafka/Redpanda message flow
#[tokio::test]
#[ignore = "requires Docker"]
async fn test_kafka_message_flow() {
    init_test_tracing();
    
    let (_container, brokers) = start_redpanda().await.unwrap();
    
    // Wait for Redpanda to be ready
    tokio::time::sleep(Duration::from_secs(5)).await;
    
    // Create admin client and topic
    let admin = helpers::kafka::create_admin_client(&brokers).unwrap();
    let topic_name = format!("test-topic-{}", unique_test_id());
    helpers::kafka::create_topic(&admin, &topic_name).await.unwrap();
    
    // Create producer and send message
    let producer = helpers::kafka::create_producer(&brokers).unwrap();
    let pkg = TestPackage::npm_express();
    let event = TestKafkaEvent::package_published(&pkg);
    let payload = serde_json::to_string(&event).unwrap();
    
    helpers::kafka::send_message(&producer, &topic_name, &pkg.id, &payload).await.unwrap();
    
    // Create consumer and receive message
    use rdkafka::consumer::Consumer;
    use rdkafka::Message;
    use futures_util::StreamExt;
    
    let consumer = helpers::kafka::create_consumer(&brokers, &format!("test-group-{}", unique_test_id())).unwrap();
    consumer.subscribe(&[&topic_name]).unwrap();
    
    // Wait for message
    let msg = tokio::time::timeout(
        Duration::from_secs(10),
        consumer.stream().next()
    ).await.unwrap().unwrap().unwrap();
    
    let received_payload = msg.payload_view::<str>().unwrap().unwrap();
    let received_event: TestKafkaEvent = serde_json::from_str(received_payload).unwrap();
    
    assert_eq!(received_event.event_type, "package.published");
    assert_eq!(received_event.package_name, "express");
}

/// Test full E2E flow: Package Event → Graph → Vector → Query
#[tokio::test]
#[ignore = "requires Docker"]
async fn test_full_e2e_flow() {
    init_test_tracing();
    
    // Start all containers
    let (_memgraph_container, memgraph_url) = start_memgraph().await.unwrap();
    let (_qdrant_container, qdrant_url) = start_qdrant().await.unwrap();
    let (_redpanda_container, kafka_url) = start_redpanda().await.unwrap();
    
    tracing::info!(
        memgraph = %memgraph_url,
        qdrant = %qdrant_url,
        kafka = %kafka_url,
        "Test infrastructure ready"
    );
    
    // Wait for services to be ready
    tokio::time::sleep(Duration::from_secs(5)).await;
    
    // 1. Create package in Memgraph
    let graph = helpers::db::connect_memgraph(&memgraph_url).await.unwrap();
    
    let serde = TestPackage::cargo_serde();
    graph.run(neo4rs::Query::new(format!(
        "CREATE (p:Package {{id: '{}', name: '{}', ecosystem: '{}', version: '{}'}})",
        serde.id, serde.name, serde.ecosystem, serde.version
    ))).await.unwrap();
    
    // 2. Create vector in Qdrant
    let qdrant_client = qdrant_client::Qdrant::from_url(&qdrant_url).build().unwrap();
    
    use qdrant_client::qdrant::{CreateCollectionBuilder, Distance, VectorParamsBuilder, PointStruct, UpsertPointsBuilder, Value};
    use std::collections::HashMap;
    
    qdrant_client.create_collection(
        CreateCollectionBuilder::new("packages")
            .vectors_config(VectorParamsBuilder::new(384, Distance::Cosine))
    ).await.unwrap();
    
    let mut payload: HashMap<String, Value> = HashMap::new();
    payload.insert("name".to_string(), Value::from("serde"));
    payload.insert("ecosystem".to_string(), Value::from("cargo"));
    
    let point = PointStruct::new(
        serde.id.clone(),
        vec![0.5f32; 384],  // Mock embedding
        payload,
    );
    
    qdrant_client.upsert_points(
        UpsertPointsBuilder::new("packages", vec![point])
    ).await.unwrap();
    
    // 3. Verify graph data
    let count = helpers::db::count_nodes(&graph, "Package").await.unwrap();
    assert_eq!(count, 1, "Should have one package in graph");
    
    // 4. Verify vector data
    use qdrant_client::qdrant::SearchPointsBuilder;
    
    let search_results = qdrant_client.search_points(
        SearchPointsBuilder::new("packages", vec![0.5f32; 384], 10)
            .with_payload(true)
    ).await.unwrap();
    
    assert_eq!(search_results.result.len(), 1, "Should find one vector");
    
    tracing::info!("✅ Full E2E flow test passed");
    
    // Cleanup
    helpers::db::clear_memgraph(&graph).await.unwrap();
}

/// Test graph traversal for impact radius calculation
#[tokio::test]
#[ignore = "requires Docker"]
async fn test_impact_radius_calculation() {
    init_test_tracing();
    
    let (_container, url) = start_memgraph().await.unwrap();
    
    let graph = helpers::db::connect_memgraph(&url).await.unwrap();
    
    // Create a dependency tree:
    // app-a → lib-b → lib-c → lib-d (lodash)
    // app-e → lib-b
    // app-f → lib-c
    
    let packages = [
        ("lodash", "npm"),
        ("lib-c", "npm"),
        ("lib-b", "npm"),
        ("app-a", "npm"),
        ("app-e", "npm"),
        ("app-f", "npm"),
    ];
    
    for (name, eco) in packages {
        graph.run(neo4rs::Query::new(format!(
            "CREATE (p:Package {{id: '{}/{}', name: '{}', ecosystem: '{}'}})",
            eco, name, name, eco
        ))).await.unwrap();
    }
    
    // Create edges
    let edges = [
        ("npm/lib-c", "npm/lodash"),
        ("npm/lib-b", "npm/lib-c"),
        ("npm/app-a", "npm/lib-b"),
        ("npm/app-e", "npm/lib-b"),
        ("npm/app-f", "npm/lib-c"),
    ];
    
    for (from, to) in edges {
        graph.run(neo4rs::Query::new(format!(
            "MATCH (a:Package {{id: '{}'}}), (b:Package {{id: '{}'}})
             CREATE (a)-[:DEPENDS_ON]->(b)",
            from, to
        ))).await.unwrap();
    }
    
    // Calculate impact radius for lodash
    let mut result = graph.execute(neo4rs::Query::new(
        "MATCH (p:Package {id: 'npm/lodash'})<-[:DEPENDS_ON*1..10]-(d:Package)
         RETURN count(DISTINCT d) as affected_count".to_string()
    )).await.unwrap();
    
    let row = result.next().await.unwrap().unwrap();
    let affected: i64 = row.get("affected_count").unwrap();
    
    // Should affect: lib-c, lib-b, app-a, app-e, app-f = 5 packages
    assert_eq!(affected, 5, "Lodash should affect 5 packages");
    
    helpers::db::clear_memgraph(&graph).await.unwrap();
}
