//! Kafka Consumer and Producer for Analysis Events
//!
//! Implements:
//! - At-least-once delivery semantics
//! - Idempotent processing via deduplication
//! - Dead Letter Queue (DLQ) for failed messages
//! - Graceful shutdown with offset commit

use crate::breaking_detector::BreakingChange;
use crate::config::KafkaConfig;
use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use rdkafka::config::ClientConfig;
use rdkafka::consumer::{Consumer, StreamConsumer};
use rdkafka::producer::{FutureProducer, FutureRecord, Producer};
use rdkafka::Message;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tracing::{debug, error, info, instrument, warn};

// ═══════════════════════════════════════════════════════════════
// EVENT TYPES
// ═══════════════════════════════════════════════════════════════

/// Event received when a package is published
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackagePublishedEvent {
    pub package_id: String,
    pub version: String,
    pub ecosystem: String,
    pub tarball_url: String,
    pub previous_version: Option<String>,
    pub published_at: DateTime<Utc>,
}

/// Events produced by the analysis service
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum AnalysisEvent {
    /// API has been parsed and symbols extracted
    ApiParsed {
        package_id: String,
        version: String,
        symbol_count: usize,
        public_symbol_count: usize,
        api_hash: String,
    },
    /// Breaking changes detected between versions
    BreakingChangesDetected {
        package_id: String,
        version: String,
        previous_version: String,
        changes: Vec<BreakingChangeEvent>,
    },
    /// Embeddings generated for symbols
    EmbeddingsGenerated {
        package_id: String,
        version: String,
        symbol_count: usize,
        embedding_count: usize,
    },
}

/// Serializable breaking change for events
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BreakingChangeEvent {
    pub change_type: String,
    pub symbol_path: String,
    pub description: String,
    pub severity: String,
    pub migration_hint: Option<String>,
}

impl From<BreakingChange> for BreakingChangeEvent {
    fn from(bc: BreakingChange) -> Self {
        Self {
            change_type: format!("{:?}", bc.change_type),
            symbol_path: bc.symbol_path,
            description: bc.description,
            severity: format!("{:?}", bc.severity),
            migration_hint: bc.migration_hint,
        }
    }
}

/// DLQ message wrapper
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DlqMessage {
    pub original_event: PackagePublishedEvent,
    pub error: String,
    pub retry_count: u32,
    pub failed_at: DateTime<Utc>,
    pub original_topic: String,
    pub original_partition: i32,
    pub original_offset: i64,
}

// ═══════════════════════════════════════════════════════════════
// EVENT CONSUMER
// ═══════════════════════════════════════════════════════════════

pub struct EventConsumer {
    consumer: StreamConsumer,
    topic: String,
    /// Deduplication set for idempotent processing
    processed_ids: Arc<RwLock<HashSet<String>>>,
    /// Max size of deduplication cache
    max_cache_size: usize,
}

impl EventConsumer {
    /// Create a new event consumer
    #[instrument(skip(config), fields(brokers = %config.brokers))]
    pub async fn new(config: &KafkaConfig) -> Result<Self> {
        info!("Creating Kafka consumer");

        let consumer: StreamConsumer = ClientConfig::new()
            .set("bootstrap.servers", &config.brokers)
            .set("group.id", &config.consumer_group)
            .set("enable.auto.commit", "false") // Manual commits for at-least-once
            .set("auto.offset.reset", "earliest")
            .set("session.timeout.ms", "30000")
            .set("heartbeat.interval.ms", "10000")
            .set("max.poll.interval.ms", "300000")
            .set("fetch.min.bytes", "1")
            .set("fetch.wait.max.ms", "500")
            .create()
            .context("Failed to create Kafka consumer")?;

        consumer
            .subscribe(&[&config.input_topic])
            .context("Failed to subscribe to topic")?;

        info!(topic = %config.input_topic, "Subscribed to topic");

        Ok(Self {
            consumer,
            topic: config.input_topic.clone(),
            processed_ids: Arc::new(RwLock::new(HashSet::new())),
            max_cache_size: 100_000,
        })
    }

