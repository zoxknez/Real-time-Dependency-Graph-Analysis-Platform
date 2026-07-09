//! Tenant Context for Multi-Tenancy Support
//!
//! Provides tenant isolation and RBAC context for all requests.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use uuid::Uuid;

/// Permission types for RBAC
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Permission {
    // Package operations
    PackageRead,
    PackageWrite,
    PackageDelete,

    // Graph operations
    GraphQuery,
    GraphMutate,

    // Admin
    TenantAdmin,
    SystemAdmin,
    AuditView,
}

/// Rate limit tier for tenant
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RateTier {
    Free,
    Pro,
    Enterprise,
}

impl RateTier {
    /// Get requests per minute limit
    pub fn rpm_limit(&self) -> u32 {
        match self {
            RateTier::Free => 100,
            RateTier::Pro => 1000,
            RateTier::Enterprise => 10000,
        }
    }

    /// Get daily request limit
    pub fn daily_limit(&self) -> u32 {
        match self {
            RateTier::Free => 1000,
            RateTier::Pro => 50000,
            RateTier::Enterprise => 1000000,
        }
    }
}

/// Tenant context - single source of truth for request context
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TenantContext {
    /// Unique tenant identifier
    pub tenant_id: Uuid,
    /// Organization within tenant
    pub organization_id: Uuid,
    /// User making the request
    pub user_id: Uuid,
    /// Permissions for this user
    pub permissions: HashSet<Permission>,
    /// Rate limit tier
    pub rate_limit_tier: RateTier,
    /// Request ID for tracing
    pub request_id: Uuid,
}

impl TenantContext {
    /// Create a new tenant context
    pub fn new(
        tenant_id: Uuid,
        organization_id: Uuid,
        user_id: Uuid,
        permissions: HashSet<Permission>,
        rate_limit_tier: RateTier,
    ) -> Self {
        Self {
            tenant_id,
            organization_id,
            user_id,
            permissions,
            rate_limit_tier,
            request_id: Uuid::new_v4(),
        }
    }

    /// Check if user has permission
    pub fn has_permission(&self, permission: Permission) -> bool {
        self.permissions.contains(&permission)
            || self.permissions.contains(&Permission::SystemAdmin)
            || (self.permissions.contains(&Permission::TenantAdmin)
                && !matches!(permission, Permission::SystemAdmin))
    }

    /// Check if user has any of the permissions
    pub fn has_any_permission(&self, permissions: &[Permission]) -> bool {
        permissions.iter().any(|p| self.has_permission(*p))
    }

    /// Check if user has all permissions
    pub fn has_all_permissions(&self, permissions: &[Permission]) -> bool {
        permissions.iter().all(|p| self.has_permission(*p))
    }

    /// Create context from JWT claims (placeholder for future implementation)
    pub fn from_jwt_claims(_claims: &serde_json::Value) -> anyhow::Result<Self> {
        // TODO: Implement JWT parsing
        // For now, return a default context
        Ok(Self::default())
    }
}

impl Default for TenantContext {
    fn default() -> Self {
        Self {
            tenant_id: Uuid::new_v4(),
            organization_id: Uuid::new_v4(),
            user_id: Uuid::new_v4(),
            permissions: HashSet::new(),
            rate_limit_tier: RateTier::Free,
            request_id: Uuid::new_v4(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_has_permission() {
        let mut permissions = HashSet::new();
        permissions.insert(Permission::PackageRead);
        permissions.insert(Permission::GraphQuery);

        let context = TenantContext::new(
            Uuid::new_v4(),
            Uuid::new_v4(),
            Uuid::new_v4(),
            permissions,
            RateTier::Pro,
        );

        assert!(context.has_permission(Permission::PackageRead));
        assert!(context.has_permission(Permission::GraphQuery));
        assert!(!context.has_permission(Permission::PackageWrite));
    }

    #[test]
    fn test_system_admin_has_all_permissions() {
        let mut permissions = HashSet::new();
        permissions.insert(Permission::SystemAdmin);

        let context = TenantContext::new(
            Uuid::new_v4(),
            Uuid::new_v4(),
            Uuid::new_v4(),
            permissions,
            RateTier::Enterprise,
        );

        assert!(context.has_permission(Permission::PackageRead));
        assert!(context.has_permission(Permission::PackageWrite));
        assert!(context.has_permission(Permission::GraphMutate));
        assert!(context.has_permission(Permission::SystemAdmin));
    }

    #[test]
    fn test_tenant_admin_has_tenant_permissions() {
        let mut permissions = HashSet::new();
        permissions.insert(Permission::TenantAdmin);

        let context = TenantContext::new(
            Uuid::new_v4(),
            Uuid::new_v4(),
            Uuid::new_v4(),
            permissions,
            RateTier::Pro,
        );

        assert!(context.has_permission(Permission::PackageRead));
        assert!(context.has_permission(Permission::GraphQuery));
        assert!(!context.has_permission(Permission::SystemAdmin));
    }

    #[test]
    fn test_rate_tier_limits() {
        assert_eq!(RateTier::Free.rpm_limit(), 100);
        assert_eq!(RateTier::Pro.rpm_limit(), 1000);
        assert_eq!(RateTier::Enterprise.rpm_limit(), 10000);

        assert_eq!(RateTier::Free.daily_limit(), 1000);
        assert_eq!(RateTier::Pro.daily_limit(), 50000);
        assert_eq!(RateTier::Enterprise.daily_limit(), 1000000);
    }
}
