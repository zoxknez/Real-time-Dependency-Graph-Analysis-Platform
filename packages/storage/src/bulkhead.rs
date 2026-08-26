//! Bulkhead Pattern - Concurrency Limiting
//!
//! Prevents resource exhaustion by limiting concurrent operations per dependency.
//! Features:
//! - Semaphore-based concurrency control
//! - Per-service isolation
//! - Configurable limits
//! - Prometheus metrics

use anyhow::{Result, anyhow};
use metrics::{counter, gauge};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Semaphore;
use tokio::time::timeout;
use tracing::warn;

/// Bulkhead configuration
#[derive(Debug, Clone)]
pub struct BulkheadConfig {
    /// Maximum concurrent operations
    pub max_concurrent: usize,
    /// Timeout for acquiring permit
    pub acquire_timeout: Duration,
}

impl Default for BulkheadConfig {
    fn default() -> Self {
        Self {
            max_concurrent: 100,
            acquire_timeout: Duration::from_secs(5),
        }
    }
}

impl BulkheadConfig {
    /// Fast operations (e.g., cache)
    pub fn fast() -> Self {
        Self {
            max_concurrent: 200,
            acquire_timeout: Duration::from_secs(1),
        }
    }

    /// Slow operations (e.g., database)
    pub fn slow() -> Self {
        Self {
            max_concurrent: 50,
            acquire_timeout: Duration::from_secs(10),
        }
    }

    /// Critical operations (limited concurrency)
    pub fn critical() -> Self {
        Self {
            max_concurrent: 10,
            acquire_timeout: Duration::from_secs(30),
        }
    }
}

/// Bulkhead for limiting concurrent operations
pub struct Bulkhead {
    service: String,
    semaphore: Arc<Semaphore>,
    config: BulkheadConfig,
}

impl Bulkhead {
    /// Create a new bulkhead
    pub fn new(service: impl Into<String>, config: BulkheadConfig) -> Self {
        let service = service.into();
        let semaphore = Arc::new(Semaphore::new(config.max_concurrent));

        // Initialize gauge
        gauge!(
            "bulkhead_capacity",
            "service" => service.clone()
        )
        .set(config.max_concurrent as f64);

        Self {
            service,
            semaphore,
            config,
        }
    }

    /// Execute operation with bulkhead protection
    pub async fn call<F, T>(&self, operation: F) -> Result<T>
    where
        F: std::future::Future<Output = Result<T>>,
    {
        // Try to acquire permit with timeout
        let permit = match timeout(self.config.acquire_timeout, self.semaphore.acquire()).await {
            Ok(Ok(permit)) => permit,
            Ok(Err(_)) => {
                counter!(
                    "bulkhead_rejected_total",
                    "service" => self.service.clone(),
                    "reason" => "semaphore_closed"
                )
                .increment(1);
                return Err(anyhow!("Bulkhead semaphore closed for {}", self.service));
            }
            Err(_) => {
                counter!(
                    "bulkhead_rejected_total",
                    "service" => self.service.clone(),
                    "reason" => "timeout"
                )
                .increment(1);
                warn!(
                    service = %self.service,
                    timeout_ms = self.config.acquire_timeout.as_millis(),
                    "Bulkhead timeout - too many concurrent operations"
                );
                return Err(anyhow!(
                    "Bulkhead timeout for {} - max concurrent: {}",
                    self.service,
                    self.config.max_concurrent
                ));
            }
        };

        // Update available permits gauge
        let available = self.semaphore.available_permits();
        gauge!(
            "bulkhead_available",
            "service" => self.service.clone()
        )
        .set(available as f64);

        counter!(
            "bulkhead_acquired_total",
            "service" => self.service.clone()
        )
        .increment(1);

        // Execute operation
        let result = operation.await;

        // Permit is automatically released when dropped
        drop(permit);

        // Update gauge after release
        let available = self.semaphore.available_permits();
        gauge!(
            "bulkhead_available",
            "service" => self.service.clone()
        )
        .set(available as f64);

        result
    }

    /// Get number of available permits
    pub fn available_permits(&self) -> usize {
        self.semaphore.available_permits()
    }

    /// Check if bulkhead is full
    pub fn is_full(&self) -> bool {
        self.semaphore.available_permits() == 0
    }
}

impl Clone for Bulkhead {
    fn clone(&self) -> Self {
        Self {
            service: self.service.clone(),
            semaphore: self.semaphore.clone(),
            config: self.config.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    #[tokio::test]
    async fn test_bulkhead_allows_concurrent_operations() {
        let bulkhead = Bulkhead::new(
            "test",
            BulkheadConfig {
                max_concurrent: 5,
                acquire_timeout: Duration::from_secs(1),
            },
        );

        let counter = Arc::new(AtomicU32::new(0));

        // Spawn 5 concurrent operations
        let mut handles = vec![];
        for _ in 0..5 {
            let bulkhead = bulkhead.clone();
            let counter = counter.clone();
            let handle = tokio::spawn(async move {
                bulkhead
                    .call(async {
                        counter.fetch_add(1, Ordering::SeqCst);
                        tokio::time::sleep(Duration::from_millis(100)).await;
                        Ok::<_, anyhow::Error>(())
                    })
                    .await
            });
            handles.push(handle);
        }

        // All should complete
        for handle in handles {
            assert!(handle.await.unwrap().is_ok());
        }

        assert_eq!(counter.load(Ordering::SeqCst), 5);
    }

    #[tokio::test]
    async fn test_bulkhead_rejects_when_full() {
        let bulkhead = Bulkhead::new(
            "test",
            BulkheadConfig {
                max_concurrent: 2,
                acquire_timeout: Duration::from_millis(100),
            },
        );

        // Start 2 long-running operations
        let bulkhead1 = bulkhead.clone();
        let bulkhead2 = bulkhead.clone();

        let handle1 = tokio::spawn(async move {
            bulkhead1
                .call(async {
                    tokio::time::sleep(Duration::from_secs(1)).await;
                    Ok::<_, anyhow::Error>(())
                })
                .await
        });

        let handle2 = tokio::spawn(async move {
            bulkhead2
                .call(async {
                    tokio::time::sleep(Duration::from_secs(1)).await;
                    Ok::<_, anyhow::Error>(())
                })
                .await
        });

        // Wait a bit for them to acquire permits
        tokio::time::sleep(Duration::from_millis(50)).await;

        // Third operation should be rejected
        let result = bulkhead.call(async { Ok::<_, anyhow::Error>(()) }).await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Bulkhead timeout"));

        // Cleanup
        handle1.await.unwrap().ok();
        handle2.await.unwrap().ok();
    }

    #[tokio::test]
    async fn test_bulkhead_available_permits() {
        let bulkhead = Bulkhead::new(
            "test",
            BulkheadConfig {
                max_concurrent: 10,
                acquire_timeout: Duration::from_secs(1),
            },
        );

        assert_eq!(bulkhead.available_permits(), 10);
        assert!(!bulkhead.is_full());
    }
}
