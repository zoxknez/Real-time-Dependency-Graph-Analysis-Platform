//! Test helper functions

use anyhow::Result;
use std::time::Duration;
use tracing_subscriber::{EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

/// Initialize tracing for tests (call once at test start)
pub fn init_test_tracing() {
    let _ = tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| "debug".into()))
        .with(tracing_subscriber::fmt::layer().with_test_writer())
        .try_init();
}

/// Wait for a condition with timeout
pub async fn wait_for<F, Fut>(
    description: &str,
    timeout: Duration,
    interval: Duration,
    condition: F,
) -> Result<()>
where
    F: Fn() -> Fut,
    Fut: std::future::Future<Output = bool>,
{
    let start = std::time::Instant::now();

    loop {
        if condition().await {
            return Ok(());
        }

        if start.elapsed() > timeout {
            anyhow::bail!("Timeout waiting for: {}", description);
        }

        tokio::time::sleep(interval).await;
    }
}

/// Retry an async operation with exponential backoff
pub async fn retry_with_backoff<T, E, F, Fut>(
    max_retries: u32,
    initial_delay: Duration,
    operation: F,
) -> Result<T, E>
where
    F: Fn() -> Fut,
    Fut: std::future::Future<Output = Result<T, E>>,
    E: std::fmt::Debug,
{
    let mut delay = initial_delay;
    let mut last_err = None;

    for attempt in 0..max_retries {
        match operation().await {
            Ok(result) => return Ok(result),
            Err(e) => {
                tracing::warn!(
                    attempt = attempt + 1,
                    max_retries = max_retries,
                    error = ?e,
                    "Retry attempt failed"
                );
                last_err = Some(e);
                tokio::time::sleep(delay).await;
                delay *= 2;
            }
        }
    }

    Err(last_err.expect("Should have at least one error"))
}

/// Generate unique test identifiers to avoid test interference
pub fn unique_test_id() -> String {
    uuid::Uuid::new_v4().to_string()[..8].to_string()
}

/// Kafka helpers
pub mod kafka {
    use anyhow::Result;
    use rdkafka::admin::{AdminClient, AdminOptions, NewTopic, TopicReplication};
    use rdkafka::client::DefaultClientContext;
    use rdkafka::config::ClientConfig;
    use rdkafka::consumer::StreamConsumer;
    use rdkafka::producer::{FutureProducer, FutureRecord};
    use std::time::Duration;

    /// Create an admin client for topic management
    pub fn create_admin_client(brokers: &str) -> Result<AdminClient<DefaultClientContext>> {
        let admin: AdminClient<DefaultClientContext> = ClientConfig::new()
            .set("bootstrap.servers", brokers)
            .create()?;
        Ok(admin)
    }

    /// Create a topic for testing
    pub async fn create_topic(
        admin: &AdminClient<DefaultClientContext>,
        topic: &str,
    ) -> Result<()> {
        let topics = [NewTopic::new(topic, 1, TopicReplication::Fixed(1))];
        let opts = AdminOptions::new();
        admin.create_topics(&topics, &opts).await?;
        Ok(())
    }

    /// Create a producer for testing
    pub fn create_producer(brokers: &str) -> Result<FutureProducer> {
        let producer: FutureProducer = ClientConfig::new()
            .set("bootstrap.servers", brokers)
            .set("message.timeout.ms", "5000")
            .create()?;
        Ok(producer)
    }

    /// Create a consumer for testing
    pub fn create_consumer(brokers: &str, group_id: &str) -> Result<StreamConsumer> {
        let consumer: StreamConsumer = ClientConfig::new()
            .set("bootstrap.servers", brokers)
            .set("group.id", group_id)
            .set("auto.offset.reset", "earliest")
            .set("enable.auto.commit", "false")
            .create()?;
        Ok(consumer)
    }

    /// Send a test message
    pub async fn send_message(
        producer: &FutureProducer,
        topic: &str,
        key: &str,
        payload: &str,
    ) -> Result<()> {
        producer
            .send(
                FutureRecord::to(topic).key(key).payload(payload),
                Duration::from_secs(5),
            )
            .await
            .map_err(|(e, _)| anyhow::anyhow!("Failed to send message: {:?}", e))?;
        Ok(())
    }
}

/// GraphQL API helpers
pub mod api {
    use anyhow::Result;
    use reqwest::Client;
    use serde_json::Value;

    /// Execute a GraphQL query against the API
    pub async fn execute_graphql(
        client: &Client,
        endpoint: &str,
        query: &str,
        variables: Option<Value>,
    ) -> Result<Value> {
        let body = serde_json::json!({
            "query": query,
            "variables": variables.unwrap_or(Value::Null),
        });

        let response = client.post(endpoint).json(&body).send().await?;

        let result: Value = response.json().await?;
        Ok(result)
    }

    /// Check if API is healthy
    pub async fn health_check(endpoint: &str) -> Result<bool> {
        let client = Client::new();
        let response = client.get(format!("{}/health", endpoint)).send().await?;
        Ok(response.status().is_success())
    }
}

/// Database helpers
pub mod db {
    use anyhow::Result;
    use neo4rs::{Graph, Query};

    /// Create a Memgraph connection
    pub async fn connect_memgraph(url: &str) -> Result<Graph> {
        let graph = Graph::new(url, "", "").await?;
        Ok(graph)
    }

    /// Clear all data in Memgraph (for test cleanup)
    pub async fn clear_memgraph(graph: &Graph) -> Result<()> {
        graph
            .run(Query::new("MATCH (n) DETACH DELETE n".to_string()))
            .await?;
        Ok(())
    }

    /// Count nodes in Memgraph
    pub async fn count_nodes(graph: &Graph, label: &str) -> Result<i64> {
        let query = Query::new(format!("MATCH (n:{}) RETURN count(n) as count", label));
        let mut result = graph.execute(query).await?;

        if let Some(row) = result.next().await? {
            let count: i64 = row.get("count")?;
            return Ok(count);
        }

        Ok(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_unique_test_id() {
        let id1 = unique_test_id();
        let id2 = unique_test_id();
        assert_ne!(id1, id2);
        assert_eq!(id1.len(), 8);
    }

    #[tokio::test]
    async fn test_wait_for_success() {
        let result = wait_for(
            "always true",
            Duration::from_secs(1),
            Duration::from_millis(100),
            || async { true },
        )
        .await;

        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_wait_for_timeout() {
        let result = wait_for(
            "always false",
            Duration::from_millis(100),
            Duration::from_millis(10),
            || async { false },
        )
        .await;

        assert!(result.is_err());
    }
}
