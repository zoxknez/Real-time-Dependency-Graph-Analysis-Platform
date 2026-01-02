//! Audit Logging Middleware
//!
//! Comprehensive audit logging for security and compliance:
//! - All API requests logged with correlation IDs
//! - Authentication events
//! - Authorization failures
//! - Rate limit violations
//! - GraphQL operation tracking

use axum::{
    body::Body,
    extract::Request,
    http::{header, StatusCode},
    middleware::Next,
    response::Response,
};
use serde::Serialize;
use std::time::Instant;
use tracing::{info, warn, Span};
use uuid::Uuid;

/// Audit event types
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AuditEventType {
    ApiRequest,
    AuthSuccess,
    AuthFailure,
    AuthorizationDenied,
    RateLimitExceeded,
    QueryExecuted,
    SubscriptionStarted,
    SubscriptionEnded,
    InvalidInput,
    SecurityViolation,
}

/// Audit log entry
#[derive(Debug, Serialize)]
pub struct AuditLogEntry {
    /// Unique event ID
    pub event_id: String,
    /// Request correlation ID
    pub correlation_id: String,
    /// Event type
    pub event_type: AuditEventType,
    /// Timestamp (ISO 8601)
    pub timestamp: String,
    /// Client IP address
    pub client_ip: Option<String>,
    /// User agent
    pub user_agent: Option<String>,
    /// Authenticated user ID
    pub user_id: Option<String>,
    /// HTTP method
    pub method: String,
    /// Request path
    pub path: String,
    /// HTTP status code
    pub status_code: Option<u16>,
    /// Response time in milliseconds
    pub duration_ms: Option<u64>,
    /// GraphQL operation name
    pub operation_name: Option<String>,
    /// GraphQL operation type
    pub operation_type: Option<String>,
    /// Additional context
    pub context: Option<serde_json::Value>,
}

impl AuditLogEntry {
    /// Create a new audit log entry
    pub fn new(
        event_type: AuditEventType,
        correlation_id: String,
        method: &str,
        path: &str,
    ) -> Self {
        Self {
            event_id: Uuid::new_v4().to_string(),
            correlation_id,
            event_type,
            timestamp: chrono::Utc::now().to_rfc3339(),
            client_ip: None,
            user_agent: None,
            user_id: None,
            method: method.to_string(),
            path: path.to_string(),
            status_code: None,
            duration_ms: None,
            operation_name: None,
            operation_type: None,
            context: None,
        }
    }

    /// Set client IP
    pub fn with_client_ip(mut self, ip: Option<String>) -> Self {
        self.client_ip = ip;
        self
    }

    /// Set user agent
    pub fn with_user_agent(mut self, ua: Option<String>) -> Self {
        self.user_agent = ua;
        self
    }

    /// Set user ID
    pub fn with_user_id(mut self, user_id: Option<String>) -> Self {
        self.user_id = user_id;
        self
    }

    /// Set status code
    pub fn with_status(mut self, status: StatusCode) -> Self {
        self.status_code = Some(status.as_u16());
        self
    }

    /// Set duration
    pub fn with_duration(mut self, duration_ms: u64) -> Self {
        self.duration_ms = Some(duration_ms);
        self
    }

    /// Set GraphQL operation
    pub fn with_operation(mut self, name: Option<String>, op_type: Option<String>) -> Self {
        self.operation_name = name;
        self.operation_type = op_type;
        self
    }

    /// Set additional context
    pub fn with_context(mut self, context: serde_json::Value) -> Self {
        self.context = Some(context);
        self
    }

    /// Log this entry
    pub fn log(&self) {
        let json = serde_json::to_string(self).unwrap_or_default();
        
        match self.event_type {
            AuditEventType::AuthFailure
            | AuditEventType::AuthorizationDenied
            | AuditEventType::RateLimitExceeded
            | AuditEventType::SecurityViolation => {
                warn!(
                    target: "audit",
                    event_type = ?self.event_type,
                    correlation_id = %self.correlation_id,
                    client_ip = ?self.client_ip,
                    user_id = ?self.user_id,
                    path = %self.path,
                    "{}", json
                );
            }
            _ => {
                info!(
                    target: "audit",
                    event_type = ?self.event_type,
                    correlation_id = %self.correlation_id,
                    client_ip = ?self.client_ip,
                    user_id = ?self.user_id,
                    path = %self.path,
                    status = ?self.status_code,
                    duration_ms = ?self.duration_ms,
                    "{}", json
                );
            }
        }
    }
}

