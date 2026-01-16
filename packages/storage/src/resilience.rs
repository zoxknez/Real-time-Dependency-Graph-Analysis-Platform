//! Resilience utilities: Timeout, Retry, Backoff, and Idempotency
//!
//! Provides a unified resilience wrapper for all external calls with:
//! - Configurable timeouts
//! - Retry with exponential backoff + jitter
//! - Smart retry (only 5xx/network errors, not 4xx)
//! - Idempotency token support
//! - Prometheus metrics

use std::time::Duration;
use anyhow::{anyhow, Result};
use metrics::{counter, histogram};
use rand::Rng;
use tokio::time::timeout;
use tracing::{warn, debug};

/// Resilience configuration for external calls
#[derive(Debug, Clone)]
pub struct ResilienceConfig {
    /// Request timeout
    pub timeout: Duration,
    /// Maximum number of retry attempts
    pub max_retries: u32,
    /// Base delay for exponential backoff
    pub base_delay: Duration,
    /// Maximum delay between retries
    pub max_delay: Duration,
    /// Whether to add jitter to backoff
    pub use_jitter: bool,
}

impl Default for ResilienceConfig {
    fn default() -> Self {
        Self {
            timeout: Duration::from_secs(5),
            max_retries: 3,
            base_delay: Duration::from_millis(100),
            max_delay: Duration::from_secs(10),
            use_jitter: true,
        }
    }
}

impl ResilienceConfig {
    /// Configuration for fast operations (e.g., cache lookups)
    pub fn fast() -> Self {
        Self {
            timeout: Duration::from_secs(1),
            max_retries: 2,
            base_delay: Duration::from_millis(50),
            max_delay: Duration::from_secs(1),
            use_jitter: true,
        }
    }

    /// Configuration for slow operations (e.g., graph queries)
    pub fn slow() -> Self {
        Self {
            timeout: Duration::from_secs(30),
            max_retries: 3,
            base_delay: Duration::from_millis(200),
            max_delay: Duration::from_secs(15),
            use_jitter: true,
        }
    }

    /// Configuration for critical operations (more retries)
    pub fn critical() -> Self {
        Self {
            timeout: Duration::from_secs(10),
            max_retries: 5,
            base_delay: Duration::from_millis(100),
            max_delay: Duration::from_secs(30),
            use_jitter: true,
        }
    }
}

/// Error classification for retry logic
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorClass {
    /// Retryable error (5xx, network, timeout)
    Retryable,
    /// Non-retryable error (4xx, validation)
    NonRetryable,
    /// Fatal error (should not retry)
    Fatal,
}

/// Trait for classifying errors
pub trait IsRetryable {
    fn classify(&self) -> ErrorClass;
}

impl IsRetryable for anyhow::Error {
    fn classify(&self) -> ErrorClass {
        // Check if it's a circuit breaker error
        let msg = self.to_string();
        if msg.contains("Circuit breaker is OPEN") || msg.contains("Circuit breaker is HALF_OPEN") {
            // Circuit breaker open is essentially a "fail fast" mechanism
            // Ideally we shouldn't retry immediately in a hot loop, but for the resilience wrapper
            // which has delays, it might be acceptable to retry if the CB timeout is short.
            // However, usually it's better to treat it as non-retryable for the current burst.
            return ErrorClass::NonRetryable;
        }

        // Check for Bulkhead rejection
        if msg.contains("Bulkhead") {
            // Retryable with backoff (maybe the load clears)
            return ErrorClass::Retryable;
        }

        // Default behavior: Assume IO/Network errors are retryable
        // This is a simplification. Ideally we should downcast to specific errors.
        if msg.contains("connection") || msg.contains("timeout") || msg.contains("reset") {
            return ErrorClass::Retryable;
        }

        // Database specific errors (naive string matching for now)
        if msg.contains("TransientError") || msg.contains("deadlock") {
            return ErrorClass::Retryable;
        }

        // Default to non-retryable for unknown errors to be safe
        ErrorClass::NonRetryable
    }
}

