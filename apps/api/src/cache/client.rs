//! Redis cache client for GraphQL query caching

use anyhow::{Context, Result};
use redis::aio::ConnectionManager;
use redis::AsyncCommands;
use serde::{de::DeserializeOwned, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tracing::{debug, instrument, warn};

use crate::config::RedisConfig;
use storage::circuit_breaker::{CircuitBreaker, CircuitBreakerConfig};

/// Redis cache client with connection pooling and circuit breaker
#[derive(Clone)]
pub struct CacheClient {
    conn: ConnectionManager,
    default_ttl: u64,
    circuit_breaker: Arc<CircuitBreaker>,
}

impl CacheClient {
    /// Connect to Redis with connection manager (auto-reconnect)
    #[instrument(skip(config), fields(url = %config.url))]
    pub async fn connect(config: &RedisConfig) -> Result<Self> {
        let client = redis::Client::open(config.url.as_str())
            .with_context(|| format!("Invalid Redis URL: {}", config.url))?;

        let conn = ConnectionManager::new(client)
            .await
            .with_context(|| format!("Failed to connect to Redis at {}", config.url))?;

        tracing::info!("Connected to Redis successfully");

        let circuit_breaker = Arc::new(CircuitBreaker::new(
            "redis",
            "cache",
            CircuitBreakerConfig {
                failure_threshold: 5,
                success_threshold: 2,
                timeout_ms: 10_000, // 10s recovery window
                half_open_requests: 3,
            },
        ));

        Ok(Self {
            conn,
            default_ttl: config.cache_ttl_secs,
            circuit_breaker,
        })
    }

    /// Get circuit breaker state for monitoring
    pub fn circuit_state(&self) -> storage::circuit_breaker::CircuitState {
        self.circuit_breaker.state()
    }

    /// Get a cached value by key with circuit breaker protection
    /// 
    /// Returns None if circuit is open (graceful degradation)
    pub async fn get<T: DeserializeOwned>(&self, key: &str) -> Option<T> {
        let mut conn = self.conn.clone();
        let cb = self.circuit_breaker.clone();

        // Wrap redis call with circuit breaker
        let result = cb
            .call::<_, _, anyhow::Error>(async {
                match conn.get::<_, Option<String>>(key).await {
                    Ok(opt) => Ok(opt),
                    Err(e) => Err(anyhow::anyhow!("Redis GET error: {}", e)),
                }
            })
            .await;

        match result {
            Ok(Some(data)) => {
                match serde_json::from_str(&data) {
                    Ok(value) => {
                        debug!(key = key, "Cache HIT");
                        metrics::counter!("cache_hits").increment(1);
                        Some(value)
                    }
                    Err(e) => {
                        warn!(key = key, error = %e, "Failed to deserialize cached value");
                        metrics::counter!("cache_errors", "type" => "deserialize").increment(1);
                        None
                    }
                }
            }
            Ok(None) => {
                debug!(key = key, "Cache MISS");
                metrics::counter!("cache_misses").increment(1);
                None
            }
            Err(e) => {
                // Circuit breaker may have rejected or redis failed
                warn!(key = key, error = %e, "Redis GET error (may be circuit open)");
                metrics::counter!("cache_errors", "type" => "redis").increment(1);
                None
            }
        }
    }

    /// Set a value with default TTL
    pub async fn set<T: Serialize>(&self, key: &str, value: &T) -> Result<()> {
        self.set_with_ttl(key, value, self.default_ttl).await
    }

    /// Set a value with custom TTL (seconds) with circuit breaker protection
    pub async fn set_with_ttl<T: Serialize>(&self, key: &str, value: &T, ttl_secs: u64) -> Result<()> {
        let mut conn = self.conn.clone();
        let cb = self.circuit_breaker.clone();
        let data = serde_json::to_string(value)?;
        
        cb.call::<_, _, anyhow::Error>(async {
            conn.set_ex::<_, _, ()>(key, data.clone(), ttl_secs)
                .await
                .with_context(|| format!("Failed to SET key: {}", key))
        })
        .await?;
        
        debug!(key = key, ttl = ttl_secs, "Cached value");
        Ok(())
    }

    /// Delete a cached key with circuit breaker protection
    pub async fn delete(&self, key: &str) -> Result<()> {
        let mut conn = self.conn.clone();
        let cb = self.circuit_breaker.clone();
        
        cb.call::<_, _, anyhow::Error>(async {
            conn.del::<_, ()>(key).await.map_err(|e| anyhow::anyhow!("DEL error: {}", e))
        })
        .await
    }

    /// Delete keys matching a pattern using SCAN (non-blocking, O(1) per iteration)
    /// 
    /// # Safety
    /// - Uses SCAN instead of KEYS (O(1) per iteration vs O(N) blocking)
    /// - Limits total keys deleted per call to prevent runaway operations
    /// - Limits iterations to prevent infinite loops
    /// 
    /// # Arguments
    /// - `pattern`: Redis SCAN pattern (e.g., "user:*:cache")
    /// - `max_keys`: Maximum number of keys to delete in this call
    /// 
    /// # Returns
    /// Number of keys actually deleted
    pub async fn delete_pattern(&self, pattern: &str, max_keys: usize) -> Result<u64> {
        let mut conn = self.conn.clone();
        let mut cursor: u64 = 0;
        let mut total_deleted: u64 = 0;
        let mut iterations: usize = 0;
        
        const MAX_ITERATIONS: usize = 100;  // Prevent infinite loops
        const SCAN_COUNT: usize = 100;      // Keys to scan per iteration
        
        loop {
            // Use SCAN instead of KEYS (non-blocking)
            let (new_cursor, keys): (u64, Vec<String>) = redis::cmd("SCAN")
                .arg(cursor)
                .arg("MATCH")
                .arg(pattern)
                .arg("COUNT")
                .arg(SCAN_COUNT)
                .query_async(&mut conn)
                .await?;
            
            if !keys.is_empty() {
                // Calculate how many keys we can still delete
                let remaining_quota = max_keys.saturating_sub(total_deleted as usize);
                let keys_to_delete: Vec<_> = keys.into_iter().take(remaining_quota).collect();
                
                if !keys_to_delete.is_empty() {
                    // Batch delete using DEL command
                    let deleted: u64 = redis::cmd("DEL")
                        .arg(&keys_to_delete)
                        .query_async(&mut conn)
                        .await?;
                    total_deleted += deleted;
                }
            }
            
            cursor = new_cursor;
            iterations += 1;
            
            // Stop conditions:
            // 1. Cursor returned to 0 (full scan complete)
            // 2. Hit max iterations (safety limit)
            // 3. Deleted max_keys (quota reached)
            if cursor == 0 || iterations >= MAX_ITERATIONS || total_deleted as usize >= max_keys {
                break;
            }
        }
        
        if iterations >= MAX_ITERATIONS && cursor != 0 {
            warn!(
                pattern = pattern,
                deleted = total_deleted,
                iterations = iterations,
                "SCAN hit max iterations limit - pattern may have more matching keys"
            );
        }
        
        debug!(pattern = pattern, count = total_deleted, iterations = iterations, "Deleted cached keys via SCAN");
        Ok(total_deleted)
    }
    
    /// Delete keys matching a pattern with default limit
    /// Convenience wrapper around delete_pattern with max_keys = 10000
    pub async fn delete_pattern_default(&self, pattern: &str) -> Result<u64> {
        self.delete_pattern(pattern, 10_000).await
    }

    /// Health check
    pub async fn health_check(&self) -> bool {
        let mut conn = self.conn.clone();
        match redis::cmd("PING").query_async::<String>(&mut conn).await {
            Ok(response) => response == "PONG",
            Err(e) => {
                warn!("Redis health check failed: {}", e);
                false
            }
        }
    }
}

/// Cache key builders for consistent key naming with tenant isolation
#[allow(dead_code)]
pub struct CacheKeys;

#[allow(dead_code)]
impl CacheKeys {
    /// Create tenant-prefixed key
    /// 
    /// All keys are prefixed with tenant ID to ensure complete isolation.
    /// Format: `t:{tenant_id}:{key}`
    fn tenant_key(tenant_id: Option<&uuid::Uuid>, key: &str) -> String {
        match tenant_id {
            Some(id) => format!("t:{}:{}", id, key),
            None => format!("t:global:{}", key),
        }
    }

    /// Cache key for package by ID (tenant-isolated)
    pub fn package(tenant_id: Option<&uuid::Uuid>, id: &str) -> String {
        Self::tenant_key(tenant_id, &format!("pkg:{}", id))
    }

    /// Cache key for reverse dependents query (tenant-isolated)
    pub fn reverse_dependents(tenant_id: Option<&uuid::Uuid>, package_id: &str, depth: i32) -> String {
        Self::tenant_key(tenant_id, &format!("rev_deps:{}:d{}", package_id, depth))
    }

    /// Cache key for impact radius query (tenant-isolated)
    pub fn impact_radius(tenant_id: Option<&uuid::Uuid>, package_id: &str, depth: i32) -> String {
        Self::tenant_key(tenant_id, &format!("impact:{}:d{}", package_id, depth))
    }

    /// Cache key for dependency path query (tenant-isolated)
    pub fn dependency_path(tenant_id: Option<&uuid::Uuid>, from: &str, to: &str) -> String {
        Self::tenant_key(tenant_id, &format!("path:{}:{}", from, to))
    }

    /// Cache key for graph stats (tenant-isolated)
    pub fn graph_stats(tenant_id: Option<&uuid::Uuid>) -> String {
        Self::tenant_key(tenant_id, "stats:graph")
    }

    /// Pattern for all tenant keys (for invalidation)
    pub fn tenant_pattern(tenant_id: &uuid::Uuid) -> String {
        format!("t:{}:*", tenant_id)
    }

    /// Invalidate all cache for a tenant
    pub fn invalidation_pattern(tenant_id: Option<&uuid::Uuid>) -> String {
        match tenant_id {
            Some(id) => format!("t:{}:*", id),
            None => "t:global:*".to_string(),
        }
    }
}
