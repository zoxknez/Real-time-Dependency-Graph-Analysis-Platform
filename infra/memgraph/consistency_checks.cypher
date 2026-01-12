-- ═══════════════════════════════════════════════════════════════
-- Memgraph Consistency Checks
-- ═══════════════════════════════════════════════════════════════
--
-- Purpose: Verify data integrity and DEPENDS_ON_PKG consistency
-- Run: Periodically or before demo to ensure data quality
--
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- CHECK 1: Indexes exist
-- ═══════════════════════════════════════════════════════════════

SHOW INDEX INFO;
-- Expected: 9+ indexes

-- ═══════════════════════════════════════════════════════════════
-- CHECK 2: DEPENDS_ON_PKG exists
-- ═══════════════════════════════════════════════════════════════

MATCH ()-[r:DEPENDS_ON_PKG]->()
RETURN count(r) AS pkg_to_pkg_count;
-- Expected: > 0

-- ═══════════════════════════════════════════════════════════════
-- CHECK 3: Version→Package without Package→Package
-- ═══════════════════════════════════════════════════════════════

MATCH (v:Version)-[:DEPENDS_ON]->(dep:Package)
MATCH (v)-[:BELONGS_TO]->(pkg:Package)
WHERE NOT (pkg)-[:DEPENDS_ON_PKG]->(dep)
RETURN count(*) AS missing_pkg_deps;
-- Expected: 0

-- ═══════════════════════════════════════════════════════════════
-- CHECK 4: Orphaned Package→Package
-- ═══════════════════════════════════════════════════════════════

MATCH (pkg:Package)-[r:DEPENDS_ON_PKG]->(dep:Package)
WHERE NOT EXISTS {
    MATCH (v:Version)-[:BELONGS_TO]->(pkg)
    MATCH (v)-[:DEPENDS_ON]->(dep)
}
RETURN count(r) AS orphaned_pkg_deps;
-- Expected: 0

-- ═══════════════════════════════════════════════════════════════
-- CHECK 5: Deleted packages with active versions
-- ═══════════════════════════════════════════════════════════════

MATCH (p:Package)<-[:BELONGS_TO]-(v:Version)
WHERE p.deleted_at IS NOT NULL
  AND (v.yanked = false OR v.yanked IS NULL)
RETURN count(v) AS active_versions_of_deleted_packages;
-- Expected: 0 (or very low)

-- ═══════════════════════════════════════════════════════════════
-- CHECK 6: Versions without packages
-- ═══════════════════════════════════════════════════════════════

MATCH (v:Version)
WHERE NOT (v)-[:BELONGS_TO]->(:Package)
RETURN count(v) AS orphaned_versions;
-- Expected: 0

-- ═══════════════════════════════════════════════════════════════
-- CHECK 7: Circular dependencies (sample check)
-- ═══════════════════════════════════════════════════════════════

MATCH path = (p:Package)-[:DEPENDS_ON_PKG*1..10]->(p)
RETURN count(path) AS circular_dependency_paths
LIMIT 10;
-- Expected: 0 (or document known circular deps)

-- ═══════════════════════════════════════════════════════════════
-- CHECK 8: Basic stats
-- ═══════════════════════════════════════════════════════════════

MATCH (p:Package)
WHERE p.deleted_at IS NULL
RETURN count(p) AS active_packages;

MATCH (v:Version)-[:BELONGS_TO]->(p:Package)
WHERE p.deleted_at IS NULL
  AND (v.yanked = false OR v.yanked IS NULL)
RETURN count(v) AS active_versions;

MATCH ()-[r:DEPENDS_ON]->()
RETURN count(r) AS version_dependencies;

MATCH ()-[r:DEPENDS_ON_PKG]->()
RETURN count(r) AS package_dependencies;

-- ═══════════════════════════════════════════════════════════════
-- SUMMARY:
-- ═══════════════════════════════════════════════════════════════
--
-- All checks should pass (return 0 or expected values)
-- If any check fails, investigate and fix before demo
--
-- ═══════════════════════════════════════════════════════════════