/// Execute operation with resilience (timeout + retry + backoff)
pub async fn with_resilience<F, Fut, T, E>(
    service: &str,
    operation: &str,
    config: &ResilienceConfig,
    mut op: F,
) -> Result<T>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<T, E>>,
    E: IsRetryable + std::fmt::Display,
{
    let mut attempt = 0;
    let mut _last_error: Option<String> = None;

    loop {
        attempt += 1;

        // Execute with timeout
        let start = std::time::Instant::now();
        let result = timeout(config.timeout, op()).await;
        let duration = start.elapsed();

        // Record duration
        histogram!(
            "resilience_call_duration_seconds",
            "service" => service.to_string(),
            "operation" => operation.to_string()
        ).record(duration.as_secs_f64());

        match result {
            // Timeout
            Ok(Err(e)) if e.classify() == ErrorClass::Retryable && attempt <= config.max_retries => {
                _last_error = Some(e.to_string());
                
                counter!(
                    "resilience_retry_total",
                    "service" => service.to_string(),
                    "operation" => operation.to_string(),
                    "reason" => "error"
                ).increment(1);

                warn!(
                    service = %service,
                    operation = %operation,
                    attempt = attempt,
                    error = %e,
                    "Retrying after error"
                );

                // Calculate backoff delay
                let delay = calculate_backoff(attempt, config);
                tokio::time::sleep(delay).await;
                continue;
            }
            Ok(Err(e)) => {
                // Non-retryable or max retries exceeded
                counter!(
                    "resilience_failure_total",
                    "service" => service.to_string(),
                    "operation" => operation.to_string(),
                    "error_class" => format!("{:?}", e.classify())
                ).increment(1);

                return Err(anyhow!("Operation failed: {}", e));
            }
            Ok(Ok(value)) => {
                if attempt > 1 {
                    counter!(
                        "resilience_success_after_retry_total",
                        "service" => service.to_string(),
                        "operation" => operation.to_string()
                    ).increment(1);

                    debug!(
                        service = %service,
                        operation = %operation,
                        attempts = attempt,
                        "Operation succeeded after retry"
                    );
                }

                counter!(
                    "resilience_success_total",
                    "service" => service.to_string(),
                    "operation" => operation.to_string()
                ).increment(1);

                return Ok(value);
            }
            Err(_timeout_err) => {
                // Timeout occurred
                if attempt <= config.max_retries {
                    _last_error = Some("timeout".to_string());
                    
                    counter!(
                        "resilience_timeout_total",
                        "service" => service.to_string(),
                        "operation" => operation.to_string()
                    ).increment(1);

                    counter!(
                        "resilience_retry_total",
                        "service" => service.to_string(),
                        "operation" => operation.to_string(),
                        "reason" => "timeout"
                    ).increment(1);

                    warn!(
                        service = %service,
                        operation = %operation,
                        attempt = attempt,
                        timeout_ms = config.timeout.as_millis(),
                        "Retrying after timeout"
                    );

                    let delay = calculate_backoff(attempt, config);
                    tokio::time::sleep(delay).await;
                    continue;
                } else {
                    counter!(
                        "resilience_failure_total",
                        "service" => service.to_string(),
                        "operation" => operation.to_string(),
                        "error_class" => "timeout"
                    ).increment(1);

                    return Err(anyhow!(
                        "Operation timed out after {} attempts (timeout: {:?})",
                        attempt,
                        config.timeout
                    ));
                }
            }
        }
    }
}

/// Calculate exponential backoff with optional jitter
fn calculate_backoff(attempt: u32, config: &ResilienceConfig) -> Duration {
    // Exponential backoff: base * 2^(attempt - 1)
    let exponential_ms = config.base_delay.as_millis() as u64
        * 2u64.saturating_pow(attempt.saturating_sub(1));

    // Cap at max_delay
    let capped_ms = exponential_ms.min(config.max_delay.as_millis() as u64);

    if config.use_jitter {
        // Add jitter: random(0, capped_ms)
        let mut rng = rand::thread_rng();
        let jitter_ms = rng.gen_range(0..=capped_ms);
        Duration::from_millis(jitter_ms)
    } else {
        Duration::from_millis(capped_ms)
    }
}

