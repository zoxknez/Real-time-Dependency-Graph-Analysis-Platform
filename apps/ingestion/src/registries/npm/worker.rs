use crate::consumer::EventConsumer;
use crate::store::outbox::{OutboxRepo, OutboxEvent};
use crate::event_utils;
use crate::proto_gen;
use super::fetcher::NpmFetcher;
use super::state::NpmStateStore;
use super::diff::calculate_diff;
use super::watcher::ChangeItem;
use anyhow::{Result, Context};
use rdkafka::consumer::{Consumer, CommitMode};
use rdkafka::Message;
use sqlx::PgPool;
use tracing::{info, warn, error, instrument, debug};
use futures::StreamExt;
use prost::Message as ProstMessage;

pub struct NpmWorker {
    consumer: EventConsumer,
    fetcher: NpmFetcher,
    state_store: NpmStateStore,
    outbox_repo: OutboxRepo,
    pool: PgPool,
}

impl NpmWorker {
    pub fn new(
        consumer: EventConsumer,
        fetcher: NpmFetcher,
        state_store: NpmStateStore,
        pool: PgPool,
    ) -> Self {
        Self {
            consumer,
            fetcher,
            state_store,
            outbox_repo: OutboxRepo::new(pool.clone()),
            pool,
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
                                self.handle_deleted_package(&change.id).await?;
                                is_deleted = true;
                            },
                            Err(e) => {
                                error!("Failed to fetch packument for {}: {}", change.id, e);
                                // Don't commit offset on fetch failure - will retry
                                continue;
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

                        // 4. TRANSACTIONAL OUTBOX: Save state + emit events in single DB transaction
                        if !diff.new_versions.is_empty() || !diff.yanked_versions.is_empty() {
                            info!(
                                pkg=%change.id, 
                                new=%diff.new_versions.len(), 
                                yanked=%diff.yanked_versions.len(), 
                                "Publishing events via outbox"
                            );

                            // Start transaction
                            let mut tx = self.pool.begin().await
                                .context("Failed to start transaction")?;

                            // Save state in transaction
                            self.state_store.save_state(tx.as_mut(), &change.id, &new_versions).await?;

                            // Emit events to outbox in same transaction
                            for version in &diff.new_versions {
                                self.emit_version_upserted(&mut tx, &change.id, version).await?;
                            }

                            for version in &diff.yanked_versions {
                                self.emit_version_yanked(&mut tx, &change.id, version).await?;
                            }

                            // Commit transaction (atomic: state + outbox events)
                            tx.commit().await.context("Failed to commit transaction")?;
                            
                            debug!(pkg=%change.id, "Transaction committed successfully");
                        }
                    }

                    // 5. Commit Kafka Offset (ONLY after DB transaction succeeds)
                    // This ensures at-least-once delivery: if we crash before commit,
                    // we'll reprocess the change, but outbox idempotency prevents duplicates
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

    /// Emit VersionUpserted event to outbox
    async fn emit_version_upserted(
        &self,
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        package_name: &str,
        version: &str,
    ) -> Result<()> {
        use proto_gen::domain::package::v1::VersionUpserted;
        use proto_gen::shared::event::v1::EventMeta;
        
        // Fetch packument to extract version data
        let packument = match self.fetcher.fetch_packument(package_name).await? {
            Some(p) => p,
            None => return Ok(()), // Skip if package disappeared
        };
        
        // Extract version data from packument
        let version_data = match packument.get("versions").and_then(|v| v.get(version)) {
            Some(d) => d,
            None => return Ok(()), // Skip if version disappeared
        };
        
        let dist = version_data.get("dist");
        let tarball_url = dist.and_then(|d| d.get("tarball")).and_then(|t| t.as_str()).unwrap_or("").to_string();
        let integrity = dist.and_then(|d| d.get("integrity")).and_then(|i| i.as_str())
            .or_else(|| dist.and_then(|d| d.get("shasum")).and_then(|s| s.as_str()))
            .unwrap_or("").to_string();
        let size_bytes = dist.and_then(|d| d.get("unpackedSize")).and_then(|s| s.as_u64()).unwrap_or(0) as i64;
        
        let published_at = packument
            .get("time")
            .and_then(|t| t.get(version))
            .and_then(|t| t.as_str())
            .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
            .map(|dt| prost_types::Timestamp {
                seconds: dt.timestamp(),
                nanos: dt.timestamp_subsec_nanos() as i32,
            });
        
        // Parse dependencies
        let dependencies = Self::parse_dependencies(version_data.get("dependencies"));
        let dev_dependencies = Self::parse_dependencies(version_data.get("devDependencies"));
        let optional_dependencies = Self::parse_dependencies(version_data.get("optionalDependencies"));
        
        // Generate deterministic event ID from dist integrity
        let content_hash = if !integrity.is_empty() { &integrity } else { "no-hash" };
        let event_id = event_utils::generate_version_upsert_event_id(
            "npm",
            package_name,
            version,
            content_hash,
        );

        // Create protobuf event
        let event_meta = EventMeta {
            event_id: event_id.clone(),
            source: "npm-ingestion".to_string(),
            traceparent: String::new(),
            occurred_at: Some(prost_types::Timestamp::from(std::time::SystemTime::now())),
            schema_version: "v1".to_string(),
        };

        let event = VersionUpserted {
            meta: Some(event_meta),
            ecosystem: "npm".to_string(),
            package_name: package_name.to_string(),
            version: version.to_string(),
            yanked: false,
            tarball_url,
            integrity,
            size_bytes,
            published_at,
            dependencies,
            dev_dependencies,
            optional_dependencies,
        };

        // Serialize to protobuf
        let payload = event.encode_to_vec();

        // Insert into outbox
        let outbox_event = OutboxEvent {
            event_id,
            event_type: "version.upserted".to_string(),
            topic: "domain.package.events.v1".to_string(),
            partition_key: package_name.to_string(),
            payload,
            headers: serde_json::json!({
                "ecosystem": "npm",
                "content_type": "application/x-protobuf"
            }),
        };

        self.outbox_repo.insert(tx.as_mut(), &outbox_event).await?;
        Ok(())
    }

    /// Emit VersionYanked event to outbox
    async fn emit_version_yanked(
        &self,
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        package_name: &str,
        version: &str,
    ) -> Result<()> {
        use proto_gen::domain::package::v1::VersionYanked;
        use proto_gen::shared::event::v1::EventMeta;
        
        let event_id = event_utils::generate_version_yanked_event_id("npm", package_name, version);

        let event_meta = EventMeta {
            event_id: event_id.clone(),
            source: "npm-ingestion".to_string(),
            traceparent: String::new(),
            occurred_at: Some(prost_types::Timestamp::from(std::time::SystemTime::now())),
            schema_version: "v1".to_string(),
        };

        let event = VersionYanked {
            meta: Some(event_meta),
            ecosystem: "npm".to_string(),
            package_name: package_name.to_string(),
            version: version.to_string(),
            reason: "missing_from_packument".to_string(),
            yanked_at: Some(prost_types::Timestamp::from(std::time::SystemTime::now())),
        };

        let payload = event.encode_to_vec();

        let outbox_event = OutboxEvent {
            event_id,
            event_type: "version.yanked".to_string(),
            topic: "domain.package.events.v1".to_string(),
            partition_key: package_name.to_string(),
            payload,
            headers: serde_json::json!({
                "ecosystem": "npm",
                "content_type": "application/x-protobuf"
            }),
        };

        self.outbox_repo.insert(tx.as_mut(), &outbox_event).await?;
        Ok(())
    }

    /// Parse dependencies from JSON object
    fn parse_dependencies(deps: Option<&serde_json::Value>) -> Vec<proto_gen::domain::package::v1::Dependency> {
        use proto_gen::domain::package::v1::Dependency;
        
        let mut result = Vec::new();
        if let Some(obj) = deps.and_then(|d| d.as_object()) {
            for (name, version_range) in obj {
                if let Some(range) = version_range.as_str() {
                    result.push(Dependency {
                        name: name.clone(),
                        version_range: range.to_string(),
                        is_peer: false,
                    });
                }
            }
        }
        result
    }

    /// Handle deleted package
    async fn handle_deleted_package(&self, package_name: &str) -> Result<()> {
        if let Some(_state) = self.state_store.get_state(package_name).await? {
            warn!(pkg=%package_name, "Package deleted/hidden");
            
            // Start transaction
            let mut tx = self.pool.begin().await
                .context("Failed to start transaction for deleted package")?;
            
            // Emit PackageDeleted event via outbox
            self.emit_package_deleted(&mut tx, package_name).await?;
            
            // Delete from state store
            sqlx::query("DELETE FROM npm_package_state WHERE package_name = $1")
                .bind(package_name)
                .execute(tx.as_mut())
                .await?;
            
            tx.commit().await?;
        }
        Ok(())
    }

    /// Emit PackageDeleted event to outbox
    async fn emit_package_deleted(
        &self,
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        package_name: &str,
    ) -> Result<()> {
        use proto_gen::domain::package::v1::PackageDeleted;
        use proto_gen::shared::event::v1::EventMeta;
        
        let event_id = event_utils::generate_package_deleted_event_id("npm", package_name);

        let event_meta = EventMeta {
            event_id: event_id.clone(),
            source: "npm-ingestion".to_string(),
            traceparent: String::new(),
            occurred_at: Some(prost_types::Timestamp::from(std::time::SystemTime::now())),
            schema_version: "v1".to_string(),
        };

        let event = PackageDeleted {
            meta: Some(event_meta),
            ecosystem: "npm".to_string(),
            package_name: package_name.to_string(),
            reason: "feed_deleted_flag".to_string(),
            deleted_at: Some(prost_types::Timestamp::from(std::time::SystemTime::now())),
            last_version: String::new(),
        };

        let payload = event.encode_to_vec();

        let outbox_event = OutboxEvent {
            event_id,
            event_type: "package.deleted".to_string(),
            topic: "domain.package.events.v1".to_string(),
            partition_key: package_name.to_string(),
            payload,
            headers: serde_json::json!({
                "ecosystem": "npm",
                "content_type": "application/x-protobuf"
            }),
        };

        self.outbox_repo.insert(tx.as_mut(), &outbox_event).await?;
        Ok(())
    }
}
