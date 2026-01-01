use crate::consumer::EventConsumer;
use crate::producer::EventProducer;
use super::fetcher::NpmFetcher;
use super::state::NpmStateStore;
use super::diff::{calculate_diff, DiffResult};
use super::watcher::ChangeItem;
use anyhow::{Result, Context};
use rdkafka::consumer::{Consumer, CommitMode};
use rdkafka::Message;
use std::sync::Arc;
use tracing::{info, warn, error, instrument};
use serde_json::Value;
use futures::StreamExt;

pub struct NpmWorker {
    consumer: EventConsumer,
    fetcher: NpmFetcher,
    state_store: NpmStateStore,
    producer: Arc<EventProducer>,
}

impl NpmWorker {
    pub fn new(
        consumer: EventConsumer,
        fetcher: NpmFetcher,
        state_store: NpmStateStore,
        producer: Arc<EventProducer>,
    ) -> Self {
        Self {
            consumer,
            fetcher,
            state_store,
            producer,
        }
    }

    #[instrument(skip(self), name = "npm_worker_loop")]
    pub async fn run(&self) -> Result<()> {
        info!("Starting NPM Worker...");
        let consumer = self.consumer.inner();
        let stream = consumer.stream();

        tokio::pin!(stream);

        while let Some(msg_res) = stream.next().await {
            match msg_res {
                Ok(msg) => {
                    let payload = match msg.payload() {
                        Some(p) => p,
                        None => continue,
                    };

                    // 1. Deserijalizacija Raw Event-a
                    let change: ChangeItem = match serde_json::from_slice(payload) {
                        Ok(c) => c,
                        Err(e) => {
                            error!("Failed to deserialize change item: {}", e);
                            continue;
                        }
                    };
                    
                    if change.id.starts_with("_design") { continue; }

                    // 2. Fetch Packument if not deleted
                    let mut new_versions = Vec::new();
                    let mut is_deleted = false;
                    
                    if change.deleted.unwrap_or(false) {
                        is_deleted = true;
                    } else {
                        match self.fetcher.fetch_packument(&change.id).await {
                            Ok(Some(json)) => {
                                if let Some(versions) = json.get("versions").and_then(|v| v.as_object()) {
                                    new_versions = versions.keys().cloned().collect();
                                }
                            },
                            Ok(None) => {
                                check_deleted_state(&self.state_store, &change.id, &self.producer).await?;
                                is_deleted = true;
                            },
                            Err(e) => {
                                error!("Failed to fetch packument for {}: {}", change.id, e);
                            }
                        }
                    }

                    if !is_deleted {
                        // 3. Load State & Diff
                        let state = self.state_store.get_state(&change.id).await?;
                        let old_versions: Vec<String> = match state {
                            Some(s) => serde_json::from_value(s.versions_json).unwrap_or_default(),
                            None => Vec::new(),
                        };

                        let diff = calculate_diff(&old_versions, &new_versions);

                        // 4. Emit Events (TODO: Protobuf)
                        if !diff.new_versions.is_empty() {
                            info!(pkg=%change.id, count=%diff.new_versions.len(), "New versions detected");
                        }

                        if !diff.yanked_versions.is_empty() {
                            warn!(pkg=%change.id, yanked=%diff.yanked_versions.len(), "Versions yanked");
                        }

                        // 5. Save State
                        if !diff.new_versions.is_empty() || !diff.yanked_versions.is_empty() {
                             self.state_store.save_state(&change.id, &new_versions).await?;
                        }
                    }

                    // 6. Commit Offset
                    if let Err(e) = self.consumer.inner().commit_message(&msg, CommitMode::Async) {
                         error!("Failed to commit message offset: {}", e);
                    }
                },
                Err(e) => {
                    error!("Kafka consumer error: {}", e);
                }
            }
        }
        
        Ok(())
    }
}

async fn check_deleted_state(store: &NpmStateStore, pkg: &str, producer: &EventProducer) -> Result<()> {
    if let Some(_) = store.get_state(pkg).await? {
        warn!(pkg=%pkg, "Package deleted/hidden");
    }
    Ok(())
}
