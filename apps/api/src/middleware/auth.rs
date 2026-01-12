//! JWT Authentication Middleware
//!
//! Features:
//! - JWT token validation (HS256, RS256)
//! - Token extraction from Authorization header
//! - Claims extraction and injection into request
//! - Optional authentication (public endpoints)

#![allow(dead_code)]

use axum::{
    body::Body,
    extract::{Request, State},
    http::{header, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::{debug, warn};
use models::tenant::{TenantContext, Permission, RateTier};
use std::collections::HashSet;
use uuid::Uuid;

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

/// JWT configuration
#[derive(Debug, Clone)]
pub struct JwtConfig {
    /// Secret key for HS256 (or public key for RS256)
    pub secret: String,
    /// Algorithm to use
    pub algorithm: Algorithm,
    /// Issuer to validate
    pub issuer: Option<String>,
    /// Audience to validate
    pub audience: Option<String>,
    /// Whether to validate expiration
    pub validate_exp: bool,
}

impl Default for JwtConfig {
    fn default() -> Self {
        Self {
            secret: std::env::var("JWT_SECRET").unwrap_or_else(|_| "development-secret".to_string()),
            algorithm: Algorithm::HS256,
            issuer: std::env::var("JWT_ISSUER").ok(),
            audience: std::env::var("JWT_AUDIENCE").ok(),
            validate_exp: true,
        }
    }
}

/// JWT state for middleware
pub type JwtState = Arc<JwtConfig>;

// ═══════════════════════════════════════════════════════════════
// CLAIMS
// ═══════════════════════════════════════════════════════════════

/// Standard JWT claims
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    /// Subject (user ID)
    pub sub: String,
    /// Expiration time (Unix timestamp)
    pub exp: u64,
    /// Issued at (Unix timestamp)
    pub iat: u64,
    /// Issuer
    #[serde(skip_serializing_if = "Option::is_none")]
    pub iss: Option<String>,
    /// Audience
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aud: Option<String>,
    /// User roles
    #[serde(default)]
    pub roles: Vec<String>,
    /// API tier (free, pro, enterprise)
    #[serde(default = "default_tier")]
    pub tier: String,
    /// Tenant ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tenant_id: Option<Uuid>,
    /// Organization ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub org_id: Option<Uuid>,
}

fn default_tier() -> String {
    "free".to_string()
}

impl Claims {
    /// Check if user has a specific role
    pub fn has_role(&self, role: &str) -> bool {
        self.roles.iter().any(|r| r == role)
    }

    /// Check if user is admin
    pub fn is_admin(&self) -> bool {
        self.has_role("admin")
    }

    /// Get rate limit based on tier
    pub fn rate_limit(&self) -> u32 {
        match self.tier.as_str() {
            "enterprise" => 10000,
            "pro" => 1000,
            _ => 100,
        }
    }


    /// Convert claims to TenantContext
    pub fn to_tenant_context(&self) -> TenantContext {
        let tenant_id = self.tenant_id.unwrap_or_else(Uuid::new_v4);
        let org_id = self.org_id.unwrap_or_else(Uuid::new_v4);
        let user_id = Uuid::parse_str(&self.sub).unwrap_or_else(|_| Uuid::new_v4());

        let mut permissions = HashSet::new();
        
        // Map roles to permissions
        for role in &self.roles {
            match role.as_str() {
                "admin" => {
                    permissions.insert(Permission::SystemAdmin);
                    permissions.insert(Permission::TenantAdmin);
                    permissions.insert(Permission::PackageWrite);
                    permissions.insert(Permission::PackageDelete);
                    permissions.insert(Permission::GraphMutate);
                }
                "user" => {
                    permissions.insert(Permission::PackageRead);
                    permissions.insert(Permission::GraphQuery);
                }
                _ => {}
            }
        }

        // Map tier
        let rate_tier = match self.tier.as_str() {
            "enterprise" => RateTier::Enterprise,
            "pro" => RateTier::Pro,
            _ => RateTier::Free,
        };

        TenantContext::new(tenant_id, org_id, user_id, permissions, rate_tier)
    }
}

// ═══════════════════════════════════════════════════════════════
// ERROR RESPONSE
// ═══════════════════════════════════════════════════════════════

#[derive(Serialize)]
pub struct AuthError {
    pub error: &'static str,
    pub message: String,
}

// ═══════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════

/// Required JWT authentication middleware
/// Returns 401 if no valid token is provided
pub async fn jwt_auth_middleware(
    State(config): State<JwtState>,
    mut request: Request<Body>,
    next: Next,
) -> Response {
    match extract_and_validate_token(&config, &request) {
        Ok(claims) => {
            // Create tenant context
            let tenant_context = claims.to_tenant_context();
            
            // Inject claims and context into request extensions
            request.extensions_mut().insert(claims);
            request.extensions_mut().insert::<Option<TenantContext>>(Some(tenant_context));
            next.run(request).await
        }
        Err(error) => error.into_response(),
    }
}

/// Optional JWT authentication middleware
/// Continues without claims if no token is provided
pub async fn optional_jwt_middleware(
    State(config): State<JwtState>,
    mut request: Request<Body>,
    next: Next,
) -> Response {
    // Try to extract token, but don't fail if missing
    if let Ok(claims) = extract_and_validate_token(&config, &request) {
        let tenant_context = claims.to_tenant_context();
        request.extensions_mut().insert(claims);
        request.extensions_mut().insert::<Option<TenantContext>>(Some(tenant_context));
    } else {
        request.extensions_mut().insert::<Option<TenantContext>>(None);
    }
    next.run(request).await
}

/// Extract and validate JWT token from request
fn extract_and_validate_token(
    config: &JwtConfig,
    request: &Request<Body>,
) -> Result<Claims, (StatusCode, Json<AuthError>)> {
    // Extract token from Authorization header
    let token = extract_bearer_token(request)?;

    // Build validation
    let mut validation = Validation::new(config.algorithm);
    validation.validate_exp = config.validate_exp;

    if let Some(ref iss) = config.issuer {
        validation.set_issuer(&[iss]);
    }

    if let Some(ref aud) = config.audience {
        validation.set_audience(&[aud]);
    }

    // Decode and validate token
    let decoding_key = DecodingKey::from_secret(config.secret.as_bytes());

    match decode::<Claims>(&token, &decoding_key, &validation) {
        Ok(token_data) => {
            debug!(sub = %token_data.claims.sub, "Token validated successfully");
            Ok(token_data.claims)
        }
        Err(e) => {
            warn!(error = %e, "Token validation failed");
            Err((
                StatusCode::UNAUTHORIZED,
                Json(AuthError {
                    error: "INVALID_TOKEN",
                    message: format!("Token validation failed: {}", e),
                }),
            ))
        }
    }
}

/// Extract Bearer token from Authorization header
fn extract_bearer_token(request: &Request<Body>) -> Result<String, (StatusCode, Json<AuthError>)> {
    let auth_header = request
        .headers()
        .get(header::AUTHORIZATION)
        .ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                Json(AuthError {
                    error: "MISSING_TOKEN",
                    message: "Authorization header is required".to_string(),
                }),
            )
        })?;

    let auth_str = auth_header.to_str().map_err(|_| {
        (
            StatusCode::UNAUTHORIZED,
            Json(AuthError {
                error: "INVALID_HEADER",
                message: "Authorization header contains invalid characters".to_string(),
            }),
        )
    })?;

    if !auth_str.starts_with("Bearer ") {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(AuthError {
                error: "INVALID_SCHEME",
                message: "Authorization header must use Bearer scheme".to_string(),
            }),
        ));
    }

    Ok(auth_str[7..].to_string())
}

