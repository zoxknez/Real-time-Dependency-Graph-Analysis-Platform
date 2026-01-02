use std::sync::Arc;
use std::time::{Duration, Instant};
use governor::{Quota, RateLimiter as GovernorLimiter, state::direct::NotKeyed, Jitter};
use std::num::NonZeroU32;
use tokio::sync::RwLock;
use tracing::{warn, info};

/// Rate limiter capable of handling standard rate limits AND global backoff (e.g. from 429s)
#[derive(Clone)]
#[allow(dead_code)]
pub struct RateLimiter {
    // Inner token bucket
    inner: Arc<GovernorLimiter<NotKeyed, governor::state::InMemoryState, governor::clock::QuantaClock>>,
    // Jitter configuration
    jitter: Jitter,
    // Global backoff state
    backoff_until: Arc<RwLock<Option<Instant>>>,
    registry_name: String,
}

impl RateLimiter {
    pub fn new(registry_name: String, requests_per_second: u32, burst: u32) -> Self {
        let quota = Quota::per_second(
            NonZeroU32::new(requests_per_second)
                .expect("requests_per_second must be > 0")
        ).allow_burst(
            NonZeroU32::new(burst)
                .expect("burst must be > 0")
        );
            
        Self {
            inner: Arc::new(GovernorLimiter::direct(quota)),
            jitter: Jitter::up_to(Duration::from_millis(100)),
            backoff_until: Arc::new(RwLock::new(None)),
            registry_name,
        }
    }

    /// Acquire a permit, waiting if necessary (handling both rate limit and backoff)
    pub async fn acquire(&self) {
        // 1. Check global backoff first
        loop {
            let backoff = *self.backoff_until.read().await;
            if let Some(until) = backoff {
                let now = Instant::now();
                if until > now {
                    let wait_time = until - now;
                    tokio::time::sleep(wait_time).await;
                    continue; // Re-check after sleeping (backoff might have been extended)
                } else {
                    // Backoff expired, try to clear it
                    let mut lock = self.backoff_until.write().await;
                    if let Some(u) = *lock {
                        if u <= now {
                            *lock = None;
                            info!(registry=%self.registry_name, "Backoff cleared");
                        }
                    }
                }
            }
            break;
        }

        // 2. Token bucket wait
        self.inner.until_ready_with_jitter(self.jitter).await;
    }

    /// Trigger a global backoff (e.g. after receiving 429 Too Many Requests)
    pub async fn report_429(&self, duration: Duration) {
        let mut lock = self.backoff_until.write().await;
        let now = Instant::now();
        let new_until = now + duration;
        
        // Only extend if new time is further in future
        if let Some(current) = *lock {
            if new_until > current {
                *lock = Some(new_until);
                warn!(registry=%self.registry_name, duration_sec=duration.as_secs(), "Global backoff triggered/extended");
            }
        } else {
            *lock = Some(new_until);
            warn!(registry=%self.registry_name, duration_sec=duration.as_secs(), "Global backoff triggered");
        }
    }
}
