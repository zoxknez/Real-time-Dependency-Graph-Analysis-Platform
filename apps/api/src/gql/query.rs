//! GraphQL Query Root - all read operations
//!
//! Implements the enterprise spec:
//! - package(id)
//! - reverseDependents(packageId, maxDepth, first, after)
//! - dependencyPath(fromPackageId, toPackageId, maxHops)
//! - impactRadius(packageId, vulnerableVersionRange, maxDepth, limit)

use async_graphql::{Context, Object, Result, ID};
use tracing::{debug, instrument};

use crate::gql::context::GqlContext;
use crate::gql::types::*;
use crate::graph::GraphQueries;

pub struct QueryRoot;

#[Object]
impl QueryRoot {
    /// Get a package by its stable ID (e.g., "npm:express")
    #[instrument(skip(self, ctx))]
    async fn package(&self, ctx: &Context<'_>, id: ID) -> Result<Option<Package>> {
        let gql_ctx = ctx.data::<GqlContext>()?;
        let pkg = gql_ctx.package_loader.load(&id.to_string()).await;
        Ok(pkg)
    }

    /// Get all packages that depend on a given package (reverse dependencies)
    ///
    /// # Arguments
    /// * `package_id` - The package to find dependents for (e.g., "npm:lodash")
    /// * `max_depth` - Maximum traversal depth (default: 2, max: configurable)
    /// * `first` - Number of results to return (for pagination)
    /// * `after` - Cursor for pagination (base64 encoded offset)
    #[instrument(skip(self, ctx))]
    async fn reverse_dependents(
        &self,
        ctx: &Context<'_>,
        package_id: ID,
        #[graphql(default = 2)] max_depth: i32,
        #[graphql(default = 50)] first: i32,
        after: Option<String>,
    ) -> Result<PackageConnection> {
        let gql_ctx = ctx.data::<GqlContext>()?;
        let guardrails = &gql_ctx.guardrails;

        // Apply guardrails
        let effective_depth = max_depth.min(guardrails.max_traversal_depth);
        let effective_limit = first.min(guardrails.max_results);
        
        // Parse cursor for offset
        let offset: i32 = after
            .and_then(|c| base64_decode_cursor(&c))
            .unwrap_or(0);

        debug!(
            effective_depth,
            effective_limit,
            offset,
            "Executing reverseDependents query"
        );

        // Execute query
        let query = GraphQueries::reverse_dependents_transitive(
            &package_id.to_string(),
            effective_depth,
            effective_limit + 1, // +1 to check if there's a next page
        );

        let rows = gql_ctx.graph.query(query).await?;
        
        // Check if there's a next page
        let has_next_page = rows.len() as i32 > effective_limit;
        let rows: Vec<_> = rows.into_iter().take(effective_limit as usize).collect();

        // Build edges
        let mut edges = Vec::with_capacity(rows.len());
        for (idx, row) in rows.iter().enumerate() {
            let id: String = row.get("id").unwrap_or_default();
            let depth: i64 = row.get("depth").unwrap_or(1);
            
            let pkg = Package {
                id: ID(id.clone()),
                ecosystem: Ecosystem::from(
                    row.get::<String>("ecosystem")
                        .unwrap_or_default()
                        .as_str(),
                ),
                name: row.get::<String>("name").unwrap_or_default(),
                created_at: None,
                updated_at: None,
            };

            edges.push(PackageEdge {
                node: pkg,
                cursor: base64_encode_cursor(offset + idx as i32),
                depth: Some(depth as i32),
            });
        }

        // Get total count (separate query, could be cached)
        let count_query = GraphQueries::reverse_dependents_count(
            &package_id.to_string(),
            effective_depth,
        );
        let total_count = match gql_ctx.graph.query_one(count_query).await? {
            Some(row) => row.get::<i64>("total").unwrap_or(0) as i32,
            None => 0,
        };

        // Extract cursors before moving edges
        let start_cursor = edges.first().map(|e| e.cursor.clone());
        let end_cursor = edges.last().map(|e| e.cursor.clone());

        Ok(PackageConnection {
            edges,
            page_info: PageInfo {
                has_next_page,
                has_previous_page: offset > 0,
                start_cursor,
                end_cursor,
            },
            total_count,
        })
    }

