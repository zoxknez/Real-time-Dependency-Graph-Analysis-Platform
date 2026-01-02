//! Distributed Rate Limiter with Redis Backend
//!
//! Features:
//! - Redis-backed distributed rate limiting (consistent across API instances)
//! - Sliding window algorithm for smooth rate limiting
//! - Tier-based limits (Free, Pro, Enterprise)
//! - IP and API key based identification
//! - Graceful degradation when Redis is unavailable

use anyhow::Result;
use axum::{
    body::Body,
    http::{Request, StatusCode, HeaderMap, HeaderValue},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use redis::{aio::MultiplexedConnection, AsyncCommands};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;
use tracing::{debug, error, warn, instrument};

/// Rate limit tiers with different limits
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum RateTier {
    /// Anonymous/free tier: 60 requests per minute
    Free,
    /// Pro tier: 600 requests per minute
    Pro,
    /// Enterprise tier: 6000 requests per minute
    Enterprise,
    /// Unlimited (for internal services)
    Unlimited,
}

impl Default for RateTier {
    fn default() -> Self {
        Self::Free
    }
}

impl RateTier {
    /// Get requests per minute for this tier
    pub fn requests_per_minute(&self) -> u32 {
        match self {
            Self::Free => 60,
            Self::Pro => 600,
            Self::Enterprise => 6000,
            Self::Unlimited => u32::MAX,
        }
    }
    
    /// Get burst allowance (percentage of limit)
    pub fn burst_allowance(&self) -> f64 {
        match self {
            Self::Free => 1.0,      // No burst
            Self::Pro => 1.5,       // 50% burst
            Self::Enterprise => 2.0, // 100% burst
            Self::Unlimited => f64::MAX,
        }
    }
    
    /// Get the header value for this tier
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Free => "free",
            Self::Pro => "pro",
            Self::Enterprise => "enterprise",
            Self::Unlimited => "unlimited",
        }
    }
}

/// Rate limit result
#[derive(Debug)]
pub struct RateLimitResult {
    /// Whether the request is allowed
    pub allowed: bool,
    /// Remaining requests in current window
    pub remaining: u32,
    /// Total limit for the window
    pub limit: u32,
    /// Seconds until limit resets
    pub reset_after: u64,
    /// Current tier
    pub tier: RateTier,
}

/// Rate limit error response
#[derive(Serialize)]
pub struct RateLimitErrorResponse {
    pub error: &'static str,
    pub message: String,
    pub retry_after: u64,
    pub tier: String,
    pub limit: u32,
}

/// Configuration for the distributed rate limiter
#[derive(Debug, Clone)]
pub struct DistributedRateLimiterConfig {
    /// Redis key prefix
    pub key_prefix: String,
    /// Window size in seconds (default: 60 for per-minute)
    pub window_size_secs: u64,
    /// Whether to allow requests when Redis is unavailable
    pub allow_on_redis_failure: bool,
    /// Local fallback limit when Redis fails (per window)
    pub fallback_limit: u32,
}

impl Default for DistributedRateLimiterConfig {
    fn default() -> Self {
        Self {
            key_prefix: "ratelimit".to_string(),
            window_size_secs: 60,
            allow_on_redis_failure: true,
            fallback_limit: 30,
        }
    }
}

/// Distributed rate limiter using Redis sliding window
pub struct DistributedRateLimiter {
    /// Redis connection (optional - falls back to local if unavailable)
    redis: Option<Arc<RwLock<MultiplexedConnection>>>,
    /// Configuration
    config: DistributedRateLimiterConfig,
    /// Local fallback counter (used when Redis is unavailable)
    local_fallback: Arc<RwLock<LocalFallbackState>>,
}

/// Local fallback state when Redis is unavailable
struct LocalFallbackState {
    /// Simple counter per key
    counters: std::collections::HashMap<String, (u32, u64)>, // (count, window_start)
    /// Last cleanup time
    last_cleanup: u64,
}

impl Default for LocalFallbackState {
    fn default() -> Self {
        Self {
            counters: std::collections::HashMap::new(),
            last_cleanup: current_timestamp(),
        }
    }
}

impl DistributedRateLimiter {
    /// Create a new distributed rate limiter with Redis connection
    pub fn new(redis: MultiplexedConnection, config: DistributedRateLimiterConfig) -> Self {
        Self {
            redis: Some(Arc::new(RwLock::new(redis))),
            config,
            local_fallback: Arc::new(RwLock::new(LocalFallbackState::default())),
        }
    }
    
    /// Create a rate limiter without Redis (local only - for testing)
    pub fn local_only(config: DistributedRateLimiterConfig) -> Self {
        Self {
            redis: None,
            config,
            local_fallback: Arc::new(RwLock::new(LocalFallbackState::default())),
        }
    }
    
