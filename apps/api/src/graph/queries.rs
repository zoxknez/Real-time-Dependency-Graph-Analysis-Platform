//! Cypher query templates for GraphQL resolvers
//!
//! All queries use DEPENDS_ON_PKG (package-level projection) for performance.
//! Version-level queries use DEPENDS_ON when semver precision is needed.

use neo4rs::Query;

/// Cypher query builder for GraphQL operations
pub struct GraphQueries;

impl GraphQueries {
    fn traversal_depth(depth: i32) -> i32 {
        depth.clamp(1, 10)
    }

    fn path_hops(hops: i32) -> i32 {
        hops.clamp(1, 10)
    }

    fn result_limit(limit: i32) -> i64 {
        limit.clamp(1, 100_000) as i64
    }

    fn result_offset(offset: i32) -> i64 {
        offset.max(0) as i64
    }

    // ═══════════════════════════════════════════════════════════════
    // PACKAGE QUERIES
    // ═══════════════════════════════════════════════════════════════

    /// Get a single package by ID
    pub fn get_package(tenant_id: &str, package_id: &str) -> Query {
        neo4rs::query(
            r#"
            MATCH (p:Package {id: $id, tenant_id: $tenant_id})
            WHERE p.deleted_at IS NULL
            RETURN p.id AS id, 
                   p.ecosystem AS ecosystem, 
                   p.name AS name,
                   p.created_at AS created_at,
                   p.updated_at AS updated_at
            "#,
        )
        .param("tenant_id", tenant_id.to_string())
        .param("id", package_id.to_string())
    }

    /// Get multiple packages by IDs (for DataLoader batch)
    pub fn get_packages_batch(tenant_id: &str, package_ids: &[String]) -> Query {
        neo4rs::query(
            r#"
            MATCH (p:Package {tenant_id: $tenant_id})
            WHERE p.id IN $ids AND p.deleted_at IS NULL
            RETURN p.id AS id,
                   p.ecosystem AS ecosystem,
                   p.name AS name,
                   p.created_at AS created_at,
                   p.updated_at AS updated_at
            "#,
        )
        .param("tenant_id", tenant_id.to_string())
        .param("ids", package_ids.to_vec())
    }

    // ═══════════════════════════════════════════════════════════════
    // VERSION QUERIES
    // ═══════════════════════════════════════════════════════════════

    /// Get multiple versions by IDs (for DataLoader batch)
    pub fn get_versions_batch(tenant_id: &str, version_ids: &[String]) -> Query {
        neo4rs::query(
            r#"
            MATCH (v:Version {tenant_id: $tenant_id})-[:BELONGS_TO]->(p:Package {tenant_id: $tenant_id})
            WHERE v.id IN $ids
            RETURN v.id AS id,
                   p.id AS package_id,
                   v.version AS version,
                   v.published_at AS published_at,
                   v.yanked AS yanked
            "#,
        )
        .param("tenant_id", tenant_id.to_string())
        .param("ids", version_ids.to_vec())
    }

    /// Get direct dependencies for multiple packages at once (for DataLoader batch)
    /// Returns source_id to identify which package each dependency belongs to
    pub fn get_dependencies_batch(tenant_id: &str, package_ids: &[String]) -> Query {
        neo4rs::query(
            r#"
            MATCH (src:Package {tenant_id: $tenant_id})<-[:BELONGS_TO]-(v:Version {tenant_id: $tenant_id})
            WHERE src.id IN $ids
            MATCH (v)-[:DEPENDS_ON]->(dep:Package {tenant_id: $tenant_id})
            WHERE dep.deleted_at IS NULL AND dep <> src
            RETURN DISTINCT src.id AS source_id,
                   dep.id AS id,
                   dep.ecosystem AS ecosystem,
                   dep.name AS name
            "#,
        )
        .param("tenant_id", tenant_id.to_string())
        .param("ids", package_ids.to_vec())
    }

