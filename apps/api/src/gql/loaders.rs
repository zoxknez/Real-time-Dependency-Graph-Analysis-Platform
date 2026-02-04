//! DataLoader implementations for batch-loading to avoid N+1 queries
//!
//! Uses async-graphql's built-in DataLoader which provides:
//! - Automatic batching within a request
//! - Configurable batch windows
//! - Per-request deduplication

use std::collections::HashMap;
use std::sync::Arc;
use async_graphql::dataloader::Loader;
use async_graphql::ID;
use tracing::{debug, instrument};
use uuid::Uuid;

use crate::graph::{GraphClient, GraphQueries};
use crate::gql::types::{Ecosystem, Package, Version};

// ============================================================================
// Async-GraphQL DataLoader Implementations
// ============================================================================

/// Batch loader for Package nodes with tenant isolation
pub struct PackageBatchLoader {
    graph: GraphClient,
    tenant_id: Option<Uuid>,
}

impl PackageBatchLoader {
    pub fn new(graph: GraphClient, tenant_id: Option<Uuid>) -> Self {
        Self { graph, tenant_id }
    }
}

impl Loader<String> for PackageBatchLoader {
    type Value = Package;
    type Error = Arc<async_graphql::Error>;

    #[instrument(skip(self), fields(batch_size = keys.len()))]
    async fn load(&self, keys: &[String]) -> Result<HashMap<String, Package>, Self::Error> {
        if keys.is_empty() {
            return Ok(HashMap::new());
        }

        debug!(
            count = keys.len(),
            tenant = ?self.tenant_id,
            "DataLoader batch loading packages"
        );

        let tenant_str = self.tenant_id
            .map(|t| t.to_string())
            .unwrap_or_else(|| "public".to_string());

        let query = GraphQueries::get_packages_batch(&tenant_str, keys);
        
        let rows = self.graph.query(query, None).await
            .map_err(|e| Arc::new(async_graphql::Error::new(format!("DataLoader query failed: {}", e))))?;

        let mut map = HashMap::with_capacity(keys.len());
        for row in rows {
            let id: String = row.get("id").unwrap_or_default();
            let pkg = Package {
                id: ID(id.clone()),
                ecosystem: Ecosystem::from(
                    row.get::<String>("ecosystem")
                        .unwrap_or_default()
                        .as_str(),
                ),
                name: row.get::<String>("name").unwrap_or_default(),
                created_at: row.get("created_at").ok(),
                updated_at: row.get("updated_at").ok(),
            };
            map.insert(id, pkg);
        }

        debug!(
            requested = keys.len(),
            returned = map.len(),
            "DataLoader batch complete"
        );

        // Record metrics
        metrics::counter!("dataloader_batch_requests", "loader" => "package").increment(1);
        metrics::histogram!("dataloader_batch_size", "loader" => "package").record(keys.len() as f64);
        if !keys.is_empty() {
            metrics::histogram!("dataloader_batch_hit_rate", "loader" => "package")
                .record(map.len() as f64 / keys.len() as f64);
        }

        Ok(map)
    }
}

/// Batch loader for Version nodes with tenant isolation
pub struct VersionBatchLoader {
    graph: GraphClient,
    tenant_id: Option<Uuid>,
}

impl VersionBatchLoader {
    pub fn new(graph: GraphClient, tenant_id: Option<Uuid>) -> Self {
        Self { graph, tenant_id }
    }
}

impl Loader<String> for VersionBatchLoader {
    type Value = Version;
    type Error = Arc<async_graphql::Error>;

    #[instrument(skip(self), fields(batch_size = keys.len()))]
    async fn load(&self, keys: &[String]) -> Result<HashMap<String, Version>, Self::Error> {
        if keys.is_empty() {
            return Ok(HashMap::new());
        }

        debug!(
            count = keys.len(),
            tenant = ?self.tenant_id,
            "DataLoader batch loading versions"
        );

        let tenant_str = self.tenant_id
            .map(|t| t.to_string())
            .unwrap_or_else(|| "public".to_string());

        let query = GraphQueries::get_versions_batch(&tenant_str, keys);
        
        let rows = self.graph.query(query, None).await
            .map_err(|e| Arc::new(async_graphql::Error::new(format!("Version DataLoader failed: {}", e))))?;

        let mut map = HashMap::with_capacity(keys.len());
        for row in rows {
            let id: String = row.get("id").unwrap_or_default();
            let version = Version {
                id: ID(id.clone()),
                package_id: ID(row.get::<String>("package_id").unwrap_or_default()),
                version: row.get::<String>("version").unwrap_or_default(),
                published_at: row.get("published_at").ok(),
                yanked: row.get::<bool>("yanked").unwrap_or(false),
            };
            map.insert(id, version);
        }

        metrics::counter!("dataloader_batch_requests", "loader" => "version").increment(1);
        metrics::histogram!("dataloader_batch_size", "loader" => "version").record(keys.len() as f64);

        Ok(map)
    }
}

