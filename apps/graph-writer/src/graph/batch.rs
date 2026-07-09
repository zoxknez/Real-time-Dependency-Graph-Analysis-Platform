//! Batch Processing for Graph Operations
//!
//! Optimizations:
//! - Batch multiple events into single transactions
//! - UNWIND for bulk operations
//! - Deduplication of redundant operations
//! - Idempotent upserts with event versioning

#![allow(dead_code)]

use anyhow::{Context, Result};
use neo4rs::Query;
use std::collections::{HashMap, HashSet};
use tracing::{debug, info, instrument};

use super::DEFAULT_TENANT_ID;
use super::MemgraphClient;

// ═══════════════════════════════════════════════════════════════
// BATCH BUILDER
// ═══════════════════════════════════════════════════════════════

/// Collects operations and executes them in optimized batches
pub struct BatchBuilder {
    /// Packages to upsert (deduped by id)
    packages: HashMap<String, PackageData>,
    /// Versions to upsert (deduped by id)
    versions: HashMap<String, VersionData>,
    /// Dependencies to create (from_version_id -> [(dep_package_id, version_req)])
    dependencies: HashMap<String, Vec<DependencyData>>,
    /// Versions to yank
    yanked_versions: HashSet<String>,
    /// Packages to delete (soft)
    deleted_packages: HashSet<String>,
    /// Maximum batch size before auto-flush
    max_batch_size: usize,
    /// Event sequence for idempotency
    event_sequences: HashMap<String, u64>,
}

#[derive(Clone, Debug)]
struct PackageData {
    id: String,
    ecosystem: String,
    name: String,
    event_seq: u64,
}

#[derive(Clone, Debug)]
struct VersionData {
    id: String,
    package_id: String,
    ecosystem: String,
    name: String,
    version: String,
    published_at: Option<i64>,
    event_seq: u64,
}

#[derive(Clone, Debug)]
struct DependencyData {
    dep_package_id: String,
    dep_ecosystem: String,
    dep_name: String,
    version_req: String,
}

impl BatchBuilder {
    /// Create a new batch builder
    pub fn new(max_batch_size: usize) -> Self {
        Self {
            packages: HashMap::new(),
            versions: HashMap::new(),
            dependencies: HashMap::new(),
            yanked_versions: HashSet::new(),
            deleted_packages: HashSet::new(),
            max_batch_size,
            event_sequences: HashMap::new(),
        }
    }

    /// Add a package upsert to the batch
    pub fn upsert_package(&mut self, ecosystem: &str, name: &str, event_seq: u64) {
        let id = format!("{}:{}", ecosystem, name);

        // Only update if this event is newer
        if let Some(existing) = self.packages.get(&id) {
            if existing.event_seq >= event_seq {
                debug!(id, "Skipping older package event");
                return;
            }
        }

        self.packages.insert(
            id.clone(),
            PackageData {
                id,
                ecosystem: ecosystem.to_string(),
                name: name.to_string(),
                event_seq,
            },
        );
    }

    /// Add a version upsert to the batch
    pub fn upsert_version(
        &mut self,
        ecosystem: &str,
        name: &str,
        version: &str,
        published_at: Option<i64>,
        dependencies: Vec<(String, String, String)>,
        event_seq: u64,
    ) {
        let package_id = format!("{}:{}", ecosystem, name);
        let version_id = format!("{}:{}:{}", ecosystem, name, version);

        // Check idempotency
        if let Some(existing) = self.versions.get(&version_id) {
            if existing.event_seq >= event_seq {
                debug!(version_id, "Skipping older version event");
                return;
            }
        }

        // Ensure package exists
        self.upsert_package(ecosystem, name, event_seq);

        // Add version
        self.versions.insert(
            version_id.clone(),
            VersionData {
                id: version_id.clone(),
                package_id,
                ecosystem: ecosystem.to_string(),
                name: name.to_string(),
                version: version.to_string(),
                published_at,
                event_seq,
            },
        );

        // Add dependencies
        let deps: Vec<DependencyData> = dependencies
            .into_iter()
            .map(|(eco, dep_name, ver_req)| {
                let dep_id = format!("{}:{}", eco, dep_name);
                // Ensure dependency package exists
                self.upsert_package(&eco, &dep_name, event_seq);
                DependencyData {
                    dep_package_id: dep_id,
                    dep_ecosystem: eco,
                    dep_name,
                    version_req: ver_req,
                }
            })
            .collect();

        self.dependencies.insert(version_id, deps);
    }

    /// Mark a version as yanked
    pub fn yank_version(&mut self, ecosystem: &str, name: &str, version: &str) {
        let version_id = format!("{}:{}:{}", ecosystem, name, version);
        self.yanked_versions.insert(version_id);
    }

