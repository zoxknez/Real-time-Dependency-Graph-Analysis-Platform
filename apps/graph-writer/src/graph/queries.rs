use neo4rs::Query;
use tracing::instrument;

/// Graph query builder for package events
pub struct GraphQueries;

impl GraphQueries {
    /// Build stable Package ID: "{ecosystem}:{name}"
    pub fn package_id(ecosystem: &str, name: &str) -> String {
        format!("{}:{}", ecosystem, name)
    }

    /// Build stable Version ID: "{ecosystem}:{name}:{version}"
    pub fn version_id(ecosystem: &str, name: &str, version: &str) -> String {
        format!("{}:{}:{}", ecosystem, name, version)
    }

    /// Process VersionUpserted event
    /// 
    /// This creates/updates:
    /// 1. Package node (MERGE by id)
    /// 2. Version node (MERGE by id)
    /// 3. BELONGS_TO edge from Version to Package
    /// 4. DEPENDS_ON edges (replace pattern - delete old, create new)
    #[instrument(skip_all, fields(ecosystem, name, version))]
    pub fn version_upserted(
        ecosystem: &str,
        name: &str,
        version: &str,
        published_at: Option<i64>,
        dependencies: &[(String, String, String)], // (dep_ecosystem, dep_name, version_req)
    ) -> Vec<Query> {
        let package_id = Self::package_id(ecosystem, name);
        let version_id = Self::version_id(ecosystem, name, version);
        let now = chrono::Utc::now().timestamp_millis();

        let mut queries = Vec::with_capacity(3);

        // 1. MERGE Package node
        queries.push(
            neo4rs::query(
                r#"
                MERGE (p:Package {id: $package_id})
                ON CREATE SET
                    p.ecosystem = $ecosystem,
                    p.name = $name,
                    p.name_lc = toLower($name),
                    p.created_at = $now,
                    p.updated_at = $now
                ON MATCH SET
                    p.updated_at = $now
                "#
            )
            .param("package_id", package_id.clone())
            .param("ecosystem", ecosystem.to_string())
            .param("name", name.to_string())
            .param("now", now)
        );

        // 2. MERGE Version node with BELONGS_TO edge
        queries.push(
            neo4rs::query(
                r#"
                MATCH (p:Package {id: $package_id})
                MERGE (v:Version {id: $version_id})
                ON CREATE SET
                    v.package_id = $package_id,
                    v.ecosystem = $ecosystem,
                    v.name = $name,
                    v.version = $version,
                    v.published_at = $published_at,
                    v.yanked = false,
                    v.created_at = $now,
                    v.updated_at = $now
                ON MATCH SET
                    v.updated_at = $now
                MERGE (v)-[:BELONGS_TO]->(p)
                "#
            )
            .param("package_id", package_id.clone())
            .param("version_id", version_id.clone())
            .param("ecosystem", ecosystem.to_string())
            .param("name", name.to_string())
            .param("version", version.to_string())
            .param("published_at", published_at.unwrap_or(now))
            .param("now", now)
        );

        // 3. Replace DEPENDS_ON edges (delete old, create new)
        // Per spec: "obrišeš sve postojeće DEPENDS_ON sa te verzije, upišeš novi set iz eventa"
        
        // First, always delete old DEPENDS_ON edges
        queries.push(
            neo4rs::query(
                r#"
                MATCH (v:Version {id: $version_id})-[old:DEPENDS_ON]->()
                DELETE old
                "#
            )
            .param("version_id", version_id.clone())
        );
        
        // Then create new DEPENDS_ON edges one by one
        // neo4rs doesn't support complex list parameters, so we do individual queries
        for (dep_eco, dep_name, ver_req) in dependencies {
            let dep_package_id = Self::package_id(dep_eco, dep_name);
            
            queries.push(
                neo4rs::query(
                    r#"
                    MATCH (v:Version {id: $version_id})
                    MERGE (p:Package {id: $dep_package_id})
                    ON CREATE SET
                        p.ecosystem = $dep_ecosystem,
                        p.name = $dep_name,
                        p.name_lc = toLower($dep_name),
                        p.created_at = $now,
                        p.updated_at = $now
                    CREATE (v)-[:DEPENDS_ON {version_req: $version_req}]->(p)
                    "#
                )
                .param("version_id", version_id.clone())
                .param("dep_package_id", dep_package_id.clone())
                .param("dep_ecosystem", dep_eco.clone())
                .param("dep_name", dep_name.clone())
                .param("version_req", ver_req.clone())
                .param("now", now)
            );
            
            // 4. DEPENDS_ON_PKG: Package-level projection for fast GraphQL traversals
            // This denormalized edge enables efficient reverseDependents/dependencyPath queries
            queries.push(
                neo4rs::query(
                    r#"
                    MATCH (srcPkg:Package {id: $package_id})
                    MATCH (depPkg:Package {id: $dep_package_id})
                    MERGE (srcPkg)-[:DEPENDS_ON_PKG]->(depPkg)
                    "#
                )
                .param("package_id", package_id.clone())
                .param("dep_package_id", dep_package_id)
            );
        }

        queries
    }