    /// Get versions of a package
    pub fn get_versions(tenant_id: &str, package_id: &str, limit: i32) -> Query {
        neo4rs::query(
            r#"
            MATCH (v:Version {tenant_id: $tenant_id})-[:BELONGS_TO]->(p:Package {id: $package_id, tenant_id: $tenant_id})
            WHERE v.yanked = false OR v.yanked IS NULL
            RETURN v.id AS id,
                   v.version AS version,
                   v.published_at AS published_at,
                   v.yanked AS yanked,
                   v.created_at AS created_at
            ORDER BY v.published_at DESC
            LIMIT $limit
            "#,
        )
        .param("tenant_id", tenant_id.to_string())
        .param("package_id", package_id.to_string())
        .param("limit", Self::result_limit(limit))
    }

    /// Get a specific version
    #[allow(dead_code)]
    pub fn get_version(version_id: &str) -> Query {
        neo4rs::query(
            r#"
            MATCH (v:Version {id: $id})
            RETURN v.id AS id,
                   v.package_id AS package_id,
                   v.version AS version,
                   v.published_at AS published_at,
                   v.yanked AS yanked,
                   v.created_at AS created_at
            "#,
        )
        .param("id", version_id.to_string())
    }

    // ═══════════════════════════════════════════════════════════════
    // REVERSE DEPENDENTS (who depends on this package)
    // ═══════════════════════════════════════════════════════════════

    /// Get direct reverse dependents (1 hop) - packages that depend on target
    /// DEPENDS_ON edges: (Version)-[:DEPENDS_ON]->(Package)
    /// So reverse dependents are packages whose versions point to target package
    #[allow(dead_code)]
    pub fn reverse_dependents_direct(tenant_id: &str, package_id: &str, limit: i32) -> Query {
        neo4rs::query(
            r#"
            MATCH (target:Package {id: $package_id, tenant_id: $tenant_id})
            MATCH (dep:Package {tenant_id: $tenant_id})-[:DEPENDS_ON_PKG]->(target)
            WHERE dep.deleted_at IS NULL AND dep <> target
            RETURN DISTINCT dep.id AS id,
                   dep.ecosystem AS ecosystem,
                   dep.name AS name,
                   1 AS depth
            ORDER BY dep.name
            LIMIT $limit
            "#,
        )
        .param("tenant_id", tenant_id.to_string())
        .param("package_id", package_id.to_string())
        .param("limit", Self::result_limit(limit))
    }

    /// Get transitive reverse dependents using package-level dependency edges.
    pub fn reverse_dependents_transitive(
        tenant_id: &str,
        package_id: &str,
        max_depth: i32,
        limit: i32,
        offset: i32,
    ) -> Query {
        let depth = Self::traversal_depth(max_depth);
        let cypher = format!(
            r#"
            MATCH (target:Package {{id: $package_id, tenant_id: $tenant_id}})
            MATCH path = (dep:Package {{tenant_id: $tenant_id}})-[:DEPENDS_ON_PKG*1..{}]->(target)
            WHERE dep.deleted_at IS NULL AND dep <> target
            WITH dep, min(length(path)) AS depth
            OPTIONAL MATCH (dep)-[direct_rel:DEPENDS_ON_PKG]->(target)
            RETURN dep.id AS id,
                   dep.ecosystem AS ecosystem,
                   dep.name AS name,
                   direct_rel.version_constraint AS raw_requirement,
                   depth
            ORDER BY depth, dep.name
            SKIP $offset
            LIMIT $limit
            "#,
            depth
        );

        neo4rs::query(&cypher)
            .param("tenant_id", tenant_id.to_string())
            .param("package_id", package_id.to_string())
            .param("limit", Self::result_limit(limit))
            .param("offset", Self::result_offset(offset))
    }

