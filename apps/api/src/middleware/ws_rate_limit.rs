//! WebSocket Subscription Rate Limiting
//!
//! Limits message rates per WebSocket connection to prevent:
//! - Subscription spam (too many concurrent subscriptions)
//! - Message flooding (too many messages per second)
//! - Connection abuse (too many connections from same IP)
//!
//! Rate limiting is applied per-connection and per-IP.

#![allow(dead_code)]

use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use tracing::{debug, warn};

/// Configuration for WebSocket rate limiting
#[derive(Debug, Clone)]
pub struct WsRateLimitConfig {
    /// Max subscriptions per connection
    pub max_subscriptions_per_connection: usize,
    /// Max messages per second per connection
    pub max_messages_per_second: usize,
    /// Max connections per IP address
    pub max_connections_per_ip: usize,
    /// Window duration for rate calculations
    pub window_duration: Duration,
    /// Burst allowance multiplier (e.g., 2.0 allows 2x burst for short periods)
    pub burst_multiplier: f64,
}

impl Default for WsRateLimitConfig {
    fn default() -> Self {
        Self {
            max_subscriptions_per_connection: 10,
            max_messages_per_second: 100,
            max_connections_per_ip: 50,
            window_duration: Duration::from_secs(1),
            burst_multiplier: 2.0,
        }
    }
}

/// Per-connection rate state
#[derive(Debug)]
struct ConnectionState {
    /// Number of active subscriptions
    subscription_count: usize,
    /// Messages in current window
    message_count: usize,
    /// Window start time
    window_start: Instant,
    /// Last activity time
    last_activity: Instant,
}

impl ConnectionState {
    fn new() -> Self {
        let now = Instant::now();
        Self {
            subscription_count: 0,
            message_count: 0,
            window_start: now,
            last_activity: now,
        }
    }

    /// Check if we're in a new window and reset if so
    fn maybe_reset_window(&mut self, window_duration: Duration) {
        let now = Instant::now();
        if now.duration_since(self.window_start) >= window_duration {
            self.message_count = 0;
            self.window_start = now;
        }
    }
}

/// Per-IP connection tracking
#[derive(Debug, Default)]
struct IpState {
    /// Active connection count
    connection_count: usize,
    /// Recent connection attempts for anti-abuse
    recent_connects: Vec<Instant>,
}

/// WebSocket rate limiter
pub struct WsRateLimiter {
    config: WsRateLimitConfig,
    /// Connection states keyed by connection ID
    connections: RwLock<HashMap<String, ConnectionState>>,
    /// IP states keyed by IP address
    ip_states: RwLock<HashMap<IpAddr, IpState>>,
}

impl WsRateLimiter {
    /// Create new rate limiter with config
    pub fn new(config: WsRateLimitConfig) -> Self {
        Self {
            config,
            connections: RwLock::new(HashMap::new()),
            ip_states: RwLock::new(HashMap::new()),
        }
    }

    /// Create with default config
    pub fn with_defaults() -> Self {
        Self::new(WsRateLimitConfig::default())
    }

    /// Check if a new connection from IP is allowed
    pub async fn allow_connection(&self, ip: IpAddr) -> bool {
        let mut ip_states = self.ip_states.write().await;
        let state = ip_states.entry(ip).or_default();

        if state.connection_count >= self.config.max_connections_per_ip {
            warn!(
                ip = %ip,
                count = state.connection_count,
                limit = self.config.max_connections_per_ip,
                "WebSocket connection limit exceeded for IP"
            );
            metrics::counter!("ws_rate_limit_connection_rejected").increment(1);
            return false;
        }

        state.connection_count += 1;
        state.recent_connects.push(Instant::now());

        // Clean up old connect timestamps (older than 1 minute)
        let cutoff = Instant::now() - Duration::from_secs(60);
        state.recent_connects.retain(|t| *t > cutoff);

        metrics::gauge!("ws_active_connections", "ip" => ip.to_string())
            .set(state.connection_count as f64);

        true
    }

    /// Record connection closed
    pub async fn connection_closed(&self, connection_id: &str, ip: IpAddr) {
        // Remove connection state
        self.connections.write().await.remove(connection_id);

        // Decrement IP connection count
        let mut ip_states = self.ip_states.write().await;
        if let Some(state) = ip_states.get_mut(&ip) {
            state.connection_count = state.connection_count.saturating_sub(1);
            metrics::gauge!("ws_active_connections", "ip" => ip.to_string())
                .set(state.connection_count as f64);
        }
    }

    /// Register a new connection
    pub async fn register_connection(&self, connection_id: &str) {
        self.connections
            .write()
            .await
            .insert(connection_id.to_string(), ConnectionState::new());
    }

