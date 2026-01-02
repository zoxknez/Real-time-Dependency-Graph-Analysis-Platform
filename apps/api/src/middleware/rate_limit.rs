//! Rate limiting middleware for GraphQL API

#![allow(dead_code)]

use axum::{
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use governor::{
    clock::{Clock, QuantaClock},
    state::{InMemoryState, NotKeyed},
    Quota, RateLimiter,
};
use serde::Serialize;
use std::num::NonZeroU32;
use std::sync::Arc;
use tracing::warn;

/// Rate limiter type alias
pub type ApiRateLimiter = Arc<RateLimiter<NotKeyed, InMemoryState, QuantaClock>>;

/// Create a new rate limiter with requests per minute
pub fn create_rate_limiter(requests_per_minute: u32) -> ApiRateLimiter {
    let quota = Quota::per_minute(
        NonZeroU32::new(requests_per_minute)
            .expect("requests_per_minute must be > 0")
    );
    
    Arc::new(RateLimiter::direct(quota))
}

/// Rate limit error response
#[derive(Serialize)]
pub struct RateLimitError {
    pub error: &'static str,
    pub message: String,
    pub retry_after_secs: u64,
}

/// Rate limiting middleware
/// 
/// Usage:
/// ```ignore
/// let rate_limiter = create_rate_limiter(100);
/// let app = Router::new()
///     .route("/graphql", post(handler))
///     .route_layer(axum::middleware::from_fn_with_state(
///         rate_limiter,
///         rate_limit_middleware,
///     ));
/// ```
pub async fn rate_limit_middleware(
    State(limiter): State<ApiRateLimiter>,
    request: Request<Body>,
    next: Next,
) -> Response {
    match limiter.check() {
        Ok(_) => {
            // Request allowed, proceed
            next.run(request).await
        }
        Err(not_until) => {
            // Rate limited
            let wait_time = not_until.wait_time_from(governor::clock::QuantaClock::default().now());
            let retry_after = wait_time.as_secs().max(1);
            
            warn!(
                retry_after_secs = retry_after,
                "Rate limit exceeded"
            );

            let error_response = RateLimitError {
                error: "RATE_LIMIT_EXCEEDED",
                message: format!(
                    "Too many requests. Please retry after {} seconds.",
                    retry_after
                ),
                retry_after_secs: retry_after,
            };

            (
                StatusCode::TOO_MANY_REQUESTS,
                [("Retry-After", retry_after.to_string())],
                Json(error_response),
            )
                .into_response()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_rate_limiter() {
        let limiter = create_rate_limiter(100);
        
        // First request should succeed
        assert!(limiter.check().is_ok());
    }
}