    /// Find the shortest dependency path between two packages
    ///
    /// # Arguments
    /// * `from_package_id` - Starting package (e.g., "npm:express")
    /// * `to_package_id` - Target package (e.g., "npm:lodash")
    /// * `max_hops` - Maximum path length to search (default: 6)
    #[instrument(skip(self, ctx))]
    async fn dependency_path(
        &self,
        ctx: &Context<'_>,
        from_package_id: ID,
        to_package_id: ID,
        #[graphql(default = 6)] max_hops: i32,
    ) -> Result<DependencyPathResult> {
        let gql_ctx = ctx.data::<GqlContext>()?;
        let guardrails = &gql_ctx.guardrails;

        // Apply guardrails
        let effective_hops = max_hops.min(guardrails.max_path_hops);

        debug!(effective_hops, "Executing dependencyPath query");

        let query = GraphQueries::dependency_path(
            &from_package_id.to_string(),
            &to_package_id.to_string(),
            effective_hops,
        );

        match gql_ctx.graph.query_one(query).await? {
            Some(row) => {
                let package_ids: Vec<String> = row.get("package_ids").unwrap_or_default();
                let hops: i64 = row.get("hops").unwrap_or(0);

                // Batch load packages
                let packages_map = gql_ctx.package_loader.load_many(&package_ids).await;
                
                // Preserve order
                let packages: Vec<Package> = package_ids
                    .iter()
                    .filter_map(|id| packages_map.get(id).cloned())
                    .collect();

                Ok(DependencyPathResult {
                    found: true,
                    hops: hops as i32,
                    packages,
                })
            }
            None => Ok(DependencyPathResult {
                found: false,
                hops: 0,
                packages: vec![],
            }),
        }
    }

    /// Calculate the impact radius of a vulnerability in a package
    ///
    /// Returns all packages that would be transitively affected if a CVE
    /// is discovered in the specified package/version range.
    ///
    /// # Arguments
    /// * `package_id` - The vulnerable package
    /// * `vulnerable_version_range` - Semver range (e.g., ">=1.2.0 <1.2.5") - for reference only in MVP
    /// * `max_depth` - Maximum traversal depth (default: 3)
    /// * `limit` - Maximum impacted packages to return (default: 5000)
    #[instrument(skip(self, ctx))]
    async fn impact_radius(
        &self,
        ctx: &Context<'_>,
        package_id: ID,
        vulnerable_version_range: Option<String>,
        #[graphql(default = 3)] max_depth: i32,
        #[graphql(default = 5000)] limit: i32,
    ) -> Result<ImpactRadiusResult> {
        let gql_ctx = ctx.data::<GqlContext>()?;
        let guardrails = &gql_ctx.guardrails;

        // Apply guardrails
        let effective_depth = max_depth.min(guardrails.max_traversal_depth);
        let effective_limit = limit.min(guardrails.max_results);

        debug!(
            effective_depth,
            effective_limit,
            "Executing impactRadius query"
        );

        // Get impacted packages with depth
        let query = GraphQueries::impact_radius(
            &package_id.to_string(),
            effective_depth,
            effective_limit,
        );

        let rows = gql_ctx.graph.query(query).await?;

        // Build top impacted list
        let mut top_impacted = Vec::with_capacity(rows.len());
        for row in &rows {
            let id: String = row.get("id").unwrap_or_default();
            let depth: i64 = row.get("depth").unwrap_or(1);

            let pkg = Package {
                id: ID(id.clone()),
                ecosystem: Ecosystem::from(
                    row.get::<String>("ecosystem")
                        .unwrap_or_default()
                        .as_str(),
                ),
                name: row.get::<String>("name").unwrap_or_default(),
                created_at: None,
                updated_at: None,
            };

            top_impacted.push(ImpactNode {
                package: pkg,
                depth: depth as i32,
                estimated_affected_versions: None, // Would need separate query
            });
        }

        // Get total counts
        let count_query = GraphQueries::impact_radius_versions(
            &package_id.to_string(),
            effective_depth,
        );
        
        let (impacted_packages, impacted_versions) = match gql_ctx.graph.query_one(count_query).await? {
            Some(row) => (
                row.get::<i64>("impacted_packages").unwrap_or(0) as i32,
                row.get::<i64>("impacted_versions").unwrap_or(0) as i32,
            ),
            None => (0, 0),
        };

        Ok(ImpactRadiusResult {
            package_id,
            vulnerable_version_range,
            max_depth: effective_depth,
            impacted_packages,
            impacted_versions,
            top_impacted,
        })
    }

    /// Get versions of a package
    #[instrument(skip(self, ctx))]
    async fn versions(
        &self,
        ctx: &Context<'_>,
        package_id: ID,
        #[graphql(default = 50)] limit: i32,
    ) -> Result<Vec<Version>> {
        let gql_ctx = ctx.data::<GqlContext>()?;
        let effective_limit = limit.min(gql_ctx.guardrails.max_results);

        let query = GraphQueries::get_versions(&package_id.to_string(), effective_limit);
        let rows = gql_ctx.graph.query(query).await?;

        let versions: Vec<Version> = rows
            .iter()
            .map(|row| Version {
                id: ID(row.get::<String>("id").unwrap_or_default()),
                package_id: package_id.clone(),
                version: row.get("version").unwrap_or_default(),
                published_at: row.get::<i64>("published_at")
                    .ok()
                    .map(|ts| chrono::DateTime::from_timestamp_millis(ts)
                        .map(|dt| dt.to_rfc3339())
                        .unwrap_or_default()),
                yanked: row.get("yanked").unwrap_or(false),
            })
            .collect();

        Ok(versions)
    }

