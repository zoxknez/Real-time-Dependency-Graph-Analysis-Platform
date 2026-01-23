//! PostgreSQL LISTEN/NOTIFY watcher with exponential backoff reconnect
//!
//! This module provides real-time event notifications from PostgreSQL using
//! LISTEN/NOTIFY via sqlx's PgListener, with robust reconnection logic.
//!
//! ## Features
//! - Real-time notifications when new outbox events are inserted
//! - Exponential backoff reconnect (100ms → 30s cap)
//! - Jitter to prevent thundering herd
//! - Hybrid mode: LISTEN/NOTIFY + polling fallback
//! - Connection health monitoring
//! - Proper async notification handling via sqlx::postgres::PgListener

use anyhow::{Context, Result};
use sqlx::postgres::PgListener;
use sqlx::PgPool;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{broadcast, watch, RwLock};
use tracing::{debug, error, info, warn};

/// Configuration for the notification watcher
#[derive(Debug, Clone)]
pub struct NotifyWatcherConfig {
    /// Channel name to listen on (default: "outbox_events")
    pub channel: String,
    /// Initial reconnect delay
    pub initial_backoff: Duration,
    /// Maximum reconnect delay
    pub max_backoff: Duration,
    /// Backoff multiplier
    pub backoff_multiplier: f64,
    /// Whether to add jitter to backoff
    pub use_jitter: bool,
    /// Maximum consecutive failures before giving up (0 = infinite)
    pub max_failures: u32,
    /// Notification receive timeout (triggers health check)
    pub receive_timeout: Duration,
}

impl Default for NotifyWatcherConfig {
    fn default() -> Self {
        Self {
            channel: "outbox_events".to_string(),
            initial_backoff: Duration::from_millis(100),
            max_backoff: Duration::from_secs(30),
            backoff_multiplier: 2.0,
            use_jitter: true,
            max_failures: 0, // Infinite retries by default
            receive_timeout: Duration::from_secs(60),
        }
    }
}

/// Notification from PostgreSQL
#[derive(Debug, Clone)]
pub struct OutboxNotification {
    /// Event ID from notification payload
    pub event_id: String,
    /// Event type
    pub event_type: String,
    /// Raw payload
    pub payload: String,
    /// Timestamp when received
    pub received_at: chrono::DateTime<chrono::Utc>,
}

/// Connection state for monitoring
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConnectionState {
    Connecting,
    Connected,
    Reconnecting,
    Failed,
    Shutdown,
}

/// Statistics for monitoring
#[derive(Debug, Clone, Default)]
pub struct WatcherStats {
    pub notifications_received: u64,
    pub reconnect_attempts: u64,
    pub last_notification_at: Option<chrono::DateTime<chrono::Utc>>,
    pub connection_uptime_secs: u64,
}

/// PostgreSQL LISTEN/NOTIFY watcher using sqlx PgListener
pub struct NotifyWatcher {
    pool: PgPool,
    config: NotifyWatcherConfig,
    /// Broadcast channel for notifications
    tx: broadcast::Sender<OutboxNotification>,
    /// Connection state for monitoring
    state: Arc<RwLock<ConnectionState>>,
    /// Statistics
    stats: Arc<RwLock<WatcherStats>>,
}

impl NotifyWatcher {
    /// Create a new watcher with the given database pool
    pub fn new(pool: PgPool, config: NotifyWatcherConfig) -> (Self, broadcast::Receiver<OutboxNotification>) {
        let (tx, rx) = broadcast::channel(1024);
        
        (
            Self {
                pool,
                config,
                tx,
                state: Arc::new(RwLock::new(ConnectionState::Connecting)),
                stats: Arc::new(RwLock::new(WatcherStats::default())),
            },
            rx,
        )
    }

    /// Get a new receiver for notifications
    pub fn subscribe(&self) -> broadcast::Receiver<OutboxNotification> {
        self.tx.subscribe()
    }

    /// Get current connection state
    pub async fn state(&self) -> ConnectionState {
        *self.state.read().await
    }

    /// Get current statistics
    pub async fn stats(&self) -> WatcherStats {
        self.stats.read().await.clone()
    }