    /// Soft-delete a package
    pub fn delete_package(&mut self, ecosystem: &str, name: &str) {
        let package_id = format!("{}:{}", ecosystem, name);
        self.deleted_packages.insert(package_id);
    }

    /// Get current batch size
    pub fn size(&self) -> usize {
        self.packages.len()
            + self.versions.len()
            + self.yanked_versions.len()
            + self.deleted_packages.len()
    }

    /// Check if batch is ready to flush
    pub fn should_flush(&self) -> bool {
        self.size() >= self.max_batch_size
    }

    /// Clear the batch
    pub fn clear(&mut self) {
        self.packages.clear();
        self.versions.clear();
        self.dependencies.clear();
        self.yanked_versions.clear();
        self.deleted_packages.clear();
    }

    /// Execute all batched operations
    #[instrument(skip(self, client), fields(
        packages = self.packages.len(),
        versions = self.versions.len(),
        yanked = self.yanked_versions.len(),
        deleted = self.deleted_packages.len()
    ))]
    pub async fn flush(&mut self, client: &MemgraphClient) -> Result<BatchStats> {
        if self.size() == 0 {
            return Ok(BatchStats::default());
        }

        info!("Flushing batch to Memgraph");

        let mut queries = Vec::new();
        let now = chrono::Utc::now().timestamp_millis();

        // 1. Batch upsert packages using UNWIND
        if !self.packages.is_empty() {
            let package_list: Vec<_> = self.packages.values().cloned().collect();
            queries.push(Self::build_package_batch_query(&package_list, now));
        }

        // 2. Batch upsert versions
        if !self.versions.is_empty() {
            let version_list: Vec<_> = self.versions.values().cloned().collect();
            queries.extend(Self::build_version_queries(&version_list, now));
        }

        // 3. Handle dependencies (needs individual queries due to variable deps per version)
        for (version_id, deps) in &self.dependencies {
            // Delete old deps
            queries.push(
                neo4rs::query(
                    r#"
                    MATCH (v:Version {id: $vid})-[d:DEPENDS_ON]->()
                    WHERE v.tenant_id = $tenant_id OR v.tenant_id IS NULL
                    SET v.tenant_id = coalesce(v.tenant_id, $tenant_id)
                    DELETE d
                    "#,
                )
                .param("tenant_id", DEFAULT_TENANT_ID.to_string())
                .param("vid", version_id.clone()),
            );

            // Create new deps
            if !deps.is_empty() {
                queries.extend(Self::build_dependency_queries(version_id, deps, now));
            }
        }

        // 4. Batch yank versions
        if !self.yanked_versions.is_empty() {
            let yanked_list: Vec<_> = self.yanked_versions.iter().cloned().collect();
            queries.push(Self::build_yank_batch_query(&yanked_list, now));
        }

        // 5. Batch delete packages
        if !self.deleted_packages.is_empty() {
            let deleted_list: Vec<_> = self.deleted_packages.iter().cloned().collect();
            queries.push(Self::build_delete_batch_query(&deleted_list, now));
        }

        // Execute all in transaction
        let stats = BatchStats {
            packages_upserted: self.packages.len(),
            versions_upserted: self.versions.len(),
            versions_yanked: self.yanked_versions.len(),
            packages_deleted: self.deleted_packages.len(),
            queries_executed: queries.len(),
        };

        client
            .execute_transaction(queries)
            .await
            .context("Failed to execute batch transaction")?;

        info!(
            packages = stats.packages_upserted,
            versions = stats.versions_upserted,
            queries = stats.queries_executed,
            "Batch flush complete"
        );

        self.clear();
        Ok(stats)
    }

    /// Build UNWIND query for batch package upsert
    fn build_package_batch_query(packages: &[PackageData], now: i64) -> Query {
        // Convert to params that neo4rs can serialize
        let package_params: Vec<HashMap<String, String>> = packages
            .iter()
            .map(|p| {
                let mut m = HashMap::new();
                m.insert("id".to_string(), p.id.clone());
                m.insert("ecosystem".to_string(), p.ecosystem.clone());
                m.insert("name".to_string(), p.name.clone());
                m
            })
            .collect();

        neo4rs::query(
            r#"
            UNWIND $packages AS pkg
            MERGE (p:Package {id: pkg.id})
            ON CREATE SET
                p.tenant_id = $tenant_id,
                p.ecosystem = pkg.ecosystem,
                p.name = pkg.name,
                p.name_lc = toLower(pkg.name),
                p.created_at = $now,
                p.updated_at = $now
            ON MATCH SET
                p.tenant_id = coalesce(p.tenant_id, $tenant_id),
                p.name_lc = coalesce(p.name_lc, toLower(pkg.name)),
                p.updated_at = $now
            "#,
        )
        .param("tenant_id", DEFAULT_TENANT_ID.to_string())
        .param("packages", package_params)
        .param("now", now)
    }

    /// Build UNWIND query for batch version upsert
    fn build_version_batch_query(versions: &[VersionData], now: i64) -> Query {
        // Use a vector of tuples as individual params instead of complex HashMap
        // neo4rs doesn't support nested HashMap with mixed types well
        let version_ids: Vec<String> = versions.iter().map(|v| v.id.clone()).collect();
        let package_ids: Vec<String> = versions.iter().map(|v| v.package_id.clone()).collect();
        let ecosystems: Vec<String> = versions.iter().map(|v| v.ecosystem.clone()).collect();
        let names: Vec<String> = versions.iter().map(|v| v.name.clone()).collect();
        let version_nums: Vec<String> = versions.iter().map(|v| v.version.clone()).collect();
        let published_ats: Vec<i64> = versions
            .iter()
            .map(|v| v.published_at.unwrap_or(now))
            .collect();

        // Use multiple MERGE statements for each version (simpler but still batched in one tx)
        // For truly large batches, consider UNWIND with explicit type handling
        let mut queries = Vec::new();
        for (i, _) in versions.iter().enumerate() {
            let q = neo4rs::query(
                r#"
                MATCH (p:Package {id: $package_id})
                WHERE p.tenant_id = $tenant_id OR p.tenant_id IS NULL
                SET p.tenant_id = coalesce(p.tenant_id, $tenant_id)
                MERGE (v:Version {id: $vid})
                ON CREATE SET
                    v.tenant_id = $tenant_id,
                    v.package_id = $package_id,
                    v.ecosystem = $ecosystem,
                    v.name = $name,
                    v.version = $version,
                    v.published_at = $published_at,
                    v.yanked = false,
                    v.created_at = $now,
                    v.updated_at = $now
                ON MATCH SET
                    v.tenant_id = coalesce(v.tenant_id, $tenant_id),
                    v.updated_at = $now
                MERGE (v)-[:BELONGS_TO]->(p)
                "#,
            )
            .param("tenant_id", DEFAULT_TENANT_ID.to_string())
            .param("vid", version_ids[i].clone())
            .param("package_id", package_ids[i].clone())
            .param("ecosystem", ecosystems[i].clone())
            .param("name", names[i].clone())
            .param("version", version_nums[i].clone())
            .param("published_at", published_ats[i])
            .param("now", now);
            queries.push(q);
        }

        // Return first query if any, caller should handle multiple
        // This is a simplification - for proper batching use build_version_queries
        queries
            .into_iter()
            .next()
            .unwrap_or_else(|| neo4rs::query("RETURN 1").param("now", now))
    }

    /// Build individual queries for each version (for batch transaction)
    fn build_version_queries(versions: &[VersionData], now: i64) -> Vec<Query> {
        versions
            .iter()
            .map(|v| {
                neo4rs::query(
                    r#"
                MATCH (p:Package {id: $package_id})
                WHERE p.tenant_id = $tenant_id OR p.tenant_id IS NULL
                SET p.tenant_id = coalesce(p.tenant_id, $tenant_id)
                MERGE (v:Version {id: $vid})
                ON CREATE SET
                    v.tenant_id = $tenant_id,
                    v.package_id = $package_id,
                    v.ecosystem = $ecosystem,
                    v.name = $name,
                    v.version = $version,
                    v.published_at = $published_at,
                    v.yanked = false,
                    v.created_at = $now,
                    v.updated_at = $now
                ON MATCH SET
                    v.tenant_id = coalesce(v.tenant_id, $tenant_id),
                    v.updated_at = $now
                MERGE (v)-[:BELONGS_TO]->(p)
                "#,
                )
                .param("tenant_id", DEFAULT_TENANT_ID.to_string())
                .param("vid", v.id.clone())
                .param("package_id", v.package_id.clone())
                .param("ecosystem", v.ecosystem.clone())
                .param("name", v.name.clone())
                .param("version", v.version.clone())
                .param("published_at", v.published_at.unwrap_or(now))
                .param("now", now)
            })
            .collect()
    }

    /// Build queries for dependencies
    fn build_dependency_queries(
        version_id: &str,
        deps: &[DependencyData],
        _now: i64,
    ) -> Vec<Query> {
        deps.iter()
            .map(|dep| {
                neo4rs::query(
                    r#"
                    MATCH (v:Version {id: $vid})
                    WHERE v.tenant_id = $tenant_id OR v.tenant_id IS NULL
                    SET v.tenant_id = coalesce(v.tenant_id, $tenant_id)
                    MATCH (v)-[:BELONGS_TO]->(srcPkg:Package)
                    MATCH (p:Package {id: $dep_id})
                    WHERE (srcPkg.tenant_id = $tenant_id OR srcPkg.tenant_id IS NULL)
                      AND (p.tenant_id = $tenant_id OR p.tenant_id IS NULL)
                    SET srcPkg.tenant_id = coalesce(srcPkg.tenant_id, $tenant_id),
                        p.tenant_id = coalesce(p.tenant_id, $tenant_id)
                    CREATE (v)-[:DEPENDS_ON {version_req: $ver_req}]->(p)
                    MERGE (srcPkg)-[:DEPENDS_ON_PKG]->(p)
                    "#,
                )
                .param("tenant_id", DEFAULT_TENANT_ID.to_string())
                .param("vid", version_id.to_string())
                .param("dep_id", dep.dep_package_id.clone())
                .param("ver_req", dep.version_req.clone())
            })
            .collect()
    }

    /// Build UNWIND query for batch yanking
    fn build_yank_batch_query(version_ids: &[String], now: i64) -> Query {
        neo4rs::query(
            r#"
            UNWIND $version_ids AS vid
            MATCH (v:Version {id: vid})
            WHERE v.tenant_id = $tenant_id OR v.tenant_id IS NULL
            SET v.yanked = true, v.yanked_at = $now, v.updated_at = $now
            "#,
        )
        .param("tenant_id", DEFAULT_TENANT_ID.to_string())
        .param("version_ids", version_ids.to_vec())
        .param("now", now)
    }

    /// Build UNWIND query for batch soft delete
    fn build_delete_batch_query(package_ids: &[String], now: i64) -> Query {
        neo4rs::query(
            r#"
            UNWIND $package_ids AS pid
            MATCH (p:Package {id: pid})
            WHERE p.tenant_id = $tenant_id OR p.tenant_id IS NULL
            SET p.deleted_at = $now, p.updated_at = $now
            "#,
        )
        .param("tenant_id", DEFAULT_TENANT_ID.to_string())
        .param("package_ids", package_ids.to_vec())
        .param("now", now)
    }
}