/// Idempotency token for safe retries
#[derive(Debug, Clone)]
pub struct IdempotencyToken(pub String);

impl IdempotencyToken {
    pub fn new() -> Self {
        Self(uuid::Uuid::new_v4().to_string())
    }

    pub fn from_request_id(request_id: &str) -> Self {
        Self(request_id.to_string())
    }
}

impl Default for IdempotencyToken {
    fn default() -> Self {
        Self::new()
    }
}

/// Wrapper for operations that support idempotency
pub async fn with_idempotency<F, Fut, T, E>(
    service: &str,
    operation: &str,
    config: &ResilienceConfig,
    token: IdempotencyToken,
    mut op: F,
) -> Result<T>
where
    F: FnMut(IdempotencyToken) -> Fut,
    Fut: std::future::Future<Output = Result<T, E>>,
    E: IsRetryable + std::fmt::Display,
{
    with_resilience(service, operation, config, || op(token.clone())).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Debug)]
    struct TestError {
        retryable: bool,
    }

    impl std::fmt::Display for TestError {
        fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            write!(f, "TestError(retryable={})", self.retryable)
        }
    }

    impl IsRetryable for TestError {
        fn classify(&self) -> ErrorClass {
            if self.retryable {
                ErrorClass::Retryable
            } else {
                ErrorClass::NonRetryable
            }
        }
    }

    #[tokio::test]
    async fn test_resilience_success_on_first_try() {
        let config = ResilienceConfig {
            timeout: Duration::from_secs(1),
            max_retries: 3,
            base_delay: Duration::from_millis(10),
            max_delay: Duration::from_secs(1),
            use_jitter: false,
        };

        let result = with_resilience("test", "op", &config, || async {
            Ok::<_, TestError>(42)
        })
        .await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 42);
    }

    #[tokio::test]
    async fn test_resilience_retry_on_retryable_error() {
        let config = ResilienceConfig {
            timeout: Duration::from_secs(1),
            max_retries: 3,
            base_delay: Duration::from_millis(10),
            max_delay: Duration::from_secs(1),
            use_jitter: false,
        };

        let mut attempt = 0;
        let result = with_resilience("test", "op", &config, || {
            attempt += 1;
            async move {
                if attempt < 3 {
                    Err(TestError { retryable: true })
                } else {
                    Ok(42)
                }
            }
        })
        .await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 42);
        assert_eq!(attempt, 3);
    }

    #[tokio::test]
    async fn test_resilience_no_retry_on_non_retryable() {
        let config = ResilienceConfig {
            timeout: Duration::from_secs(1),
            max_retries: 3,
            base_delay: Duration::from_millis(10),
            max_delay: Duration::from_secs(1),
            use_jitter: false,
        };

        let mut attempt = 0;
        let result = with_resilience("test", "op", &config, || {
            attempt += 1;
            async move { Err::<i32, _>(TestError { retryable: false }) }
        })
        .await;

        assert!(result.is_err());
        assert_eq!(attempt, 1); // Should not retry
    }

    #[tokio::test]
    async fn test_backoff_calculation() {
        let config = ResilienceConfig {
            base_delay: Duration::from_millis(100),
            max_delay: Duration::from_secs(10),
            use_jitter: false,
            ..Default::default()
        };

        // Attempt 1: 100ms
        let delay1 = calculate_backoff(1, &config);
        assert_eq!(delay1, Duration::from_millis(100));

        // Attempt 2: 200ms
        let delay2 = calculate_backoff(2, &config);
        assert_eq!(delay2, Duration::from_millis(200));

        // Attempt 3: 400ms
        let delay3 = calculate_backoff(3, &config);
        assert_eq!(delay3, Duration::from_millis(400));

        // Attempt 10: should cap at max_delay
        let delay10 = calculate_backoff(10, &config);
        assert_eq!(delay10, Duration::from_secs(10));
    }
}
