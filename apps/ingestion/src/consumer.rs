use anyhow::Result;
use rdkafka::config::ClientConfig;
use rdkafka::consumer::{Consumer, StreamConsumer, CommitMode};
use rdkafka::message::Message as KafkaMessage;
use tracing::{info, warn};
use std::sync::Arc;

pub struct EventConsumer {
    consumer: Arc<StreamConsumer>, // Arc for thread safety if needed
}

impl EventConsumer {
    pub fn new(brokers: &str, group_id: &str, topic: &str) -> Result<Self> {
        let consumer: StreamConsumer = ClientConfig::new()
            .set("bootstrap.servers", brokers)
            .set("group.id", group_id)
            .set("enable.partition.eof", "false")
            .set("session.timeout.ms", "6000")
            .set("enable.auto.commit", "false") // Manual commit for at-least-once
            .set("auto.offset.reset", "earliest")
            .create()?;

        consumer.subscribe(&[topic])?;
        info!(brokers=%brokers, group=%group_id, topic=%topic, "Created Kafka consumer");

        Ok(Self {
            consumer: Arc::new(consumer),
        })
    }

    pub fn inner(&self) -> Arc<StreamConsumer> {
        self.consumer.clone()
    }
}
