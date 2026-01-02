//! PyPI Worker - Process raw changes and emit domain events
//!
//! Consumes from raw.pypi.journal.v1, fetches metadata, 
//! calculates diff, and emits to domain topics via outbox.

use crate::consumer::EventConsumer;
use crate::store::outbox::{OutboxRepo, OutboxEvent};
use super::fetcher::PypiFetcher;
use super::state::{PypiStateStore, VersionInfo};
use super::diff::calculate_diff;
use super::watcher::PypiChangeEntry;
use anyhow::Result;
use rdkafka::consumer::{Consumer, CommitMode};
use rdkafka::Message;
use sqlx::PgPool;
use tracing::{info, error, instrument, debug};
use futures::StreamExt;

const ECOSYSTEM: &str = "pypi";

pub struct PypiWorker {
    consumer: EventConsumer,
    fetcher: PypiFetcher,
    state_store: PypiStateStore,
    outbox_repo: OutboxRepo,
    pool: PgPool,
}

impl PypiWorker {
    pub fn new(
        consumer: EventConsumer,
        fetcher: PypiFetcher,
        state_store: PypiStateStore,
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

    #[instrument(skip(self), name = "pypi_worker_loop")]
    pub async fn run(&self) -> Result<()> {
        info!("Starting PyPI Worker...");
        
        // Initialize state table
        self.state_store.init().await?;
        
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

                    // 1. Deserialize change entry
                    let change: PypiChangeEntry = match serde_json::from_slice(payload) {
                        Ok(c) => c,
                        Err(e) => {
                            error!("Failed to deserialize PyPI change: {}", e);
                            continue;
                        }
                    };

                    // 2. Process the change
                    match self.process_change(&change).await {
                        Ok(_) => {
                            // Commit offset on success
                            if let Err(e) = consumer.commit_message(&msg, CommitMode::Async) {
                                error!("Failed to commit offset: {}", e);
                            }
                        }
                        Err(e) => {
                            error!(package = %change.project_name, error = %e, "Failed to process PyPI change");
                            // Don't commit - will retry
                        }
                    }
                }
                Err(e) => {
                    error!("Kafka consumer error: {}", e);
                }
            }
        }

        Ok(())
    }

    async fn process_change(&self, change: &PypiChangeEntry) -> Result<()> {
        let package_name = &change.project_name;
        
        debug!(package = %package_name, action = %change.action, "Processing PyPI change");

        // Handle removals
        if change.action.contains("remove") && change.version.is_none() {
            return self.handle_deleted_package(package_name).await;
        }

        // Fetch current package metadata
        let metadata = match self.fetcher.fetch_package(package_name).await? {
            Some(m) => m,
            None => {
                // Package not found - might be deleted
                return self.handle_deleted_package(package_name).await;
            }
        };

        // Build version list with yank status
        let new_versions: Vec<VersionInfo> = metadata.releases
            .iter()
            .map(|(version, releases)| {
                let yanked = releases.iter().any(|r| r.yanked.unwrap_or(false));
                VersionInfo::new(version.clone(), yanked)
            })
            .collect();

        // Load old state
        let old_state = self.state_store.get_state(package_name).await?;
        let old_versions: Vec<VersionInfo> = match &old_state {
            Some(s) => serde_json::from_value(s.versions_json.clone()).unwrap_or_default(),
            None => Vec::new(),
        };

        // Calculate diff
        let diff = calculate_diff(&old_versions, &new_versions);

        if diff.is_empty() {
            debug!(package = %package_name, "No changes detected");
            return Ok(());
        }

        // Start transaction for state + outbox
        let mut tx = self.pool.begin().await?;

        // Extract dependencies from latest version
        let dependencies = metadata.info.requires_dist
            .as_ref()
            .map(|deps| PypiFetcher::parse_requires_dist(deps))
            .unwrap_or_default();

        // Emit domain events
        let package_id = format!("{}:{}", ECOSYSTEM, package_name);

        // Package upsert event
        if old_state.is_none() || !diff.added.is_empty() {
            let event = self.create_package_upsert_event(&package_id, &metadata.info);
            self.outbox_repo.insert(&mut *tx, &event).await?;
        }

        // Version upsert events for new versions
        for version in &diff.added {
            let event = self.create_version_upsert_event(
                &package_id,
                package_name,
                version,
                &dependencies,
            );
            self.outbox_repo.insert(&mut *tx, &event).await?;
        }

        // Yanked events
        for version in &diff.yanked {
            let event = self.create_yanked_event(&package_id, version);
            self.outbox_repo.insert(&mut *tx, &event).await?;
        }

        // Unyanked events (version upsert with yanked=false)
        for version in &diff.unyanked {
            let event = self.create_unyanked_event(&package_id, version);
            self.outbox_repo.insert(&mut *tx, &event).await?;
        }

        // Update state
        let versions_json = serde_json::to_value(&new_versions)?;
        let versions_hash = PypiStateStore::calculate_versions_hash(&new_versions);
        
        sqlx::query(r#"
            INSERT INTO pypi_package_state 
                (package_name, versions_json, versions_hash, last_serial, updated_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (package_name) 
            DO UPDATE SET 
                versions_json = EXCLUDED.versions_json,
                versions_hash = EXCLUDED.versions_hash,
                last_serial = EXCLUDED.last_serial,
                updated_at = NOW()
        "#)
        .bind(package_name)
        .bind(&versions_json)
        .bind(&versions_hash)
        .bind(change.serial)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;

        info!(
            package = %package_name,
            added = diff.added.len(),
            yanked = diff.yanked.len(),
            "PyPI package processed"
        );

        Ok(())
    }

    async fn handle_deleted_package(&self, package_name: &str) -> Result<()> {
        let package_id = format!("{}:{}", ECOSYSTEM, package_name);
        
        let payload = serde_json::json!({
            "package_id": package_id,
            "ecosystem": ECOSYSTEM,
            "name": package_name,
        });
        
        let event = OutboxEvent {
            event_id: uuid::Uuid::new_v4().to_string(),
            event_type: "domain.package.deleted.v1".to_string(),
            topic: "domain.package.deleted.v1".to_string(),
            partition_key: package_id.clone(),
            payload: serde_json::to_vec(&payload)?,
            headers: serde_json::json!({}),
        };

        self.outbox_repo.insert(&self.pool, &event).await?;
        self.state_store.mark_deleted(package_name).await?;

        info!(package = %package_name, "PyPI package marked as deleted");
        Ok(())
    }

    fn create_package_upsert_event(
        &self,
        package_id: &str,
        info: &super::fetcher::PypiInfo,
    ) -> OutboxEvent {
        let payload = serde_json::json!({
            "package_id": package_id,
            "ecosystem": ECOSYSTEM,
            "name": info.name,
            "description": info.summary,
            "repository_url": info.home_page,
            "license": info.license,
        });
        
        OutboxEvent {
            event_id: uuid::Uuid::new_v4().to_string(),
            event_type: "domain.package.upsert.v1".to_string(),
            topic: "domain.package.upsert.v1".to_string(),
            partition_key: package_id.to_string(),
            payload: serde_json::to_vec(&payload).unwrap_or_default(),
            headers: serde_json::json!({}),
        }
    }

    fn create_version_upsert_event(
        &self,
        package_id: &str,
        _package_name: &str,
        version: &str,
        dependencies: &[super::fetcher::ParsedDependency],
    ) -> OutboxEvent {
        let version_id = format!("{}@{}", package_id, version);
        
        let deps: Vec<serde_json::Value> = dependencies
            .iter()
            .filter(|d| !d.is_optional)
            .map(|d| {
                serde_json::json!({
                    "package_id": format!("{}:{}", ECOSYSTEM, d.name),
                    "version_req": d.version_req,
                })
            })
            .collect();

        let payload = serde_json::json!({
            "version_id": version_id,
            "package_id": package_id,
            "ecosystem": ECOSYSTEM,
            "version": version,
            "dependencies": deps,
            "yanked": false,
        });

        OutboxEvent {
            event_id: uuid::Uuid::new_v4().to_string(),
            event_type: "domain.version.upsert.v1".to_string(),
            topic: "domain.version.upsert.v1".to_string(),
            partition_key: version_id.clone(),
            payload: serde_json::to_vec(&payload).unwrap_or_default(),
            headers: serde_json::json!({}),
        }
    }

    fn create_yanked_event(&self, package_id: &str, version: &str) -> OutboxEvent {
        let version_id = format!("{}@{}", package_id, version);
        
        let payload = serde_json::json!({
            "version_id": version_id,
            "package_id": package_id,
            "version": version,
            "yanked": true,
        });

        OutboxEvent {
            event_id: uuid::Uuid::new_v4().to_string(),
            event_type: "domain.version.yanked.v1".to_string(),
            topic: "domain.version.yanked.v1".to_string(),
            partition_key: version_id.clone(),
            payload: serde_json::to_vec(&payload).unwrap_or_default(),
            headers: serde_json::json!({}),
        }
    }

    fn create_unyanked_event(&self, package_id: &str, version: &str) -> OutboxEvent {
        let version_id = format!("{}@{}", package_id, version);
        
        let payload = serde_json::json!({
            "version_id": version_id,
            "package_id": package_id,
            "version": version,
            "yanked": false,
        });

        OutboxEvent {
            event_id: uuid::Uuid::new_v4().to_string(),
            event_type: "domain.version.upsert.v1".to_string(),
            topic: "domain.version.upsert.v1".to_string(),
            partition_key: version_id.clone(),
            payload: serde_json::to_vec(&payload).unwrap_or_default(),
            headers: serde_json::json!({}),
        }
    }
}