    /// Check if a new subscription is allowed
    pub async fn allow_subscription(&self, connection_id: &str) -> bool {
        let mut connections = self.connections.write().await;
        let state = connections
            .entry(connection_id.to_string())
            .or_insert_with(ConnectionState::new);

        if state.subscription_count >= self.config.max_subscriptions_per_connection {
            warn!(
                connection_id = connection_id,
                count = state.subscription_count,
                limit = self.config.max_subscriptions_per_connection,
                "Subscription limit exceeded for connection"
            );
            metrics::counter!("ws_rate_limit_subscription_rejected").increment(1);
            return false;
        }

        state.subscription_count += 1;
        state.last_activity = Instant::now();

        debug!(
            connection_id = connection_id,
            count = state.subscription_count,
            "Subscription registered"
        );

        true
    }

    /// Record subscription ended
    pub async fn subscription_ended(&self, connection_id: &str) {
        let mut connections = self.connections.write().await;
        if let Some(state) = connections.get_mut(connection_id) {
            state.subscription_count = state.subscription_count.saturating_sub(1);
        }
    }

    /// Check if a message can be sent (rate limit)
    pub async fn allow_message(&self, connection_id: &str) -> bool {
        let mut connections = self.connections.write().await;
        let state = connections
            .entry(connection_id.to_string())
            .or_insert_with(ConnectionState::new);

        // Reset window if needed
        state.maybe_reset_window(self.config.window_duration);

        // Calculate effective limit (with burst)
        let effective_limit =
            (self.config.max_messages_per_second as f64 * self.config.burst_multiplier) as usize;

        if state.message_count >= effective_limit {
            metrics::counter!("ws_rate_limit_message_rejected").increment(1);
            return false;
        }

        state.message_count += 1;
        state.last_activity = Instant::now();
        true
    }

    /// Get stats for a connection
    pub async fn get_connection_stats(&self, connection_id: &str) -> Option<ConnectionStats> {
        let connections = self.connections.read().await;
        connections.get(connection_id).map(|state| ConnectionStats {
            subscription_count: state.subscription_count,
            message_count: state.message_count,
            window_start: state.window_start,
            last_activity: state.last_activity,
        })
    }

    /// Cleanup stale connections (call periodically)
    pub async fn cleanup_stale(&self, max_idle: Duration) {
        let cutoff = Instant::now() - max_idle;
        let mut connections = self.connections.write().await;

        let stale_ids: Vec<String> = connections
            .iter()
            .filter(|(_, state)| state.last_activity < cutoff)
            .map(|(id, _)| id.clone())
            .collect();

        for id in &stale_ids {
            connections.remove(id);
        }

        if !stale_ids.is_empty() {
            debug!(
                count = stale_ids.len(),
                "Cleaned up stale WebSocket connections"
            );
        }
    }
}

/// Connection statistics
#[derive(Debug, Clone)]
pub struct ConnectionStats {
    pub subscription_count: usize,
    pub message_count: usize,
    pub window_start: Instant,
    pub last_activity: Instant,
}

/// Global rate limiter instance
static WS_RATE_LIMITER: std::sync::OnceLock<Arc<WsRateLimiter>> = std::sync::OnceLock::new();

/// Initialize global WebSocket rate limiter
pub fn init_ws_rate_limiter(config: WsRateLimitConfig) {
    let limiter = Arc::new(WsRateLimiter::new(config));
    if WS_RATE_LIMITER.set(limiter).is_err() {
        tracing::warn!("WebSocket rate limiter already initialized");
    }
}

/// Get global rate limiter
pub fn get_ws_rate_limiter() -> Option<&'static Arc<WsRateLimiter>> {
    WS_RATE_LIMITER.get()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_connection_limit() {
        let limiter = WsRateLimiter::new(WsRateLimitConfig {
            max_connections_per_ip: 2,
            ..Default::default()
        });

        let ip: IpAddr = "127.0.0.1".parse().unwrap();

        assert!(limiter.allow_connection(ip).await);
        assert!(limiter.allow_connection(ip).await);
        assert!(!limiter.allow_connection(ip).await); // Exceeds limit
    }

    #[tokio::test]
    async fn test_subscription_limit() {
        let limiter = WsRateLimiter::new(WsRateLimitConfig {
            max_subscriptions_per_connection: 2,
            ..Default::default()
        });

        let conn_id = "test-conn-1";
        limiter.register_connection(conn_id).await;

        assert!(limiter.allow_subscription(conn_id).await);
        assert!(limiter.allow_subscription(conn_id).await);
        assert!(!limiter.allow_subscription(conn_id).await); // Exceeds limit
    }

    #[tokio::test]
    async fn test_message_rate_limit() {
        let limiter = WsRateLimiter::new(WsRateLimitConfig {
            max_messages_per_second: 5,
            burst_multiplier: 1.0, // No burst
            ..Default::default()
        });

        let conn_id = "test-conn-2";
        limiter.register_connection(conn_id).await;

        for _ in 0..5 {
            assert!(limiter.allow_message(conn_id).await);
        }
        assert!(!limiter.allow_message(conn_id).await); // Exceeds limit
    }
}
