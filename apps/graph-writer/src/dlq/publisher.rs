use anyhow::{Context, Result};
use prost::Message;
use rdkafka::producer::{FutureProducer, FutureRecord};
use rdkafka::util::Timeout;
use std::sync::Arc;
use std::time::Duration;
use tracing::{error, instrument, warn};

use crate::config::KafkaConfig;
use crate::proto_gen::domain::package::v1::IngestionError;
use crate::proto_gen::shared::event::v1::EventMeta;

/// Dead Letter Queue publisher
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

    /// Publish a failed event to the DLQ
    #[instrument(skip_all, fields(
        ecosystem = %ecosystem,
        package = %package_name,
        error_type = %error_type
    ))]
    pub async fn publish(
        &self,
        ecosystem: &str,
        package_name: &str,
        error_type: &str,
        error_message: &str,
        original_payload: &[u8],
        attempts: i32,
    ) -> Result<()> {
        let event_id = format!(
            "dlq-{}-{}-{}-{}",
            ecosystem,
            package_name,
            chrono::Utc::now().timestamp_millis(),
            uuid::Uuid::new_v4()
        );

        let event_meta = EventMeta {
            event_id: event_id.clone(),
            source: "graph-writer".to_string(),
            traceparent: String::new(),
            occurred_at: Some(prost_types::Timestamp::from(std::time::SystemTime::now())),
            schema_version: "v1".to_string(),
        };

        let now = std::time::SystemTime::now();
        let error_event = IngestionError {
            meta: Some(event_meta),
            ecosystem: ecosystem.to_string(),
            package_name: package_name.to_string(),
            error_type: error_type.to_string(),
            error_message: error_message.to_string(),
            attempts,
            original_payload: original_payload.to_vec(),
            first_failed_at: Some(prost_types::Timestamp::from(now)),
            deadlettered_at: Some(prost_types::Timestamp::from(now)),
        };

        let payload = error_event.encode_to_vec();
        let partition_key = format!("{}:{}", ecosystem, package_name);

        let record = FutureRecord::to(&self.topic)
            .key(&partition_key)
            .payload(&payload)
            .headers(rdkafka::message::OwnedHeaders::new()
                .insert(rdkafka::message::Header {
                    key: "event_type",
                    value: Some("ingestion.error"),
                })
                .insert(rdkafka::message::Header {
                    key: "content_type",
                    value: Some("application/x-protobuf"),
                })
            );

        match self.producer.send(record, Timeout::After(Duration::from_secs(30))).await {
            Ok((partition, offset)) => {
                warn!(
                    event_id = %event_id,
                    partition,
                    offset,
                    "Event sent to DLQ"
                );
                metrics::counter!("graph_writer_dlq_published_total").increment(1);
                Ok(())
            }
            Err((err, _)) => {
                error!(
                    error = %err,
                    "Failed to publish to DLQ - event may be lost!"
                );
                metrics::counter!("graph_writer_dlq_publish_failed_total").increment(1);
                Err(err.into())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Integration tests require running Kafka
    // Unit tests can mock the producer
}
