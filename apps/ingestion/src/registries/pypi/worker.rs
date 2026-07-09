//! PyPI Worker - Process raw changes and emit domain events
//!
//! Consumes from raw.pypi.journal.v1, fetches metadata,
//! calculates diff, and emits to domain topics via outbox.

use super::diff::calculate_diff;
use super::fetcher::PypiFetcher;
use super::state::{PypiStateStore, VersionInfo};
use super::watcher::PypiChangeEntry;
use crate::consumer::EventConsumer;
use crate::event_utils;
use crate::proto_gen;
use crate::store::outbox::{OutboxEvent, OutboxRepo};
use anyhow::Result;
use futures::StreamExt;
use prost::Message as ProstMessage;
use prost_types::Timestamp;
use rdkafka::Message;
use rdkafka::consumer::{CommitMode, Consumer};
use sqlx::PgPool;
use tracing::{debug, error, info, instrument};

const ECOSYSTEM: &str = "pypi";
const DOMAIN_PACKAGE_UPSERT_TOPIC: &str = "domain.package.upsert.v1";
const DOMAIN_VERSION_UPSERT_TOPIC: &str = "domain.version.upsert.v1";
const DOMAIN_VERSION_YANKED_TOPIC: &str = "domain.version.yanked.v1";
const DOMAIN_PACKAGE_DELETED_TOPIC: &str = "domain.package.deleted.v1";

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
        let new_versions: Vec<VersionInfo> = metadata
            .releases
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
        let dependencies = metadata
            .info
            .requires_dist
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
                &metadata,
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

        sqlx::query(
            r#"
            INSERT INTO pypi_package_state 
                (package_name, versions_json, versions_hash, last_serial, updated_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (package_name) 
            DO UPDATE SET 
                versions_json = EXCLUDED.versions_json,
                versions_hash = EXCLUDED.versions_hash,
                last_serial = EXCLUDED.last_serial,
                updated_at = NOW()
        "#,
        )
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

        let event_id = event_utils::generate_package_deleted_event_id(ECOSYSTEM, package_name);
        let event = proto_gen::PackageDeleted {
            meta: Some(event_meta(&event_id, "pypi-ingestion")),
            ecosystem: ECOSYSTEM.to_string(),
            package_name: package_name.to_string(),
            reason: "registry_removal".to_string(),
            deleted_at: Some(now_timestamp()),
            last_version: String::new(),
        };

        let event = OutboxEvent {
            event_id,
            event_type: DOMAIN_PACKAGE_DELETED_TOPIC.to_string(),
            topic: DOMAIN_PACKAGE_DELETED_TOPIC.to_string(),
            partition_key: package_id.clone(),
            payload: event.encode_to_vec(),
            headers: protobuf_headers(ECOSYSTEM),
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
        let content_hash = event_utils::hash_json(&serde_json::json!({
            "name": info.name,
            "version": info.version,
            "summary": info.summary,
            "home_page": info.home_page,
            "license": info.license,
        }));
        let event_id =
            event_utils::generate_package_upsert_event_id(ECOSYSTEM, &info.name, &content_hash);

        let event = proto_gen::PackageUpserted {
            meta: Some(event_meta(&event_id, "pypi-ingestion")),
            ecosystem: ECOSYSTEM.to_string(),
            package_name: info.name.clone(),
            latest_version: info.version.clone(),
            repository_url: info
                .project_url
                .clone()
                .or_else(|| info.home_page.clone())
                .unwrap_or_default(),
            packument_sha256: content_hash,
            description: info.summary.clone().unwrap_or_default(),
            homepage: info.home_page.clone().unwrap_or_default(),
            license: info.license.clone().unwrap_or_default(),
            maintainers: info
                .author
                .clone()
                .into_iter()
                .chain(info.author_email.clone())
                .collect(),
        };

        OutboxEvent {
            event_id,
            event_type: DOMAIN_PACKAGE_UPSERT_TOPIC.to_string(),
            topic: DOMAIN_PACKAGE_UPSERT_TOPIC.to_string(),
            partition_key: package_id.to_string(),
            payload: event.encode_to_vec(),
            headers: protobuf_headers(ECOSYSTEM),
        }
    }

    fn create_version_upsert_event(
        &self,
        package_id: &str,
        package_name: &str,
        version: &str,
        metadata: &super::fetcher::PypiPackageMetadata,
        dependencies: &[super::fetcher::ParsedDependency],
    ) -> OutboxEvent {
        let version_id = format!("{}@{}", package_id, version);

        let release = metadata
            .releases
            .get(version)
            .and_then(|releases| releases.first());
        let integrity = release
            .and_then(|release| release.digests.sha256.clone())
            .unwrap_or_default();
        let content_hash = if integrity.is_empty() {
            event_utils::hash_json(&serde_json::json!({
                "package": package_name,
                "version": version,
                "dependencies": dependencies.iter().map(|dep| (&dep.name, &dep.version_req)).collect::<Vec<_>>(),
            }))
        } else {
            integrity.clone()
        };
        let event_id = event_utils::generate_version_upsert_event_id(
            ECOSYSTEM,
            package_name,
            version,
            &content_hash,
        );

        let deps: Vec<proto_gen::Dependency> = dependencies
            .iter()
            .filter(|d| !d.is_optional)
            .map(|d| proto_gen::Dependency {
                name: d.name.clone(),
                version_range: d.version_req.clone().unwrap_or_else(|| "*".to_string()),
                is_peer: false,
            })
            .collect();

        let published_at = release
            .and_then(|release| release.upload_time_iso_8601.as_deref())
            .and_then(parse_rfc3339_timestamp);

        let event = proto_gen::VersionUpserted {
            meta: Some(event_meta(&event_id, "pypi-ingestion")),
            ecosystem: ECOSYSTEM.to_string(),
            package_name: package_name.to_string(),
            version: version.to_string(),
            yanked: false,
            tarball_url: release
                .map(|release| release.url.clone())
                .unwrap_or_default(),
            integrity,
            size_bytes: release
                .map(|release| release.size as i64)
                .unwrap_or_default(),
            published_at,
            dependencies: deps,
            dev_dependencies: Vec::new(),
            optional_dependencies: Vec::new(),
        };

        OutboxEvent {
            event_id,
            event_type: DOMAIN_VERSION_UPSERT_TOPIC.to_string(),
            topic: DOMAIN_VERSION_UPSERT_TOPIC.to_string(),
            partition_key: version_id.clone(),
            payload: event.encode_to_vec(),
            headers: protobuf_headers(ECOSYSTEM),
        }
    }

    fn create_yanked_event(&self, package_id: &str, version: &str) -> OutboxEvent {
        let version_id = format!("{}@{}", package_id, version);
        let package_name = package_id
            .strip_prefix(&format!("{}:", ECOSYSTEM))
            .unwrap_or(package_id);
        let event_id =
            event_utils::generate_version_yanked_event_id(ECOSYSTEM, package_name, version);
        let event = proto_gen::VersionYanked {
            meta: Some(event_meta(&event_id, "pypi-ingestion")),
            ecosystem: ECOSYSTEM.to_string(),
            package_name: package_name.to_string(),
            version: version.to_string(),
            reason: "pypi_yanked".to_string(),
            yanked_at: Some(now_timestamp()),
        };

        OutboxEvent {
            event_id,
            event_type: DOMAIN_VERSION_YANKED_TOPIC.to_string(),
            topic: DOMAIN_VERSION_YANKED_TOPIC.to_string(),
            partition_key: version_id.clone(),
            payload: event.encode_to_vec(),
            headers: protobuf_headers(ECOSYSTEM),
        }
    }

    fn create_unyanked_event(&self, package_id: &str, version: &str) -> OutboxEvent {
        let version_id = format!("{}@{}", package_id, version);
        let package_name = package_id
            .strip_prefix(&format!("{}:", ECOSYSTEM))
            .unwrap_or(package_id);
        let event_id = event_utils::generate_version_upsert_event_id(
            ECOSYSTEM,
            package_name,
            version,
            "unyanked",
        );
        let event = proto_gen::VersionUpserted {
            meta: Some(event_meta(&event_id, "pypi-ingestion")),
            ecosystem: ECOSYSTEM.to_string(),
            package_name: package_name.to_string(),
            version: version.to_string(),
            yanked: false,
            tarball_url: String::new(),
            integrity: String::new(),
            size_bytes: 0,
            published_at: None,
            dependencies: Vec::new(),
            dev_dependencies: Vec::new(),
            optional_dependencies: Vec::new(),
        };

        OutboxEvent {
            event_id,
            event_type: DOMAIN_VERSION_UPSERT_TOPIC.to_string(),
            topic: DOMAIN_VERSION_UPSERT_TOPIC.to_string(),
            partition_key: version_id.clone(),
            payload: event.encode_to_vec(),
            headers: protobuf_headers(ECOSYSTEM),
        }
    }
}

fn protobuf_headers(ecosystem: &str) -> serde_json::Value {
    serde_json::json!({
        "ecosystem": ecosystem,
        "content_type": "application/x-protobuf",
    })
}

fn event_meta(event_id: &str, source: &str) -> proto_gen::EventMeta {
    proto_gen::EventMeta {
        event_id: event_id.to_string(),
        source: source.to_string(),
        traceparent: String::new(),
        occurred_at: Some(now_timestamp()),
        schema_version: "v1".to_string(),
    }
}

fn now_timestamp() -> Timestamp {
    Timestamp::from(std::time::SystemTime::now())
}

fn parse_rfc3339_timestamp(value: &str) -> Option<Timestamp> {
    chrono::DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|dt| Timestamp {
            seconds: dt.timestamp(),
            nanos: dt.timestamp_subsec_nanos() as i32,
        })
}