/// Audit logging middleware
pub async fn audit_middleware(request: Request, next: Next) -> Response {
    let start = Instant::now();
    
    // Generate or extract correlation ID
    let correlation_id = request
        .headers()
        .get("x-correlation-id")
        .and_then(|v| v.to_str().ok())
        .map(String::from)
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    // Extract request info
    let method = request.method().to_string();
    let path = request.uri().path().to_string();
    let client_ip = extract_client_ip(&request);
    let user_agent = request
        .headers()
        .get(header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .map(String::from);

    // Add correlation ID to span
    let span = Span::current();
    span.record("correlation_id", &correlation_id);

    // Execute request
    let response = next.run(request).await;
    
    let duration = start.elapsed();
    let status = response.status();

    // Create audit entry
    let entry = AuditLogEntry::new(
        AuditEventType::ApiRequest,
        correlation_id.clone(),
        &method,
        &path,
    )
    .with_client_ip(client_ip)
    .with_user_agent(user_agent)
    .with_status(status)
    .with_duration(duration.as_millis() as u64);

    // Log the entry
    entry.log();

    // Add correlation ID to response headers
    let mut response = response;
    if let Ok(value) = header::HeaderValue::from_str(&correlation_id) {
        response.headers_mut().insert(
            header::HeaderName::from_static("x-correlation-id"),
            value,
        );
    }

    response
}

/// Extract client IP from request headers
fn extract_client_ip(request: &Request) -> Option<String> {
    // Check X-Forwarded-For first (for proxied requests)
    if let Some(forwarded_for) = request.headers().get("x-forwarded-for") {
        if let Ok(value) = forwarded_for.to_str() {
            // Take the first IP in the chain
            return value.split(',').next().map(|s| s.trim().to_string());
        }
    }

    // Check X-Real-IP
    if let Some(real_ip) = request.headers().get("x-real-ip") {
        if let Ok(value) = real_ip.to_str() {
            return Some(value.to_string());
        }
    }

    // Check CF-Connecting-IP (Cloudflare)
    if let Some(cf_ip) = request.headers().get("cf-connecting-ip") {
        if let Ok(value) = cf_ip.to_str() {
            return Some(value.to_string());
        }
    }

    None
}

/// Log security-related events
pub fn log_security_event(
    event_type: AuditEventType,
    correlation_id: &str,
    client_ip: Option<&str>,
    user_id: Option<&str>,
    context: Option<serde_json::Value>,
) {
    let entry = AuditLogEntry::new(
        event_type,
        correlation_id.to_string(),
        "SECURITY",
        "/",
    )
    .with_client_ip(client_ip.map(String::from))
    .with_user_id(user_id.map(String::from));

    let entry = if let Some(ctx) = context {
        entry.with_context(ctx)
    } else {
        entry
    };

    entry.log();
}

/// Log authentication events
pub fn log_auth_event(
    success: bool,
    correlation_id: &str,
    client_ip: Option<&str>,
    user_id: Option<&str>,
    reason: Option<&str>,
) {
    let event_type = if success {
        AuditEventType::AuthSuccess
    } else {
        AuditEventType::AuthFailure
    };

    let context = reason.map(|r| serde_json::json!({ "reason": r }));

    log_security_event(event_type, correlation_id, client_ip, user_id, context);
}

/// Log GraphQL operation
pub fn log_graphql_operation(
    correlation_id: &str,
    operation_name: Option<&str>,
    operation_type: &str,
    complexity: Option<u32>,
    duration_ms: u64,
) {
    let entry = AuditLogEntry::new(
        AuditEventType::QueryExecuted,
        correlation_id.to_string(),
        "POST",
        "/graphql",
    )
    .with_operation(
        operation_name.map(String::from),
        Some(operation_type.to_string()),
    )
    .with_duration(duration_ms)
    .with_context(serde_json::json!({
        "complexity": complexity,
    }));

    entry.log();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_audit_log_entry() {
        let entry = AuditLogEntry::new(
            AuditEventType::ApiRequest,
            "test-123".to_string(),
            "GET",
            "/health",
        )
        .with_status(StatusCode::OK)
        .with_duration(15);

        assert_eq!(entry.correlation_id, "test-123");
        assert_eq!(entry.method, "GET");
        assert_eq!(entry.status_code, Some(200));
        assert_eq!(entry.duration_ms, Some(15));
    }
}
