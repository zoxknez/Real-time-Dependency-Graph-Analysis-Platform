use crate::producer::EventProducer;
use crate::store::PostgresCheckpointStore;
use crate::traits::CheckpointStore;
use anyhow::{Result, bail};
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tracing::{debug, error, info, instrument, warn};

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
    poll_interval: Duration,
}

impl NpmWatcher {
    pub fn new(
        checkpoint_store: Arc<PostgresCheckpointStore>,
        producer: Arc<EventProducer>,
        topic: String,
        poll_interval: Duration,
    ) -> Result<Self> {
        let client = Client::builder()
            .user_agent("InverseDeps-Watcher/1.0")
            .timeout(Duration::from_secs(30))
            .build()?;

        Ok(Self {
            client,
            checkpoint_store,
            producer,
            topic,
            poll_interval,
        })
    }

    #[instrument(skip(self), name = "npm_watcher_loop")]
    pub async fn run(&self) -> Result<()> {
        info!("Starting NPM Watcher...");

        loop {
            // 1. Get last cursor
            let since = match self.checkpoint_store.get_cursor("npm").await? {
                Some(cursor) if !is_invalid_initial_cursor(&cursor) => cursor,
                _ => {
                    let latest = self.fetch_latest_cursor().await?;
                    self.checkpoint_store.set_cursor("npm", &latest).await?;
                    info!(cursor = %latest, "Initialized NPM changes cursor");
                    tokio::time::sleep(self.poll_interval).await;
                    continue;
                }
            };

            // 2. Poll _changes
            let params = vec![("since", since.clone()), ("limit", BATCH_SIZE.to_string())];

            match self.client.get(NPM_CHANGES_URL).query(&params).send().await {
                Ok(resp) => {
                    if !resp.status().is_success() {
                        let status = resp.status();
                        warn!(%status, cursor = %since, "NPM Changes Feed returned non-success status");

                        if status == StatusCode::BAD_REQUEST {
                            let latest = self.fetch_latest_cursor().await?;
                            self.checkpoint_store.set_cursor("npm", &latest).await?;
                            warn!(
                                old_cursor = %since,
                                new_cursor = %latest,
                                "Reset invalid NPM changes cursor"
                            );
                        }

                        tokio::time::sleep(self.poll_interval).await;
                        continue;
                    }

                    match resp.json::<ChangesResponse>().await {
                        Ok(data) => {
                            if data.results.is_empty() {
                                let new_cursor = cursor_to_string(&data.last_seq);
                                self.checkpoint_store.set_cursor("npm", &new_cursor).await?;
                                debug!(cursor = %new_cursor, "No new NPM changes");
                                tokio::time::sleep(self.poll_interval).await;
                                continue;
                            }

                            info!(
                                "Got {} changes from NPM. Last seq: {}",
                                data.results.len(),
                                data.last_seq
                            );

                            // 3. Process Batch
                            let mut all_published = true;
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
                                    match self
                                        .producer
                                        .publish_raw(&self.topic, &key, &payload)
                                        .await
                                    {
                                        Ok(_) => break,
                                        Err(e) => {
                                            kafka_retries += 1;
                                            if kafka_retries >= MAX_KAFKA_RETRIES {
                                                error!(
                                                    "Failed to produce to Kafka after {} retries: {}. Skipping message.",
                                                    MAX_KAFKA_RETRIES, e
                                                );
                                                all_published = false;
                                                break;
                                            }
                                            let backoff =
                                                Duration::from_secs(1 << kafka_retries.min(5));
                                            warn!(
                                                "Kafka publish failed (attempt {}): {}. Retrying in {:?}",
                                                kafka_retries, e, backoff
                                            );
                                            tokio::time::sleep(backoff).await;
                                        }
                                    }
                                }

                                if !all_published {
                                    break;
                                }
                            }

                            if !all_published {
                                warn!(
                                    cursor = %since,
                                    "NPM batch was not fully published; checkpoint will not advance"
                                );
                                tokio::time::sleep(self.poll_interval).await;
                                continue;
                            }

                            // 4. Update Checkpoint (Atomic Batch Commit)
                            // We use `last_seq` from the response as the new cursor
                            let new_cursor = cursor_to_string(&data.last_seq);
                            self.checkpoint_store.set_cursor("npm", &new_cursor).await?;

                            if data.results.len() < BATCH_SIZE {
                                tokio::time::sleep(self.poll_interval).await;
                            }
                        }
                        Err(e) => {
                            error!("Failed to parse NPM changes: {}", e);
                            tokio::time::sleep(self.poll_interval).await;
                        }
                    }
                }
                Err(e) => {
                    warn!("Failed to fetch NPM changes: {}", e);
                    tokio::time::sleep(self.poll_interval).await;
                }
            }
        }
    }

    async fn fetch_latest_cursor(&self) -> Result<String> {
        let params = [("descending", "true"), ("limit", "1")];
        let resp = self
            .client
            .get(NPM_CHANGES_URL)
            .query(&params)
            .send()
            .await?;

        if !resp.status().is_success() {
            bail!(
                "NPM Changes Feed latest cursor request returned {}",
                resp.status()
            );
        }

        let data = resp.json::<ChangesResponse>().await?;
        Ok(cursor_to_string(&data.last_seq))
    }
}

fn cursor_to_string(cursor: &serde_json::Value) -> String {
    match cursor {
        serde_json::Value::String(value) => value.clone(),
        other => other.to_string(),
    }
}

fn is_invalid_initial_cursor(cursor: &str) -> bool {
    let cursor = cursor.trim();
    cursor.is_empty() || cursor == "0" || cursor.eq_ignore_ascii_case("now")
}