/// Batch loader for direct dependencies of packages
pub struct DependenciesLoader {
    graph: GraphClient,
    tenant_id: Option<Uuid>,
}

impl DependenciesLoader {
    pub fn new(graph: GraphClient, tenant_id: Option<Uuid>) -> Self {
        Self { graph, tenant_id }
    }
}

impl Loader<String> for DependenciesLoader {
    type Value = Vec<Package>;
    type Error = Arc<async_graphql::Error>;

    #[instrument(skip(self), fields(batch_size = keys.len()))]
    async fn load(&self, keys: &[String]) -> Result<HashMap<String, Vec<Package>>, Self::Error> {
        if keys.is_empty() {
            return Ok(HashMap::new());
        }

        let tenant_str = self.tenant_id
            .map(|t| t.to_string())
            .unwrap_or_else(|| "public".to_string());

        let query = GraphQueries::get_dependencies_batch(&tenant_str, keys);
        
        let rows = self.graph.query(query, None).await
            .map_err(|e| Arc::new(async_graphql::Error::new(format!("Dependencies loader failed: {}", e))))?;

        let mut map: HashMap<String, Vec<Package>> = HashMap::with_capacity(keys.len());
        
        for row in rows {
            let source_id: String = row.get("source_id").unwrap_or_default();
            let pkg = Package {
                id: ID(row.get::<String>("id").unwrap_or_default()),
                ecosystem: Ecosystem::from(row.get::<String>("ecosystem").unwrap_or_default().as_str()),
                name: row.get::<String>("name").unwrap_or_default(),
                created_at: None,
                updated_at: None,
            };
            
            map.entry(source_id).or_default().push(pkg);
        }

        // Ensure all keys have entries (even if empty)
        for key in keys {
            map.entry(key.to_string()).or_default();
        }

        metrics::counter!("dataloader_batch_requests", "loader" => "dependencies").increment(1);

        Ok(map)
    }
}

// ============================================================================
// Legacy PackageLoader for backwards compatibility
// ============================================================================

/// Legacy PackageLoader - kept for backwards compatibility with existing code
#[derive(Clone)]
pub struct PackageLoader {
    graph: GraphClient,
}

impl PackageLoader {
    pub fn new(graph: GraphClient) -> Self {
        Self { graph }
    }

    /// Load a single package by ID
    #[allow(dead_code)]
    pub async fn load(&self, id: &str, tenant_id: &str) -> Option<Package> {
        let query = GraphQueries::get_package(tenant_id, id);
        match self.graph.query_one(query, None).await {
            Ok(Some(row)) => {
                Some(Package {
                    id: ID(row.get::<String>("id").unwrap_or_default()),
                    ecosystem: Ecosystem::from(
                        row.get::<String>("ecosystem")
                            .unwrap_or_default()
                            .as_str(),
                    ),
                    name: row.get::<String>("name").unwrap_or_default(),
                    created_at: row.get("created_at").ok(),
                    updated_at: row.get("updated_at").ok(),
                })
            }
            Ok(None) => None,
            Err(e) => {
                tracing::warn!("Failed to load package {}: {}", id, e);
                None
            }
        }
    }

    /// Batch load multiple packages by IDs
    pub async fn load_many(&self, ids: &[String], tenant_id: &str) -> HashMap<String, Package> {
        if ids.is_empty() {
            return HashMap::new();
        }

        debug!(count = ids.len(), "Batch loading packages");

        let query = GraphQueries::get_packages_batch(tenant_id, ids);
        let mut result = HashMap::new();

        if let Ok(rows) = self.graph.query(query, None).await {
            for row in rows {
                let id: String = row.get("id").unwrap_or_default();
                let pkg = Package {
                    id: ID(id.clone()),
                    ecosystem: Ecosystem::from(
                        row.get::<String>("ecosystem")
                            .unwrap_or_default()
                            .as_str(),
                    ),
                    name: row.get::<String>("name").unwrap_or_default(),
                    created_at: row.get("created_at").ok(),
                    updated_at: row.get("updated_at").ok(),
                };
                result.insert(id, pkg);
            }
        }

        result
    }
}