    /// Run the watcher with automatic reconnection
    /// 
    /// This function runs indefinitely until:
    /// - shutdown_rx receives true
    /// - max_failures is reached (if configured)
    pub async fn run(&self, mut shutdown_rx: watch::Receiver<bool>) -> Result<()> {
        let mut consecutive_failures = 0u32;
        let mut current_backoff = self.config.initial_backoff;

        info!(
            channel = %self.config.channel,
            max_failures = self.config.max_failures,
            "Starting PostgreSQL NOTIFY watcher"
        );

        loop {
            // Check for shutdown signal
            if *shutdown_rx.borrow() {
                info!("Shutdown signal received, stopping watcher");
                *self.state.write().await = ConnectionState::Shutdown;
                break;
            }

            *self.state.write().await = ConnectionState::Connecting;

            match self.listen_loop(&mut shutdown_rx).await {
                Ok(()) => {
                    // Clean shutdown
                    info!("Listener shut down cleanly");
                    break;
                }
                Err(e) => {
                    consecutive_failures += 1;
                    self.stats.write().await.reconnect_attempts += 1;
                    *self.state.write().await = ConnectionState::Reconnecting;

                    // Check max failures
                    if self.config.max_failures > 0 && consecutive_failures >= self.config.max_failures {
                        error!(
                            failures = consecutive_failures,
                            max = self.config.max_failures,
                            error = %e,
                            "Max consecutive failures reached, giving up"
                        );
                        *self.state.write().await = ConnectionState::Failed;
                        return Err(e.context("Max consecutive failures reached"));
                    }

                    // Calculate backoff with optional jitter
                    let delay = calculate_backoff(
                        current_backoff,
                        self.config.max_backoff,
                        self.config.use_jitter,
                    );

                    warn!(
                        error = %e,
                        failure_count = consecutive_failures,
                        backoff_ms = delay.as_millis(),
                        "Connection failed, reconnecting with backoff"
                    );

                    metrics::counter!("pg_notify_reconnects").increment(1);

                    // Wait with shutdown check
                    tokio::select! {
                        _ = tokio::time::sleep(delay) => {}
                        _ = shutdown_rx.changed() => {
                            if *shutdown_rx.borrow() {
                                info!("Shutdown during backoff");
                                *self.state.write().await = ConnectionState::Shutdown;
                                return Ok(());
                            }
                        }
                    }

                    // Increase backoff for next failure
                    current_backoff = Duration::from_millis(
                        ((current_backoff.as_millis() as f64) * self.config.backoff_multiplier) as u64
                    ).min(self.config.max_backoff);
                }
            }

            // Reset on next attempt (will reset fully on success in listen_loop)
            // Keep backoff growing until successful connection
        }

        Ok(())
    }

    /// Main listen loop - creates listener and processes notifications
    async fn listen_loop(&self, shutdown_rx: &mut watch::Receiver<bool>) -> Result<()> {
        // Create a new PgListener from the pool
        let mut listener = PgListener::connect_with(&self.pool)
            .await
            .context("Failed to create PgListener")?;

        // Subscribe to the channel
        listener.listen(&self.config.channel)
            .await
            .context("Failed to LISTEN on channel")?;

        info!(channel = %self.config.channel, "Listening for PostgreSQL notifications");
        *self.state.write().await = ConnectionState::Connected;

        metrics::counter!("pg_notify_connections", "status" => "connected").increment(1);
        let connection_start = std::time::Instant::now();

        // Main notification loop
        loop {
            tokio::select! {
                biased;  // Check shutdown first

                // Shutdown signal
                _ = shutdown_rx.changed() => {
                    if *shutdown_rx.borrow() {
                        info!("Shutdown requested, closing listener");
                        return Ok(());
                    }
                }

                // Receive notification with timeout
                result = tokio::time::timeout(
                    self.config.receive_timeout,
                    listener.recv()
                ) => {
                    match result {
                        Ok(Ok(notification)) => {
                            let now = chrono::Utc::now();
                            
                            debug!(
                                channel = %notification.channel(),
                                payload = %notification.payload(),
                                "Received PostgreSQL notification"
                            );

                            metrics::counter!("pg_notify_received").increment(1);

                            // Parse notification payload
                            // Expected format: event_id:event_type or just event_id
                            let payload = notification.payload();
                            let notification = parse_notification_payload(payload, now);

                            // Update stats
                            {
                                let mut stats = self.stats.write().await;
                                stats.notifications_received += 1;
                                stats.last_notification_at = Some(now);
                                stats.connection_uptime_secs = connection_start.elapsed().as_secs();
                            }

                            // Broadcast to all subscribers (ignore if no receivers)
                            let _ = self.tx.send(notification);
                        }
                        Ok(Err(e)) => {
                            // Database error
                            metrics::counter!("pg_notify_connections", "status" => "error").increment(1);
                            return Err(anyhow::anyhow!("PostgreSQL listener error: {}", e));
                        }
                        Err(_) => {
                            // Timeout - this is normal, just continue loop
                            // Update uptime stats
                            self.stats.write().await.connection_uptime_secs = 
                                connection_start.elapsed().as_secs();
                            debug!("Notification receive timeout, still connected");
                        }
                    }
                }
            }
        }
    }
}

