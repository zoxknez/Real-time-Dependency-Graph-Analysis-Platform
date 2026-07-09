//! Cargo Worker
//!
//! Consumes raw.cargo.index.v1 events and:
//! 1. Compares against stored state
//! 2. Calculates diff (new, yanked, unyanked)
//! 3. Writes to state + outbox in transaction
//! 4. Emits domain events: package.upsert, version.upsert, version.yanked

use anyhow::{Context, Result};
use chrono::Utc;
use prost::Message;
use rdkafka::{
    Message as KafkaMessage,
    consumer::{Consumer, StreamConsumer},
};
use sqlx::PgPool;
use tokio_stream::StreamExt;
use tracing::{debug, error, info, instrument};

use crate::event_utils;
use crate::proto_gen;

use super::diff::{calculate_diff, is_initial_sync};
use super::fetcher::CargoFetcher;
use super::index::CrateIndexEntry;
use super::state::{CargoStateStore, VersionState};
use super::watcher::{CrateVersionRecord, IndexChange};

/// Topic for raw cargo index changes
const RAW_CARGO_INDEX_TOPIC: &str = "raw.cargo.index.v1";

/// Domain event topics
const DOMAIN_PACKAGE_UPSERT_TOPIC: &str = "domain.package.upsert.v1";
const DOMAIN_VERSION_UPSERT_TOPIC: &str = "domain.version.upsert.v1";
const DOMAIN_VERSION_YANKED_TOPIC: &str = "domain.version.yanked.v1";

/// Consumer group for cargo worker
#[allow(dead_code)]
const CONSUMER_GROUP: &str = "cargo-worker";

/// Cargo Worker - processes raw index events
pub struct CargoWorker {
    consumer: StreamConsumer,
    pool: PgPool,
    state_store: CargoStateStore,
    #[allow(dead_code)]
    fetcher: CargoFetcher,
}

impl CargoWorker {
    pub fn new(consumer: StreamConsumer, pool: PgPool) -> Result<Self> {
        Ok(Self {
            consumer,
            state_store: CargoStateStore::new(pool.clone()),
            pool,
            fetcher: CargoFetcher::new()?,
        })
    }

    /// Initialize the worker (create tables, subscribe)
    pub async fn init(&self) -> Result<()> {
        self.state_store.init().await?;

        self.consumer
            .subscribe(&[RAW_CARGO_INDEX_TOPIC])
            .context("Failed to subscribe to cargo topic")?;

        info!("Cargo worker initialized");
        Ok(())
    }

    /// Run the worker loop
    #[instrument(skip(self))]
    pub async fn run(&self) -> Result<()> {
        info!("Starting Cargo worker");

        let mut stream = self.consumer.stream();

        while let Some(result) = stream.next().await {
            match result {
                Ok(message) => {
                    if let Err(e) = self.process_message(&message).await {
                        error!(error = %e, "Failed to process cargo message");
                    }
                }
                Err(e) => {
                    error!(error = %e, "Kafka consume error");
                }
            }
        }

        Ok(())
    }

    /// Process a single Kafka message
    async fn process_message(&self, message: &rdkafka::message::BorrowedMessage<'_>) -> Result<()> {
        let payload = message.payload().context("Empty message payload")?;

        let index_change = IndexChange::decode(payload).context("Failed to decode IndexChange")?;

        self.process_index_change(&index_change).await
    }

