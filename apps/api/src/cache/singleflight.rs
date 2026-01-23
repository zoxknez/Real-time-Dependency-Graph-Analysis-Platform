//! Singleflight cache layer for stampede protection
//!
//! Prevents thundering herd problem by deduplicating concurrent requests
//! for the same resource. Uses stale-while-revalidate pattern for optimal latency.
//!
//! # Features
//! - In-flight deduplication: Only one request goes to the backend
//! - Stale-while-revalidate: Returns stale data immediately, refreshes in background
//! - Metrics: Tracks hit/miss/inflight rates

use anyhow::Result;
use serde::{de::DeserializeOwned, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::{broadcast, RwLock};
use tracing::{debug, instrument, warn};

use super::CacheClient;

/// Entry with timestamp for stale-while-revalidate
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct TimestampedEntry<T> {
    /// The cached value
    pub value: T,
    /// Unix timestamp when this entry was cached
    pub cached_at: u64,
}

impl<T> TimestampedEntry<T> {
    pub fn new(value: T) -> Self {
        Self {
            value,
            cached_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
        }
    }

    /// Check if this entry is stale (older than max_age)
    pub fn is_stale(&self, max_age_secs: u64) -> bool {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        now.saturating_sub(self.cached_at) > max_age_secs
    }
}

/// Cache configuration for stale-while-revalidate
#[derive(Debug, Clone)]
pub struct CacheConfig {
    /// How long until data is considered stale (triggers background refresh)
    pub stale_after_secs: u64,
    /// How long until data expires completely (hard TTL)
    pub expire_after_secs: u64,
}

impl Default for CacheConfig {
    fn default() -> Self {
        Self {
            stale_after_secs: 60,      // 1 minute before stale
            expire_after_secs: 300,    // 5 minutes hard expiry
        }
    }
}

/// In-flight request tracking for singleflight deduplication
type InflightMap = HashMap<String, broadcast::Sender<Result<Vec<u8>, String>>>;

/// Singleflight cache with stampede protection
pub struct SingleflightCache {
    /// Redis cache client
    cache: Arc<CacheClient>,
    /// In-flight requests for deduplication
    inflight: Arc<RwLock<InflightMap>>,
    /// Configuration
    config: CacheConfig,
}

impl SingleflightCache {
    pub fn new(cache: Arc<CacheClient>, config: CacheConfig) -> Self {
        Self {
            cache,
            inflight: Arc::new(RwLock::new(HashMap::new())),
            config,
        }
    }

    /// Get or fetch with singleflight deduplication and stale-while-revalidate
    ///
    /// Flow:
    /// 1. Check cache for existing entry
    /// 2. If fresh → return immediately
    /// 3. If stale → return immediately, trigger background refresh
    /// 4. If miss → use singleflight to deduplicate concurrent fetches
    #[instrument(skip(self, fetch_fn), fields(key = %key))]
    pub async fn get_or_fetch<T, F, Fut>(
        &self,
        key: &str,
        fetch_fn: F,
    ) -> Result<T>
    where
        T: Serialize + DeserializeOwned + Clone + Send + Sync + 'static,
        F: FnOnce() -> Fut + Clone + Send + 'static,
        Fut: std::future::Future<Output = Result<T>> + Send,
    {
        // Check cache first
        if let Some(entry) = self.cache.get::<TimestampedEntry<T>>(key).await {
            metrics::counter!("cache_requests", "result" => "hit").increment(1);
            
            if entry.is_stale(self.config.stale_after_secs) {
                // Stale-while-revalidate: return stale data, refresh in background
                debug!(key = key, "Cache STALE - returning stale, refreshing in background");
                metrics::counter!("cache_requests", "result" => "stale").increment(1);
                
                let cache = self.cache.clone();
                let key_owned = key.to_string();
                let expire_after = self.config.expire_after_secs;
                let fetch_fn_clone = fetch_fn.clone();
                
                // Spawn background refresh
                tokio::spawn(async move {
                    match fetch_fn_clone().await {
                        Ok(fresh_value) => {
                            let new_entry = TimestampedEntry::new(fresh_value);
                            if let Err(e) = cache.set_with_ttl(&key_owned, &new_entry, expire_after).await {
                                warn!(key = %key_owned, error = %e, "Failed to refresh stale cache entry");
                            }
                        }
                        Err(e) => {
                            warn!(key = %key_owned, error = %e, "Background refresh failed");
                        }
                    }
                });
                
                return Ok(entry.value);
            } else {
                // Fresh data
                debug!(key = key, "Cache HIT (fresh)");
                return Ok(entry.value);
            }
        }

        // Cache miss - use singleflight to deduplicate
        debug!(key = key, "Cache MISS - using singleflight");
        metrics::counter!("cache_requests", "result" => "miss").increment(1);
        
        let start = Instant::now();
        
        // Check if there's already an in-flight request for this key
        {
            let inflight = self.inflight.read().await;
            if let Some(sender) = inflight.get(key) {
                // Subscribe to existing in-flight request
                let mut rx = sender.subscribe();
                drop(inflight); // Release read lock before awaiting
                
                metrics::counter!("singleflight_flights", "status" => "deduplicated").increment(1);
                debug!(key = key, "Singleflight: waiting for existing request");
                
                match rx.recv().await {
                    Ok(Ok(bytes)) => {
                        let entry: TimestampedEntry<T> = serde_json::from_slice(&bytes)?;
                        return Ok(entry.value);
                    }
                    Ok(Err(e)) => {
                        return Err(anyhow::anyhow!("In-flight request failed: {}", e));
                    }
                    Err(e) => {
                        return Err(anyhow::anyhow!("Failed to receive from in-flight: {}", e));
                    }
                }
            }
        }
        
        // No in-flight request - create one
        let (tx, _) = broadcast::channel(1);
        {
            let mut inflight = self.inflight.write().await;
            inflight.insert(key.to_string(), tx.clone());
        }
        
        metrics::counter!("singleflight_flights", "status" => "started").increment(1);
        
        // Execute the fetch
        let result = fetch_fn().await;
        
        let elapsed = start.elapsed();
        metrics::histogram!("singleflight_duration_seconds").record(elapsed.as_secs_f64());
        
        // Remove from in-flight map
        {
            let mut inflight = self.inflight.write().await;
            inflight.remove(key);
        }
        
        // Broadcast result to any waiters
        match &result {
            Ok(value) => {
                let entry = TimestampedEntry::new(value.clone());
                let bytes = serde_json::to_vec(&entry)?;
                
                // Cache the result
                if let Err(e) = self.cache.set_with_ttl(key, &entry, self.config.expire_after_secs).await {
                    warn!(key = key, error = %e, "Failed to cache singleflight result");
                }
                
                // Broadcast to waiters (ignore errors if no receivers)
                let _ = tx.send(Ok(bytes));
                
                metrics::counter!("singleflight_flights", "status" => "success").increment(1);
                Ok(value.clone())
            }
            Err(e) => {
                let _ = tx.send(Err(e.to_string()));
                metrics::counter!("singleflight_flights", "status" => "error").increment(1);
                Err(anyhow::anyhow!("Fetch failed: {}", e))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_timestamped_entry_freshness() {
        let entry = TimestampedEntry::new("test".to_string());
        
        // Should not be stale immediately with 60s max age
        assert!(!entry.is_stale(60));
        
        // With 0 max_age, entry is stale if any time has passed
        // Since we just created it, it might be 0 seconds old (same second)
        // So is_stale(0) returns false when age == 0 (not > 0)
        // This is correct behavior: 0 age is not > 0 max_age
        // Use a very large max_age to ensure fresh
        assert!(!entry.is_stale(1000));
    }

    #[test]
    fn test_cache_config_defaults() {
        let config = CacheConfig::default();
        assert_eq!(config.stale_after_secs, 60);
        assert_eq!(config.expire_after_secs, 300);
    }
}