// ═══════════════════════════════════════════════════════════════
// ROLE-BASED ACCESS
// ═══════════════════════════════════════════════════════════════

/// Middleware to require specific role
pub fn require_role(required_role: &'static str) -> impl Fn(Request<Body>, Next) -> std::pin::Pin<Box<dyn std::future::Future<Output = Response> + Send>> + Clone {
    move |request: Request<Body>, next: Next| {
        let role = required_role;
        Box::pin(async move {
            let claims = request.extensions().get::<Claims>();

            match claims {
                Some(c) if c.has_role(role) => next.run(request).await,
                Some(_) => (
                    StatusCode::FORBIDDEN,
                    Json(AuthError {
                        error: "INSUFFICIENT_PERMISSIONS",
                        message: format!("Role '{}' is required", role),
                    }),
                )
                    .into_response(),
                None => (
                    StatusCode::UNAUTHORIZED,
                    Json(AuthError {
                        error: "NOT_AUTHENTICATED",
                        message: "Authentication required".to_string(),
                    }),
                )
                    .into_response(),
            }
        })
    }
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;
    use jsonwebtoken::{encode, EncodingKey, Header};

    fn create_test_token(claims: &Claims, secret: &str) -> String {
        encode(
            &Header::default(),
            claims,
            &EncodingKey::from_secret(secret.as_bytes()),
        )
        .unwrap()
    }

    #[test]
    fn test_claims_has_role() {
        let claims = Claims {
            sub: "user123".to_string(),
            exp: 9999999999,
            iat: 0,
            iss: None,
            aud: None,
            roles: vec!["admin".to_string(), "user".to_string()],
            tier: "pro".to_string(),
            tenant_id: None,
            org_id: None,
        };

        assert!(claims.has_role("admin"));
        assert!(claims.has_role("user"));
        assert!(!claims.has_role("superadmin"));
    }

    #[test]
    fn test_claims_rate_limit() {
        let free = Claims {
            sub: "u1".to_string(),
            exp: 0,
            iat: 0,
            iss: None,
            aud: None,
            roles: vec![],
            tier: "free".to_string(),
            tenant_id: None,
            org_id: None,
        };
        assert_eq!(free.rate_limit(), 100);

        let pro = Claims { tier: "pro".to_string(), ..free.clone() };
        assert_eq!(pro.rate_limit(), 1000);

        let enterprise = Claims { tier: "enterprise".to_string(), ..free };
        assert_eq!(enterprise.rate_limit(), 10000);
    }

    #[test]
    fn test_token_encoding() {
        let claims = Claims {
            sub: "test".to_string(),
            exp: 9999999999,
            iat: 0,
            iss: Some("test-issuer".to_string()),
            aud: None,
            roles: vec![],
            tier: "free".to_string(),
            tenant_id: None,
            org_id: None,
        };

        let token = create_test_token(&claims, "secret");
        assert!(!token.is_empty());
        assert!(token.contains('.'));
    }
}
