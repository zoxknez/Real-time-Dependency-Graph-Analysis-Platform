//! Circuit Breaker Pattern Implementation
//!
//! Enterprise-grade circuit breaker with:
//! - Per-dependency isolation (Memgraph, Qdrant, Kafka, Redis)
//! - Per-operation granularity (search vs upsert)
//! - State machine: CLOSED → OPEN → HALF_OPEN
//! - Prometheus metrics integration
//! - Configurable thresholds

use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use anyhow::{anyhow, Result};
use dashmap::DashMap;
use metrics::{counter, gauge, histogram};
use tracing::{warn, info};

/// Circuit breaker state
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CircuitState {
    Closed = 0,
    Open = 1,
    HalfOpen = 2,
}

impl From<u8> for CircuitState {
    fn from(value: u8) -> Self {
        match value {
            0 => CircuitState::Closed,
            1 => CircuitState::Open,
            2 => CircuitState::HalfOpen,
            _ => CircuitState::Closed,
        }
    }
}

/// Circuit breaker configuration
#[derive(Debug, Clone)]
pub struct CircuitBreakerConfig {
    /// Number of failures before opening circuit
    pub failure_threshold: u32,
    /// Number of successes to close circuit from half-open
    pub success_threshold: u32,
    /// Timeout before transitioning from open to half-open (ms)
    pub timeout_ms: u64,
    /// Number of requests allowed in half-open state
    pub half_open_requests: u32,
}

impl Default for CircuitBreakerConfig {
    fn default() -> Self {
        Self {
            failure_threshold: 5,
            success_threshold: 3,
            timeout_ms: 30000, // 30 seconds
            half_open_requests: 3,
        }
    }
}

/// Circuit breaker instance
pub struct CircuitBreaker {
    service: String,
    operation: String,
    state: AtomicU32, // Using u32 to store CircuitState
    failure_count: AtomicU32,
    success_count: AtomicU32,
    last_failure_time: AtomicU64,
    half_open_calls: AtomicU32,
    config: CircuitBreakerConfig,
}

impl CircuitBreaker {
    pub fn new(service: impl Into<String>, operation: impl Into<String>, config: CircuitBreakerConfig) -> Self {
        let service = service.into();
        let operation = operation.into();
        
        // Initialize metrics
        gauge!(
            "circuit_breaker_state",
            "service" => service.clone(),
            "operation" => operation.clone()
        ).set(CircuitState::Closed as u32 as f64);

        Self {
            service,
            operation,
            state: AtomicU32::new(CircuitState::Closed as u32),
            failure_count: AtomicU32::new(0),
            success_count: AtomicU32::new(0),
            last_failure_time: AtomicU64::new(0),
            half_open_calls: AtomicU32::new(0),
            config,
        }
    }

    /// Get current state
    pub fn state(&self) -> CircuitState {
        let state_val = self.state.load(Ordering::Acquire);
        CircuitState::from(state_val as u8)
    }

    /// Execute operation with circuit breaker protection
    pub async fn call<F, T, E>(&self, operation: F) -> Result<T>
    where
        F: std::future::Future<Output = Result<T, E>> + Send,
        E: std::fmt::Display + Send + Sync + 'static,
        T: Send,
    {
        // Check if circuit is open
        match self.state() {
            CircuitState::Open => {
                // Check if timeout has elapsed
                let now = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_millis() as u64;
                let last_failure = self.last_failure_time.load(Ordering::Acquire);

                if now - last_failure >= self.config.timeout_ms {
                    // Transition to half-open
                    self.transition_to_half_open();
                } else {
                    counter!(
                        "circuit_breaker_rejected_total",
                        "service" => self.service.clone(),
                        "operation" => self.operation.clone()
                    ).increment(1);
                    return Err(anyhow!("Circuit breaker is OPEN for {}/{}", self.service, self.operation));
                }
            }
            CircuitState::HalfOpen => {
                // Limit concurrent requests in half-open state
                let current_calls = self.half_open_calls.fetch_add(1, Ordering::SeqCst);
                if current_calls >= self.config.half_open_requests {
                    self.half_open_calls.fetch_sub(1, Ordering::SeqCst);
                    counter!(
                        "circuit_breaker_rejected_total",
                        "service" => self.service.clone(),
                        "operation" => self.operation.clone()
                    ).increment(1);
                    return Err(anyhow!("Circuit breaker is HALF_OPEN with max concurrent requests"));
                }
            }
            CircuitState::Closed => {}
        }

        // Execute operation
        let start = std::time::Instant::now();
        let result = operation.await;
        let duration = start.elapsed();

        histogram!(
            "circuit_breaker_call_duration_seconds",
            "service" => self.service.clone(),
            "operation" => self.operation.clone()
        ).record(duration.as_secs_f64());

        // Handle result
        match result {
            Ok(value) => {
                self.on_success();
                Ok(value)
            }
            Err(e) => {
                self.on_failure();
                Err(anyhow!("Operation failed: {}", e))
            }
        }
    }