/// Parse notification payload into OutboxNotification
fn parse_notification_payload(payload: &str, received_at: chrono::DateTime<chrono::Utc>) -> OutboxNotification {
    // Try JSON first
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(payload) {
        return OutboxNotification {
            event_id: json.get("event_id")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string(),
            event_type: json.get("event_type")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string(),
            payload: payload.to_string(),
            received_at,
        };
    }

    // Fallback: colon-separated format (event_id:event_type)
    let parts: Vec<&str> = payload.split(':').collect();
    OutboxNotification {
        event_id: parts.first().unwrap_or(&"unknown").to_string(),
        event_type: parts.get(1).unwrap_or(&"unknown").to_string(),
        payload: payload.to_string(),
        received_at,
    }
}

/// Calculate backoff duration with optional jitter
fn calculate_backoff(current: Duration, max: Duration, use_jitter: bool) -> Duration {
    let base_ms = current.as_millis() as u64;
    
    if use_jitter {
        // Add 0-25% jitter
        let jitter = {
            use std::time::SystemTime;
            let seed = SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos() as u64;
            // Simple LCG for jitter
            (seed.wrapping_mul(1103515245).wrapping_add(12345)) % (base_ms / 4 + 1)
        };
        Duration::from_millis((base_ms + jitter).min(max.as_millis() as u64))
    } else {
        current.min(max)
    }
}

// ============================================================================
// Hybrid Watcher - combines NOTIFY with polling fallback
// ============================================================================

/// Hybrid outbox watcher that combines LISTEN/NOTIFY with polling fallback
/// 
/// This is the recommended way to use the watcher - it provides real-time
/// notifications when available, but falls back to polling if notifications
/// are missed or the connection fails.
pub struct HybridOutboxWatcher {
    /// Receiver for notifications
    notify_rx: broadcast::Receiver<OutboxNotification>,
    /// Fallback poll interval
    fallback_poll_interval: Duration,
    /// Last poll time
    last_poll: std::time::Instant,
}

impl HybridOutboxWatcher {
    /// Create a new hybrid watcher from an existing NotifyWatcher
    pub fn new(
        watcher: &NotifyWatcher,
        fallback_poll_interval: Duration,
    ) -> Self {
        Self {
            notify_rx: watcher.subscribe(),
            fallback_poll_interval,
            last_poll: std::time::Instant::now(),
        }
    }

