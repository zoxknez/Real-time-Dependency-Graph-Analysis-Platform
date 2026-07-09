//! API Middleware Modules
//!
//! Security and performance middleware for the GraphQL API:
//! - JWT Authentication
//! - Rate Limiting (local and distributed Redis-based)
//! - Query Complexity Analysis
//! - Security Headers (HSTS, CSP, X-Frame-Options, etc.)
//! - Audit Logging
//! - Input Validation
//! - WebSocket Rate Limiting

pub mod audit;
pub mod auth;
pub mod complexity;
pub mod distributed_rate_limit;
pub mod rate_limit;
pub mod rbac;
pub mod security_headers;
pub mod validation;
pub mod ws_rate_limit;

// Re-exports for convenience - these are available for external use
#[allow(unused_imports)]
pub use auth::{Claims, JwtConfig, JwtState, jwt_auth_middleware, optional_jwt_middleware};
#[allow(unused_imports)]
pub use complexity::{ComplexityCalculator, ComplexityConfig, ComplexityError};
pub use rate_limit::create_rate_limiter;
#[allow(unused_imports)]
pub use rate_limit::{ApiRateLimiter, rate_limit_middleware};

// Distributed rate limiting exports
#[allow(unused_imports)]
pub use distributed_rate_limit::{
    DistributedRateLimiter, DistributedRateLimiterConfig, RateLimitResult, RateTier,
    distributed_rate_limit_middleware,
};

// Security middleware exports
#[allow(unused_imports)]
pub use audit::{
    AuditEventType, AuditLogEntry, audit_middleware, log_graphql_operation, log_security_event,
};
#[allow(unused_imports)]
pub use security_headers::{SecurityHeadersConfig, SecurityHeadersLayer};
#[allow(unused_imports)]
pub use validation::{
    GraphQLRequest, InputValidator, ValidationConfig, ValidationError, validate_package_id,
    validate_version,
};

// WebSocket rate limiting exports
#[allow(unused_imports)]
pub use ws_rate_limit::{
    ConnectionStats, WsRateLimitConfig, WsRateLimiter, get_ws_rate_limiter, init_ws_rate_limiter,
};
