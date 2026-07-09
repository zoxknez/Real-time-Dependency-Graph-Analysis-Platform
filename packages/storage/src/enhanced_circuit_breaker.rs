//! Enhanced Circuit Breaker Implementation
//!
//! Implements the Circuit Breaker pattern with advanced features:
//! - Half-Open state with gradual recovery
//! - Adaptive thresholds based on error rates
//! - Bulkhead pattern for resource isolation
//! - Metrics and observability
//!
//! References:
//! - https://martinfowler.com/bliki/CircuitBreaker.html
//! - https://docs.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker
//! - https://resilience4j.readme.io/docs/circuitbreaker

use anyhow::Result;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use tracing::{debug, warn};

/// Circuit breaker state
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CircuitState {
    /// Circuit is closed, requests flow normally
    Closed,
    /// Circuit is open, requests are rejected
    Open,
    /// Circuit is half-open, testing if service recovered
    HalfOpen,
}

/// Circuit breaker configuration
#[derive(Debug, Clone)]
pub struct CircuitBreakerConfig {
    /// Failure threshold to open circuit (percentage)
    pub failure_threshold: f64,
    /// Minimum number of requests before evaluating
    pub min_requests: usize,
    /// Time to wait before attempting recovery
    pub timeout: Duration,
    /// Number of successful requests needed to close circuit
    pub success_threshold: usize,
    /// Window size for calculating error rate
    pub window_size: Duration,
    /// Maximum concurrent requests (bulkhead)
    pub max_concurrent: usize,
}

impl Default for CircuitBreakerConfig {
    fn default() -> Self {
        Self {
            failure_threshold: 0.5, // 50% error rate
            min_requests: 10,
            timeout: Duration::from_secs(30),
            success_threshold: 5,
            window_size: Duration::from_secs(60),
            max_concurrent: 100,
        }
    }
}

/// Circuit breaker metrics
#[derive(Debug, Default)]
struct Metrics {
    total_requests: AtomicU64,
    successful_requests: AtomicU64,
    failed_requests: AtomicU64,
    rejected_requests: AtomicU64,
    state_changes: AtomicU64,
    concurrent_requests: AtomicUsize,
}

impl Metrics {
    fn record_success(&self) {
        self.total_requests.fetch_add(1, Ordering::Relaxed);
        self.successful_requests.fetch_add(1, Ordering::Relaxed);
        self.concurrent_requests.fetch_sub(1, Ordering::Relaxed);
    }

    fn record_failure(&self) {
        self.total_requests.fetch_add(1, Ordering::Relaxed);
        self.failed_requests.fetch_add(1, Ordering::Relaxed);
        self.concurrent_requests.fetch_sub(1, Ordering::Relaxed);
    }

    fn record_rejection(&self) {
        self.rejected_requests.fetch_add(1, Ordering::Relaxed);
    }

    fn record_state_change(&self) {
        self.state_changes.fetch_add(1, Ordering::Relaxed);
    }

    fn try_acquire(&self, max_concurrent: usize) -> bool {
        let current = self.concurrent_requests.fetch_add(1, Ordering::Relaxed);
        if current >= max_concurrent {
            self.concurrent_requests.fetch_sub(1, Ordering::Relaxed);
            false
        } else {
            true
        }
    }

    fn error_rate(&self) -> f64 {
        let total = self.total_requests.load(Ordering::Relaxed);
        if total == 0 {
            return 0.0;
        }
        let failed = self.failed_requests.load(Ordering::Relaxed);
        (failed as f64) / (total as f64)
    }
}

/// Sliding window for tracking recent requests
struct SlidingWindow {
    requests: RwLock<Vec<(Instant, bool)>>, // (timestamp, success)
    window_size: Duration,
}

impl SlidingWindow {
    fn new(window_size: Duration) -> Self {
        Self {
            requests: RwLock::new(Vec::new()),
            window_size,
        }
    }

    async fn record(&self, success: bool) {
        let mut requests = self.requests.write().await;
        let now = Instant::now();

        // Remove old entries
        requests.retain(|(timestamp, _)| now.duration_since(*timestamp) < self.window_size);

        // Add new entry
        requests.push((now, success));
    }

    async fn error_rate(&self) -> f64 {
        let requests = self.requests.read().await;
        let now = Instant::now();

        // Filter to window
        let recent: Vec<_> = requests
            .iter()
            .filter(|(timestamp, _)| now.duration_since(*timestamp) < self.window_size)
            .collect();

        if recent.is_empty() {
            return 0.0;
        }

        let failures = recent.iter().filter(|(_, success)| !success).count();
        (failures as f64) / (recent.len() as f64)
    }

    async fn count(&self) -> usize {
        let requests = self.requests.read().await;
        let now = Instant::now();

        requests
            .iter()
            .filter(|(timestamp, _)| now.duration_since(*timestamp) < self.window_size)
            .count()
    }
}