    /// Process VersionYanked event
    /// Sets yanked=true on the Version node
    #[instrument(skip_all, fields(ecosystem, name, version))]
    pub fn version_yanked(ecosystem: &str, name: &str, version: &str) -> Query {
        let version_id = Self::version_id(ecosystem, name, version);
        let now = chrono::Utc::now().timestamp_millis();

        neo4rs::query(
            r#"
            MATCH (v:Version {id: $version_id})
            SET v.yanked = true, v.yanked_at = $now, v.updated_at = $now
            "#
        )
        .param("version_id", version_id)
        .param("now", now)
    }

    /// Process PackageDeleted event
    /// Soft delete - sets deleted_at timestamp on Package node
    #[instrument(skip_all, fields(ecosystem, name))]
    pub fn package_deleted(ecosystem: &str, name: &str) -> Query {
        let package_id = Self::package_id(ecosystem, name);
        let now = chrono::Utc::now().timestamp_millis();

        neo4rs::query(
            r#"
            MATCH (p:Package {id: $package_id})
            SET p.deleted_at = $now, p.updated_at = $now
            "#
        )
        .param("package_id", package_id)
        .param("now", now)
    }

    /// Optional: Hard delete package and all its versions/edges
    /// Use with caution - for cleanup scenarios only
    #[allow(dead_code)]
    pub fn package_hard_delete(ecosystem: &str, name: &str) -> Query {
        let package_id = Self::package_id(ecosystem, name);

        neo4rs::query(
            r#"
            MATCH (p:Package {id: $package_id})
            OPTIONAL MATCH (v:Version)-[:BELONGS_TO]->(p)
            OPTIONAL MATCH (v)-[d:DEPENDS_ON]->()
            OPTIONAL MATCH ()-[r:DEPENDS_ON]->(p)
            DELETE d, r, v, p
            "#
        )
        .param("package_id", package_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_package_id() {
        assert_eq!(GraphQueries::package_id("npm", "express"), "npm:express");
    }

    #[test]
    fn test_version_id() {
        assert_eq!(
            GraphQueries::version_id("npm", "express", "4.18.2"),
            "npm:express:4.18.2"
        );
    }

    #[test]
    fn test_version_upserted_creates_queries() {
        let deps = vec![
            ("npm".to_string(), "body-parser".to_string(), "^1.0.0".to_string()),
        ];
        let queries = GraphQueries::version_upserted("npm", "express", "4.18.2", None, &deps);
        // Package + Version + Delete old deps + (DEPENDS_ON + DEPENDS_ON_PKG) per dependency
        // 1 + 1 + 1 + 2*1 = 5
        assert_eq!(queries.len(), 5);
    }

    #[test]
    fn test_version_upserted_no_deps() {
        let queries = GraphQueries::version_upserted("npm", "express", "4.18.2", None, &[]);
        assert_eq!(queries.len(), 3); // Package + Version + Delete old deps
    }
}
