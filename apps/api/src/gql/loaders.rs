//! DataLoader for batch-loading packages to avoid N+1 queries

use std::collections::HashMap;
use std::sync::Arc;
use async_graphql::ID;
use tokio::sync::Mutex;
use tracing::debug;

use crate::graph::{GraphClient, GraphQueries};
use crate::gql::types::{Ecosystem, Package};

/// DataLoader for batch-loading Package nodes
#[derive(Clone)]
pub struct PackageLoader {
    graph: GraphClient,
    cache: Arc<Mutex<HashMap<String, Package>>>,
}

impl PackageLoader {
    pub fn new(graph: GraphClient) -> Self {
        Self {
            graph,
            cache: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Load a single package by ID
    pub async fn load(&self, id: &str, tenant_id: &str) -> Option<Package> {
        let cache_key = format!("{}::{}", tenant_id, id);

        // Check cache first
        {
            let cache = self.cache.lock().await;
            if let Some(pkg) = cache.get(&cache_key) {
                return Some(pkg.clone());
            }
        }

        // Fetch from database
        let query = GraphQueries::get_package(tenant_id, id);
        match self.graph.query_one(query, None).await {
            Ok(Some(row)) => {
                let pkg = Package {
                    id: ID(row.get::<String>("id").unwrap_or_default()),
                    ecosystem: Ecosystem::from(
                        row.get::<String>("ecosystem")
                            .unwrap_or_default()
                            .as_str(),
                    ),
                    name: row.get::<String>("name").unwrap_or_default(),
                    created_at: row.get("created_at").ok(),
                    updated_at: row.get("updated_at").ok(),
                };

                // Cache the result
                {
                    let mut cache = self.cache.lock().await;
                     // Minimal eviction: prevent unbounded growth
                    if cache.len() > 10000 {
                        cache.clear();
                    }
                    cache.insert(cache_key, pkg.clone());
                }

                Some(pkg)
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

        // Check cache for existing entries
        let mut result = HashMap::new();
        let mut missing_ids = Vec::new();

        {
            let cache = self.cache.lock().await;
            for id in ids {
                let cache_key = format!("{}::{}", tenant_id, id);
                if let Some(pkg) = cache.get(&cache_key) {
                    result.insert(id.clone(), pkg.clone());
                } else {
                    missing_ids.push(id.clone());
                }
            }
        }

        // Fetch missing from database
        if !missing_ids.is_empty() {
            let query = GraphQueries::get_packages_batch(tenant_id, &missing_ids);
            
            if let Ok(rows) = self.graph.query(query, None).await {
                let mut cache = self.cache.lock().await;
                
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

                    let cache_key = format!("{}::{}", tenant_id, id);
                    // Minimal eviction
                     if cache.len() > 10000 {
                         cache.clear();
                     }
                    cache.insert(cache_key, pkg.clone());
                    result.insert(id, pkg);
                }
            }
        }

        result
    }

    /// Clear the cache (useful for testing or after mutations)
    #[allow(dead_code)]
    pub async fn clear_cache(&self) {
        let mut cache = self.cache.lock().await;
        cache.clear();
    }
}
