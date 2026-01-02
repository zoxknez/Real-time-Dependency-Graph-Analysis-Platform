//! Kafka Consumer for Embedding Events
//!
//! Consumes analysis events and writes embeddings to Qdrant

use crate::config::KafkaConfig;
use crate::writer::{PayloadValue, VectorPoint, VectorWriter};
use anyhow::{Context, Result};
use rdkafka::config::ClientConfig;
use rdkafka::consumer::{Consumer, StreamConsumer};
use rdkafka::Message;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::watch;
use tracing::{debug, error, info, instrument, warn};

/// Event received from analysis service
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type")]
pub enum AnalysisEvent {
    EmbeddingsGenerated(EmbeddingsEvent),
    #[serde(other)]
    Other,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EmbeddingsEvent {
    pub package_id: String,
    pub version: String,
    pub symbols: Vec<SymbolEmbedding>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SymbolEmbedding {
    pub symbol_id: String,
    pub name: String,
    pub kind: String,
    pub vector: Vec<f32>,
    pub documentation: Option<String>,
}

/// Kafka event consumer
pub struct EventConsumer {
    consumer: StreamConsumer,
    writer: Arc<VectorWriter>,
    batch_size: usize,
}

impl EventConsumer {
    /// Create new consumer
    #[instrument(skip(config, writer), fields(brokers = %config.brokers))]
    pub async fn new(config: &KafkaConfig, writer: Arc<VectorWriter>) -> Result<Self> {
        info!("Creating Kafka consumer");

        let consumer: StreamConsumer = ClientConfig::new()
            .set("bootstrap.servers", &config.brokers)
            .set("group.id", &config.group_id)
            .set("enable.auto.commit", "false")
            .set("auto.offset.reset", "earliest")
            .set("session.timeout.ms", "30000")
            .create()
            .context("Failed to create Kafka consumer")?;

        consumer
            .subscribe(&[&config.topic])
            .context("Failed to subscribe to topic")?;

        info!(topic = %config.topic, "Subscribed to topic");

        Ok(Self {
            consumer,
            writer,
            batch_size: 100,
        })
    }

    /// Run consumer loop
    pub async fn run(self, mut shutdown: watch::Receiver<bool>) -> Result<()> {
        info!("Starting consumer loop");

        let mut batch: Vec<VectorPoint> = Vec::with_capacity(self.batch_size);
        let flush_interval = Duration::from_secs(5);
        let mut last_flush = std::time::Instant::now();

        loop {
            tokio::select! {
                _ = shutdown.changed() => {
                    if *shutdown.borrow() {
                        info!("Shutdown signal received, flushing remaining batch");
                        if !batch.is_empty() {
                            self.flush_batch(&mut batch).await;
                        }
                        break;
                    }
                }
                result = tokio::time::timeout(Duration::from_millis(100), self.consumer.recv()) => {
                    match result {
                        Ok(Ok(msg)) => {
                            if let Some(payload) = msg.payload() {
                                match serde_json::from_slice::<AnalysisEvent>(payload) {
                                    Ok(AnalysisEvent::EmbeddingsGenerated(event)) => {
                                        self.process_embeddings_event(&event, &mut batch);
                                    }
                                    Ok(AnalysisEvent::Other) => {
                                        debug!("Ignoring non-embedding event");
                                    }
                                    Err(e) => {
                                        warn!(error = %e, "Failed to parse event");
                                    }
                                }
                            }

                            // Commit offset
                            if let Err(e) = self.consumer.commit_message(&msg, rdkafka::consumer::CommitMode::Async) {
                                error!(error = %e, "Failed to commit offset");
                            }
                        }
                        Ok(Err(e)) => {
                            error!(error = %e, "Kafka error");
                        }
                        Err(_) => {
                            // Timeout - check if we should flush
                        }
                    }

                    // Flush if batch is full or interval elapsed
                    if batch.len() >= self.batch_size || last_flush.elapsed() >= flush_interval {
                        if !batch.is_empty() {
                            self.flush_batch(&mut batch).await;
                            last_flush = std::time::Instant::now();
                        }
                    }
                }
            }
        }

        info!("Consumer loop stopped");
        Ok(())
    }

    /// Process embeddings event
    fn process_embeddings_event(&self, event: &EmbeddingsEvent, batch: &mut Vec<VectorPoint>) {
        for symbol in &event.symbols {
            let point_id = format!("{}:{}:{}", event.package_id, event.version, symbol.symbol_id);

            let mut payload = HashMap::new();
            payload.insert(
                "package_id".to_string(),
                PayloadValue::String(event.package_id.clone()),
            );
            payload.insert(
                "version".to_string(),
                PayloadValue::String(event.version.clone()),
            );
            payload.insert(
                "symbol_name".to_string(),
                PayloadValue::String(symbol.name.clone()),
            );
            payload.insert(
                "symbol_kind".to_string(),
                PayloadValue::String(symbol.kind.clone()),
            );

            if let Some(ref doc) = symbol.documentation {
                payload.insert("documentation".to_string(), PayloadValue::String(doc.clone()));
            }

            batch.push(VectorPoint {
                id: point_id,
                vector: symbol.vector.clone(),
                payload,
            });
        }
    }

    /// Flush batch to Qdrant
    async fn flush_batch(&self, batch: &mut Vec<VectorPoint>) {
        let count = batch.len();
        info!(count, "Flushing batch to Qdrant");

        let points: Vec<VectorPoint> = batch.drain(..).collect();

        if let Err(e) = self.writer.upsert_batch(points).await {
            error!(error = %e, "Failed to upsert batch");
        }
    }
}