    /// Count total reverse dependents (for pagination info)
    pub fn reverse_dependents_count(tenant_id: &str, package_id: &str, max_depth: i32) -> Query {
        let depth = Self::traversal_depth(max_depth);
        let cypher = format!(
            r#"
            MATCH (target:Package {{id: $package_id, tenant_id: $tenant_id}})
            MATCH path = (dep:Package {{tenant_id: $tenant_id}})-[:DEPENDS_ON_PKG*1..{}]->(target)
            WHERE dep.deleted_at IS NULL AND dep <> target
            RETURN count(DISTINCT dep) AS total
            "#,
            depth
        );

        neo4rs::query(&cypher)
            .param("tenant_id", tenant_id.to_string())
            .param("package_id", package_id.to_string())
    }

    // ═══════════════════════════════════════════════════════════════
    // DEPENDENCY PATH (shortest path between packages)
    // ═══════════════════════════════════════════════════════════════

    /// Count reverse dependents with the same relationship filter as the extended view.
    pub fn reverse_dependents_extended_count(
        tenant_id: &str,
        package_id: &str,
        max_depth: i32,
        relationship: Option<&str>,
    ) -> Query {
        let rel_filter = match relationship {
            Some("DIRECT") => "WHERE depth = 1",
            Some("TRANSITIVE") => "WHERE depth > 1",
            _ => "",
        };
        let depth = Self::traversal_depth(max_depth);

        let cypher = format!(
            r#"
            MATCH (target:Package {{id: $package_id, tenant_id: $tenant_id}})
            MATCH path = (dep:Package {{tenant_id: $tenant_id}})-[:DEPENDS_ON_PKG*1..{}]->(target)
            WHERE dep.deleted_at IS NULL AND dep <> target
            WITH dep, min(length(path)) AS depth
            {}
            RETURN count(dep) AS total
            "#,
            depth, rel_filter
        );

        neo4rs::query(&cypher)
            .param("tenant_id", tenant_id.to_string())
            .param("package_id", package_id.to_string())
    }

    /// Find shortest dependency path from package A to package B
    /// Memgraph uses BFS-based path finding instead of Neo4j's shortestPath function
    pub fn dependency_path(tenant_id: &str, from_id: &str, to_id: &str, max_hops: i32) -> Query {
        let hops = Self::path_hops(max_hops);
        let cypher = format!(
            r#"
            MATCH (from:Package {{id: $from_id, tenant_id: $tenant_id}})
            MATCH (to:Package {{id: $to_id, tenant_id: $tenant_id}})
            MATCH path = (from)-[:DEPENDS_ON_PKG*1..{}]->(to)
            WITH path, length(path) AS hops
            ORDER BY hops ASC
            LIMIT 1
            RETURN [node IN nodes(path) | node.id] AS package_ids, hops
            "#,
            hops
        );

        neo4rs::query(&cypher)
            .param("tenant_id", tenant_id.to_string())
            .param("from_id", from_id.to_string())
            .param("to_id", to_id.to_string())
    }

    // ═══════════════════════════════════════════════════════════════
    // IMPACT RADIUS (CVE propagation simulation)
    // ═══════════════════════════════════════════════════════════════

    /// Get impacted packages (reverse dependents) for CVE analysis.
    pub fn impact_radius(tenant_id: &str, package_id: &str, max_depth: i32, limit: i32) -> Query {
        let depth = Self::traversal_depth(max_depth);
        let cypher = format!(
            r#"
            MATCH (target:Package {{id: $package_id, tenant_id: $tenant_id}})
            MATCH path = (dep:Package {{tenant_id: $tenant_id}})-[:DEPENDS_ON_PKG*1..{}]->(target)
            WHERE dep.deleted_at IS NULL AND dep <> target
            WITH dep, min(length(path)) AS depth
            RETURN dep.id AS id,
                   dep.ecosystem AS ecosystem,
                   dep.name AS name,
                   depth
            ORDER BY depth, dep.name
            LIMIT $limit
            "#,
            depth
        );

        neo4rs::query(&cypher)
            .param("tenant_id", tenant_id.to_string())
            .param("package_id", package_id.to_string())
            .param("limit", Self::result_limit(limit))
    }

