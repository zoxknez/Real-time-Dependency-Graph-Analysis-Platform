-- Memgraph Graph Algorithms Setup
-- Install MAGE module procedures for graph analysis
-- Usage: mgconsole < scripts/db/002-graph-algorithms.cypher

-- ============================================
-- VERIFY MAGE IS INSTALLED
-- ============================================

-- List available procedures
CALL mg.procedures() YIELD name, signature
WHERE name STARTS WITH 'pagerank' 
   OR name STARTS WITH 'betweenness'
   OR name STARTS WITH 'community'
RETURN name, signature;

-- ============================================
-- CREATE TRIGGERS FOR REAL-TIME UPDATES
-- ============================================

-- Trigger to update package stats on new version
CREATE TRIGGER update_package_on_version
ON CREATE BEFORE COMMIT
EXECUTE
UNWIND createdVertices AS v
WITH v WHERE v:Version
MATCH (p:Package {id: v.packageId})
SET p.versionCount = COALESCE(p.versionCount, 0) + 1,
    p.latestVersion = v.version,
    p.updatedAt = datetime();

-- Trigger to update dependency counts
CREATE TRIGGER update_dependency_counts
ON CREATE BEFORE COMMIT  
EXECUTE
UNWIND createdEdges AS e
WITH e WHERE type(e) = 'DEPENDS_ON'
MATCH (source)-[e]->(target)
SET source.dependencyCount = COALESCE(source.dependencyCount, 0) + 1,
    target.dependentCount = COALESCE(target.dependentCount, 0) + 1;

-- ============================================
-- MATERIALIZED VIEWS (via periodic queries)
-- ============================================

-- Note: Memgraph doesn't have native materialized views
-- Use scheduled queries or application-level caching

-- Example: Update ecosystem stats every 5 minutes
-- This would be called from a cron job or scheduled task

-- MATCH (p:Package)
-- WITH p.ecosystem AS ecosystem, count(p) AS packageCount
-- MERGE (s:EcosystemStats {ecosystem: ecosystem})
-- SET s.packageCount = packageCount,
--     s.updatedAt = datetime();

-- ============================================
-- QUERY TEMPLATES FOR COMMON OPERATIONS
-- ============================================

-- Template: Find reverse dependents with depth
-- MATCH path = (target:Package {id: $packageId})<-[:DEPENDS_ON*1..3]-(dependent:Package)
-- RETURN DISTINCT dependent.id, dependent.name, length(path) AS depth
-- ORDER BY depth, dependent.name;

-- Template: Impact radius calculation
-- MATCH (p:Package {id: $packageId})<-[:DEPENDS_ON*1..5]-(d:Package)
-- WITH collect(DISTINCT d) AS dependents
-- RETURN size(dependents) AS totalImpact,
--        size([d IN dependents WHERE size((d)<-[:DEPENDS_ON]-()) > 100]) AS highImpact;

-- Template: Breaking change propagation
-- MATCH (p:Package {id: $packageId})<-[:DEPENDS_ON]-(direct:Package)
-- OPTIONAL MATCH (direct)<-[:DEPENDS_ON*1..3]-(transitive:Package)
-- WITH direct, collect(DISTINCT transitive) AS transitives
-- RETURN direct.id, direct.name, size(transitives) AS transitiveCount
-- ORDER BY transitiveCount DESC;
