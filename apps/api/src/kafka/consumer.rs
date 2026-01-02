//! Kafka consumer for broadcasting events to GraphQL subscriptions
//!
//! Supports multiple event types:
//! - version.upserted -> VersionEvent
//! - breaking_change.detected -> BreakingChangeEvent
//! - dependency.impact -> DependencyImpactEvent

use anyhow::{Context as _, Result};
use async_graphql::ID;
use rdkafka::{
    consumer::{Consumer, StreamConsumer},
    message::Headers,
    ClientConfig, Message,
};
use std::sync::Arc;
use tokio_stream::StreamExt;
use tracing::{debug, error, info, warn};

use crate::config::KafkaConfig;
use crate::gql::context::EventChannels;
use crate::gql::types::{
    Ecosystem, EventMeta, Package, Version, VersionEvent,
    BreakingChangeEvent, BreakingSeverity, BreakingChange,
    DependencyImpactEvent, LiveStatsEvent, EcosystemActivity,
};

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
    let topics = [
        &config.topic,
        "breaking-changes",
        "dependency-impact",
    ];
    
    consumer
        .subscribe(&topics)
        .context("Failed to subscribe to topics")?;

    info!("Kafka consumer started, listening for events on topics: {:?}", topics);

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

async fn process_message<M: Message>(
    msg: &M,
    channels: &EventChannels,
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

    let payload = msg.payload().unwrap_or_default();
    
    match event_type.as_str() {
        "version.upserted" => process_version_event(payload, channels).await?,
        "breaking_change.detected" => process_breaking_change_event(payload, channels).await?,
        "dependency.impact" => process_impact_event(payload, channels).await?,
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

async fn process_version_event(
    payload: &[u8],
    channels: &EventChannels,
) -> Result<()> {
    let event: serde_json::Value = serde_json::from_slice(payload)
        .context("Failed to parse version event payload")?;

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
            id: ID(package_id.clone()),
            ecosystem: Ecosystem::from(ecosystem),
            name: name.to_string(),
            created_at: None,
            updated_at: None,
        },
        version: Version {
            id: ID(version_id),
            package_id: ID(package_id),
            version: version_str.to_string(),
            published_at: published_at.map(|ts| {
                chrono::DateTime::from_timestamp_millis(ts)
                    .map(|dt| dt.to_rfc3339())
                    .unwrap_or_default()
            }),
            yanked: false,
        },
    };

    broadcast_event(&channels.version_tx, version_event, "version");
    Ok(())
}

async fn process_breaking_change_event(
    payload: &[u8],
    channels: &EventChannels,
) -> Result<()> {
    let event: serde_json::Value = serde_json::from_slice(payload)
        .context("Failed to parse breaking change event payload")?;

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

    broadcast_event(&channels.breaking_change_tx, breaking_event, "breaking_change");
    Ok(())
}

async fn process_impact_event(
    payload: &[u8],
    channels: &EventChannels,
) -> Result<()> {
    let event: serde_json::Value = serde_json::from_slice(payload)
        .context("Failed to parse impact event payload")?;

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
                        id: ID(format!("{}:{}", 
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

    broadcast_event(&channels.dependency_impact_tx, impact_event, "dependency_impact");
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
            event_type,
            "Broadcasting event to subscribers"
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
            ecosystem_activity: vec![
                EcosystemActivity {
                    ecosystem: Ecosystem::Npm,
                    packages_added: 0,
                    versions_added: 0,
                    change_rate_percent: 0.0,
                },
            ],
        };

        if channels.live_stats_tx.send(stats).is_err() {
            // No receivers
        }
    }
}
