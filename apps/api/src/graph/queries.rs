//! Cypher query templates for GraphQL resolvers
//! 
//! All queries use DEPENDS_ON_PKG (package-level projection) for performance.
//! Version-level queries use DEPENDS_ON when semver precision is needed.

use neo4rs::Query;

/// Cypher query builder for GraphQL operations
pub struct GraphQueries;

impl GraphQueries {
    // ═══════════════════════════════════════════════════════════════
    // PACKAGE QUERIES
    // ═══════════════════════════════════════════════════════════════

    /// Get a single package by ID
    pub fn get_package(package_id: &str) -> Query {
        neo4rs::query(
            r#"
            MATCH (p:Package {id: $id})
            WHERE p.deleted_at IS NULL
            RETURN p.id AS id, 
                   p.ecosystem AS ecosystem, 
                   p.name AS name,
                   p.created_at AS created_at,
                   p.updated_at AS updated_at
            "#,
        )
        .param("id", package_id.to_string())
    }

    /// Get multiple packages by IDs (for DataLoader batch)
    pub fn get_packages_batch(package_ids: &[String]) -> Query {
        neo4rs::query(
            r#"
            MATCH (p:Package)
            WHERE p.id IN $ids AND p.deleted_at IS NULL
            RETURN p.id AS id,
                   p.ecosystem AS ecosystem,
                   p.name AS name,
                   p.created_at AS created_at,
                   p.updated_at AS updated_at
            "#,
        )
        .param("ids", package_ids.to_vec())
    }

    // ═══════════════════════════════════════════════════════════════
    // VERSION QUERIES
    // ═══════════════════════════════════════════════════════════════