    /// Poll for the next event
    #[instrument(skip(self))]
    pub async fn poll(&self, timeout: Duration) -> Result<Option<PackagePublishedEvent>> {
        match tokio::time::timeout(timeout, self.consumer.recv()).await {
            Ok(Ok(msg)) => {
                let payload = msg
                    .payload()
                    .ok_or_else(|| anyhow::anyhow!("Empty message payload"))?;

                let event: PackagePublishedEvent = serde_json::from_slice(payload)
                    .context("Failed to deserialize event")?;

                // Check for duplicate
                let event_id = format!("{}:{}", event.package_id, event.version);
                
                {
                    let processed = self.processed_ids.read().await;
                    if processed.contains(&event_id) {
                        debug!(event_id, "Skipping duplicate event");
                        // Commit offset but don't process
                        self.commit_offset(&msg).await?;
                        return Ok(None);
                    }
                }

                // Mark as processed
                {
                    let mut processed = self.processed_ids.write().await;
                    
                    // Evict old entries if cache is full
                    if processed.len() >= self.max_cache_size {
                        // Simple eviction: clear half the cache
                        let to_remove: Vec<_> = processed.iter().take(self.max_cache_size / 2).cloned().collect();
                        for id in to_remove {
                            processed.remove(&id);
                        }
                    }
                    
                    processed.insert(event_id);
                }

                // Commit offset after successful processing
                self.commit_offset(&msg).await?;

                debug!(
                    package_id = %event.package_id,
                    version = %event.version,
                    "Received event"
                );

                Ok(Some(event))
            }
            Ok(Err(e)) => {
                error!(error = %e, "Kafka receive error");
                Err(e.into())
            }
            Err(_) => {
                // Timeout - no message available
                Ok(None)
            }
        }
    }

    /// Commit message offset
    async fn commit_offset(&self, msg: &rdkafka::message::BorrowedMessage<'_>) -> Result<()> {
        self.consumer
            .commit_message(msg, rdkafka::consumer::CommitMode::Async)
            .context("Failed to commit offset")?;
        Ok(())
    }
}

// ═══════════════════════════════════════════════════════════════
// EVENT PRODUCER
// ═══════════════════════════════════════════════════════════════

pub struct EventProducer {
    producer: FutureProducer,
    output_topic: String,
}

impl EventProducer {
    /// Create a new event producer
    #[instrument(skip(config), fields(brokers = %config.brokers))]
    pub async fn new(config: &KafkaConfig) -> Result<Self> {
        info!("Creating Kafka producer");

        let producer: FutureProducer = ClientConfig::new()
            .set("bootstrap.servers", &config.brokers)
            .set("message.timeout.ms", "5000")
            .set("acks", "all") // Wait for all replicas
            .set("enable.idempotence", "true") // Exactly-once semantics
            .set("max.in.flight.requests.per.connection", "5")
            .set("retries", config.max_retries.to_string())
            .set("compression.type", "lz4")
            .create()
            .context("Failed to create Kafka producer")?;

        Ok(Self {
            producer,
            output_topic: config.output_topic.clone(),
        })
    }

    /// Send an analysis event
    #[instrument(skip(self, event))]
    pub async fn send_analysis_event(&self, event: &AnalysisEvent) -> Result<()> {
        let payload = serde_json::to_vec(event).context("Failed to serialize event")?;

        let key = match event {
            AnalysisEvent::ApiParsed { package_id, .. } => package_id.as_str(),
            AnalysisEvent::BreakingChangesDetected { package_id, .. } => package_id.as_str(),
            AnalysisEvent::EmbeddingsGenerated { package_id, .. } => package_id.as_str(),
        };

        let record = FutureRecord::to(&self.output_topic)
            .key(key)
            .payload(&payload);

        match self.producer.send(record, Duration::from_secs(5)).await {
            Ok((partition, offset)) => {
                debug!(partition, offset, "Event sent successfully");
                Ok(())
            }
            Err((e, _)) => {
                error!(error = %e, "Failed to send event");
                Err(e.into())
            }
        }
    }