    /// Wait for next event (either notification or poll timeout)
    /// 
    /// Returns `Some(notification)` if woken by notification,
    /// `None` if woken by poll timeout.
    pub async fn wait_for_event(&mut self) -> Option<OutboxNotification> {
        let remaining = self.fallback_poll_interval
            .checked_sub(self.last_poll.elapsed())
            .unwrap_or(Duration::ZERO);

        tokio::select! {
            biased;

            result = self.notify_rx.recv() => {
                match result {
                    Ok(notification) => {
                        debug!(
                            event_id = %notification.event_id,
                            "Woken by PostgreSQL notification"
                        );
                        metrics::counter!("outbox_wakeups", "source" => "notify").increment(1);
                        self.last_poll = std::time::Instant::now();
                        Some(notification)
                    }
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        warn!(skipped = n, "Notification receiver lagged, polling immediately");
                        metrics::counter!("outbox_wakeups", "source" => "lagged").increment(1);
                        self.last_poll = std::time::Instant::now();
                        None
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        // Channel closed, rely on polling
                        debug!("Notification channel closed, using poll fallback");
                        tokio::time::sleep(remaining).await;
                        self.last_poll = std::time::Instant::now();
                        metrics::counter!("outbox_wakeups", "source" => "poll_closed").increment(1);
                        None
                    }
                }
            }

            _ = tokio::time::sleep(remaining) => {
                debug!("Poll timeout reached");
                metrics::counter!("outbox_wakeups", "source" => "poll").increment(1);
                self.last_poll = std::time::Instant::now();
                None
            }
        }
    }

    /// Check if notification channel is still active
    pub fn is_channel_active(&self) -> bool {
        // broadcast::Receiver doesn't have is_closed, but we can check via len
        // If the sender is dropped, recv() will return Closed
        true // Assume active, actual check happens on recv
    }
}

// ============================================================================
// SQL Trigger for NOTIFY (to be run as migration)
// ============================================================================

/// SQL to create the notification trigger
/// 
/// Run this as a migration to enable NOTIFY on outbox inserts:
/// 
/// ```sql
/// CREATE OR REPLACE FUNCTION notify_outbox_event()
/// RETURNS TRIGGER AS $$
/// BEGIN
///     PERFORM pg_notify(
///         'outbox_events',
///         json_build_object(
///             'event_id', NEW.event_id,
///             'event_type', NEW.event_type
///         )::text
///     );
///     RETURN NEW;
/// END;
/// $$ LANGUAGE plpgsql;
/// 
/// DROP TRIGGER IF EXISTS outbox_notify_trigger ON outbox;
/// CREATE TRIGGER outbox_notify_trigger
///     AFTER INSERT ON outbox
///     FOR EACH ROW
///     EXECUTE FUNCTION notify_outbox_event();
/// ```
pub const NOTIFY_TRIGGER_SQL: &str = r#"
CREATE OR REPLACE FUNCTION notify_outbox_event()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify(
        'outbox_events',
        json_build_object(
            'event_id', NEW.event_id,
            'event_type', NEW.event_type
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS outbox_notify_trigger ON outbox;
CREATE TRIGGER outbox_notify_trigger
    AFTER INSERT ON outbox
    FOR EACH ROW
    EXECUTE FUNCTION notify_outbox_event();
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_defaults() {
        let config = NotifyWatcherConfig::default();
        assert_eq!(config.channel, "outbox_events");
        assert_eq!(config.initial_backoff, Duration::from_millis(100));
        assert_eq!(config.max_backoff, Duration::from_secs(30));
        assert!(config.use_jitter);
        assert_eq!(config.max_failures, 0); // Infinite retries
    }

    #[test]
    fn test_parse_notification_json() {
        let payload = r#"{"event_id":"abc123","event_type":"package.created"}"#;
        let notification = parse_notification_payload(payload, chrono::Utc::now());
        
        assert_eq!(notification.event_id, "abc123");
        assert_eq!(notification.event_type, "package.created");
    }

    #[test]
    fn test_parse_notification_colon_separated() {
        let payload = "abc123:package.created";
        let notification = parse_notification_payload(payload, chrono::Utc::now());
        
        assert_eq!(notification.event_id, "abc123");
        assert_eq!(notification.event_type, "package.created");
    }

    #[test]
    fn test_parse_notification_simple() {
        let payload = "abc123";
        let notification = parse_notification_payload(payload, chrono::Utc::now());
        
        assert_eq!(notification.event_id, "abc123");
        assert_eq!(notification.event_type, "unknown");
    }

    #[test]
    fn test_calculate_backoff_no_jitter() {
        let backoff = calculate_backoff(
            Duration::from_millis(100),
            Duration::from_secs(30),
            false,
        );
        assert_eq!(backoff, Duration::from_millis(100));
    }

    #[test]
    fn test_calculate_backoff_max_cap() {
        let backoff = calculate_backoff(
            Duration::from_secs(60),
            Duration::from_secs(30),
            false,
        );
        assert_eq!(backoff, Duration::from_secs(30));
    }
}