    /// Count total impacted packages for impact radius
    #[allow(dead_code)]
    pub fn impact_radius_count(tenant_id: &str, package_id: &str, max_depth: i32) -> Query {
        let depth = Self::traversal_depth(max_depth);
        let cypher = format!(
            r#"
            MATCH (target:Package {{id: $package_id, tenant_id: $tenant_id}})
            MATCH path = (dep:Package {{tenant_id: $tenant_id}})-[:DEPENDS_ON_PKG*1..{}]->(target)
            WHERE dep.deleted_at IS NULL AND dep <> target
            RETURN count(DISTINCT dep) AS impacted_packages
            "#,
            depth
        );

        neo4rs::query(&cypher)
            .param("tenant_id", tenant_id.to_string())
            .param("package_id", package_id.to_string())
    }

    /// Summarize direct and transitive package impact using minimum path depth.
    pub fn impact_radius_summary(tenant_id: &str, package_id: &str, max_depth: i32) -> Query {
        let depth = Self::traversal_depth(max_depth);
        let cypher = format!(
            r#"
            MATCH (target:Package {{id: $package_id, tenant_id: $tenant_id}})
            MATCH path = (dep:Package {{tenant_id: $tenant_id}})-[:DEPENDS_ON_PKG*1..{}]->(target)
            WHERE dep.deleted_at IS NULL AND dep <> target
            WITH dep, min(length(path)) AS depth
            RETURN count(dep) AS impacted_packages,
                   sum(CASE WHEN depth = 1 THEN 1 ELSE 0 END) AS direct_impacted_packages,
                   sum(CASE WHEN depth > 1 THEN 1 ELSE 0 END) AS transitive_impacted_packages
            "#,
            depth
        );

        neo4rs::query(&cypher)
            .param("tenant_id", tenant_id.to_string())
            .param("package_id", package_id.to_string())
    }

    /// Count impacted packages per dependency depth.
    pub fn impact_radius_depth_buckets(tenant_id: &str, package_id: &str, max_depth: i32) -> Query {
        let depth = Self::traversal_depth(max_depth);
        let cypher = format!(
            r#"
            MATCH (target:Package {{id: $package_id, tenant_id: $tenant_id}})
            MATCH path = (dep:Package {{tenant_id: $tenant_id}})-[:DEPENDS_ON_PKG*1..{}]->(target)
            WHERE dep.deleted_at IS NULL AND dep <> target
            WITH dep, min(length(path)) AS depth
            RETURN depth, count(dep) AS package_count
            ORDER BY depth
            "#,
            depth
        );

        neo4rs::query(&cypher)
            .param("tenant_id", tenant_id.to_string())
            .param("package_id", package_id.to_string())
    }

    /// Count impacted versions (more detailed CVE analysis)
    pub fn impact_radius_versions(tenant_id: &str, package_id: &str, max_depth: i32) -> Query {
        let depth = Self::traversal_depth(max_depth);
        let cypher = format!(
            r#"
            MATCH (target:Package {{id: $package_id, tenant_id: $tenant_id}})
            MATCH path = (dep:Package {{tenant_id: $tenant_id}})-[:DEPENDS_ON_PKG*1..{}]->(target)
            WHERE dep.deleted_at IS NULL AND dep <> target
            WITH DISTINCT dep
            OPTIONAL MATCH (v:Version {{tenant_id: $tenant_id}})-[:BELONGS_TO]->(dep)
            WHERE v.yanked = false OR v.yanked IS NULL
            RETURN count(DISTINCT dep) AS impacted_packages,
                   count(DISTINCT v) AS impacted_versions
            "#,
            depth
        );

        neo4rs::query(&cypher)
            .param("tenant_id", tenant_id.to_string())
            .param("package_id", package_id.to_string())
    }

