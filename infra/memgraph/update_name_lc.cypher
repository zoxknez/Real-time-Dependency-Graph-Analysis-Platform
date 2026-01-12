-- ═══════════════════════════════════════════════════════════════
-- Memgraph Schema Update - Search Performance (Phase 3)
-- ═══════════════════════════════════════════════════════════════

-- 1. Create Index for Case-Insensitive Search
CREATE INDEX ON :Package(name_lc);

-- 2. Backfill name_lc property for existing packages
-- This ensures that search works for all packages, not just new ones.
MATCH (p:Package)
WHERE p.name_lc IS NULL
SET p.name_lc = toLower(p.name);

-- 3. Verify
MATCH (p:Package)
WHERE p.name_lc IS NULL
RETURN count(p) AS remaining_without_name_lc;
