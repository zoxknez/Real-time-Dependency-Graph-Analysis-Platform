//! Security Headers Middleware
//!
//! Adds enterprise security headers to all responses:
//! - Content-Security-Policy
//! - X-Frame-Options
//! - X-Content-Type-Options
//! - Strict-Transport-Security
//! - X-XSS-Protection
//! - Referrer-Policy
//! - Permissions-Policy

use axum::http::{HeaderValue, Request, Response, header::HeaderName};
use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll};
use tower::{Layer, Service};

/// Security headers configuration
#[derive(Debug, Clone)]
pub struct SecurityHeadersConfig {
    /// Enable HSTS (Strict-Transport-Security)
    pub hsts_enabled: bool,
    /// HSTS max-age in seconds (default: 1 year)
    pub hsts_max_age: u64,
    /// Include subdomains in HSTS
    pub hsts_include_subdomains: bool,
    /// Content-Security-Policy value
    pub csp: Option<String>,
    /// X-Frame-Options value
    pub frame_options: String,
    /// Referrer-Policy value
    pub referrer_policy: String,
    /// Permissions-Policy value
    pub permissions_policy: Option<String>,
}

impl Default for SecurityHeadersConfig {
    fn default() -> Self {
        Self {
            hsts_enabled: true,
            hsts_max_age: 31536000, // 1 year
            hsts_include_subdomains: true,
            csp: Some("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' ws: wss: http://localhost:* https://localhost:*".to_string()),
            frame_options: "DENY".to_string(),
            referrer_policy: "strict-origin-when-cross-origin".to_string(),
            permissions_policy: Some("accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()".to_string()),
        }
    }
}

/// Security headers layer
#[derive(Clone)]
pub struct SecurityHeadersLayer {
    config: SecurityHeadersConfig,
}

impl SecurityHeadersLayer {
    #[allow(dead_code)]
    pub fn new(config: SecurityHeadersConfig) -> Self {
        Self { config }
    }

    pub fn default_headers() -> Self {
        Self {
            config: SecurityHeadersConfig::default(),
        }
    }
}

impl<S> Layer<S> for SecurityHeadersLayer {
    type Service = SecurityHeadersMiddleware<S>;

    fn layer(&self, inner: S) -> Self::Service {
        SecurityHeadersMiddleware {
            inner,
            config: self.config.clone(),
        }
    }
}

/// Security headers middleware service
#[derive(Clone)]
pub struct SecurityHeadersMiddleware<S> {
    inner: S,
    config: SecurityHeadersConfig,
}

impl<S, ReqBody, ResBody> Service<Request<ReqBody>> for SecurityHeadersMiddleware<S>
where
    S: Service<Request<ReqBody>, Response = Response<ResBody>> + Clone + Send + 'static,
    S::Future: Send,
    ReqBody: Send + 'static,
    ResBody: Send + 'static,
{
    type Response = S::Response;
    type Error = S::Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>> + Send>>;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, request: Request<ReqBody>) -> Self::Future {
        let config = self.config.clone();
        let future = self.inner.call(request);

        Box::pin(async move {
            let mut response = future.await?;
            let headers = response.headers_mut();

            // X-Content-Type-Options
            headers.insert(
                HeaderName::from_static("x-content-type-options"),
                HeaderValue::from_static("nosniff"),
            );

            // X-Frame-Options
            if let Ok(value) = HeaderValue::from_str(&config.frame_options) {
                headers.insert(HeaderName::from_static("x-frame-options"), value);
            }

            // X-XSS-Protection
            headers.insert(
                HeaderName::from_static("x-xss-protection"),
                HeaderValue::from_static("1; mode=block"),
            );

            // Referrer-Policy
            if let Ok(value) = HeaderValue::from_str(&config.referrer_policy) {
                headers.insert(HeaderName::from_static("referrer-policy"), value);
            }

            // Strict-Transport-Security (HSTS)
            if config.hsts_enabled {
                let hsts_value = if config.hsts_include_subdomains {
                    format!(
                        "max-age={}; includeSubDomains; preload",
                        config.hsts_max_age
                    )
                } else {
                    format!("max-age={}", config.hsts_max_age)
                };
                if let Ok(value) = HeaderValue::from_str(&hsts_value) {
                    headers.insert(HeaderName::from_static("strict-transport-security"), value);
                }
            }

            // Content-Security-Policy
            if let Some(ref csp) = config.csp {
                if let Ok(value) = HeaderValue::from_str(csp) {
                    headers.insert(HeaderName::from_static("content-security-policy"), value);
                }
            }

            // Permissions-Policy
            if let Some(ref policy) = config.permissions_policy {
                if let Ok(value) = HeaderValue::from_str(policy) {
                    headers.insert(HeaderName::from_static("permissions-policy"), value);
                }
            }

            // Cache-Control for API responses
            headers.insert(
                HeaderName::from_static("cache-control"),
                HeaderValue::from_static("no-store, no-cache, must-revalidate, private"),
            );

            // Remove server header
            headers.remove(HeaderName::from_static("server"));

            Ok(response)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = SecurityHeadersConfig::default();
        assert!(config.hsts_enabled);
        assert_eq!(config.hsts_max_age, 31536000);
        assert_eq!(config.frame_options, "DENY");
    }
}
