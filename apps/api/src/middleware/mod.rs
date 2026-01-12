//! API Middleware Modules
//!
//! Security and performance middleware for the GraphQL API:
//! - JWT Authentication
//! - Rate Limiting (local and distributed Redis-based)
//! - Query Complexity Analysis
//! - Security Headers (HSTS, CSP, X-Frame-Options, etc.)
//! - Audit Logging
//! - Input Validation

pub mod audit;
pub mod auth;
pub mod complexity;
pub mod distributed_rate_limit;
pub mod rate_limit;
pub mod rbac;
pub mod security_headers;
pub mod validation;

// Re-exports for convenience - these are available for external use
#[allow(unused_imports)]
pub use auth::{jwt_auth_middleware, optional_jwt_middleware, Claims, JwtConfig, JwtState};
#[allow(unused_imports)]
pub use complexity::{ComplexityCalculator, ComplexityConfig, ComplexityError};
pub use rate_limit::create_rate_limiter;
#[allow(unused_imports)]
pub use rate_limit::{rate_limit_middleware, ApiRateLimiter};

// Distributed rate limiting exports
#[allow(unused_imports)]
pub use distributed_rate_limit::{
    distributed_rate_limit_middleware, DistributedRateLimiter, DistributedRateLimiterConfig,
    RateLimitResult, RateTier,
};

// Security middleware exports
#[allow(unused_imports)]
pub use audit::{audit_middleware, log_graphql_operation, log_security_event, AuditEventType, AuditLogEntry};
#[allow(unused_imports)]
pub use security_headers::{SecurityHeadersConfig, SecurityHeadersLayer};
#[allow(unused_imports)]
pub use validation::{
    validate_package_id, validate_version, GraphQLRequest, InputValidator, ValidationConfig,
    ValidationError,
};