    /// Process an index change event
    #[instrument(skip(self, change), fields(crate_name = %change.crate_name))]
    async fn process_index_change(&self, change: &IndexChange) -> Result<()> {
        let crate_name = &change.crate_name;

        info!(
            crate_name = %crate_name,
            versions = change.versions.len(),
            "Processing cargo index change"
        );

        // Convert protobuf versions to index entries for diffing
        let new_entries: Vec<CrateIndexEntry> = change
            .versions
            .iter()
            .map(|v| version_record_to_entry(crate_name, v))
            .collect();

        // Get current state
        let old_state = self.state_store.get_version_map(crate_name).await?;
        let is_initial = is_initial_sync(&old_state);

        // Calculate diff
        let diff = calculate_diff(&old_state, &new_entries);

        if !diff.has_changes() && !is_initial {
            debug!(crate_name = %crate_name, "No changes detected");
            return Ok(());
        }

        info!(
            crate_name = %crate_name,
            added = diff.added.len(),
            yanked = diff.yanked.len(),
            unyanked = diff.unyanked.len(),
            "Changes detected"
        );

        // Begin transaction for state + outbox
        let mut tx = self.pool.begin().await?;

        // Update state
        let versions: Vec<VersionState> = new_entries.iter().map(VersionState::from).collect();
        let versions_json = serde_json::to_value(&versions)?;
        let versions_hash = calculate_versions_hash(&versions);

        sqlx::query(
            r#"
            INSERT INTO cargo_package_state (crate_name, versions_json, versions_hash, last_updated)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (crate_name) DO UPDATE SET
                versions_json = EXCLUDED.versions_json,
                versions_hash = EXCLUDED.versions_hash,
                last_updated = NOW()
            "#,
        )
        .bind(crate_name)
        .bind(&versions_json)
        .bind(&versions_hash)
        .execute(&mut *tx)
        .await?;

        // Write domain events to outbox
        let event_time = Utc::now();

        // Package upsert (always on first sync or when we have new versions)
        if is_initial || !diff.added.is_empty() {
            let package_event = PackageUpsertEvent {
                event_id: event_utils::generate_package_upsert_event_id(
                    "cargo",
                    crate_name,
                    &event_utils::hash_json(&serde_json::json!({
                        "name": crate_name,
                        "latest_version": find_latest_version(&new_entries),
                    })),
                ),
                ecosystem: "cargo".to_string(),
                name: crate_name.clone(),
                latest_version: find_latest_version(&new_entries),
                description: None, // Would need API call for this
                repository: None,
                homepage: None,
            };

            write_outbox_event(
                &mut tx,
                &package_event.event_id,
                DOMAIN_PACKAGE_UPSERT_TOPIC,
                DOMAIN_PACKAGE_UPSERT_TOPIC,
                &format!("cargo:{}", crate_name),
                package_event.encode_to_vec(),
                &event_time,
            )
            .await?;
        }

        // Version upserts for new versions
        for entry in &diff.added {
            let version_event = VersionUpsertEvent {
                event_id: event_utils::generate_version_upsert_event_id(
                    "cargo",
                    crate_name,
                    &entry.version,
                    &entry.cksum,
                ),
                ecosystem: "cargo".to_string(),
                package_name: crate_name.clone(),
                version: entry.version.clone(),
                yanked: entry.yanked,
                dependencies: entry
                    .deps
                    .iter()
                    .filter(|d| matches!(d.kind, super::index::DependencyKind::Normal))
                    .map(|d| DependencyRef {
                        name: d.name.clone(),
                        version_req: d.req.clone(),
                        optional: d.optional,
                    })
                    .collect(),
            };

            write_outbox_event(
                &mut tx,
                &version_event.event_id,
                DOMAIN_VERSION_UPSERT_TOPIC,
                DOMAIN_VERSION_UPSERT_TOPIC,
                &format!("cargo:{}:{}", crate_name, entry.version),
                version_event.encode_to_vec(),
                &event_time,
            )
            .await?;
        }

        // Version yanked events
        for version in &diff.yanked {
            let yank_event = VersionYankedEvent {
                event_id: event_utils::generate_version_yanked_event_id(
                    "cargo", crate_name, version,
                ),
                ecosystem: "cargo".to_string(),
                package_name: crate_name.clone(),
                version: version.clone(),
                yanked: true,
            };

            write_outbox_event(
                &mut tx,
                &yank_event.event_id,
                DOMAIN_VERSION_YANKED_TOPIC,
                DOMAIN_VERSION_YANKED_TOPIC,
                &format!("cargo:{}:{}", crate_name, version),
                yank_event.encode_to_vec(),
                &event_time,
            )
            .await?;
        }

        // Version unyanked events
        for version in &diff.unyanked {
            let version_event = VersionUpsertEvent {
                event_id: event_utils::generate_version_upsert_event_id(
                    "cargo", crate_name, version, "unyanked",
                ),
                ecosystem: "cargo".to_string(),
                package_name: crate_name.clone(),
                version: version.clone(),
                yanked: false,
                dependencies: Vec::new(),
            };

            write_outbox_event(
                &mut tx,
                &version_event.event_id,
                DOMAIN_VERSION_UPSERT_TOPIC,
                DOMAIN_VERSION_UPSERT_TOPIC,
                &format!("cargo:{}:{}", crate_name, version),
                version_event.encode_to_vec(),
                &event_time,
            )
            .await?;
        }

        // Commit transaction
        tx.commit().await?;

        info!(
            crate_name = %crate_name,
            "Cargo index change processed successfully"
        );

        Ok(())
    }
}

/// Convert protobuf version record to index entry
fn version_record_to_entry(crate_name: &str, record: &CrateVersionRecord) -> CrateIndexEntry {
    use super::index::{CrateDependency, DependencyKind};

    CrateIndexEntry {
        name: crate_name.to_string(),
        version: record.version.clone(),
        deps: record
            .deps
            .iter()
            .map(|d| CrateDependency {
                name: d.name.clone(),
                req: d.req.clone(),
                features: d.features.clone(),
                optional: d.optional,
                default_features: true,
                target: if d.target.is_empty() {
                    None
                } else {
                    Some(d.target.clone())
                },
                kind: match d.kind.as_str() {
                    "dev" => DependencyKind::Dev,
                    "build" => DependencyKind::Build,
                    _ => DependencyKind::Normal,
                },
                registry: None,
                package: None,
            })
            .collect(),
        cksum: record.cksum.clone(),
        features: record
            .features
            .iter()
            .map(|(k, v)| (k.clone(), v.split(',').map(String::from).collect()))
            .collect(),
        yanked: record.yanked,
        links: None,
        rust_version: if record.rust_version.is_empty() {
            None
        } else {
            Some(record.rust_version.clone())
        },
        features2: Default::default(),
    }
}

