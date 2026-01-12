-- ═══════════════════════════════════════════════════════════════
-- Memgraph Schema - Production-Ready for Hackathon Demo
-- ═══════════════════════════════════════════════════════════════
-- 
-- Purpose: Complete schema with indexes, constraints, and DEPENDS_ON_PKG
-- Version: 2.0 (Refined with critical fixes)
-- 
-- CRITICAL FEATURES:
-- 1. Unique constraints (auto-create indexes)
-- 2. Performance indexes on critical fields
-- 3. DEPENDS_ON_PKG for transitive queries
-- 4. Consistency checks
--
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- STEP 1: UNIQUE CONSTRAINTS (MUST-HAVE)
-- ═══════════════════════════════════════════════════════════════

-- Package unique ID (automatically creates index)
CREATE CONSTRAINT ON (p:Package) ASSERT p.id IS UNIQUE;

-- Version unique ID (automatically creates index)
CREATE CONSTRAINT ON (v:Version) ASSERT v.id IS UNIQUE;

-- ═══════════════════════════════════════════════════════════════
-- STEP 2: CRITICAL PERFORMANCE INDEXES (MUST-HAVE)
-- ═══════════════════════════════════════════════════════════════

-- Version.package_id for BELONGS_TO traversal
CREATE INDEX ON :Version(package_id);

-- Package.deleted_at for filtering
CREATE INDEX ON :Package(deleted_at);

-- ═══════════════════════════════════════════════════════════════
-- STEP 3: ADDITIONAL PERFORMANCE INDEXES (SHOULD-HAVE)
-- ═══════════════════════════════════════════════════════════════

-- Package.name for search
CREATE INDEX ON :Package(name);
CREATE INDEX ON :Package(name_lc);

-- Package.ecosystem for filtering
CREATE INDEX ON :Package(ecosystem);

-- Version.yanked for filtering
CREATE INDEX ON :Version(yanked);

-- Version.published_at for sorting
CREATE INDEX ON :Version(published_at);

-- Package.updated_at for sorting
CREATE INDEX ON :Package(updated_at);

-- ═══════════════════════════════════════════════════════════════
-- STEP 4: VERIFICATION QUERIES
-- ═══════════════════════════════════════════════════════════════

-- Show all indexes (should see 9+ indexes)
SHOW INDEX INFO;

-- Show all constraints (should see 2 constraints)
SHOW CONSTRAINT INFO;

-- ═══════════════════════════════════════════════════════════════
-- NOTES FOR IMPLEMENTATION:
-- ═══════════════════════════════════════════════════════════════
--
-- 1. DEPENDS_ON_PKG Creation:
--    - Will be created via backfill script (see memgraph_backfill.cypher)
--    - Must be maintained by graph-writer on every Version insert
--
-- 2. Consistency Checks:
--    - Run periodically to ensure DEPENDS_ON_PKG is in sync
--    - See memgraph_consistency_checks.cypher
--
-- 3. Performance:
--    - All critical queries should use indexes
--    - Use EXPLAIN to verify index usage
--
-- ═══════════════════════════════════════════════════════════════
