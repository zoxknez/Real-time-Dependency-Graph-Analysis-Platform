//! Cached Graph Service with Singleflight pattern
//!
//! This service wraps GraphClient with a caching layer that:
//! - Uses singleflight to prevent cache stampede (concurrent requests for same key)
//! - Implements stale-while-revalidate for improved latency
//! - Supports tenant isolation in cache keys
//! - Provides negative caching for 404s
//!
//! ## Architecture
//!
//! ```text
//! Request → CachedGraphService
//!              ↓
//!     [Cache Check - Fresh?] → Yes → Return cached
//!              ↓ No/Stale
//!     [Singleflight Dedup] → Already in-flight? → Wait & share result
//!              ↓ Not in-flight
//!     [GraphClient Query] → Cache result → Return
//! ```

use crate::cache::CacheClient;
use crate::graph::GraphClient;
use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use models::tenant::TenantContext;
use neo4rs::query;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{broadcast, RwLock};
use tracing::{debug, warn};
use uuid::Uuid;

/// Cache configuration
#[derive(Debug, Clone)]
pub struct CacheConfig {
    /// Time after which entry is considered stale (but still usable)
    pub stale_after: Duration,
    /// Time after which entry expires completely
    pub expire_after: Duration,
    /// TTL for negative cache (404s)
    pub negative_ttl: Duration,
    /// Enable stale-while-revalidate pattern
    pub stale_while_revalidate: bool,
}

impl Default for CacheConfig {
    fn default() -> Self {
        Self {
            stale_after: Duration::from_secs(60),
            expire_after: Duration::from_secs(300),
            negative_ttl: Duration::from_secs(30),
            stale_while_revalidate: true,
        }
    }
}

/// Cached entry wrapper with metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedEntry<T> {
    /// The cached value
    pub value: CacheResult<T>,
    /// When the entry was cached
    pub cached_at: DateTime<Utc>,
    /// TTL in seconds
    pub ttl_secs: u64,
}

/// Cache result supporting negative caching
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CacheResult<T> {
    Found(T),
    NotFound,
}

impl<T> CachedEntry<T> {
    fn new(value: CacheResult<T>, ttl: Duration) -> Self {
        Self {
            value,
            cached_at: Utc::now(),
            ttl_secs: ttl.as_secs(),
        }
    }

    fn age(&self) -> Duration {
        let age_secs = (Utc::now() - self.cached_at).num_seconds().max(0) as u64;
        Duration::from_secs(age_secs)
    }

    fn is_fresh(&self, stale_after: Duration) -> bool {
        self.age() < stale_after
    }

    fn is_expired(&self, expire_after: Duration) -> bool {
        self.age() >= expire_after
    }
}

/// In-flight request tracker for singleflight pattern
struct InFlightRequest<T> {
    tx: broadcast::Sender<Result<Arc<T>, String>>,
}

/// Cached Graph Service with stampede protection
#[derive(Clone)]
pub struct CachedGraphService {
    graph: Arc<GraphClient>,
    cache: Arc<CacheClient>,
    config: CacheConfig,
    /// In-flight requests for singleflight pattern
    /// Key: cache_key, Value: broadcast channel
    in_flight: Arc<RwLock<HashMap<String, broadcast::Sender<Result<Arc<Vec<ReverseDep>>, String>>>>>,
    /// In-flight for package queries
    in_flight_packages: Arc<RwLock<HashMap<String, broadcast::Sender<Result<Arc<Option<PackageData>>, String>>>>>,
}

/// Reverse dependency data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReverseDep {
    pub id: String,
    pub name: String,
    pub ecosystem: String,
    pub depth: i32,
}

/// Package data for caching
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageData {
    pub id: String,
    pub name: String,
    pub ecosystem: String,
    pub description: Option<String>,
    pub latest_version: Option<String>,
}

