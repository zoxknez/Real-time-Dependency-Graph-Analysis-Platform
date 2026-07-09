//! Dead Letter Queue Publisher for Vector Writer
//!
//! Publishes failed embedding events to a separate Kafka topic
//! for manual investigation and reprocessing.

use anyhow::{Context, Result};
use rdkafka::producer::{FutureProducer, FutureRecord};
use rdkafka::util::Timeout;
use serde::Serialize;
use std::sync::Arc;
use std::time::Duration;
use tracing::{error, instrument, warn};

use crate::config::KafkaConfig;

/// Event structure for DLQ messages
#[derive(Debug, Clone, Serialize)]
pub struct DlqEvent {
    pub event_id: String,
    pub source: String,
    pub package_id: String,
    pub version: String,
    pub error_type: String,
    pub error_message: String,
    pub attempts: i32,
    pub original_payload: String,
    pub failed_at: String,
    pub deadlettered_at: String,
}

/// Dead Letter Queue publisher for vector-writer
///
/// Publishes failed events to a separate topic for manual investigation
#[derive(Clone)]
pub struct DlqPublisher {
    producer: Arc<FutureProducer>,
    topic: String,
}

impl DlqPublisher {
    /// Create a new DLQ publisher
    pub fn new(config: &KafkaConfig) -> Result<Self> {
        use rdkafka::ClientConfig;

        let producer: FutureProducer = ClientConfig::new()
            .set("bootstrap.servers", &config.brokers)
            .set("message.timeout.ms", "30000")
            .set("acks", "all") // Ensure DLQ messages are durable
            .set("retries", "5")
            .set("retry.backoff.ms", "500")
            .create()
            .context("Failed to create Kafka producer for DLQ")?;

        Ok(Self {
            producer: Arc::new(producer),
            topic: config.dlq_topic.clone(),
        })
    }

    /// Publish a failed embedding event to the DLQ
    #[instrument(skip_all, fields(
        package_id = %package_id,
        version = %version,
        error_type = %error_type
    ))]
    pub async fn publish(
        &self,
        package_id: &str,
        version: &str,
        error_type: &str,
        error_message: &str,
        original_payload: &[u8],
        attempts: i32,
    ) -> Result<()> {
        let now = chrono::Utc::now();
        let event_id = format!(
            "dlq-vector-{}-{}-{}-{}",
            package_id.replace(':', "-"),
            version,
            now.timestamp_millis(),
            uuid::Uuid::new_v4()
        );

        let dlq_event = DlqEvent {
            event_id: event_id.clone(),
            source: "vector-writer".to_string(),
            package_id: package_id.to_string(),
            version: version.to_string(),
            error_type: error_type.to_string(),
            error_message: error_message.to_string(),
            attempts,
            original_payload: String::from_utf8_lossy(original_payload).to_string(),
            failed_at: now.to_rfc3339(),
            deadlettered_at: now.to_rfc3339(),
        };

        let payload = serde_json::to_vec(&dlq_event).context("Failed to serialize DLQ event")?;

        let partition_key = format!("{}:{}", package_id, version);

        let record = FutureRecord::to(&self.topic)
            .key(&partition_key)
            .payload(&payload)
            .headers(
                rdkafka::message::OwnedHeaders::new()
                    .insert(rdkafka::message::Header {
                        key: "event_type",
                        value: Some("embedding.error"),
                    })
                    .insert(rdkafka::message::Header {
                        key: "content_type",
                        value: Some("application/json"),
                    }),
            );

        match self
            .producer
            .send(record, Timeout::After(Duration::from_secs(30)))
            .await
        {
            Ok(delivery) => {
                warn!(
                    event_id = %event_id,
                    partition = delivery.partition,
                    offset = delivery.offset,
                    "Event sent to DLQ"
                );
                metrics::counter!("vector_writer_dlq_published_total").increment(1);
                Ok(())
            }
            Err((err, _)) => {
                error!(
                    error = %err,
                    "Failed to publish to DLQ - event may be lost!"
                );
                metrics::counter!("vector_writer_dlq_publish_failed_total").increment(1);
                Err(err.into())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    // Integration tests require running Kafka
    // Unit tests can mock the producer
}
