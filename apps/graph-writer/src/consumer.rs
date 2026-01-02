//! Kafka consumer for domain package events
//!
//! Consumes from `domain.package.events.v1` topic (single topic envelope pattern)
//! Routes events by `event_type` header to appropriate handlers
//! Uses manual offset commit for at-least-once semantics

use anyhow::{Context, Result};
use rdkafka::consumer::{CommitMode, Consumer, StreamConsumer};
use rdkafka::message::{Headers, BorrowedMessage, Message};
use rdkafka::ClientConfig;
use std::sync::Arc;
use tokio::sync::watch;
use tracing::{debug, error, info, instrument, warn};

use crate::config::KafkaConfig;
use crate::dlq::DlqPublisher;
use crate::graph::MemgraphClient;
use crate::handlers::{
    handle_package_deleted, handle_version_upserted, handle_version_yanked,
    EVENT_TYPE_PACKAGE_DELETED, EVENT_TYPE_VERSION_UPSERTED, EVENT_TYPE_VERSION_YANKED,
    EVENT_TYPE_DOMAIN_VERSION_UPSERT, EVENT_TYPE_DOMAIN_PACKAGE_UPSERT,
};

/// Event consumer that processes domain package events
pub struct EventConsumer {
    consumer: Arc<StreamConsumer>,
    memgraph: MemgraphClient,
    dlq: DlqPublisher,
    #[allow(dead_code)]
    config: KafkaConfig,
}

impl EventConsumer {
    /// Create a new event consumer
    #[instrument(skip(config, memgraph, dlq), fields(group_id = %config.group_id))]
    pub async fn new(
        config: KafkaConfig,
        memgraph: MemgraphClient,
        dlq: DlqPublisher,
    ) -> Result<Self> {
        info!("Creating Kafka consumer...");

        let consumer: StreamConsumer = ClientConfig::new()
            .set("bootstrap.servers", &config.brokers)
            .set("group.id", &config.group_id)
            .set("auto.offset.reset", &config.auto_offset_reset)
            .set("enable.auto.commit", "false") // Manual commit for at-least-once
            .set("session.timeout.ms", config.session_timeout_ms.to_string())
            .set("heartbeat.interval.ms", config.heartbeat_interval_ms.to_string())
            .set("max.poll.interval.ms", config.max_poll_interval_ms.to_string())
            .create()
            .context("Failed to create Kafka consumer")?;

        // Subscribe to domain events topics (single topic + per-event-type topics)
        // This allows consuming from both the main envelope topic and specific topics
        let topics = [
            &config.topic as &str,                      // domain.package.events.v1
            "domain.package.upsert.v1",
            "domain.version.upsert.v1",
        ];
        consumer
            .subscribe(&topics)
            .context("Failed to subscribe to topics")?;

        info!(topics = ?topics, "Subscribed to topics");

        Ok(Self {
            consumer: Arc::new(consumer),
            memgraph,
            dlq,
            config,
        })
    }

    /// Run the consumer loop
    #[instrument(skip(self, shutdown_rx), name = "consumer_loop")]
    pub async fn run(&self, mut shutdown_rx: watch::Receiver<bool>) -> Result<()> {
        info!("Starting event consumer loop...");

        loop {
            tokio::select! {
                // Check for shutdown signal
                _ = shutdown_rx.changed() => {
                    if *shutdown_rx.borrow() {
                        info!("Shutdown signal received, stopping consumer");
                        break;
                    }
                }

                // Poll for messages
                msg_result = self.consumer.recv() => {
                    match msg_result {
                        Ok(msg) => {
                            if let Err(e) = self.process_message(&msg).await {
                                error!(
                                    error = %e,
                                    partition = msg.partition(),
                                    offset = msg.offset(),
                                    "Failed to process message"
                                );
                                // Error handling is done in process_message (DLQ)
                            }
                        }
                        Err(e) => {
                            error!(error = %e, "Error receiving message from Kafka");
                            // Continue trying - Kafka will reconnect
                            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                        }
                    }
                }
            }
        }

        info!("Consumer loop stopped");
        Ok(())
    }

