//! Kafka/Redpanda producer for publishing events

use anyhow::Result;
use rdkafka::config::ClientConfig;
use rdkafka::producer::{FutureProducer, FutureRecord, Producer};
use rdkafka::util::Timeout;
use std::time::Duration;
use tracing::{debug, error, info};
use prost::Message;

/// Event producer for Redpanda
pub struct EventProducer {
    producer: FutureProducer,
    topic: String,
}

impl EventProducer {
    /// Create a new producer connected to Redpanda
    pub fn new(brokers: &str, topic: &str) -> Result<Self> {
        let producer: FutureProducer = ClientConfig::new()
            .set("bootstrap.servers", brokers)
            .set("message.timeout.ms", "5000") // 5s timeout
            .set("batch.size", "65536")
            .set("linger.ms", "5")
            .set("acks", "all")
            .set("enable.idempotence", "true") // Enterprise Idempotency
            .create()?;
        
        info!(brokers = %brokers, topic = %topic, "Created Kafka producer");
        
        Ok(Self {
            producer,
            topic: topic.to_string(),
        })
    }
    
    /// Get the underlying FutureProducer (for OutboxPublisher)
    pub fn inner_producer(&self) -> &FutureProducer {
        &self.producer
    }
    
    /// Publish a protobuf message to the default topic
    pub async fn publish<M: Message>(&self, key: &str, message: &M) -> Result<()> {
        let payload = message.encode_to_vec();
        self.publish_bytes(&self.topic, key, &payload).await
    }

    /// Publish raw bytes to a specific topic (e.g. for RAW streams)
    pub async fn publish_raw(&self, topic: &str, key: &str, payload: &[u8]) -> Result<()> {
        self.publish_bytes(topic, key, payload).await
    }

    /// Internal helper
    async fn publish_bytes(&self, topic: &str, key: &str, payload: &[u8]) -> Result<()> {
        let record = FutureRecord::to(topic)
            .key(key)
            .payload(payload);
        
        // Wait for ACK
        match self.producer.send(record, Timeout::After(Duration::from_secs(10))).await {
            Ok((partition, offset)) => {
                debug!(topic=%topic, key=%key, partition=%partition, offset=%offset, "Published message");
                Ok(())
            }
            Err((err, _)) => {
                error!(topic=%topic, key=%key, error=%err, "Failed to publish message");
                Err(err.into())
            }
        }
    }
    
    /// Flush pending messages
    pub fn flush(&self, timeout: Duration) -> Result<()> {
        info!("Flushing producer messages...");
        match self.producer.flush(Timeout::After(timeout)) {
            Ok(_) => {
                info!("Producer flushed successfully.");
                Ok(())
            }
            Err(e) => {
                error!("Failed to flush producer: {:?}", e);
                Err(e.into()) 
            }
        }
    }
}

impl Drop for EventProducer {
    fn drop(&mut self) {
        let _ = self.flush(Duration::from_secs(5));
    }
}