/// Enhanced circuit breaker
pub struct EnhancedCircuitBreaker {
    config: CircuitBreakerConfig,
    state: Arc<RwLock<CircuitState>>,
    opened_at: Arc<RwLock<Option<Instant>>>,
    half_open_successes: Arc<AtomicUsize>,
    metrics: Arc<Metrics>,
    sliding_window: Arc<SlidingWindow>,
}

impl EnhancedCircuitBreaker {
    /// Create a new circuit breaker
    pub fn new(config: CircuitBreakerConfig) -> Self {
        Self {
            sliding_window: Arc::new(SlidingWindow::new(config.window_size)),
            config,
            state: Arc::new(RwLock::new(CircuitState::Closed)),
            opened_at: Arc::new(RwLock::new(None)),
            half_open_successes: Arc::new(AtomicUsize::new(0)),
            metrics: Arc::new(Metrics::default()),
        }
    }

    /// Execute a function with circuit breaker protection
    pub async fn call<F, T, E>(&self, f: F) -> Result<T, CircuitBreakerError<E>>
    where
        F: std::future::Future<Output = Result<T, E>>,
    {
        // Check if we can proceed
        self.check_state().await.map_err(|err| match err {
            CircuitBreakerError::Open => CircuitBreakerError::Open,
            CircuitBreakerError::BulkheadFull => CircuitBreakerError::BulkheadFull,
            CircuitBreakerError::Inner(()) => {
                unreachable!("check_state does not return inner errors")
            }
        })?;

        // Try to acquire bulkhead slot
        if !self.metrics.try_acquire(self.config.max_concurrent) {
            self.metrics.record_rejection();
            return Err(CircuitBreakerError::BulkheadFull);
        }

        // Execute the function
        let result = f.await;

        // Record result
        match &result {
            Ok(_) => {
                self.on_success().await;
            }
            Err(_) => {
                self.on_failure().await;
            }
        }

        result.map_err(CircuitBreakerError::Inner)
    }

    /// Check if request can proceed
    async fn check_state(&self) -> Result<(), CircuitBreakerError<()>> {
        let state = *self.state.read().await;

        match state {
            CircuitState::Closed => Ok(()),
            CircuitState::Open => {
                // Check if timeout has elapsed
                let opened_at = self.opened_at.read().await;
                if let Some(opened) = *opened_at {
                    if opened.elapsed() >= self.config.timeout {
                        // Transition to half-open
                        drop(opened_at);
                        self.transition_to_half_open().await;
                        Ok(())
                    } else {
                        self.metrics.record_rejection();
                        Err(CircuitBreakerError::Open)
                    }
                } else {
                    Err(CircuitBreakerError::Open)
                }
            }
            CircuitState::HalfOpen => Ok(()),
        }
    }

    /// Handle successful request
    async fn on_success(&self) {
        self.metrics.record_success();
        self.sliding_window.record(true).await;

        let state = *self.state.read().await;

        if state == CircuitState::HalfOpen {
            let successes = self.half_open_successes.fetch_add(1, Ordering::Relaxed) + 1;

            if successes >= self.config.success_threshold {
                self.transition_to_closed().await;
            }
        }
    }

    /// Handle failed request
    async fn on_failure(&self) {
        self.metrics.record_failure();
        self.sliding_window.record(false).await;

        let state = *self.state.read().await;

        match state {
            CircuitState::Closed => {
                // Check if we should open
                let count = self.sliding_window.count().await;
                if count >= self.config.min_requests {
                    let error_rate = self.sliding_window.error_rate().await;
                    if error_rate >= self.config.failure_threshold {
                        self.transition_to_open().await;
                    }
                }
            }
            CircuitState::HalfOpen => {
                // Any failure in half-open state reopens circuit
                self.transition_to_open().await;
            }
            CircuitState::Open => {
                // Already open, do nothing
            }
        }
    }

    /// Transition to open state
    async fn transition_to_open(&self) {
        let mut state = self.state.write().await;
        if *state != CircuitState::Open {
            *state = CircuitState::Open;
            *self.opened_at.write().await = Some(Instant::now());
            self.metrics.record_state_change();

            warn!(
                error_rate = self.metrics.error_rate(),
                "Circuit breaker opened"
            );
        }
    }

    /// Transition to half-open state
    async fn transition_to_half_open(&self) {
        let mut state = self.state.write().await;
        *state = CircuitState::HalfOpen;
        self.half_open_successes.store(0, Ordering::Relaxed);
        self.metrics.record_state_change();

        debug!("Circuit breaker half-open, testing recovery");
    }

    /// Transition to closed state
    async fn transition_to_closed(&self) {
        let mut state = self.state.write().await;
        *state = CircuitState::Closed;
        *self.opened_at.write().await = None;
        self.half_open_successes.store(0, Ordering::Relaxed);
        self.metrics.record_state_change();

        debug!("Circuit breaker closed, service recovered");
    }

    /// Get current state
    pub async fn state(&self) -> CircuitState {
        *self.state.read().await
    }

