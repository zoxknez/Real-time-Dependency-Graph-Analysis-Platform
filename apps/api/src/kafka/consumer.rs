//! Kafka consumer for broadcasting events to GraphQL subscriptions

use anyhow::{Context as _, Result};
use async_graphql::ID;
use rdkafka::{
    consumer::{Consumer, StreamConsumer},
    message::Headers,
    ClientConfig, Message,
};
use tokio::sync::broadcast;
use tokio_stream::StreamExt;
use tracing::{debug, error, info, warn};

use crate::config::KafkaConfig;
use crate::gql::types::{Ecosystem, EventMeta, Package, Version, VersionEvent};

/// Start the Kafka consumer that broadcasts events to GraphQL subscribers
pub async fn start_event_consumer(
    config: &KafkaConfig,
    event_tx: broadcast::Sender<VersionEvent>,
) -> Result<()> {
    info!(
        brokers = %config.brokers,
        topic = %config.topic,
        group = %config.consumer_group,
        "Starting Kafka event consumer for subscriptions"
    );

    let consumer: StreamConsumer = ClientConfig::new()
        .set("bootstrap.servers", &config.brokers)
        .set("group.id", &config.consumer_group)
        .set("enable.auto.commit", "true")
        .set("auto.offset.reset", "latest") // Only new events for subscriptions
        .set("session.timeout.ms", "30000")
        .create()
        .context("Failed to create Kafka consumer")?;

    consumer
        .subscribe(&[&config.topic])
        .context("Failed to subscribe to topic")?;

    info!("Kafka consumer started, listening for events...");

    // Process messages
    let mut stream = consumer.stream();
    
    while let Some(result) = stream.next().await {
        match result {
            Ok(msg) => {
                if let Err(e) = process_message(&msg, &event_tx).await {
                    warn!("Failed to process message: {}", e);
                }
            }
            Err(e) => {
                error!("Kafka consumer error: {}", e);
            }
        }
    }

    Ok(())
}

async fn process_message<M: Message>(
    msg: &M,
    event_tx: &broadcast::Sender<VersionEvent>,
) -> Result<()> {
    // Get event type from headers
    let event_type = msg
        .headers()
        .and_then(|h| {
            for i in 0..h.count() {
                let header = h.get_as::<str>(i);
                if let Ok(h) = header {
                    if h.key == "event_type" {
                        return h.value.map(|v| v.to_string());
                    }
                }
            }
            None
        })
        .unwrap_or_default();

    // Only process version.upserted events for now
    if event_type != "version.upserted" {
        return Ok(());
    }

    let payload = msg.payload().unwrap_or_default();
    
    // Parse the protobuf or JSON payload
    // For now, assume JSON format matching our domain events
    let event: serde_json::Value = serde_json::from_slice(payload)
        .context("Failed to parse event payload")?;

    // Extract fields
    let ecosystem = event["ecosystem"].as_str().unwrap_or("npm");
    let name = event["name"].as_str().unwrap_or("");
    let version_str = event["version"].as_str().unwrap_or("");
    let event_id = event["event_id"].as_str().unwrap_or("");
    let published_at = event["published_at"].as_i64();

    if name.is_empty() || version_str.is_empty() {
        return Ok(());
    }

    let package_id = format!("{}:{}", ecosystem, name);
    let version_id = format!("{}:{}:{}", ecosystem, name, version_str);

    let version_event = VersionEvent {
        meta: EventMeta {
            event_id: ID(event_id.to_string()),
            occurred_at: chrono::Utc::now().to_rfc3339(),
            source: "kafka".to_string(),
            traceparent: None,
        },
        package: Package {
            id: ID(package_id),
            ecosystem: Ecosystem::from(ecosystem),
            name: name.to_string(),
            created_at: None,
            updated_at: None,
        },
        version: Version {
            id: ID(version_id),
            package_id: ID(format!("{}:{}", ecosystem, name)),
            version: version_str.to_string(),
            published_at: published_at.map(|ts| {
                chrono::DateTime::from_timestamp_millis(ts)
                    .map(|dt| dt.to_rfc3339())
                    .unwrap_or_default()
            }),
            yanked: false,
        },
    };

    // Broadcast to subscribers
    let subscriber_count = event_tx.receiver_count();
    if subscriber_count > 0 {
        debug!(
            subscriber_count,
            package = %version_event.package.name,
            version = %version_event.version.version,
            "Broadcasting version event to subscribers"
        );
        
        if event_tx.send(version_event).is_err() {
            // All receivers dropped - that's fine
        }
    }

    Ok(())
}