    // ═══════════════════════════════════════════════════════════════
    // DEPENDENCIES (what this package depends on)
    // ═══════════════════════════════════════════════════════════════

    /// Get direct dependencies of a package
    /// Uses DEPENDS_ON edges from Version → Package
    pub fn dependencies_direct(tenant_id: &str, package_id: &str, limit: i32) -> Query {
        // DEPENDS_ON edges go from Version to Package (the dependency package)
        neo4rs::query(
            r#"
            MATCH (src:Package {id: $package_id, tenant_id: $tenant_id})<-[:BELONGS_TO]-(v:Version {tenant_id: $tenant_id})
            MATCH (v)-[:DEPENDS_ON]->(dep:Package {tenant_id: $tenant_id})
            WHERE dep.deleted_at IS NULL AND dep <> src
            RETURN DISTINCT dep.id AS id,
                   dep.ecosystem AS ecosystem,
                   dep.name AS name
            ORDER BY dep.name
            LIMIT $limit
            "#,
        )
        .param("tenant_id", tenant_id.to_string())
        .param("package_id", package_id.to_string())
        .param("limit", Self::result_limit(limit))
    }

    /// Get dependencies of a specific version (with version requirements)
    #[allow(dead_code)]
    pub fn version_dependencies(version_id: &str) -> Query {
        neo4rs::query(
            r#"
            MATCH (v:Version {id: $version_id})-[d:DEPENDS_ON]->(p:Package)
            WHERE p.deleted_at IS NULL
            RETURN p.id AS id,
                   p.ecosystem AS ecosystem,
                   p.name AS name,
                   d.version_req AS version_req
            ORDER BY p.name
            "#,
        )
        .param("version_id", version_id.to_string())
    }

    // ═══════════════════════════════════════════════════════════════
    // STATS QUERIES
    // ═══════════════════════════════════════════════════════════════

    /// Get overall graph stats
    pub fn graph_stats(tenant_id: &str) -> Query {
        // Use OPTIONAL MATCH for edges that may not exist yet
        neo4rs::query(
            r#"
            MATCH (p:Package {tenant_id: $tenant_id})
            WITH count(p) AS packages
            MATCH (v:Version {tenant_id: $tenant_id})
            WITH packages, count(v) AS versions
            OPTIONAL MATCH (v:Version {tenant_id: $tenant_id})-[d:DEPENDS_ON]->(p:Package {tenant_id: $tenant_id})
            WITH packages, versions, count(d) AS dependencies
            OPTIONAL MATCH (p:Package {tenant_id: $tenant_id})-[dp:DEPENDS_ON_PKG]->(p2:Package {tenant_id: $tenant_id})
            RETURN packages, versions, dependencies, count(dp) AS pkg_dependencies
            "#,
        )
        .param("tenant_id", tenant_id.to_string())
    }

    /// Get ecosystem breakdown for stats
    pub fn ecosystem_breakdown(tenant_id: &str) -> Query {
        neo4rs::query(
            r#"
            MATCH (p:Package {tenant_id: $tenant_id})
            WHERE p.deleted_at IS NULL
            RETURN p.ecosystem AS ecosystem, count(p) AS count
            ORDER BY count DESC
            "#,
        )
        .param("tenant_id", tenant_id.to_string())
    }

    // ═══════════════════════════════════════════════════════════════
    // SEARCH QUERIES
    // ═══════════════════════════════════════════════════════════════

