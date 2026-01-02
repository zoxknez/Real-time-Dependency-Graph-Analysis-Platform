use crate::store::PostgresCheckpointStore;
use crate::producer::EventProducer;
use crate::traits::CheckpointStore;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tracing::{info, warn, error, instrument};
use std::sync::Arc;
use reqwest::Client;

const NPM_CHANGES_URL: &str = "https://replicate.npmjs.com/_changes";
const BATCH_SIZE: usize = 1000;

#[derive(Debug, Deserialize)]
pub struct ChangesResponse {
    pub results: Vec<ChangeItem>,
    pub last_seq: serde_json::Value, // Opaque
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ChangeItem {
    pub seq: serde_json::Value,
    pub id: String,
    pub changes: Vec<Rev>,
    pub deleted: Option<bool>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Rev {
    pub rev: String,
}

pub struct NpmWatcher {
    client: Client,
    checkpoint_store: Arc<PostgresCheckpointStore>,
    producer: Arc<EventProducer>,
    topic: String,
}

impl NpmWatcher {
    pub fn new(
        checkpoint_store: Arc<PostgresCheckpointStore>,
        producer: Arc<EventProducer>,
        topic: String,
    ) -> Result<Self> {
        // Dedicated client for long-polling
        let client = Client::builder()
            .user_agent("InverseDeps-Watcher/1.0")
            .timeout(Duration::from_secs(90)) // > heartbeat
            .build()?;

        Ok(Self {
            client,
            checkpoint_store,
            producer,
            topic,
        })
    }

    #[instrument(skip(self), name = "npm_watcher_loop")]
    pub async fn run(&self) -> Result<()> {
        info!("Starting NPM Watcher...");
        
        loop {
            // 1. Get last cursor
            let since = self.checkpoint_store.get_cursor("npm").await?
                .unwrap_or_else(|| "0".to_string());

            // 2. Poll _changes
            // Note: In enterprise, we might process the stream chunk-by-chunk using `reqwest::Response::bytes_stream`
            // For MVP/Simplicity, we use `feed=longpoll` which returns a JSON body after some time or events.
            // NPM changes feed: heartbeat must be in seconds (not milliseconds)
            let url = format!("{}?feed=longpoll&since={}&limit={}", 
                NPM_CHANGES_URL, since, BATCH_SIZE);

            match self.client.get(&url).send().await {
                Ok(resp) => {
                    if !resp.status().is_success() {
                        warn!("NPM Changes Feed returned status: {}", resp.status());
                        tokio::time::sleep(Duration::from_secs(5)).await;
                        continue;
                    }

                    match resp.json::<ChangesResponse>().await {
                        Ok(data) => {
                            if data.results.is_empty() {
                                continue; // Heartbeat
                            }
                            
                            info!("Got {} changes from NPM. Last seq: {}", data.results.len(), data.last_seq);

                            // 3. Process Batch
                            for change in &data.results {
                                // Filter logic: ignore design docs
                                if change.id.starts_with("_design") {
                                    continue;
                                }

                                // Emit RAW event
                                let payload = serde_json::to_vec(change)?;
                                let key = format!("npm:{}", change.id);
                                
                                // Retry loop for Kafka produce with exponential backoff
                                let mut kafka_retries = 0u32;
                                const MAX_KAFKA_RETRIES: u32 = 5;
                                
                                loop {
                                    match self.producer.publish_raw(&self.topic, &key, &payload).await {
                                        Ok(_) => break,
                                        Err(e) => {
                                            kafka_retries += 1;
                                            if kafka_retries >= MAX_KAFKA_RETRIES {
                                                error!("Failed to produce to Kafka after {} retries: {}. Skipping message.", MAX_KAFKA_RETRIES, e);
                                                break;
                                            }
                                            let backoff = Duration::from_secs(1 << kafka_retries.min(5));
                                            warn!("Kafka publish failed (attempt {}): {}. Retrying in {:?}", kafka_retries, e, backoff);
                                            tokio::time::sleep(backoff).await;
                                        }
                                    }
                                }
                            }

                            // 4. Update Checkpoint (Atomic Batch Commit)
                            // We use `last_seq` from the response as the new cursor
                            // Note: `last_seq` needs to be stringified if it's a number/json
                            let new_cursor = data.last_seq.to_string().replace("\"", ""); // Simple scrub
                            self.checkpoint_store.set_cursor("npm", &new_cursor).await?;
                        }
                        Err(e) => {
                            error!("Failed to parse NPM changes: {}", e);
                            tokio::time::sleep(Duration::from_secs(5)).await;
                        }
                    }
                }
                Err(e) => {
                    warn!("Failed to fetch NPM changes: {}", e);
                    tokio::time::sleep(Duration::from_secs(5)).await;
                }
            }
        }
    }
}