    /// Get direct dependencies of a package
    #[instrument(skip(self, ctx))]
    async fn dependencies(
        &self,
        ctx: &Context<'_>,
        package_id: ID,
        #[graphql(default = 100)] limit: i32,
    ) -> Result<Vec<Package>> {
        let gql_ctx = ctx.data::<GqlContext>()?;
        let effective_limit = limit.min(gql_ctx.guardrails.max_results);

        let query = GraphQueries::dependencies_direct(&package_id.to_string(), effective_limit);
        let rows = gql_ctx.graph.query(query).await?;

        let packages: Vec<Package> = rows
            .iter()
            .map(|row| Package {
                id: ID(row.get::<String>("id").unwrap_or_default()),
                ecosystem: Ecosystem::from(
                    row.get::<String>("ecosystem")
                        .unwrap_or_default()
                        .as_str(),
                ),
                name: row.get("name").unwrap_or_default(),
                created_at: None,
                updated_at: None,
            })
            .collect();

        Ok(packages)
    }

    /// Get graph statistics
    async fn graph_stats(&self, ctx: &Context<'_>) -> Result<GraphStats> {
        let gql_ctx = ctx.data::<GqlContext>()?;
        
        let query = GraphQueries::graph_stats();
        
        let (total_packages, total_versions, total_dependencies, total_package_dependencies) = 
            match gql_ctx.graph.query_one(query).await? {
                Some(row) => (
                    row.get("packages").unwrap_or(0),
                    row.get("versions").unwrap_or(0),
                    row.get("dependencies").unwrap_or(0),
                    row.get("pkg_dependencies").unwrap_or(0),
                ),
                None => (0, 0, 0, 0),
            };

        // Get ecosystem breakdown
        let eco_query = GraphQueries::ecosystem_breakdown();
        let eco_rows = gql_ctx.graph.query(eco_query).await?;
        
        let ecosystem_breakdown: Vec<EcosystemCount> = eco_rows
            .iter()
            .map(|row| {
                let eco_str: String = row.get("ecosystem").unwrap_or_default();
                EcosystemCount {
                    ecosystem: Ecosystem::from(eco_str.as_str()),
                    count: row.get("count").unwrap_or(0),
                }
            })
            .collect();

        Ok(GraphStats {
            total_packages,
            total_versions,
            total_dependencies,
            total_package_dependencies,
            ecosystem_breakdown,
        })
    }

    /// Search packages by name
    #[instrument(skip(self, ctx))]
    async fn search_packages(
        &self,
        ctx: &Context<'_>,
        query: String,
        ecosystem: Option<Ecosystem>,
        #[graphql(default = 20)] first: i32,
        after: Option<String>,
    ) -> Result<SearchConnection> {
        let gql_ctx = ctx.data::<GqlContext>()?;
        let effective_limit = first.min(gql_ctx.guardrails.max_results);

        // Parse cursor for offset
        let offset: i32 = after
            .and_then(|c| base64_decode_cursor(&c))
            .unwrap_or(0);

        // Convert ecosystem to string for query
        let eco_str = ecosystem.map(|e| format!("{:?}", e).to_uppercase());

        debug!(query = %query, ecosystem = ?eco_str, "Executing searchPackages");

        // Execute search query
        let search_query = GraphQueries::search_packages(
            &query,
            eco_str.as_deref(),
            effective_limit + 1,
        );
        let rows = gql_ctx.graph.query(search_query).await?;

        // Check for next page
        let has_next_page = rows.len() as i32 > effective_limit;
        let rows: Vec<_> = rows.into_iter().take(effective_limit as usize).collect();

        // Build edges
        let mut edges = Vec::with_capacity(rows.len());
        for (idx, row) in rows.iter().enumerate() {
            let pkg = Package {
                id: ID(row.get::<String>("id").unwrap_or_default()),
                ecosystem: Ecosystem::from(
                    row.get::<String>("ecosystem")
                        .unwrap_or_default()
                        .as_str(),
                ),
                name: row.get("name").unwrap_or_default(),
                created_at: None,
                updated_at: None,
            };

            edges.push(SearchEdge {
                node: pkg,
                cursor: base64_encode_cursor(offset + idx as i32),
            });
        }

        // Get total count
        let count_query = GraphQueries::search_packages_count(&query, eco_str.as_deref());
        let total_count = match gql_ctx.graph.query_one(count_query).await? {
            Some(row) => row.get::<i64>("total").unwrap_or(0) as i32,
            None => 0,
        };

        let start_cursor = edges.first().map(|e| e.cursor.clone());
        let end_cursor = edges.last().map(|e| e.cursor.clone());

        Ok(SearchConnection {
            edges,
            page_info: PageInfo {
                has_next_page,
                has_previous_page: offset > 0,
                start_cursor,
                end_cursor,
            },
            total_count,
        })
    }
}

// ═══════════════════════════════════════════════════════════════
// CURSOR HELPERS
// ═══════════════════════════════════════════════════════════════

fn base64_encode_cursor(offset: i32) -> String {
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    STANDARD.encode(offset.to_string())
}

fn base64_decode_cursor(cursor: &str) -> Option<i32> {
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    STANDARD
        .decode(cursor)
        .ok()
        .and_then(|bytes| String::from_utf8(bytes).ok())
        .and_then(|s| s.parse().ok())
}