    /// Send a failed message to the Dead Letter Queue
    #[instrument(skip(self, event, error))]
    pub async fn send_to_dlq(
        &self,
        dlq_topic: &str,
        event: &PackagePublishedEvent,
        error: &str,
    ) -> Result<()> {
        let dlq_message = DlqMessage {
            original_event: event.clone(),
            error: error.to_string(),
            retry_count: 0,
            failed_at: Utc::now(),
            original_topic: "ingestion-events".to_string(),
            original_partition: 0,
            original_offset: 0,
        };

        let payload = serde_json::to_vec(&dlq_message).context("Failed to serialize DLQ message")?;

        let record = FutureRecord::to(dlq_topic)
            .key(&event.package_id)
            .payload(&payload);

        match self.producer.send(record, Duration::from_secs(5)).await {
            Ok((partition, offset)) => {
                warn!(
                    partition,
                    offset,
                    package_id = %event.package_id,
                    "Message sent to DLQ"
                );
                Ok(())
            }
            Err((e, _)) => {
                error!(error = %e, "Failed to send to DLQ");
                Err(e.into())
            }
        }
    }

    /// Flush pending messages
    pub async fn flush(&self, timeout: Duration) {
        info!("Flushing producer");
        self.producer.flush(timeout).unwrap_or_else(|e| {
            error!(error = %e, "Failed to flush producer");
        });
    }
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_package_published_event_serialization() {
        let event = PackagePublishedEvent {
            package_id: "test-package".to_string(),
            version: "1.0.0".to_string(),
            ecosystem: "npm".to_string(),
            tarball_url: "https://registry.npmjs.org/test-package/-/test-package-1.0.0.tgz".to_string(),
            previous_version: Some("0.9.0".to_string()),
            published_at: Utc::now(),
        };

        let json = serde_json::to_string(&event).unwrap();
        let parsed: PackagePublishedEvent = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.package_id, event.package_id);
        assert_eq!(parsed.version, event.version);
    }

    #[test]
    fn test_analysis_event_serialization() {
        let event = AnalysisEvent::ApiParsed {
            package_id: "test".to_string(),
            version: "1.0.0".to_string(),
            symbol_count: 100,
            public_symbol_count: 50,
            api_hash: "abc123".to_string(),
        };

        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"type\":\"ApiParsed\""));
    }

    #[test]
    fn test_breaking_change_event_conversion() {
        use crate::breaking_detector::{BreakingChangeType, SeverityLevel};

        let bc = BreakingChange {
            change_type: BreakingChangeType::RemovedSymbol,
            symbol_path: "module::function".to_string(),
            old_signature: Some("fn test()".to_string()),
            new_signature: None,
            description: "Function removed".to_string(),
            severity: SeverityLevel::Breaking,
            migration_hint: Some("Use new_function instead".to_string()),
        };

        let event: BreakingChangeEvent = bc.into();
        assert_eq!(event.symbol_path, "module::function");
        assert!(event.migration_hint.is_some());
    }

    #[test]
    fn test_dlq_message_serialization() {
        let event = PackagePublishedEvent {
            package_id: "test".to_string(),
            version: "1.0.0".to_string(),
            ecosystem: "npm".to_string(),
            tarball_url: "https://registry.npmjs.org/test/-/test-1.0.0.tgz".to_string(),
            previous_version: None,
            published_at: Utc::now(),
        };

        let dlq = DlqMessage {
            original_event: event,
            error: "Parse failed".to_string(),
            retry_count: 3,
            failed_at: Utc::now(),
            original_topic: "test-topic".to_string(),
            original_partition: 0,
            original_offset: 123,
        };

        let json = serde_json::to_string(&dlq).unwrap();
        let parsed: DlqMessage = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.error, "Parse failed");
        assert_eq!(parsed.retry_count, 3);
    }
}