    /// Search packages by name (case-insensitive contains)
    pub fn search_packages(
        tenant_id: &str,
        query: &str,
        ecosystem: Option<&str>,
        limit: i32,
    ) -> Query {
        let cypher = match ecosystem {
            Some(_) => {
                r#"
                MATCH (p:Package {tenant_id: $tenant_id})
                WHERE p.deleted_at IS NULL 
                  AND (p.name_lc CONTAINS toLower($query) OR toLower(p.name) CONTAINS toLower($query))
                  AND toLower(p.ecosystem) = toLower($ecosystem)
                RETURN p.id AS id,
                       p.ecosystem AS ecosystem,
                       p.name AS name
                ORDER BY 
                  CASE WHEN p.name_lc = toLower($query) THEN 0 ELSE 1 END,
                  size(p.name)
                LIMIT $limit
            "#
            }
            None => {
                r#"
                MATCH (p:Package {tenant_id: $tenant_id})
                WHERE p.deleted_at IS NULL 
                  AND (p.name_lc CONTAINS toLower($query) OR toLower(p.name) CONTAINS toLower($query))
                RETURN p.id AS id,
                       p.ecosystem AS ecosystem,
                       p.name AS name
                ORDER BY 
                  CASE WHEN p.name_lc = toLower($query) THEN 0 ELSE 1 END,
                  size(p.name)
                LIMIT $limit
            "#
            }
        };

        let mut q = neo4rs::query(cypher)
            .param("tenant_id", tenant_id.to_string())
            .param("query", query.to_string())
            .param("limit", limit as i64);

        if let Some(eco) = ecosystem {
            q = q.param("ecosystem", eco.to_string());
        }

        q
    }

    /// Count search results for pagination
    pub fn search_packages_count(tenant_id: &str, query: &str, ecosystem: Option<&str>) -> Query {
        let cypher = match ecosystem {
            Some(_) => {
                r#"
                MATCH (p:Package {tenant_id: $tenant_id})
                WHERE p.deleted_at IS NULL 
                  AND (p.name_lc CONTAINS toLower($query) OR toLower(p.name) CONTAINS toLower($query))
                  AND toLower(p.ecosystem) = toLower($ecosystem)
                RETURN count(p) AS total
            "#
            }
            None => {
                r#"
                MATCH (p:Package {tenant_id: $tenant_id})
                WHERE p.deleted_at IS NULL 
                  AND (p.name_lc CONTAINS toLower($query) OR toLower(p.name) CONTAINS toLower($query))
                RETURN count(p) AS total
            "#
            }
        };

        let mut q = neo4rs::query(cypher)
            .param("tenant_id", tenant_id.to_string())
            .param("query", query.to_string());

        if let Some(eco) = ecosystem {
            q = q.param("ecosystem", eco.to_string());
        }

        q
    }
}

// ═══════════════════════════════════════════════════════════════
// TRANSITIVE PATH QUERIES
// Based on GitHub Dependency Graph "Show paths" feature
// ═══════════════════════════════════════════════════════════════

impl GraphQueries {
    /// Get shortest paths from root to target package
    /// Returns top N shortest paths (for "Show paths" UI feature)
    ///
    /// Based on GitHub Dependency Graph transitive path visualization
    pub fn transitive_paths(tenant_id: &str, from_id: &str, to_id: &str, limit: i32) -> Query {
        neo4rs::query(
            r#"
            MATCH path = (root:Package {id: $from_id, tenant_id: $tenant_id})
                         -[:DEPENDS_ON_PKG*1..5]->(target:Package {id: $to_id, tenant_id: $tenant_id})
            WITH path, length(path) AS length
            ORDER BY length
            LIMIT $limit
            RETURN [node IN nodes(path) | node.id] AS package_ids, length
            ORDER BY length
            "#,
        )
        .param("tenant_id", tenant_id.to_string())
        .param("from_id", from_id.to_string())
        .param("to_id", to_id.to_string())
        .param("limit", Self::result_limit(limit))
    }

