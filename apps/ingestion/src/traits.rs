use crate::model::PackageMetadata;
use anyhow::Result;
use async_trait::async_trait; // TBD: Normalized model

/// Unique identifier for a unit of work (e.g. "npm:react:cursor-123")
#[derive(Debug, Clone)]
pub struct WorkItem {
    pub registry: String,
    pub cursor: String,
    pub package_name: Option<String>,
    pub url: Option<String>,
}

/// Normalized output event from processing
#[derive(Debug)]
pub struct IngestionEvent {
    pub registry: String,
    pub package: PackageMetadata,
    pub raw_payload: serde_json::Value,
    pub original_cursor: String,
}

/// Component that monitors a registry for changes and emits WorkItems
#[async_trait]
pub trait Watcher: Send + Sync {
    /// Start watching the registry and return a stream or channel of items
    /// For this version, we might just poll and return a batch
    async fn poll(&self, last_cursor: &str) -> Result<(Vec<WorkItem>, String)>;

    /// Return unique ID of the registry
    fn registry_name(&self) -> &'static str;
}

/// Component that fetches raw data given a WorkItem
#[async_trait]
pub trait Fetcher: Send + Sync {
    async fn fetch(&self, item: &WorkItem) -> Result<serde_json::Value>;
}

/// Component that parses raw JSON into normalized domain model
pub trait Parser: Send + Sync {
    fn parse(&self, raw: serde_json::Value) -> Result<PackageMetadata>;
}

/// Persistent storage for checkpoints
#[async_trait]
pub trait CheckpointStore: Send + Sync {
    async fn get_cursor(&self, registry: &str) -> Result<Option<String>>;
    async fn set_cursor(&self, registry: &str, cursor: &str) -> Result<()>;
}
