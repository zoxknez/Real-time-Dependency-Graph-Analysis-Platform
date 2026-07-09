//! RBAC (Role-Based Access Control) Guards for AsyncGraphQL
#![allow(dead_code)]
//!
//! Provides declarative permission checks for GraphQL resolvers using
//! AsyncGraphQL's guard system.

use async_graphql::{Context, ErrorExtensions, Guard, Result as GqlResult};
use models::tenant::{Permission, TenantContext};

/// Guard that requires specific permissions to access a resolver
///
/// # Example
/// ```rust,ignore
/// use crate::middleware::rbac::RequirePermission;
/// use models::tenant::Permission;
///
/// #[Object]
/// impl QueryRoot {
///     #[graphql(guard = "RequirePermission::one(Permission::PackageRead)")]
///     async fn package(&self, ctx: &Context<'_>, id: ID) -> Result<Package> {
///         // ...
///     }
/// }
/// ```
pub struct RequirePermission {
    permissions: Vec<Permission>,
}

impl RequirePermission {
    /// Create a guard requiring any of the given permissions
    pub fn new(permissions: Vec<Permission>) -> Self {
        Self { permissions }
    }

    /// Create a guard requiring a single permission
    pub fn one(permission: Permission) -> Self {
        Self {
            permissions: vec![permission],
        }
    }

    /// Create a guard requiring multiple permissions (any of them)
    pub fn any(permissions: Vec<Permission>) -> Self {
        Self { permissions }
    }
}

impl Guard for RequirePermission {
    async fn check(&self, ctx: &Context<'_>) -> GqlResult<()> {
        // Extract tenant context from GraphQL context
        let tenant_ctx = ctx.data::<Option<TenantContext>>().map_err(|_| {
            async_graphql::Error::new("Internal error: TenantContext not found in context")
                .extend_with(|_, ext: &mut async_graphql::ErrorExtensionValues| {
                    ext.set("code", "INTERNAL_ERROR");
                })
        })?;

        match tenant_ctx {
            Some(ctx) => {
                // Check if user has ANY of the required permissions
                // TenantContext::has_any_permission handles permission inheritance
                let has_permission = ctx.has_any_permission(&self.permissions);

                if has_permission {
                    Ok(())
                } else {
                    Err(
                        async_graphql::Error::new("Insufficient permissions").extend_with(
                            |_, ext: &mut async_graphql::ErrorExtensionValues| {
                                ext.set("code", "FORBIDDEN");
                                ext.set("required_permissions", format!("{:?}", self.permissions));
                            },
                        ),
                    )
                }
            }
            None => {
                // No tenant context = unauthenticated request
                Err(
                    async_graphql::Error::new("Authentication required").extend_with(
                        |_, ext: &mut async_graphql::ErrorExtensionValues| {
                            ext.set("code", "UNAUTHENTICATED");
                        },
                    ),
                )
            }
        }
    }
}

/// Guard that requires ALL of the specified permissions
///
/// # Example
/// ```rust,ignore
/// use crate::middleware::rbac::RequireAllPermissions;
/// use models::tenant::Permission;
///
/// #[Object]
/// impl MutationRoot {
///     #[graphql(guard = "RequireAllPermissions::new(vec![Permission::PackageWrite, Permission::GraphMutate])")]
///     async fn update_package(&self, ctx: &Context<'_>, input: UpdatePackageInput) -> Result<Package> {
///         // ...
///     }
/// }
/// ```
pub struct RequireAllPermissions {
    permissions: Vec<Permission>,
}

impl RequireAllPermissions {
    /// Create a guard requiring all of the given permissions
    pub fn new(permissions: Vec<Permission>) -> Self {
        Self { permissions }
    }
}

