//! Cargo Index Watcher
//!
//! Watches crates for changes using the sparse index.
//! For each crate being watched, polls the index file with conditional headers.

use anyhow::{Context, Result};
use chrono::Utc;
use prost::Message;
use rdkafka::producer::{FutureProducer, FutureRecord};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tracing::{debug, error, info, instrument, warn};

use super::fetcher::CargoFetcher;
use super::index::CrateIndexEntry;

/// Topic for raw cargo index changes
const RAW_CARGO_INDEX_TOPIC: &str = "raw.cargo.index.v1";

/// Checkpoint key in database
#[allow(dead_code)]
const CHECKPOINT_KEY: &str = "cargo_watcher";

/// State for a watched crate
#[derive(Debug, Clone)]
struct WatchedCrate {
    /// Last known ETag
    etag: Option<String>,
    /// Last known Last-Modified
    last_modified: Option<String>,
    /// Hash of last known versions
    versions_hash: String,
}

/// Cargo Index Watcher
///
/// Maintains a list of crates to watch and polls their index files.
/// Uses ETag/Last-Modified for efficient conditional requests.
pub struct CargoWatcher {
    fetcher: CargoFetcher,
    producer: FutureProducer,
    /// Map of crate name -> watch state
    watch_state: Arc<RwLock<HashMap<String, WatchedCrate>>>,
    /// Poll interval
    poll_interval: Duration,
}

impl CargoWatcher {
    pub fn new(producer: FutureProducer) -> Result<Self> {
        Ok(Self {
            fetcher: CargoFetcher::new()?,
            producer,
            watch_state: Arc::new(RwLock::new(HashMap::new())),
            poll_interval: Duration::from_secs(60), // Poll each crate every 60s
        })
    }

    /// Add a crate to the watch list
    pub async fn watch_crate(&self, crate_name: &str) {
        let mut state = self.watch_state.write().await;
        if !state.contains_key(crate_name) {
            state.insert(
                crate_name.to_string(),
                WatchedCrate {
                    etag: None,
                    last_modified: None,
                    versions_hash: String::new(),
                },
            );
            info!(crate_name = %crate_name, "Added crate to watch list");
        }
    }

    /// Add multiple crates to watch list
    pub async fn watch_crates(&self, crate_names: &[&str]) {
        for name in crate_names {
            self.watch_crate(name).await;
        }
    }

    /// Run the watcher loop
    ///
    /// For seed mode, pass in a list of crates to watch.
    /// For production, crates are discovered from downstream events.
    #[instrument(skip(self))]
    pub async fn run(&self) -> Result<()> {
        info!("Starting Cargo index watcher");

        loop {
            if let Err(e) = self.poll_all_crates().await {
                error!(error = %e, "Error in poll cycle");
            }

            tokio::time::sleep(self.poll_interval).await;
        }
    }

    /// Poll all watched crates for changes
    async fn poll_all_crates(&self) -> Result<()> {
        let crates_to_poll: Vec<String> = {
            let state = self.watch_state.read().await;
            state.keys().cloned().collect()
        };

        if crates_to_poll.is_empty() {
            debug!("No crates to poll");
            return Ok(());
        }

        info!(count = crates_to_poll.len(), "Polling crates for changes");

        for crate_name in crates_to_poll {
            if let Err(e) = self.poll_crate(&crate_name).await {
                warn!(crate_name = %crate_name, error = %e, "Failed to poll crate");
                // Continue with other crates
            }

            // Small delay between crates to avoid hammering the index
            tokio::time::sleep(Duration::from_millis(100)).await;
        }

        Ok(())
    }

    /// Poll a single crate for changes
    #[instrument(skip(self))]
    async fn poll_crate(&self, crate_name: &str) -> Result<()> {
        let (etag, last_modified, old_hash) = {
            let state = self.watch_state.read().await;
            match state.get(crate_name) {
                Some(s) => (
                    s.etag.clone(),
                    s.last_modified.clone(),
                    s.versions_hash.clone(),
                ),
                None => return Ok(()), // Not in watch list
            }
        };

        let result = self
            .fetcher
            .fetch_crate_index_conditional(crate_name, etag.as_deref(), last_modified.as_deref())
            .await?;

        let Some(fetch_result) = result else {
            debug!(crate_name = %crate_name, "No changes (304 or 404)");
            return Ok(());
        };

        // Calculate new versions hash
        let new_hash = calculate_versions_hash(&fetch_result.entries);

        // Check if actually changed
        if new_hash == old_hash {
            debug!(crate_name = %crate_name, "Index fetched but content unchanged");
            // Update etag/last-modified anyway
            let mut state = self.watch_state.write().await;
            if let Some(ws) = state.get_mut(crate_name) {
                ws.etag = fetch_result.etag;
                ws.last_modified = fetch_result.last_modified;
            }
            return Ok(());
        }

        info!(
            crate_name = %crate_name,
            versions = fetch_result.entries.len(),
            "Crate index changed"
        );

        // Emit raw event
        self.emit_index_change(crate_name, &fetch_result.entries)
            .await?;

        // Update state
        let mut state = self.watch_state.write().await;
        if let Some(ws) = state.get_mut(crate_name) {
            ws.etag = fetch_result.etag;
            ws.last_modified = fetch_result.last_modified;
            ws.versions_hash = new_hash;
        }

        Ok(())
    }