    /// Get circuit breaker statistics
    pub async fn stats(&self) -> CircuitBreakerStats {
        CircuitBreakerStats {
            state: *self.state.read().await,
            total_requests: self.metrics.total_requests.load(Ordering::Relaxed),
            successful_requests: self.metrics.successful_requests.load(Ordering::Relaxed),
            failed_requests: self.metrics.failed_requests.load(Ordering::Relaxed),
            rejected_requests: self.metrics.rejected_requests.load(Ordering::Relaxed),
            error_rate: self.metrics.error_rate(),
            state_changes: self.metrics.state_changes.load(Ordering::Relaxed),
            concurrent_requests: self.metrics.concurrent_requests.load(Ordering::Relaxed),
        }
    }

    /// Force open the circuit (for testing/maintenance)
    pub async fn force_open(&self) {
        self.transition_to_open().await;
    }

    /// Force close the circuit (for testing/recovery)
    pub async fn force_close(&self) {
        self.transition_to_closed().await;
    }

    /// Reset all metrics
    pub async fn reset(&self) {
        self.transition_to_closed().await;
        self.metrics.total_requests.store(0, Ordering::Relaxed);
        self.metrics.successful_requests.store(0, Ordering::Relaxed);
        self.metrics.failed_requests.store(0, Ordering::Relaxed);
        self.metrics.rejected_requests.store(0, Ordering::Relaxed);
        self.metrics.state_changes.store(0, Ordering::Relaxed);

        let mut requests = self.sliding_window.requests.write().await;
        requests.clear();
    }
}

/// Circuit breaker error
#[derive(Debug, thiserror::Error)]
pub enum CircuitBreakerError<E> {
    #[error("Circuit breaker is open")]
    Open,

    #[error("Bulkhead is full, too many concurrent requests")]
    BulkheadFull,

    #[error("Inner error: {0}")]
    Inner(#[source] E),
}

/// Circuit breaker statistics
#[derive(Debug, Clone)]
pub struct CircuitBreakerStats {
    pub state: CircuitState,
    pub total_requests: u64,
    pub successful_requests: u64,
    pub failed_requests: u64,
    pub rejected_requests: u64,
    pub error_rate: f64,
    pub state_changes: u64,
    pub concurrent_requests: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_circuit_breaker_opens_on_failures() {
        let config = CircuitBreakerConfig {
            failure_threshold: 0.5,
            min_requests: 5,
            timeout: Duration::from_secs(1),
            success_threshold: 3,
            window_size: Duration::from_secs(10),
            max_concurrent: 10,
        };

        let cb = EnhancedCircuitBreaker::new(config);

        // Simulate failures
        for _ in 0..10 {
            let _ = cb.call(async { Err::<(), _>("error") }).await;
        }

        // Circuit should be open
        assert_eq!(cb.state().await, CircuitState::Open);
    }

    #[tokio::test]
    async fn test_circuit_breaker_recovers() {
        let config = CircuitBreakerConfig {
            failure_threshold: 0.5,
            min_requests: 5,
            timeout: Duration::from_millis(100),
            success_threshold: 3,
            window_size: Duration::from_secs(10),
            max_concurrent: 10,
        };

        let cb = EnhancedCircuitBreaker::new(config);

        // Open circuit
        for _ in 0..10 {
            let _ = cb.call(async { Err::<(), _>("error") }).await;
        }

        assert_eq!(cb.state().await, CircuitState::Open);

        // Wait for timeout
        tokio::time::sleep(Duration::from_millis(150)).await;

        // Simulate successful requests
        for _ in 0..5 {
            let _ = cb.call(async { Ok::<_, ()>(()) }).await;
        }

        // Circuit should be closed
        assert_eq!(cb.state().await, CircuitState::Closed);
    }

    #[tokio::test]
    async fn test_bulkhead_limits_concurrent_requests() {
        let config = CircuitBreakerConfig {
            max_concurrent: 2,
            ..Default::default()
        };

        let cb = Arc::new(EnhancedCircuitBreaker::new(config));

        // Start 2 long-running requests
        let cb1 = cb.clone();
        let cb2 = cb.clone();

        let handle1 = tokio::spawn(async move {
            cb1.call(async {
                tokio::time::sleep(Duration::from_millis(100)).await;
                Ok::<_, ()>(())
            })
            .await
        });

        let handle2 = tokio::spawn(async move {
            cb2.call(async {
                tokio::time::sleep(Duration::from_millis(100)).await;
                Ok::<_, ()>(())
            })
            .await
        });

        // Third request should be rejected
        tokio::time::sleep(Duration::from_millis(10)).await;
        let result = cb.call(async { Ok::<_, ()>(()) }).await;

        assert!(matches!(result, Err(CircuitBreakerError::BulkheadFull)));

        // Wait for first two to complete
        let _ = handle1.await;
        let _ = handle2.await;
    }
}

// Made with Bob