    /// Get which direct dependencies introduced a transitive dependency
    /// Returns list of direct deps that bring in the target
    #[allow(dead_code)]
    pub fn introduced_by(tenant_id: &str, root_id: &str, target_id: &str) -> Query {
        neo4rs::query(
            r#"
            MATCH (root:Package {id: $root_id, tenant_id: $tenant_id})
                  -[:DEPENDS_ON_PKG]->(direct:Package {tenant_id: $tenant_id})
            WHERE direct.deleted_at IS NULL AND direct.id <> $root_id
            MATCH (direct)-[:DEPENDS_ON_PKG*0..4]->(target:Package {id: $target_id, tenant_id: $tenant_id})
            RETURN DISTINCT direct.id AS id,
                   direct.ecosystem AS ecosystem,
                   direct.name AS name
            ORDER BY direct.name
            "#,
        )
        .param("tenant_id", tenant_id.to_string())
        .param("root_id", root_id.to_string())
        .param("target_id", target_id.to_string())
    }

    /// Get dependencies with extended info (relationship type, depth, introduced_by)
    /// For the extended dependency view with Direct/Transitive badges
    #[allow(dead_code)]
    pub fn dependencies_extended(tenant_id: &str, package_id: &str, limit: i32) -> Query {
        neo4rs::query(
            r#"
            MATCH (src:Package {id: $package_id, tenant_id: $tenant_id})
                  -[:DEPENDS_ON_PKG]->(direct:Package {tenant_id: $tenant_id})
            WHERE direct.deleted_at IS NULL AND direct <> src
            
            WITH DISTINCT src, direct, 'DIRECT' AS rel, 1 AS depth
            
            RETURN direct.id AS id,
                   direct.ecosystem AS ecosystem,
                   direct.name AS name,
                   rel AS relationship,
                   depth,
                   [] AS introduced_by_ids
            ORDER BY direct.name
            LIMIT $limit
            "#,
        )
        .param("tenant_id", tenant_id.to_string())
        .param("package_id", package_id.to_string())
        .param("limit", Self::result_limit(limit))
    }

    /// Get reverse dependents with extended relationship info
    pub fn reverse_dependents_extended(
        tenant_id: &str,
        package_id: &str,
        max_depth: i32,
        relationship: Option<&str>,
        limit: i32,
        offset: i32,
    ) -> Query {
        let rel_filter = match relationship {
            Some("DIRECT") => "WHERE depth = 1",
            Some("TRANSITIVE") => "WHERE depth > 1",
            _ => "",
        };
        let depth = Self::traversal_depth(max_depth);

        let cypher = format!(
            r#"
            MATCH (target:Package {{id: $package_id, tenant_id: $tenant_id}})
            MATCH path = (dep:Package {{tenant_id: $tenant_id}})-[:DEPENDS_ON_PKG*1..{}]->(target)
            WHERE dep.deleted_at IS NULL AND dep <> target
            WITH dep, min(length(path)) AS depth
            {}
            WITH dep, depth, CASE WHEN depth = 1 THEN 'DIRECT' ELSE 'TRANSITIVE' END AS relationship
            RETURN dep.id AS id,
                   dep.ecosystem AS ecosystem,
                   dep.name AS name,
                   depth,
                   relationship,
                   [] AS introduced_by_ids
            ORDER BY depth, dep.name
            SKIP $offset
            LIMIT $limit
            "#,
            depth, rel_filter
        );

        neo4rs::query(&cypher)
            .param("tenant_id", tenant_id.to_string())
            .param("package_id", package_id.to_string())
            .param("limit", Self::result_limit(limit))
            .param("offset", Self::result_offset(offset))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_reverse_dependents_query_builds() {
        let _query =
            GraphQueries::reverse_dependents_transitive("test_tenant", "npm:express", 3, 100, 0);
    }

    #[test]
    fn test_dependency_path_query_builds() {
        let _query = GraphQueries::dependency_path("test_tenant", "npm:express", "npm:lodash", 6);
    }

    #[test]
    fn test_impact_radius_query_builds() {
        let _query = GraphQueries::impact_radius("test_tenant", "npm:lodash", 3, 5000);
    }

    #[test]
    fn test_transitive_paths_query_builds() {
        let _query = GraphQueries::transitive_paths("test_tenant", "npm:express", "npm:lodash", 3);
    }
}