    /// Process a single Kafka message
    #[instrument(skip(self, msg), fields(
        partition = msg.partition(),
        offset = msg.offset()
    ))]
    async fn process_message(&self, msg: &BorrowedMessage<'_>) -> Result<()> {
        let start = std::time::Instant::now();
        metrics::counter!("graph_writer_messages_received_total").increment(1);

        // Get event type from header
        let event_type = self.get_header(msg, "event_type")
            .unwrap_or_default();

        // Get payload
        let payload = match msg.payload() {
            Some(p) => p,
            None => {
                warn!("Empty message payload, skipping");
                self.commit_offset(msg)?;
                return Ok(());
            }
        };

        debug!(
            event_type = %event_type,
            payload_size = payload.len(),
            "Processing message"
        );

        // Route by event type
        let result = match event_type.as_str() {
            // Original C4-style event types
            EVENT_TYPE_VERSION_UPSERTED => {
                handle_version_upserted(&self.memgraph, payload).await
            }
            EVENT_TYPE_VERSION_YANKED => {
                handle_version_yanked(&self.memgraph, payload).await
            }
            EVENT_TYPE_PACKAGE_DELETED => {
                handle_package_deleted(&self.memgraph, payload).await
            }
            // PyPI/Cargo topic-style event types (same handlers)
            EVENT_TYPE_DOMAIN_VERSION_UPSERT => {
                handle_version_upserted(&self.memgraph, payload).await
            }
            EVENT_TYPE_DOMAIN_PACKAGE_UPSERT => {
                // For package upsert, we create the Package node via version handler
                // since VersionUpserted contains package info. Skip pure package events.
                debug!("Package upsert event - package nodes created via version events");
                Ok(())
            }
            unknown => {
                warn!(event_type = %unknown, "Unknown event type, sending to DLQ");
                self.send_to_dlq(
                    payload,
                    "unknown_event_type",
                    &format!("Unknown event type: {}", unknown),
                ).await?;
                // Commit offset even for unknown events (they're in DLQ now)
                self.commit_offset(msg)?;
                return Ok(());
            }
        };

        // Clone event_type for later use
        let event_type_label = event_type.clone();

        // Handle processing result
        match result {
            Ok(()) => {
                // SUCCESS: Commit offset only after Memgraph write
                self.commit_offset(msg)?;
                
                let elapsed = start.elapsed();
                metrics::counter!("graph_writer_messages_processed_total", "status" => "success", "event_type" => event_type_label.clone()).increment(1);
                metrics::histogram!("graph_writer_message_processing_seconds", "event_type" => event_type_label.clone()).record(elapsed.as_secs_f64());
                
                debug!(
                    event_type = %event_type,
                    elapsed_ms = elapsed.as_millis(),
                    "Message processed successfully"
                );
            }
            Err(e) => {
                // FAILURE: Send to DLQ, then commit
                error!(
                    error = %e,
                    event_type = %event_type,
                    "Failed to process event, sending to DLQ"
                );
                
                self.send_to_dlq(
                    payload,
                    "processing_error",
                    &e.to_string(),
                ).await?;
                
                // Commit offset after DLQ write (event is handled, just failed)
                self.commit_offset(msg)?;
                
                metrics::counter!("graph_writer_messages_processed_total", "status" => "failed", "event_type" => event_type_label).increment(1);
            }
        }

        Ok(())
    }

    /// Extract a header value from Kafka message headers
    fn get_header(&self, msg: &BorrowedMessage<'_>, key: &str) -> Option<String> {
        msg.headers().and_then(|headers| {
            for i in 0..headers.count() {
                let header = headers.get(i);
                if header.key == key {
                    if let Some(value) = header.value {
                        return String::from_utf8(value.to_vec()).ok();
                    }
                }
            }
            None
        })
    }

    /// Commit the current offset
    fn commit_offset(&self, msg: &BorrowedMessage<'_>) -> Result<()> {
        self.consumer
            .commit_message(msg, CommitMode::Async)
            .context("Failed to commit offset")?;
        Ok(())
    }

    /// Send a failed message to the Dead Letter Queue
    async fn send_to_dlq(
        &self,
        payload: &[u8],
        error_type: &str,
        error_message: &str,
    ) -> Result<()> {
        // Try to extract ecosystem/package from payload (best effort)
        let (ecosystem, package_name) = self.extract_identifiers(payload);
        
        self.dlq.publish(
            &ecosystem,
            &package_name,
            error_type,
            error_message,
            payload,
            1, // Single attempt before DLQ (can be enhanced with retry logic)
        ).await
    }

    /// Best-effort extraction of ecosystem and package from protobuf payload
    fn extract_identifiers(&self, payload: &[u8]) -> (String, String) {
        // Try to decode as VersionUpserted first (most common)
        use prost::Message;
        use crate::proto_gen::domain::package::v1::VersionUpserted;
        
        if let Ok(event) = VersionUpserted::decode(payload) {
            return (event.ecosystem, event.package_name);
        }

        // Try VersionYanked
        use crate::proto_gen::domain::package::v1::VersionYanked;
        if let Ok(event) = VersionYanked::decode(payload) {
            return (event.ecosystem, event.package_name);
        }

        // Try PackageDeleted
        use crate::proto_gen::domain::package::v1::PackageDeleted;
        if let Ok(event) = PackageDeleted::decode(payload) {
            return (event.ecosystem, event.package_name);
        }

        // Fallback
        ("unknown".to_string(), "unknown".to_string())
    }
}