/// Find the latest non-yanked version
fn find_latest_version(entries: &[CrateIndexEntry]) -> Option<String> {
    entries
        .iter()
        .filter(|e| !e.yanked)
        .max_by(|a, b| {
            semver::Version::parse(&a.version)
                .ok()
                .cmp(&semver::Version::parse(&b.version).ok())
        })
        .map(|e| e.version.clone())
}

/// Calculate hash for version states
fn calculate_versions_hash(versions: &[VersionState]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    for v in versions {
        hasher.update(v.version.as_bytes());
        hasher.update(if v.yanked { b"1" } else { b"0" });
    }
    format!("{:x}", hasher.finalize())
}

/// Write event to outbox table
async fn write_outbox_event(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    event_id: &str,
    event_type: &str,
    topic: &str,
    key: &str,
    payload: Vec<u8>,
    event_time: &chrono::DateTime<Utc>,
) -> Result<()> {
    sqlx::query(
        r#"
        INSERT INTO ingestion_outbox (
            event_id, event_type, topic, partition_key, payload, headers, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (event_id) DO NOTHING
        "#,
    )
    .bind(event_id)
    .bind(event_type)
    .bind(topic)
    .bind(key)
    .bind(payload)
    .bind(serde_json::json!({
        "ecosystem": "cargo",
        "content_type": "application/x-protobuf",
    }))
    .bind(event_time)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

// Domain event types
#[derive(Debug, serde::Serialize)]
struct PackageUpsertEvent {
    event_id: String,
    ecosystem: String,
    name: String,
    latest_version: Option<String>,
    description: Option<String>,
    repository: Option<String>,
    homepage: Option<String>,
}

#[derive(Debug, serde::Serialize)]
struct VersionUpsertEvent {
    event_id: String,
    ecosystem: String,
    package_name: String,
    version: String,
    yanked: bool,
    dependencies: Vec<DependencyRef>,
}

#[derive(Debug, serde::Serialize)]
struct DependencyRef {
    name: String,
    version_req: String,
    optional: bool,
}

#[derive(Debug, serde::Serialize)]
struct VersionYankedEvent {
    event_id: String,
    ecosystem: String,
    package_name: String,
    version: String,
    yanked: bool,
}

impl PackageUpsertEvent {
    fn encode_to_vec(&self) -> Vec<u8> {
        proto_gen::PackageUpserted {
            meta: Some(event_meta(&self.event_id, "cargo-ingestion")),
            ecosystem: self.ecosystem.clone(),
            package_name: self.name.clone(),
            latest_version: self.latest_version.clone().unwrap_or_default(),
            repository_url: self.repository.clone().unwrap_or_default(),
            packument_sha256: self.event_id.clone(),
            description: self.description.clone().unwrap_or_default(),
            homepage: self.homepage.clone().unwrap_or_default(),
            license: String::new(),
            maintainers: Vec::new(),
        }
        .encode_to_vec()
    }
}

impl VersionUpsertEvent {
    fn encode_to_vec(&self) -> Vec<u8> {
        proto_gen::VersionUpserted {
            meta: Some(event_meta(&self.event_id, "cargo-ingestion")),
            ecosystem: self.ecosystem.clone(),
            package_name: self.package_name.clone(),
            version: self.version.clone(),
            yanked: self.yanked,
            tarball_url: String::new(),
            integrity: String::new(),
            size_bytes: 0,
            published_at: None,
            dependencies: self
                .dependencies
                .iter()
                .map(|dep| proto_gen::Dependency {
                    name: dep.name.clone(),
                    version_range: dep.version_req.clone(),
                    is_peer: false,
                })
                .collect(),
            dev_dependencies: Vec::new(),
            optional_dependencies: Vec::new(),
        }
        .encode_to_vec()
    }
}

impl VersionYankedEvent {
    fn encode_to_vec(&self) -> Vec<u8> {
        proto_gen::VersionYanked {
            meta: Some(event_meta(&self.event_id, "cargo-ingestion")),
            ecosystem: self.ecosystem.clone(),
            package_name: self.package_name.clone(),
            version: self.version.clone(),
            reason: if self.yanked {
                "cargo_yanked".to_string()
            } else {
                "cargo_unyanked".to_string()
            },
            yanked_at: Some(prost_types::Timestamp::from(std::time::SystemTime::now())),
        }
        .encode_to_vec()
    }
}

fn event_meta(event_id: &str, source: &str) -> proto_gen::EventMeta {
    proto_gen::EventMeta {
        event_id: event_id.to_string(),
        source: source.to_string(),
        traceparent: String::new(),
        occurred_at: Some(prost_types::Timestamp::from(std::time::SystemTime::now())),
        schema_version: "v1".to_string(),
    }
}