    /// Handle successful operation
    fn on_success(&self) {
        let current_state = self.state();
        
        match current_state {
            CircuitState::HalfOpen => {
                let successes = self.success_count.fetch_add(1, Ordering::SeqCst) + 1;
                self.half_open_calls.fetch_sub(1, Ordering::SeqCst);
                
                if successes >= self.config.success_threshold {
                    self.transition_to_closed();
                }
            }
            CircuitState::Closed => {
                // Reset failure count on success
                self.failure_count.store(0, Ordering::Release);
            }
            CircuitState::Open => {
                // Should not happen, but reset if it does
                self.half_open_calls.fetch_sub(1, Ordering::SeqCst);
            }
        }

        counter!(
            "circuit_breaker_success_total",
            "service" => self.service.clone(),
            "operation" => self.operation.clone()
        ).increment(1);
    }

    /// Handle failed operation
    fn on_failure(&self) {
        let current_state = self.state();
        
        match current_state {
            CircuitState::HalfOpen => {
                self.half_open_calls.fetch_sub(1, Ordering::SeqCst);
                self.transition_to_open();
            }
            CircuitState::Closed => {
                let failures = self.failure_count.fetch_add(1, Ordering::SeqCst) + 1;
                
                if failures >= self.config.failure_threshold {
                    self.transition_to_open();
                }
            }
            CircuitState::Open => {
                // Already open, update timestamp
                let now = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_millis() as u64;
                self.last_failure_time.store(now, Ordering::Release);
            }
        }

        counter!(
            "circuit_breaker_failure_total",
            "service" => self.service.clone(),
            "operation" => self.operation.clone()
        ).increment(1);
    }

    /// Transition to OPEN state
    fn transition_to_open(&self) {
        let old_state = self.state();
        self.state.store(CircuitState::Open as u32, Ordering::Release);
        
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
        self.last_failure_time.store(now, Ordering::Release);
        
        self.failure_count.store(0, Ordering::Release);
        self.success_count.store(0, Ordering::Release);

        gauge!(
            "circuit_breaker_state",
            "service" => self.service.clone(),
            "operation" => self.operation.clone()
        ).set(CircuitState::Open as u32 as f64);

        counter!(
            "circuit_breaker_transitions_total",
            "service" => self.service.clone(),
            "operation" => self.operation.clone(),
            "from" => format!("{:?}", old_state),
            "to" => "Open"
        ).increment(1);

        warn!(
            service = %self.service,
            operation = %self.operation,
            from = ?old_state,
            "Circuit breaker transitioned to OPEN"
        );
    }

    /// Transition to HALF_OPEN state
    fn transition_to_half_open(&self) {
        let old_state = self.state();
        self.state.store(CircuitState::HalfOpen as u32, Ordering::Release);
        
        self.success_count.store(0, Ordering::Release);
        self.half_open_calls.store(0, Ordering::Release);

        gauge!(
            "circuit_breaker_state",
            "service" => self.service.clone(),
            "operation" => self.operation.clone()
        ).set(CircuitState::HalfOpen as u32 as f64);

        counter!(
            "circuit_breaker_transitions_total",
            "service" => self.service.clone(),
            "operation" => self.operation.clone(),
            "from" => format!("{:?}", old_state),
            "to" => "HalfOpen"
        ).increment(1);

        info!(
            service = %self.service,
            operation = %self.operation,
            from = ?old_state,
            "Circuit breaker transitioned to HALF_OPEN"
        );
    }