impl Guard for RequireAllPermissions {
    async fn check(&self, ctx: &Context<'_>) -> GqlResult<()> {
        let tenant_ctx = ctx.data::<Option<TenantContext>>().map_err(|_| {
            async_graphql::Error::new("Internal error: TenantContext not found in context")
                .extend_with(|_, ext: &mut async_graphql::ErrorExtensionValues| {
                    ext.set("code", "INTERNAL_ERROR");
                })
        })?;

        match tenant_ctx {
            Some(ctx) => {
                // Check if user has ALL of the required permissions
                let has_all = ctx.has_all_permissions(&self.permissions);

                if has_all {
                    Ok(())
                } else {
                    Err(
                        async_graphql::Error::new("Insufficient permissions").extend_with(
                            |_, ext: &mut async_graphql::ErrorExtensionValues| {
                                ext.set("code", "FORBIDDEN");
                                ext.set("required_permissions", format!("{:?}", self.permissions));
                            },
                        ),
                    )
                }
            }
            None => Err(
                async_graphql::Error::new("Authentication required").extend_with(
                    |_, ext: &mut async_graphql::ErrorExtensionValues| {
                        ext.set("code", "UNAUTHENTICATED");
                    },
                ),
            ),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use async_graphql::{EmptyMutation, EmptySubscription, Object, Schema};
    use models::tenant::{Permission, RateTier, TenantContext};
    use std::collections::HashSet;
    use uuid::Uuid;

    struct TestQuery;

    #[Object]
    impl TestQuery {
        #[graphql(guard = "RequirePermission::one(Permission::PackageRead)")]
        async fn protected_query(&self) -> String {
            "success".to_string()
        }

        #[graphql(guard = "RequirePermission::one(Permission::SystemAdmin)")]
        async fn admin_query(&self) -> String {
            "admin success".to_string()
        }

        #[graphql(
            guard = "RequireAllPermissions::new(vec![Permission::PackageRead, Permission::GraphQuery])"
        )]
        async fn multi_permission_query(&self) -> String {
            "multi success".to_string()
        }

        async fn public_query(&self) -> String {
            "public".to_string()
        }
    }

    fn create_schema() -> Schema<TestQuery, EmptyMutation, EmptySubscription> {
        Schema::build(TestQuery, EmptyMutation, EmptySubscription).finish()
    }

    fn create_context_with_permissions(permissions: Vec<Permission>) -> TenantContext {
        let mut perm_set = HashSet::new();
        for p in permissions {
            perm_set.insert(p);
        }

        TenantContext::new(
            Uuid::new_v4(),
            Uuid::new_v4(),
            Uuid::new_v4(),
            perm_set,
            RateTier::Pro,
        )
    }

    #[tokio::test]
    async fn test_permission_guard_allows_authorized() {
        let schema = create_schema();
        let ctx = create_context_with_permissions(vec![Permission::PackageRead]);

        let query = "{ protectedQuery }";
        let result = schema
            .execute(async_graphql::Request::new(query).data(Some(ctx)))
            .await;

        assert!(result.errors.is_empty());
        assert_eq!(result.data.to_string(), r#"{protectedQuery: "success"}"#);
    }

    #[tokio::test]
    async fn test_permission_guard_denies_unauthorized() {
        let schema = create_schema();
        let ctx = create_context_with_permissions(vec![Permission::GraphQuery]);

        let query = "{ protectedQuery }";
        let result = schema
            .execute(async_graphql::Request::new(query).data(Some(ctx)))
            .await;

        assert!(!result.errors.is_empty());
        assert!(
            result.errors[0]
                .message
                .contains("Insufficient permissions")
        );
    }

    #[tokio::test]
    async fn test_system_admin_has_all_permissions() {
        let schema = create_schema();
        let ctx = create_context_with_permissions(vec![Permission::SystemAdmin]);

        let query = "{ protectedQuery adminQuery }";
        let result = schema
            .execute(async_graphql::Request::new(query).data(Some(ctx)))
            .await;

        assert!(result.errors.is_empty());
    }

    #[tokio::test]
    async fn test_unauthenticated_denied() {
        let schema = create_schema();

        let query = "{ protectedQuery }";
        let result = schema
            .execute(async_graphql::Request::new(query).data(None::<TenantContext>))
            .await;

        assert!(!result.errors.is_empty());
        assert!(result.errors[0].message.contains("Authentication required"));
    }

    #[tokio::test]
    async fn test_public_query_allows_unauthenticated() {
        let schema = create_schema();

        let query = "{ publicQuery }";
        let result = schema
            .execute(async_graphql::Request::new(query).data(None::<TenantContext>))
            .await;

        assert!(result.errors.is_empty());
        assert_eq!(result.data.to_string(), r#"{publicQuery: "public"}"#);
    }

    #[tokio::test]
    async fn test_all_permissions_guard_requires_all() {
        let schema = create_schema();

        // Has only one of the required permissions
        let ctx = create_context_with_permissions(vec![Permission::PackageRead]);
        let query = "{ multiPermissionQuery }";
        let result = schema
            .execute(async_graphql::Request::new(query).data(Some(ctx)))
            .await;

        assert!(!result.errors.is_empty());

        // Has both required permissions
        let ctx =
            create_context_with_permissions(vec![Permission::PackageRead, Permission::GraphQuery]);
        let result = schema
            .execute(async_graphql::Request::new(query).data(Some(ctx)))
            .await;

        assert!(result.errors.is_empty());
    }
}