    /// Check rate limit for a key with specified tier
    #[instrument(skip(self), fields(key = %key, tier = ?tier))]
    pub async fn check(&self, key: &str, tier: RateTier) -> RateLimitResult {
        if tier == RateTier::Unlimited {
            return RateLimitResult {
                allowed: true,
                remaining: u32::MAX,
                limit: u32::MAX,
                reset_after: 0,
                tier,
            };
        }
        
        let limit = tier.requests_per_minute();
        let burst_limit = (limit as f64 * tier.burst_allowance()) as u32;
        
        // Try Redis first
        if let Some(redis) = &self.redis {
            match self.check_redis(redis, key, burst_limit).await {
                Ok(result) => return RateLimitResult {
                    tier,
                    limit,
                    ..result
                },
                Err(e) => {
                    warn!(error = %e, "Redis rate limit check failed, using fallback");
                    if !self.config.allow_on_redis_failure {
                        return RateLimitResult {
                            allowed: false,
                            remaining: 0,
                            limit,
                            reset_after: self.config.window_size_secs,
                            tier,
                        };
                    }
                }
            }
        }
        
        // Fallback to local counter
        self.check_local(key, limit).await
    }
    
    /// Check rate limit using Redis sliding window
    async fn check_redis(
        &self,
        redis: &Arc<RwLock<MultiplexedConnection>>,
        key: &str,
        limit: u32,
    ) -> Result<RateLimitResult> {
        let now = current_timestamp();
        let window_start = now - self.config.window_size_secs;
        let redis_key = format!("{}:{}", self.config.key_prefix, key);
        
        let mut conn = redis.write().await;
        
        // Lua script for atomic sliding window rate limiting
        let script = redis::Script::new(r#"
            local key = KEYS[1]
            local now = tonumber(ARGV[1])
            local window_start = tonumber(ARGV[2])
            local limit = tonumber(ARGV[3])
            local window_size = tonumber(ARGV[4])
            
            -- Remove old entries outside window
            redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)
            
            -- Count current requests in window
            local count = redis.call('ZCARD', key)
            
            if count < limit then
                -- Add new request with current timestamp as score
                redis.call('ZADD', key, now, now .. ':' .. math.random(1000000))
                -- Set expiry on key
                redis.call('EXPIRE', key, window_size + 1)
                return {1, limit - count - 1}  -- allowed, remaining
            else
                -- Get oldest entry to calculate reset time
                local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
                local reset_after = 0
                if #oldest > 0 then
                    reset_after = tonumber(oldest[2]) + window_size - now
                    if reset_after < 0 then reset_after = 0 end
                end
                return {0, 0, reset_after}  -- denied, remaining, reset_after
            end
        "#);
        
        let result: Vec<i64> = script
            .key(&redis_key)
            .arg(now)
            .arg(window_start)
            .arg(limit)
            .arg(self.config.window_size_secs)
            .invoke_async(&mut *conn)
            .await?;
        
        let allowed = result.first().copied().unwrap_or(0) == 1;
        let remaining = result.get(1).copied().unwrap_or(0) as u32;
        let reset_after = result.get(2).copied().unwrap_or(self.config.window_size_secs as i64) as u64;
        
        debug!(allowed, remaining, reset_after, "Redis rate limit check");
        
        Ok(RateLimitResult {
            allowed,
            remaining,
            limit,
            reset_after,
            tier: RateTier::Free, // Will be overwritten by caller
        })
    }
    
    /// Check rate limit using local fallback
    async fn check_local(&self, key: &str, limit: u32) -> RateLimitResult {
        let now = current_timestamp();
        let window_start = now - self.config.window_size_secs;
        
        let mut state = self.local_fallback.write().await;
        
        // Periodic cleanup of old entries
        if now - state.last_cleanup > 300 { // Every 5 minutes
            state.counters.retain(|_, (_, ts)| *ts > window_start);
            state.last_cleanup = now;
        }
        
        let entry = state.counters.entry(key.to_string()).or_insert((0, now));
        
        // Reset if outside window
        if entry.1 < window_start {
            *entry = (0, now);
        }
        
        let effective_limit = self.config.fallback_limit.min(limit);
        
        if entry.0 < effective_limit {
            entry.0 += 1;
            RateLimitResult {
                allowed: true,
                remaining: effective_limit - entry.0,
                limit: effective_limit,
                reset_after: self.config.window_size_secs - (now - entry.1),
                tier: RateTier::Free,
            }
        } else {
            RateLimitResult {
                allowed: false,
                remaining: 0,
                limit: effective_limit,
                reset_after: self.config.window_size_secs - (now - entry.1),
                tier: RateTier::Free,
            }
        }
    }
    
    /// Extract client identifier from request headers
    pub fn extract_client_key(headers: &HeaderMap) -> String {
        // Check for API key first
        if let Some(api_key) = headers.get("X-API-Key") {
            if let Ok(key) = api_key.to_str() {
                return format!("apikey:{}", key);
            }
        }
        
        // Fall back to IP address
        // Check X-Forwarded-For first (for proxied requests)
        if let Some(forwarded) = headers.get("X-Forwarded-For") {
            if let Ok(ips) = forwarded.to_str() {
                if let Some(ip) = ips.split(',').next() {
                    return format!("ip:{}", ip.trim());
                }
            }
        }
        
        // Check X-Real-IP
        if let Some(real_ip) = headers.get("X-Real-IP") {
            if let Ok(ip) = real_ip.to_str() {
                return format!("ip:{}", ip);
            }
        }
        
        // Default to "anonymous"
        "anonymous".to_string()
    }
    
