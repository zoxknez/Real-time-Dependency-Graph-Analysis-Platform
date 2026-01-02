//! Redis cache client for GraphQL query caching

use anyhow::{Context, Result};
use redis::aio::ConnectionManager;
use redis::AsyncCommands;
use serde::{de::DeserializeOwned, Serialize};
use std::sync::Arc;
use tracing::{debug, instrument, warn};

use crate::config::RedisConfig;

/// Redis cache client with connection pooling
#[derive(Clone)]
pub struct CacheClient {
    conn: ConnectionManager,
    default_ttl: u64,
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

        Ok(Self {
            conn,
            default_ttl: config.cache_ttl_secs,
        })
    }

    /// Get a cached value by key
    pub async fn get<T: DeserializeOwned>(&self, key: &str) -> Option<T> {
        let mut conn = self.conn.clone();
        
        match conn.get::<_, Option<String>>(key).await {
            Ok(Some(data)) => {
                match serde_json::from_str(&data) {
                    Ok(value) => {
                        debug!(key = key, "Cache HIT");
                        Some(value)
                    }
                    Err(e) => {
                        warn!(key = key, error = %e, "Failed to deserialize cached value");
                        None
                    }
                }
            }
            Ok(None) => {
                debug!(key = key, "Cache MISS");
                None
            }
            Err(e) => {
                warn!(key = key, error = %e, "Redis GET error");
                None
            }
        }
    }

    /// Set a value with default TTL
    pub async fn set<T: Serialize>(&self, key: &str, value: &T) -> Result<()> {
        self.set_with_ttl(key, value, self.default_ttl).await
    }

    /// Set a value with custom TTL (seconds)
    pub async fn set_with_ttl<T: Serialize>(&self, key: &str, value: &T, ttl_secs: u64) -> Result<()> {
        let mut conn = self.conn.clone();
        let data = serde_json::to_string(value)?;
        
        conn.set_ex::<_, _, ()>(key, data, ttl_secs)
            .await
            .with_context(|| format!("Failed to SET key: {}", key))?;
        
        debug!(key = key, ttl = ttl_secs, "Cached value");
        Ok(())
    }

    /// Delete a cached key
    pub async fn delete(&self, key: &str) -> Result<()> {
        let mut conn = self.conn.clone();
        conn.del::<_, ()>(key).await?;
        Ok(())
    }

    /// Delete keys matching a pattern (use sparingly - O(N))
    pub async fn delete_pattern(&self, pattern: &str) -> Result<u64> {
        let mut conn = self.conn.clone();
        let keys: Vec<String> = redis::cmd("KEYS")
            .arg(pattern)
            .query_async(&mut conn)
            .await?;
        
        if keys.is_empty() {
            return Ok(0);
        }

        let count = keys.len() as u64;
        for key in keys {
            let _ = conn.del::<_, ()>(&key).await;
        }

        debug!(pattern = pattern, count = count, "Deleted cached keys");
        Ok(count)
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

/// Cache key builders for consistent key naming
pub struct CacheKeys;

impl CacheKeys {
    /// Cache key for package by ID
    pub fn package(id: &str) -> String {
        format!("pkg:{}", id)
    }

    /// Cache key for reverse dependents query
    pub fn reverse_dependents(package_id: &str, depth: i32) -> String {
        format!("rev_deps:{}:d{}", package_id, depth)
    }

    /// Cache key for impact radius query
    pub fn impact_radius(package_id: &str, depth: i32) -> String {
        format!("impact:{}:d{}", package_id, depth)
    }

    /// Cache key for dependency path query
    pub fn dependency_path(from: &str, to: &str) -> String {
        format!("path:{}:{}", from, to)
    }

    /// Cache key for graph stats
    pub fn graph_stats() -> String {
        "stats:graph".to_string()
    }
}