impl CachedGraphService {
    /// Create a new cached graph service
    pub fn new(graph: Arc<GraphClient>, cache: Arc<CacheClient>, config: CacheConfig) -> Self {
        Self {
            graph,
            cache,
            config,
            in_flight: Arc::new(RwLock::new(HashMap::new())),
            in_flight_packages: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Create with default config
    pub fn with_defaults(graph: Arc<GraphClient>, cache: Arc<CacheClient>) -> Self {
        Self::new(graph, cache, CacheConfig::default())
    }

    // =========================================================================
    // Cache Key Generation
    // =========================================================================

    /// Schema version - increment when cache format changes
    const CACHE_VERSION: u32 = 1;

    fn cache_key_reverse_deps(
        package_id: &str,
        max_depth: i32,
        tenant_id: Option<Uuid>,
    ) -> String {
        let tenant_prefix = tenant_id
            .map(|t| format!("t:{}:", t))
            .unwrap_or_default();
        format!(
            "{}v{}:rdeps:{}:d{}",
            tenant_prefix,
            Self::CACHE_VERSION,
            package_id,
            max_depth
        )
    }

    fn cache_key_package(package_id: &str, tenant_id: Option<Uuid>) -> String {
        let tenant_prefix = tenant_id
            .map(|t| format!("t:{}:", t))
            .unwrap_or_default();
        format!("{}v{}:pkg:{}", tenant_prefix, Self::CACHE_VERSION, package_id)
    }

    // =========================================================================
    // Reverse Dependencies with Singleflight
    // =========================================================================

    /// Get reverse dependencies with caching and singleflight
    ///
    /// This method:
    /// 1. Checks cache for fresh hit
    /// 2. Returns stale data while revalidating in background (if enabled)
    /// 3. Uses singleflight to deduplicate concurrent requests
    pub async fn reverse_dependents(
        &self,
        package_id: &str,
        max_depth: i32,
        tenant_ctx: Option<&TenantContext>,
    ) -> Result<Arc<Vec<ReverseDep>>> {
        let tenant_id = tenant_ctx.map(|t| t.tenant_id);
        let cache_key = Self::cache_key_reverse_deps(package_id, max_depth, tenant_id);

        // 1. Check cache
        if let Some(entry) = self.get_cached::<Vec<ReverseDep>>(&cache_key).await? {
            if entry.is_fresh(self.config.stale_after) {
                metrics::counter!("cache_hits", "query" => "reverse_deps", "type" => "fresh")
                    .increment(1);
                return match entry.value {
                    CacheResult::Found(v) => Ok(Arc::new(v)),
                    CacheResult::NotFound => Ok(Arc::new(Vec::new())),
                };
            }

            // Stale but usable
            if !entry.is_expired(self.config.expire_after) && self.config.stale_while_revalidate {
                metrics::counter!("cache_hits", "query" => "reverse_deps", "type" => "stale")
                    .increment(1);

                // Return stale, refresh in background
                let stale_value = match entry.value {
                    CacheResult::Found(v) => Arc::new(v),
                    CacheResult::NotFound => Arc::new(Vec::new()),
                };

                // Fire-and-forget background refresh
                let this = self.clone();
                let pkg_id = package_id.to_string();
                let key = cache_key.clone();
                let tenant = tenant_ctx.cloned();
                tokio::spawn(async move {
                    if let Err(e) = this
                        .fetch_and_cache_reverse_deps(&pkg_id, max_depth, tenant.as_ref(), &key)
                        .await
                    {
                        warn!(error = %e, key = %key, "Background cache refresh failed");
                    }
                });

                return Ok(stale_value);
            }
        }

        // 2. Cache miss - use singleflight
        metrics::counter!("cache_misses", "query" => "reverse_deps").increment(1);

        self.singleflight_reverse_deps(package_id, max_depth, tenant_ctx, &cache_key)
            .await
    }

    /// Singleflight implementation for reverse deps
    async fn singleflight_reverse_deps(
        &self,
        package_id: &str,
        max_depth: i32,
        tenant_ctx: Option<&TenantContext>,
        cache_key: &str,
    ) -> Result<Arc<Vec<ReverseDep>>> {
        // Check if already in-flight
        {
            let in_flight = self.in_flight.read().await;
            if let Some(tx) = in_flight.get(cache_key) {
                // Subscribe to existing request
                let mut rx = tx.subscribe();
                drop(in_flight); // Release lock before await

                metrics::counter!("singleflight_joins", "query" => "reverse_deps").increment(1);
                debug!(key = %cache_key, "Joining in-flight request");

                return match rx.recv().await {
                    Ok(Ok(result)) => Ok(result),
                    Ok(Err(e)) => Err(anyhow::anyhow!("Shared request failed: {}", e)),
                    Err(e) => Err(anyhow::anyhow!("Channel error: {}", e)),
                };
            }
        }

        // We're the leader - create broadcast channel
        let (tx, _) = broadcast::channel::<Result<Arc<Vec<ReverseDep>>, String>>(1);

        // Register in-flight
        {
            let mut in_flight = self.in_flight.write().await;
            in_flight.insert(cache_key.to_string(), tx.clone());
        }

        // Fetch data
        let result = self
            .fetch_and_cache_reverse_deps(package_id, max_depth, tenant_ctx, cache_key)
            .await;

        // Cleanup and broadcast
        {
            let mut in_flight = self.in_flight.write().await;
            in_flight.remove(cache_key);
        }

        // Broadcast result to waiting subscribers
        match &result {
            Ok(data) => {
                let _ = tx.send(Ok(data.clone()));
            }
            Err(e) => {
                let _ = tx.send(Err(e.to_string()));
            }
        }

        result
    }

    /// Fetch from database and cache
    async fn fetch_and_cache_reverse_deps(
        &self,
        package_id: &str,
        max_depth: i32,
        tenant_ctx: Option<&TenantContext>,
        cache_key: &str,
    ) -> Result<Arc<Vec<ReverseDep>>> {
        let start = Instant::now();

        // Query Memgraph with tenant isolation
        let cypher = format!(
            r#"
            MATCH path = (p:Package {{id: $id}})<-[:DEPENDS_ON*1..{}]-(dependent:Package)
            WITH dependent, length(path) as depth
            RETURN DISTINCT dependent.id as id, dependent.name as name, 
                   dependent.ecosystem as ecosystem, depth
            ORDER BY depth, name
            LIMIT 1000
            "#,
            max_depth
        );

        let q = query(&cypher).param("id", package_id);
        let rows = self.graph.query(q, tenant_ctx).await?;

        let deps: Vec<ReverseDep> = rows
            .into_iter()
            .filter_map(|row| {
                Some(ReverseDep {
                    id: row.get("id").ok()?,
                    name: row.get("name").ok()?,
                    ecosystem: row.get("ecosystem").ok()?,
                    depth: row.get::<i64>("depth").ok()? as i32,
                })
            })
            .collect();

        metrics::histogram!("db_query_duration_seconds", "query" => "reverse_deps")
            .record(start.elapsed().as_secs_f64());

        // Cache with TTL based on depth (deeper = longer TTL, more expensive to compute)
        let ttl = match max_depth {
            1 => Duration::from_secs(60),
            2 => Duration::from_secs(180),
            _ => Duration::from_secs(300),
        };

        let entry = CachedEntry::new(CacheResult::Found(deps.clone()), ttl);
        self.set_cached(cache_key, &entry).await?;

        Ok(Arc::new(deps))
    }

    // =========================================================================
    // Package Lookup with Negative Caching
    // =========================================================================

    /// Get package by ID with caching (including 404s)
    pub async fn get_package(
        &self,
        package_id: &str,
        tenant_ctx: Option<&TenantContext>,
    ) -> Result<Option<PackageData>> {
        let tenant_id = tenant_ctx.map(|t| t.tenant_id);
        let cache_key = Self::cache_key_package(package_id, tenant_id);

        // Check cache
        if let Some(entry) = self.get_cached::<PackageData>(&cache_key).await? {
            if entry.is_fresh(self.config.stale_after) {
                match entry.value {
                    CacheResult::Found(pkg) => {
                        metrics::counter!("cache_hits", "query" => "package", "type" => "found")
                            .increment(1);
                        return Ok(Some(pkg));
                    }
                    CacheResult::NotFound => {
                        metrics::counter!("cache_hits", "query" => "package", "type" => "negative")
                            .increment(1);
                        return Ok(None);
                    }
                }
            }
        }

        metrics::counter!("cache_misses", "query" => "package").increment(1);

        // Query database
        let start = Instant::now();
        let q = query(
            r#"
            MATCH (p:Package {id: $id})
            OPTIONAL MATCH (p)-[:HAS_VERSION]->(v:Version)
            WITH p, v ORDER BY v.published_at DESC LIMIT 1
            RETURN p.id as id, p.name as name, p.ecosystem as ecosystem,
                   p.description as description, v.version as latest_version
            "#,
        )
        .param("id", package_id);

        let row = self.graph.query_one(q, tenant_ctx).await?;

        metrics::histogram!("db_query_duration_seconds", "query" => "package")
            .record(start.elapsed().as_secs_f64());

        match row {
            Some(row) => {
                let pkg = PackageData {
                    id: row.get("id")?,
                    name: row.get("name")?,
                    ecosystem: row.get("ecosystem")?,
                    description: row.get("description").ok(),
                    latest_version: row.get("latest_version").ok(),
                };

                // Cache positive result
                let entry = CachedEntry::new(
                    CacheResult::Found(pkg.clone()),
                    self.config.expire_after,
                );
                self.set_cached(&cache_key, &entry).await?;

                Ok(Some(pkg))
            }
            None => {
                // Cache negative result (404)
                let entry: CachedEntry<PackageData> =
                    CachedEntry::new(CacheResult::NotFound, self.config.negative_ttl);
                self.set_cached(&cache_key, &entry).await?;

                Ok(None)
            }
        }
    }

    // =========================================================================
    // Cache Helpers
    // =========================================================================

    async fn get_cached<T: for<'de> Deserialize<'de>>(
        &self,
        key: &str,
    ) -> Result<Option<CachedEntry<T>>> {
        Ok(self.cache.get::<CachedEntry<T>>(key).await)
    }

    async fn set_cached<T: Serialize>(&self, key: &str, entry: &CachedEntry<T>) -> Result<()> {
        self.cache
            .set_with_ttl(key, entry, entry.ttl_secs)
            .await
            .context("Cache set failed")
    }

    // =========================================================================
    // Cache Invalidation
    // =========================================================================

    /// Invalidate cache for a package (e.g., after update)
    pub async fn invalidate_package(&self, package_id: &str, tenant_id: Option<Uuid>) -> Result<()> {
        let key = Self::cache_key_package(package_id, tenant_id);
        self.cache.delete(&key).await?;

        // Also invalidate any reverse deps that might include this package
        // Use pattern matching if supported, otherwise this is a best-effort
        debug!(package_id = %package_id, "Invalidated package cache");

        Ok(())
    }

    /// Invalidate reverse deps cache for a package
    pub async fn invalidate_reverse_deps(
        &self,
        package_id: &str,
        tenant_id: Option<Uuid>,
    ) -> Result<()> {
        // Invalidate all depth variants (1, 2, 3)
        for depth in 1..=3 {
            let key = Self::cache_key_reverse_deps(package_id, depth, tenant_id);
            let _ = self.cache.delete(&key).await;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_key_generation() {
        let key = CachedGraphService::cache_key_package("npm:lodash", None);
        assert!(key.contains("v1:pkg:npm:lodash"));
        assert!(!key.contains("t:"));

        let tenant_id = Uuid::new_v4();
        let key_with_tenant =
            CachedGraphService::cache_key_package("npm:lodash", Some(tenant_id));
        assert!(key_with_tenant.starts_with("t:"));
        assert!(key_with_tenant.contains(&tenant_id.to_string()));
    }

    #[test]
    fn test_cached_entry_freshness() {
        let entry = CachedEntry::new(CacheResult::Found("test".to_string()), Duration::from_secs(60));

        // Just created - should be fresh
        assert!(entry.is_fresh(Duration::from_secs(10)));
        assert!(!entry.is_expired(Duration::from_secs(300)));
    }
}
