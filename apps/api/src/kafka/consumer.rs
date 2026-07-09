//! Kafka consumer for broadcasting events to GraphQL subscriptions
//!
//! Supports multiple event types:
//! - version.upserted -> VersionEvent
//! - breaking_change.detected -> BreakingChangeEvent
//! - dependency.impact -> DependencyImpactEvent

use anyhow::{Context as _, Result};
use async_graphql::ID;
use prost::Message as ProstMessage;
use rdkafka::{
    ClientConfig, Message,
    consumer::{Consumer, StreamConsumer},
    message::Headers,
};
use std::sync::Arc;
use tokio_stream::StreamExt;
use tracing::{debug, error, info, warn};

use crate::config::KafkaConfig;
use crate::gql::context::EventChannels;
use crate::gql::types::{
    BreakingChange, BreakingChangeEvent, BreakingSeverity, DependencyImpactEvent, Ecosystem,
    EcosystemActivity, EventMeta, LiveStatsEvent, Package, Version, VersionEvent,
};
use crate::proto_gen::domain::package::v1::VersionUpserted;

/// Start the Kafka consumer that broadcasts events to GraphQL subscribers
pub async fn start_event_consumer(
    config: &KafkaConfig,
    channels: Arc<EventChannels>,
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
        .set("auto.offset.reset", "latest")
        .set("session.timeout.ms", "30000")
        .create()
        .context("Failed to create Kafka consumer")?;

    // Subscribe to all relevant topics
    let topics = [&config.topic, "breaking-changes", "dependency-impact"];

    consumer
        .subscribe(&topics)
        .context("Failed to subscribe to topics")?;

    info!(
        "Kafka consumer started, listening for events on topics: {:?}",
        topics
    );

    // Also start the live stats broadcaster
    let stats_channels = channels.clone();
    tokio::spawn(async move {
        start_live_stats_broadcaster(stats_channels).await;
    });

    // Process messages
    let mut stream = consumer.stream();

    while let Some(result) = stream.next().await {
        match result {
            Ok(msg) => {
                if let Err(e) = process_message(&msg, &channels).await {
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

async fn process_message<M: Message>(msg: &M, channels: &EventChannels) -> Result<()> {
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

    let payload = msg.payload().unwrap_or_default();

    match event_type.as_str() {
        "version.upserted" | "domain.version.upsert.v1" => {
            process_version_event(payload, channels).await?
        }
        "breaking_change.detected" => process_breaking_change_event(payload, channels).await?,
        "dependency.impact" => process_impact_event(payload, channels).await?,
        "version.yanked"
        | "domain.version.yanked.v1"
        | "package.deleted"
        | "domain.package.deleted.v1" => {
            debug!(
                event_type,
                "Ignoring package lifecycle event without subscription mapping"
            );
        }
        _ => {
            // Try to infer from topic
            let topic = msg.topic();
            if topic.contains("breaking") {
                process_breaking_change_event(payload, channels).await?;
            } else if topic.contains("impact") {
                process_impact_event(payload, channels).await?;
            }
        }
    }

    Ok(())
}

async fn process_version_event(payload: &[u8], channels: &EventChannels) -> Result<()> {
    let Some(event) = decode_version_event(payload)? else {
        return Ok(());
    };

    if event.name.is_empty() || event.version.is_empty() {
        return Ok(());
    }

    let package_id = format!("{}:{}", event.ecosystem, event.name);
    let version_id = format!("{}:{}:{}", event.ecosystem, event.name, event.version);

    let version_event = VersionEvent {
        meta: EventMeta {
            event_id: ID(event.event_id),
            occurred_at: event
                .occurred_at
                .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
            source: "kafka".to_string(),
            traceparent: None,
        },
        package: Package {
            id: ID(package_id.clone()),
            ecosystem: Ecosystem::from(event.ecosystem.as_str()),
            name: event.name,
            created_at: None,
            updated_at: None,
        },
        version: Version {
            id: ID(version_id),
            package_id: ID(package_id),
            version: event.version,
            published_at: event.published_at,
            yanked: false,
        },
    };

    broadcast_event(&channels.version_tx, version_event, "version");
    Ok(())
}

struct DecodedVersionEvent {
    ecosystem: String,
    name: String,
    version: String,
    event_id: String,
    occurred_at: Option<String>,
    published_at: Option<String>,
}

fn decode_version_event(payload: &[u8]) -> Result<Option<DecodedVersionEvent>> {
    if let Ok(event) = serde_json::from_slice::<serde_json::Value>(payload) {
        let ecosystem = event["ecosystem"].as_str().unwrap_or("npm").to_string();
        let name = event["name"]
            .as_str()
            .or_else(|| event["package_name"].as_str())
            .unwrap_or("")
            .to_string();
        let version = event["version"].as_str().unwrap_or("").to_string();
        let event_id = event["event_id"].as_str().unwrap_or("").to_string();
        let occurred_at = event["occurred_at"].as_str().map(String::from);
        let published_at = decode_json_timestamp(&event["published_at"]);

        return Ok(Some(DecodedVersionEvent {
            ecosystem,
            name,
            version,
            event_id,
            occurred_at,
            published_at,
        }));
    }

    let event = VersionUpserted::decode(payload)
        .context("Failed to parse version event payload as JSON or VersionUpserted protobuf")?;

    if event.yanked {
        return Ok(None);
    }

    let (event_id, occurred_at) = event
        .meta
        .as_ref()
        .map(|meta| {
            (
                meta.event_id.clone(),
                meta.occurred_at
                    .as_ref()
                    .and_then(protobuf_timestamp_to_rfc3339),
            )
        })
        .unwrap_or_default();

    Ok(Some(DecodedVersionEvent {
        ecosystem: event.ecosystem,
        name: event.package_name,
        version: event.version,
        event_id,
        occurred_at,
        published_at: event
            .published_at
            .as_ref()
            .and_then(protobuf_timestamp_to_rfc3339),
    }))
}

fn decode_json_timestamp(value: &serde_json::Value) -> Option<String> {
    if let Some(timestamp) = value.as_i64() {
        return chrono::DateTime::from_timestamp_millis(timestamp).map(|dt| dt.to_rfc3339());
    }
    value.as_str().map(String::from)
}

fn protobuf_timestamp_to_rfc3339(timestamp: &prost_types::Timestamp) -> Option<String> {
    let nanos = timestamp.nanos.clamp(0, 999_999_999) as u32;
    chrono::DateTime::<chrono::Utc>::from_timestamp(timestamp.seconds, nanos)
        .map(|dt| dt.to_rfc3339())
}

async fn process_breaking_change_event(payload: &[u8], channels: &EventChannels) -> Result<()> {
    let event: serde_json::Value =
        serde_json::from_slice(payload).context("Failed to parse breaking change event payload")?;

    let ecosystem = event["ecosystem"].as_str().unwrap_or("npm");
    let name = event["name"].as_str().unwrap_or("");
    let old_version = event["old_version"].as_str().unwrap_or("");
    let new_version = event["new_version"].as_str().unwrap_or("");
    let event_id = event["event_id"].as_str().unwrap_or("");

    let severity_str = event["severity"].as_str().unwrap_or("low");
    let severity = match severity_str.to_lowercase().as_str() {
        "critical" => BreakingSeverity::Critical,
        "high" => BreakingSeverity::High,
        "medium" => BreakingSeverity::Medium,
        _ => BreakingSeverity::Low,
    };

    let changes: Vec<BreakingChange> = event["changes"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|c| {
                    Some(BreakingChange {
                        change_type: c["type"].as_str()?.to_string(),
                        description: c["description"].as_str().unwrap_or("").to_string(),
                        symbol: c["symbol"].as_str().map(String::from),
                        migration_hint: c["migration_hint"].as_str().map(String::from),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let affected_dependents = event["affected_dependents"].as_i64().unwrap_or(0) as i32;

    if name.is_empty() {
        return Ok(());
    }

    let package_id = format!("{}:{}", ecosystem, name);

    let breaking_event = BreakingChangeEvent {
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
        old_version: old_version.to_string(),
        new_version: new_version.to_string(),
        severity,
        changes,
        affected_dependents,
    };

    broadcast_event(
        &channels.breaking_change_tx,
        breaking_event,
        "breaking_change",
    );
    Ok(())
}

async fn process_impact_event(payload: &[u8], channels: &EventChannels) -> Result<()> {
    let event: serde_json::Value =
        serde_json::from_slice(payload).context("Failed to parse impact event payload")?;

    let ecosystem = event["ecosystem"].as_str().unwrap_or("npm");
    let name = event["name"].as_str().unwrap_or("");
    let version = event["version"].as_str().unwrap_or("");
    let event_id = event["event_id"].as_str().unwrap_or("");
    let impact_score = event["impact_score"].as_f64().unwrap_or(0.0);
    let direct_dependents = event["direct_dependents"].as_i64().unwrap_or(0) as i32;
    let transitive_dependents = event["transitive_dependents"].as_i64().unwrap_or(0) as i32;

    if name.is_empty() {
        return Ok(());
    }

    let package_id = format!("{}:{}", ecosystem, name);

    let notable_dependents: Vec<Package> = event["notable_dependents"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|p| {
                    Some(Package {
                        id: ID(format!(
                            "{}:{}",
                            p["ecosystem"].as_str().unwrap_or(ecosystem),
                            p["name"].as_str()?
                        )),
                        ecosystem: Ecosystem::from(p["ecosystem"].as_str().unwrap_or(ecosystem)),
                        name: p["name"].as_str()?.to_string(),
                        created_at: None,
                        updated_at: None,
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let impact_event = DependencyImpactEvent {
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
        version: version.to_string(),
        impact_score,
        direct_dependents,
        transitive_dependents,
        notable_dependents,
    };

    broadcast_event(
        &channels.dependency_impact_tx,
        impact_event,
        "dependency_impact",
    );
    Ok(())
}

/// Broadcast an event to subscribers
fn broadcast_event<T: Clone + std::fmt::Debug>(
    tx: &tokio::sync::broadcast::Sender<T>,
    event: T,
    event_type: &str,
) {
    let subscriber_count = tx.receiver_count();
    if subscriber_count > 0 {
        debug!(
            subscriber_count,
            event_type, "Broadcasting event to subscribers"
        );

        if tx.send(event).is_err() {
            // All receivers dropped
        }
    }
}

/// Periodically broadcast live statistics
async fn start_live_stats_broadcaster(channels: Arc<EventChannels>) {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(5));

    loop {
        interval.tick().await;

        // Only broadcast if there are subscribers
        if channels.live_stats_tx.receiver_count() == 0 {
            continue;
        }

        // In production, these would come from actual metrics
        let stats = LiveStatsEvent {
            timestamp: chrono::Utc::now().to_rfc3339(),
            total_packages: 0, // Would query from graph
            total_versions: 0,
            packages_last_hour: 0,
            versions_last_hour: 0,
            active_subscriptions: channels.subscription_count(),
            processing_queue_size: 0,
            ecosystem_activity: vec![EcosystemActivity {
                ecosystem: Ecosystem::Npm,
                packages_added: 0,
                versions_added: 0,
                change_rate_percent: 0.0,
            }],
        };

        if channels.live_stats_tx.send(stats).is_err() {
            // No receivers
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::proto_gen::shared::event::v1::EventMeta as ProtoEventMeta;

    #[test]
    fn decodes_json_version_event() {
        let payload = serde_json::json!({
            "ecosystem": "npm",
            "name": "react",
            "version": "19.0.0",
            "event_id": "evt-json",
            "published_at": 1_704_067_200_000i64
        })
        .to_string();

        let event = decode_version_event(payload.as_bytes()).unwrap().unwrap();

        assert_eq!(event.ecosystem, "npm");
        assert_eq!(event.name, "react");
        assert_eq!(event.version, "19.0.0");
        assert_eq!(event.event_id, "evt-json");
        assert!(event.published_at.is_some());
    }

    #[test]
    fn decodes_protobuf_version_event() {
        let payload = VersionUpserted {
            meta: Some(ProtoEventMeta {
                event_id: "evt-proto".to_string(),
                source: "test".to_string(),
                traceparent: String::new(),
                occurred_at: Some(prost_types::Timestamp {
                    seconds: 1_704_067_200,
                    nanos: 0,
                }),
                schema_version: "v1".to_string(),
            }),
            ecosystem: "npm".to_string(),
            package_name: "uuid".to_string(),
            version: "9.0.0".to_string(),
            yanked: false,
            tarball_url: "https://registry.npmjs.org/uuid/-/uuid-9.0.0.tgz".to_string(),
            integrity: "sha512-test".to_string(),
            size_bytes: 1024,
            published_at: Some(prost_types::Timestamp {
                seconds: 1_704_067_200,
                nanos: 0,
            }),
            dependencies: vec![],
            dev_dependencies: vec![],
            optional_dependencies: vec![],
        }
        .encode_to_vec();

        let event = decode_version_event(&payload).unwrap().unwrap();

        assert_eq!(event.ecosystem, "npm");
        assert_eq!(event.name, "uuid");
        assert_eq!(event.version, "9.0.0");
        assert_eq!(event.event_id, "evt-proto");
        assert!(event.occurred_at.is_some());
        assert!(event.published_at.is_some());
    }
}