    /// Transition to CLOSED state
    fn transition_to_closed(&self) {
        let old_state = self.state();
        self.state.store(CircuitState::Closed as u32, Ordering::Release);
        
        self.failure_count.store(0, Ordering::Release);
        self.success_count.store(0, Ordering::Release);
        self.half_open_calls.store(0, Ordering::Release);

        gauge!(
            "circuit_breaker_state",
            "service" => self.service.clone(),
            "operation" => self.operation.clone()
        ).set(CircuitState::Closed as u32 as f64);

        counter!(
            "circuit_breaker_transitions_total",
            "service" => self.service.clone(),
            "operation" => self.operation.clone(),
            "from" => format!("{:?}", old_state),
            "to" => "Closed"
        ).increment(1);

        info!(
            service = %self.service,
            operation = %self.operation,
            from = ?old_state,
            "Circuit breaker transitioned to CLOSED"
        );
    }
}

/// Circuit breaker registry for managing multiple breakers
pub struct CircuitBreakerRegistry {
    breakers: DashMap<String, Arc<CircuitBreaker>>,
    default_config: CircuitBreakerConfig,
}

impl CircuitBreakerRegistry {
    pub fn new(default_config: CircuitBreakerConfig) -> Self {
        Self {
            breakers: DashMap::new(),
            default_config,
        }
    }

    /// Get or create circuit breaker for service/operation
    pub fn get_or_create(
        &self,
        service: impl Into<String>,
        operation: impl Into<String>,
    ) -> Arc<CircuitBreaker> {
        let service = service.into();
        let operation = operation.into();
        let key = format!("{}:{}", service, operation);

        self.breakers
            .entry(key.clone())
            .or_insert_with(|| {
                Arc::new(CircuitBreaker::new(
                    service,
                    operation,
                    self.default_config.clone(),
                ))
            })
            .clone()
    }

    /// Get breaker with custom config
    pub fn get_or_create_with_config(
        &self,
        service: impl Into<String>,
        operation: impl Into<String>,
        config: CircuitBreakerConfig,
    ) -> Arc<CircuitBreaker> {
        let service = service.into();
        let operation = operation.into();
        let key = format!("{}:{}", service, operation);

        self.breakers
            .entry(key.clone())
            .or_insert_with(|| Arc::new(CircuitBreaker::new(service, operation, config)))
            .clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_circuit_breaker_opens_after_threshold() {
        let breaker = CircuitBreaker::new("test", "operation", CircuitBreakerConfig {
            failure_threshold: 3,
            success_threshold: 2,
            timeout_ms: 1000,
            half_open_requests: 2,
        });

        // Simulate 3 failures
        for _ in 0..3 {
            let result = breaker.call(async { Err::<(), _>("error") }).await;
            assert!(result.is_err());
        }

        // Circuit should be open
        assert_eq!(breaker.state(), CircuitState::Open);
    }

    #[tokio::test]
    async fn test_circuit_breaker_half_open_after_timeout() {
        let breaker = CircuitBreaker::new("test", "operation", CircuitBreakerConfig {
            failure_threshold: 2,
            success_threshold: 2,
            timeout_ms: 100, // 100ms timeout
            half_open_requests: 2,
        });

        // Open the circuit
        for _ in 0..2 {
            let _ = breaker.call(async { Err::<(), _>("error") }).await;
        }

        assert_eq!(breaker.state(), CircuitState::Open);

        // Wait for timeout
        tokio::time::sleep(Duration::from_millis(150)).await;

        // Next call should transition to half-open
        let result = breaker.call(async { Ok::<_, String>(()) }).await;
        assert!(result.is_ok());
        assert_eq!(breaker.state(), CircuitState::HalfOpen);
    }

    #[tokio::test]
    async fn test_circuit_breaker_closes_after_successes() {
        let breaker = CircuitBreaker::new("test", "operation", CircuitBreakerConfig {
            failure_threshold: 2,
            success_threshold: 2,
            timeout_ms: 100,
            half_open_requests: 3,
        });

        // Open the circuit
        for _ in 0..2 {
            let _ = breaker.call(async { Err::<(), _>("error") }).await;
        }

        // Wait for timeout
        tokio::time::sleep(Duration::from_millis(150)).await;

        // Succeed enough times to close
        for _ in 0..2 {
            let result = breaker.call(async { Ok::<_, String>(()) }).await;
            assert!(result.is_ok());
        }

        assert_eq!(breaker.state(), CircuitState::Closed);
    }
}