// ═══════════════════════════════════════════════════════════════
// BATCH STATS
// ═══════════════════════════════════════════════════════════════

/// Statistics from a batch flush operation
#[derive(Debug, Default, Clone)]
pub struct BatchStats {
    pub packages_upserted: usize,
    pub versions_upserted: usize,
    pub versions_yanked: usize,
    pub packages_deleted: usize,
    pub queries_executed: usize,
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_batch_builder_deduplication() {
        let mut batch = BatchBuilder::new(100);

        // Add same package twice with different sequences
        batch.upsert_package("npm", "express", 1);
        batch.upsert_package("npm", "express", 2);

        // Should only have one package
        assert_eq!(batch.packages.len(), 1);
        // Should have the newer sequence
        assert_eq!(batch.packages.get("npm:express").unwrap().event_seq, 2);
    }

    #[test]
    fn test_batch_builder_idempotency() {
        let mut batch = BatchBuilder::new(100);

        // Add version with newer sequence first
        batch.upsert_version("npm", "express", "1.0.0", None, vec![], 10);
        // Try to add older event
        batch.upsert_version("npm", "express", "1.0.0", None, vec![], 5);

        // Should keep the newer one
        assert_eq!(
            batch.versions.get("npm:express:1.0.0").unwrap().event_seq,
            10
        );
    }

    #[test]
    fn test_batch_builder_auto_package_creation() {
        let mut batch = BatchBuilder::new(100);

        batch.upsert_version(
            "npm",
            "express",
            "1.0.0",
            None,
            vec![(
                "npm".to_string(),
                "body-parser".to_string(),
                "^1.0".to_string(),
            )],
            1,
        );

        // Should have 2 packages: express and body-parser
        assert_eq!(batch.packages.len(), 2);
        assert!(batch.packages.contains_key("npm:express"));
        assert!(batch.packages.contains_key("npm:body-parser"));
    }

    #[test]
    fn test_should_flush() {
        let mut batch = BatchBuilder::new(3);

        batch.upsert_package("npm", "a", 1);
        assert!(!batch.should_flush());

        batch.upsert_package("npm", "b", 2);
        assert!(!batch.should_flush());

        batch.upsert_package("npm", "c", 3);
        assert!(batch.should_flush());
    }
}