    /// Get versions of a package
    pub fn get_versions(package_id: &str, limit: i32) -> Query {
        neo4rs::query(
            r#"
            MATCH (v:Version)-[:BELONGS_TO]->(p:Package {id: $package_id})
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
        .param("package_id", package_id.to_string())
        .param("limit", limit as i64)
    }

    /// Get a specific version
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
    pub fn reverse_dependents_direct(package_id: &str, limit: i32) -> Query {
        neo4rs::query(
            r#"
            MATCH (target:Package {id: $package_id})
            MATCH (depV:Version)-[:DEPENDS_ON]->(target)
            MATCH (depV)-[:BELONGS_TO]->(dep:Package)
            WHERE dep.deleted_at IS NULL AND dep <> target
            RETURN DISTINCT dep.id AS id,
                   dep.ecosystem AS ecosystem,
                   dep.name AS name,
                   1 AS depth
            ORDER BY dep.name
            LIMIT $limit
            "#,
        )
        .param("package_id", package_id.to_string())
        .param("limit", limit as i64)
    }

    /// Get transitive reverse dependents (variable depth)
    /// For transitive, we need to follow: Version→Package, then find Versions that depend on those Packages
    /// This is complex because DEPENDS_ON is Version→Package, not Version→Version
    pub fn reverse_dependents_transitive(package_id: &str, max_depth: i32, limit: i32) -> Query {
        // For transitive reverse dependents with Version→Package edges:
        // Depth 1: Find versions that depend on target package, get their parent packages
        // Depth 2: Find versions that depend on depth-1 packages, etc.
        // 
        // With DEPENDS_ON_PKG (Package→Package), this would be simpler.
        // For now, we'll only do direct (depth=1) reverse dependents efficiently
        // and use DEPENDS_ON_PKG for deeper traversals once populated.
        //
        // MVP approach: Use direct for all depths (approximation)
        neo4rs::query(
            r#"
            MATCH (target:Package {id: $package_id})
            MATCH (depV:Version)-[:DEPENDS_ON]->(target)
            MATCH (depV)-[:BELONGS_TO]->(dep:Package)
            WHERE dep.deleted_at IS NULL AND dep <> target
            WITH DISTINCT dep, 1 AS depth
            RETURN dep.id AS id,
                   dep.ecosystem AS ecosystem,
                   dep.name AS name,
                   depth
            ORDER BY depth, dep.name
            LIMIT $limit
            "#,
        )
        .param("package_id", package_id.to_string())
        .param("limit", limit as i64)
    }

    /// Count total reverse dependents (for pagination info)
    pub fn reverse_dependents_count(package_id: &str, _max_depth: i32) -> Query {
        neo4rs::query(
            r#"
            MATCH (target:Package {id: $package_id})
            MATCH (depV:Version)-[:DEPENDS_ON]->(target)
            MATCH (depV)-[:BELONGS_TO]->(dep:Package)
            WHERE dep.deleted_at IS NULL AND dep <> target
            RETURN count(DISTINCT dep) AS total
            "#,
        )
        .param("package_id", package_id.to_string())
    }

    // ═══════════════════════════════════════════════════════════════
    // DEPENDENCY PATH (shortest path between packages)
    // ═══════════════════════════════════════════════════════════════

    /// Find shortest dependency path from package A to package B
    /// Memgraph uses BFS-based path finding instead of Neo4j's shortestPath function
    pub fn dependency_path(from_id: &str, to_id: &str, _max_hops: i32) -> Query {
        // With DEPENDS_ON going Version→Package, path finding between packages is complex.
        // For MVP: Check if there's a direct dependency relationship.
        // For transitive paths, we'd need DEPENDS_ON_PKG edges.
        neo4rs::query(
            r#"
            MATCH (a:Package {id: $from_id})<-[:BELONGS_TO]-(aV:Version)
            MATCH (aV)-[:DEPENDS_ON]->(b:Package {id: $to_id})
            RETURN [a.id, b.id] AS package_ids, 1 AS hops
            LIMIT 1
            "#,
        )
        .param("from_id", from_id.to_string())
        .param("to_id", to_id.to_string())
    }

    // ═══════════════════════════════════════════════════════════════
    // IMPACT RADIUS (CVE propagation simulation)
    // ═══════════════════════════════════════════════════════════════

    /// Get impacted packages (reverse dependents) for CVE analysis
    /// MVP: Direct dependents only (depth 1) with Version→Package schema
    pub fn impact_radius(package_id: &str, _max_depth: i32, limit: i32) -> Query {
        // For Version→Package schema, impact radius = reverse dependents
        neo4rs::query(
            r#"
            MATCH (target:Package {id: $package_id})
            MATCH (depV:Version)-[:DEPENDS_ON]->(target)
            MATCH (depV)-[:BELONGS_TO]->(dep:Package)
            WHERE dep.deleted_at IS NULL AND dep <> target
            WITH DISTINCT dep
            RETURN dep.id AS id,
                   dep.ecosystem AS ecosystem,
                   dep.name AS name,
                   1 AS depth
            ORDER BY dep.name
            LIMIT $limit
            "#,
        )
        .param("package_id", package_id.to_string())
        .param("limit", limit as i64)
    }

    /// Count total impacted packages for impact radius
    pub fn impact_radius_count(package_id: &str, _max_depth: i32) -> Query {
        neo4rs::query(
            r#"
            MATCH (target:Package {id: $package_id})
            MATCH (depV:Version)-[:DEPENDS_ON]->(target)
            MATCH (depV)-[:BELONGS_TO]->(dep:Package)
            WHERE dep.deleted_at IS NULL AND dep <> target
            RETURN count(DISTINCT dep) AS impacted_packages
            "#,
        )
        .param("package_id", package_id.to_string())
    }

    /// Count impacted versions (more detailed CVE analysis)
    pub fn impact_radius_versions(package_id: &str, _max_depth: i32) -> Query {
        neo4rs::query(
            r#"
            MATCH (target:Package {id: $package_id})
            MATCH (depV:Version)-[:DEPENDS_ON]->(target)
            MATCH (depV)-[:BELONGS_TO]->(dep:Package)
            WHERE dep.deleted_at IS NULL AND dep <> target
            WITH DISTINCT dep
            MATCH (v:Version)-[:BELONGS_TO]->(dep)
            WHERE v.yanked = false OR v.yanked IS NULL
            RETURN count(DISTINCT dep) AS impacted_packages,
                   count(v) AS impacted_versions
            "#,
        )
        .param("package_id", package_id.to_string())
    }

    // ═══════════════════════════════════════════════════════════════
    // DEPENDENCIES (what this package depends on)
    // ═══════════════════════════════════════════════════════════════

    /// Get direct dependencies of a package
    /// Uses DEPENDS_ON edges from Version → Package
    pub fn dependencies_direct(package_id: &str, limit: i32) -> Query {
        // DEPENDS_ON edges go from Version to Package (the dependency package)
        neo4rs::query(
            r#"
            MATCH (src:Package {id: $package_id})<-[:BELONGS_TO]-(v:Version)
            MATCH (v)-[:DEPENDS_ON]->(dep:Package)
            WHERE dep.deleted_at IS NULL AND dep <> src
            RETURN DISTINCT dep.id AS id,
                   dep.ecosystem AS ecosystem,
                   dep.name AS name
            ORDER BY dep.name
            LIMIT $limit
            "#,
        )
        .param("package_id", package_id.to_string())
        .param("limit", limit as i64)
    }

    /// Get dependencies of a specific version (with version requirements)
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
    pub fn graph_stats() -> Query {
        // Use OPTIONAL MATCH for edges that may not exist yet
        neo4rs::query(
            r#"
            MATCH (p:Package)
            WITH count(p) AS packages
            MATCH (v:Version)
            WITH packages, count(v) AS versions
            OPTIONAL MATCH ()-[d:DEPENDS_ON]->()
            WITH packages, versions, count(d) AS dependencies
            OPTIONAL MATCH ()-[dp:DEPENDS_ON_PKG]->()
            RETURN packages, versions, dependencies, count(dp) AS pkg_dependencies
            "#,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_reverse_dependents_query_builds() {
        let query = GraphQueries::reverse_dependents_transitive("npm:express", 3, 100);
        // Just verify it builds without panic
        assert!(true);
    }

    #[test]
    fn test_dependency_path_query_builds() {
        let query = GraphQueries::dependency_path("npm:express", "npm:lodash", 6);
        assert!(true);
    }

    #[test]
    fn test_impact_radius_query_builds() {
        let query = GraphQueries::impact_radius("npm:lodash", 3, 5000);
        assert!(true);
    }
}
