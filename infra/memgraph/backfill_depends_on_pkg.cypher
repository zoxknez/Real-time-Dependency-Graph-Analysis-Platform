-- ═══════════════════════════════════════════════════════════════
-- Memgraph DEPENDS_ON_PKG Backfill Script
-- ═══════════════════════════════════════════════════════════════
--
-- Purpose: Create Package→Package relationships from Version→Package
-- Run: After initial data ingestion or when DEPENDS_ON_PKG is missing
--
-- CRITICAL: This must be run AND graph-writer must maintain it!
--
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- STEP 1: Create DEPENDS_ON_PKG relationships
-- ═══════════════════════════════════════════════════════════════

-- Create Package→Package from Version→Package dependencies
MATCH (v:Version)-[:DEPENDS_ON]->(depPkg:Package)
MATCH (v)-[:BELONGS_TO]->(pkg:Package)
WHERE NOT (pkg)-[:DEPENDS_ON_PKG]->(depPkg)
MERGE (pkg)-[:DEPENDS_ON_PKG]->(depPkg);

-- ═══════════════════════════════════════════════════════════════
-- STEP 2: Verify creation
-- ═══════════════════════════════════════════════════════════════

-- Count DEPENDS_ON_PKG relationships (should be > 0)
MATCH ()-[r:DEPENDS_ON_PKG]->()
RETURN count(r) AS pkg_to_pkg_count;

-- ═══════════════════════════════════════════════════════════════
-- STEP 3: Consistency check
-- ═══════════════════════════════════════════════════════════════

-- Check for missing Package→Package (should be 0)
MATCH (v:Version)-[:DEPENDS_ON]->(dep:Package)
MATCH (v)-[:BELONGS_TO]->(pkg:Package)
WHERE NOT (pkg)-[:DEPENDS_ON_PKG]->(dep)
RETURN count(*) AS missing_pkg_deps;

-- Check for orphaned Package→Package (should be 0)
MATCH (pkg:Package)-[r:DEPENDS_ON_PKG]->(dep:Package)
WHERE NOT EXISTS {
    MATCH (v:Version)-[:BELONGS_TO]->(pkg)
    MATCH (v)-[:DEPENDS_ON]->(dep)
}
RETURN count(r) AS orphaned_pkg_deps;

-- ═══════════════════════════════════════════════════════════════
-- EXPECTED RESULTS:
-- ═══════════════════════════════════════════════════════════════
--
-- pkg_to_pkg_count: > 0 (number of unique package dependencies)
-- missing_pkg_deps: 0 (all Version deps have Package deps)
-- orphaned_pkg_deps: 0 (no Package deps without Version deps)
--
-- ═══════════════════════════════════════════════════════════════