    /// Determine tier from API key (stub - would lookup in database)
    pub async fn determine_tier(&self, client_key: &str) -> RateTier {
        // In production, this would look up the API key in a database
        // For now, use simple heuristics
        if client_key.starts_with("apikey:ent_") {
            RateTier::Enterprise
        } else if client_key.starts_with("apikey:pro_") {
            RateTier::Pro
        } else if client_key.starts_with("apikey:internal_") {
            RateTier::Unlimited
        } else {
            RateTier::Free
        }
    }
}

/// Get current timestamp in seconds
fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO)
        .as_secs()
}

/// Rate limiting middleware using distributed limiter
pub async fn distributed_rate_limit_middleware(
    limiter: Arc<DistributedRateLimiter>,
    request: Request<Body>,
    next: Next,
) -> Response {
    // Extract client identifier
    let client_key = DistributedRateLimiter::extract_client_key(request.headers());
    
    // Determine tier
    let tier = limiter.determine_tier(&client_key).await;
    
    // Check rate limit
    let result = limiter.check(&client_key, tier).await;
    
    // Build response with rate limit headers
    let mut response = if result.allowed {
        next.run(request).await
    } else {
        let error_response = RateLimitErrorResponse {
            error: "RATE_LIMIT_EXCEEDED",
            message: format!(
                "Rate limit exceeded. You are on the {} tier ({} requests/minute). Please retry after {} seconds or upgrade your plan.",
                tier.as_str(),
                result.limit,
                result.reset_after
            ),
            retry_after: result.reset_after,
            tier: tier.as_str().to_string(),
            limit: result.limit,
        };
        
        warn!(
            client_key = %client_key,
            tier = %tier.as_str(),
            "Rate limit exceeded"
        );
        
        (
            StatusCode::TOO_MANY_REQUESTS,
            Json(error_response),
        ).into_response()
    };
    
    // Add rate limit headers
    let headers = response.headers_mut();
    headers.insert(
        "X-RateLimit-Limit",
        HeaderValue::from_str(&result.limit.to_string()).unwrap(),
    );
    headers.insert(
        "X-RateLimit-Remaining",
        HeaderValue::from_str(&result.remaining.to_string()).unwrap(),
    );
    headers.insert(
        "X-RateLimit-Reset",
        HeaderValue::from_str(&result.reset_after.to_string()).unwrap(),
    );
    headers.insert(
        "X-RateLimit-Tier",
        HeaderValue::from_static(tier.as_str()),
    );
    
    if !result.allowed {
        headers.insert(
            "Retry-After",
            HeaderValue::from_str(&result.reset_after.to_string()).unwrap(),
        );
    }
    
    response
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_tier_limits() {
        assert_eq!(RateTier::Free.requests_per_minute(), 60);
        assert_eq!(RateTier::Pro.requests_per_minute(), 600);
        assert_eq!(RateTier::Enterprise.requests_per_minute(), 6000);
    }
    
    #[tokio::test]
    async fn test_local_rate_limiter() {
        let config = DistributedRateLimiterConfig {
            fallback_limit: 3,
            ..Default::default()
        };
        let limiter = DistributedRateLimiter::local_only(config);
        
        // First 3 requests should succeed
        for i in 0..3 {
            let result = limiter.check("test-key", RateTier::Free).await;
            assert!(result.allowed, "Request {} should be allowed", i + 1);
        }
        
        // 4th request should fail
        let result = limiter.check("test-key", RateTier::Free).await;
        assert!(!result.allowed, "4th request should be denied");
    }
    
    #[test]
    fn test_extract_client_key() {
        let mut headers = HeaderMap::new();
        
        // Anonymous
        assert_eq!(DistributedRateLimiter::extract_client_key(&headers), "anonymous");
        
        // API key
        headers.insert("X-API-Key", HeaderValue::from_static("pro_abc123"));
        assert_eq!(
            DistributedRateLimiter::extract_client_key(&headers),
            "apikey:pro_abc123"
        );
        
        // IP fallback
        headers.remove("X-API-Key");
        headers.insert("X-Forwarded-For", HeaderValue::from_static("1.2.3.4, 5.6.7.8"));
        assert_eq!(
            DistributedRateLimiter::extract_client_key(&headers),
            "ip:1.2.3.4"
        );
    }
    
    #[tokio::test]
    async fn test_tier_detection() {
        let config = DistributedRateLimiterConfig::default();
        let limiter = DistributedRateLimiter::local_only(config);
        
        assert_eq!(limiter.determine_tier("apikey:ent_123").await, RateTier::Enterprise);
        assert_eq!(limiter.determine_tier("apikey:pro_456").await, RateTier::Pro);
        assert_eq!(limiter.determine_tier("ip:1.2.3.4").await, RateTier::Free);
        assert_eq!(limiter.determine_tier("apikey:internal_svc").await, RateTier::Unlimited);
    }
}