    /// Emit a raw index change event to Kafka
    async fn emit_index_change(&self, crate_name: &str, entries: &[CrateIndexEntry]) -> Result<()> {
        // Create protobuf message
        let version_records: Vec<_> = entries
            .iter()
            .map(|e| CrateVersionRecord {
                version: e.version.clone(),
                yanked: e.yanked,
                cksum: e.cksum.clone(),
                deps: e
                    .deps
                    .iter()
                    .map(|d| CrateDependencyProto {
                        name: d.name.clone(),
                        req: d.req.clone(),
                        features: d.features.clone(),
                        optional: d.optional,
                        target: d.target.clone().unwrap_or_default(),
                        kind: match d.kind {
                            super::index::DependencyKind::Normal => "normal".to_string(),
                            super::index::DependencyKind::Dev => "dev".to_string(),
                            super::index::DependencyKind::Build => "build".to_string(),
                        },
                    })
                    .collect(),
                features: e
                    .features
                    .iter()
                    .map(|(k, v)| (k.clone(), v.join(",")))
                    .collect(),
                rust_version: e.rust_version.clone().unwrap_or_default(),
            })
            .collect();

        let index_change = IndexChange {
            crate_name: crate_name.to_string(),
            cursor: Utc::now().timestamp_millis().to_string(),
            detected_at: Utc::now().to_rfc3339(),
            source: IndexSource::Sparse as i32,
            versions: version_records,
        };

        let payload = index_change.encode_to_vec();
        let key = format!("cargo:{}", crate_name);

        let record = FutureRecord::to(RAW_CARGO_INDEX_TOPIC)
            .key(&key)
            .payload(&payload);

        self.producer
            .send(record, Duration::from_secs(5))
            .await
            .map_err(|(e, _)| e)
            .context("Failed to send to Kafka")?;

        debug!(crate_name = %crate_name, "Emitted index change event");

        Ok(())
    }
}

/// Calculate a hash of all versions for change detection
fn calculate_versions_hash(entries: &[CrateIndexEntry]) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();

    for entry in entries {
        entry.version.hash(&mut hasher);
        entry.yanked.hash(&mut hasher);
        entry.cksum.hash(&mut hasher);
    }

    format!("{:x}", hasher.finish())
}

// Protobuf types (simplified - these would normally come from generated proto)
#[derive(Clone, prost::Message)]
pub struct IndexChange {
    #[prost(string, tag = "1")]
    pub crate_name: String,
    #[prost(string, tag = "2")]
    pub cursor: String,
    #[prost(string, tag = "3")]
    pub detected_at: String,
    #[prost(enumeration = "IndexSource", tag = "4")]
    pub source: i32,
    #[prost(message, repeated, tag = "5")]
    pub versions: Vec<CrateVersionRecord>,
}

#[derive(Clone, prost::Message)]
pub struct CrateVersionRecord {
    #[prost(string, tag = "1")]
    pub version: String,
    #[prost(bool, tag = "2")]
    pub yanked: bool,
    #[prost(string, tag = "3")]
    pub cksum: String,
    #[prost(message, repeated, tag = "4")]
    pub deps: Vec<CrateDependencyProto>,
    #[prost(map = "string, string", tag = "5")]
    pub features: HashMap<String, String>,
    #[prost(string, tag = "6")]
    pub rust_version: String,
}

#[derive(Clone, prost::Message)]
pub struct CrateDependencyProto {
    #[prost(string, tag = "1")]
    pub name: String,
    #[prost(string, tag = "2")]
    pub req: String,
    #[prost(string, repeated, tag = "3")]
    pub features: Vec<String>,
    #[prost(bool, tag = "4")]
    pub optional: bool,
    #[prost(string, tag = "5")]
    pub target: String,
    #[prost(string, tag = "6")]
    pub kind: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, prost::Enumeration)]
#[repr(i32)]
pub enum IndexSource {
    Git = 0,
    Sparse = 1,
}
